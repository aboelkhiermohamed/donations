import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveScreenshotViewUrl, isR2Configured, createPresignedDownloadUrl } from '@/lib/r2';

export async function GET(req: NextRequest) {
  try {
    // 1. Verify Administrative Authorization
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required.' }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token.' }, { status: 401 });
    }

    // Verify user exists in admins table
    const { data: adminRecord } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!adminRecord) {
      return NextResponse.json({ error: 'Forbidden: Admin privilege required.' }, { status: 403 });
    }

    // 2. Extract requested key
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter.' }, { status: 400 });
    }

    // 3. Resolve secure URL
    // If it's an R2 key
    if (isR2Configured() && !key.startsWith('http://') && !key.startsWith('https://')) {
      const signedUrl = await createPresignedDownloadUrl(key, 900); // 15 mins expiry
      return NextResponse.json({ url: signedUrl, provider: 'r2' });
    }

    // Fallback: If legacy Supabase Storage URL or key
    if (key.startsWith('http://') || key.startsWith('https://')) {
      return NextResponse.json({ url: key, provider: 'direct' });
    }

    // Try Supabase Storage signed URL
    const { data: signedData } = await supabaseAdmin.storage
      .from('receipts')
      .createSignedUrl(key, 900);

    return NextResponse.json({
      url: signedData?.signedUrl || null,
      provider: 'supabase',
    });
  } catch (err: any) {
    console.error('Admin receipt URL resolution error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error resolving receipt' },
      { status: 500 }
    );
  }
}
