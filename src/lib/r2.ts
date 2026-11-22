import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'donations-receipts';
const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN; // Optional custom/public domain if enabled

/**
 * Returns true if all required Cloudflare R2 credentials are set
 */
export function isR2Configured(): boolean {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);
}

/**
 * Lazy singleton S3 client for Cloudflare R2
 */
let s3ClientInstance: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!s3ClientInstance) {
    if (!isR2Configured()) {
      throw new Error('Cloudflare R2 is not fully configured. Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY.');
    }

    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    });
  }

  return s3ClientInstance;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  objectKey: string;
  bucket: string;
  expiresIn: number;
}

/**
 * Generate a short-lived presigned PUT URL for direct browser-to-R2 upload
 * @param contentType The MIME type (e.g. image/webp, image/jpeg, image/png)
 * @param prefix Optional subfolder prefix (default: 'receipts')
 * @param expiresIn Expiration time in seconds (default: 300 = 5 minutes)
 */
export async function createPresignedUploadUrl(
  contentType: string,
  prefix: string = 'receipts',
  expiresIn: number = 300
): Promise<PresignedUploadResult> {
  const client = getR2Client();

  // Determine file extension
  let ext = 'jpg';
  if (contentType.includes('webp')) ext = 'webp';
  else if (contentType.includes('png')) ext = 'png';
  else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';

  // Generate unguessable random key (no PII, no donor name/phone in key)
  const randomId = typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  const objectKey = `${prefix}/${Date.now()}_${randomId}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });

  return {
    uploadUrl,
    objectKey,
    bucket: R2_BUCKET_NAME,
    expiresIn,
  };
}

/**
 * Generate a short-lived presigned GET URL for secure administrator access
 * @param objectKey The R2 key (e.g. 'receipts/17823...webp')
 * @param expiresIn Expiration time in seconds (default: 900 = 15 minutes)
 */
export async function createPresignedDownloadUrl(
  objectKey: string,
  expiresIn: number = 900
): Promise<string> {
  const client = getR2Client();

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
  });

  return await getSignedUrl(client, command, { expiresIn });
}

/**
 * Check if an object exists and is accessible in R2
 */
export async function checkR2ObjectExists(objectKey: string): Promise<boolean> {
  try {
    const client = getR2Client();
    await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Dual resolver helper for screenshots:
 * If it's an R2 key or r2:// URI, generates a secure download URL.
 * If it's a legacy Supabase storage HTTP URL, returns as-is.
 */
export async function resolveScreenshotViewUrl(
  urlOrKey?: string | null
): Promise<string | null> {
  if (!urlOrKey) return null;

  // If it's already a full HTTP(S) URL
  if (urlOrKey.startsWith('http://') || urlOrKey.startsWith('https://')) {
    // If it's an R2 public domain URL, return directly
    return urlOrKey;
  }

  // If it's an R2 object key (e.g. "receipts/xyz.webp")
  if (isR2Configured()) {
    try {
      return await createPresignedDownloadUrl(urlOrKey, 900);
    } catch (err) {
      console.warn('Failed to generate presigned download URL for R2 key:', urlOrKey, err);
      return null;
    }
  }

  return null;
}
