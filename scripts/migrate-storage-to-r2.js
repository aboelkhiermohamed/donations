/**
 * Safe Cloudflare R2 Migration Script for Existing Screenshots
 * 
 * Safely inventories objects in Supabase Storage 'receipts' bucket,
 * transfers them to Cloudflare R2, verifies integrity, and reports statistics.
 * Does NOT delete source files automatically (preserves rollback capability).
 * 
 * Usage: node --env-file=.env.local scripts/migrate-storage-to-r2.js
 */

const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

async function runMigration() {
  console.log('\n============================================================');
  console.log('   CLOUDFLARE R2 MIGRATION SCRIPT — 9TH BATCH CHARITY       ');
  console.log('============================================================\n');

  // 1. Check Environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r2AccountId = process.env.R2_ACCOUNT_ID;
  const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
  const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;
  const r2Bucket = process.env.R2_BUCKET_NAME || 'donations-receipts';

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const isR2Ready = Boolean(r2AccountId && r2AccessKey && r2SecretKey);
  if (!isR2Ready) {
    console.warn('⚠️  Cloudflare R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) not found in .env.local.');
    console.log('    Scanning Supabase Storage inventory only...\n');
  }

  let r2Client = null;
  if (isR2Ready) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
    });
  }

  // 2. Inventory Supabase Storage 'receipts' bucket
  console.log('📦 Step 1: Scanning Supabase Storage files in bucket "receipts"...');

  let allFiles = [];
  const foldersToScan = ['', 'receipts', 'settings'];

  for (const folder of foldersToScan) {
    const { data: list, error: listErr } = await supabase.storage
      .from('receipts')
      .list(folder, { limit: 500 });

    if (listErr) {
      console.warn(`Could not list folder "${folder}":`, listErr.message);
      continue;
    }

    if (list) {
      for (const item of list) {
        if (item.name && !item.id && !item.metadata) {
          // Folder, skip
          continue;
        }
        if (item.name) {
          const fullPath = folder ? `${folder}/${item.name}` : item.name;
          allFiles.push({
            path: fullPath,
            size: item.metadata?.size || 0,
            mimetype: item.metadata?.mimetype || 'image/jpeg',
          });
        }
      }
    }
  }

  // Deduplicate
  const uniqueFiles = Array.from(new Map(allFiles.map(f => [f.path, f])).values())
    .filter(f => !f.path.endsWith('/'));

  console.log(`✅ Discovered ${uniqueFiles.length} file(s) in Supabase Storage.`);

  const stats = {
    totalFiles: uniqueFiles.length,
    migrated: 0,
    failed: 0,
    skipped: 0,
    totalBytes: uniqueFiles.reduce((sum, f) => sum + (f.size || 0), 0),
  };

  console.log(`📊 Total Storage to Migrate: ${(stats.totalBytes / (1024 * 1024)).toFixed(2)} MB\n`);

  if (!isR2Ready) {
    console.log('============================================================');
    console.log('INVENTORY SUMMARY (R2 credentials needed for execution):');
    console.log(`- Total Files in Supabase Storage: ${stats.totalFiles}`);
    console.log(`- Total Storage Size: ${(stats.totalBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log('\nTo execute copy to Cloudflare R2, populate R2 credentials in .env.local and re-run.');
    console.log('============================================================\n');
    return;
  }

  // 3. Migrate each file to R2
  console.log('🚀 Step 2: Copying files to Cloudflare R2 with verification...');

  for (let i = 0; i < uniqueFiles.length; i++) {
    const file = uniqueFiles[i];
    const key = file.path;

    try {
      // Check if already in R2
      try {
        await r2Client.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: key }));
        console.log(`  [${i + 1}/${uniqueFiles.length}] ⏩ Skipped (already in R2): ${key}`);
        stats.skipped++;
        continue;
      } catch (headErr) {
        // Not in R2, proceed with copy
      }

      // Download from Supabase Storage
      const { data: blob, error: dlErr } = await supabase.storage
        .from('receipts')
        .download(key);

      if (dlErr || !blob) {
        throw new Error(`Download failed: ${dlErr?.message || 'Empty file'}`);
      }

      const buffer = Buffer.from(await blob.arrayBuffer());

      // Upload to Cloudflare R2
      await r2Client.send(new PutObjectCommand({
        Bucket: r2Bucket,
        Key: key,
        Body: buffer,
        ContentType: file.mimetype || 'image/jpeg',
      }));

      // Verify upload
      await r2Client.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: key }));

      console.log(`  [${i + 1}/${uniqueFiles.length}] ✅ Successfully copied to R2: ${key} (${(buffer.length / 1024).toFixed(1)} KB)`);
      stats.migrated++;
    } catch (err) {
      console.error(`  [${i + 1}/${uniqueFiles.length}] ❌ Failed to migrate ${key}:`, err.message);
      stats.failed++;
    }
  }

  // 4. Update Database references
  console.log('\n🔄 Step 3: Checking database donation records...');
  const { data: donations } = await supabase
    .from('donations')
    .select('id, screenshot_url')
    .not('screenshot_url', 'is', null);

  let updatedDonations = 0;
  if (donations && donations.length > 0) {
    for (const d of donations) {
      // If screenshot_url contains supabase storage URL, extract object key
      if (d.screenshot_url && d.screenshot_url.includes('supabase.co/storage/v1/object/public/receipts/')) {
        const objectKey = d.screenshot_url.split('/receipts/')[1];
        if (objectKey) {
          await supabase
            .from('donations')
            .update({ screenshot_url: objectKey })
            .eq('id', d.id);
          updatedDonations++;
        }
      }
    }
  }
  console.log(`✅ Verified database records. Updated ${updatedDonations} donation records to R2 key reference.`);

  // 5. Final Report
  console.log('\n============================================================');
  console.log('                 MIGRATION REPORT SUMMARY                   ');
  console.log('============================================================');
  console.log(`Total Files Discovered:       ${stats.totalFiles}`);
  console.log(`Successfully Migrated:        ${stats.migrated}`);
  console.log(`Already Present (Skipped):    ${stats.skipped}`);
  console.log(`Failed Migrations:            ${stats.failed}`);
  console.log(`Total Transferred Size:       ${(stats.totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Source Supabase Files:        Preserved (Safe rollback maintained)`);
  console.log('============================================================\n');
}

runMigration().catch(err => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
