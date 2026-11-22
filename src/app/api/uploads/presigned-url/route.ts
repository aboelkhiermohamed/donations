import { NextRequest, NextResponse } from 'next/server';
import { isR2Configured, createPresignedUploadUrl } from '@/lib/r2';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// In-memory sliding window rate limiter: max 10 presigned requests per IP per 5 minutes
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 15;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  entry.count += 1;
  return false;
}

// Clean up stale rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 10 * 60 * 1000).unref?.();

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many upload requests. Please wait a few minutes before trying again.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { fileType, fileSize, fileName } = body;

    if (!fileType || typeof fileType !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid fileType.' }, { status: 400 });
    }

    const normalizedType = fileType.toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(normalizedType)) {
      return NextResponse.json(
        { error: 'Invalid file format. Only JPEG, PNG, and WebP images are permitted.' },
        { status: 400 }
      );
    }

    if (typeof fileSize === 'number' && fileSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File size exceeds the 5MB limit. Please choose a smaller image.' },
        { status: 400 }
      );
    }

    // 1. PRIMARY PATH: CLOUDFLARE R2
    if (isR2Configured()) {
      const presigned = await createPresignedUploadUrl(normalizedType, 'receipts', 300); // 5 min expiry
      return NextResponse.json({
        storageProvider: 'r2',
        uploadUrl: presigned.uploadUrl,
        objectKey: presigned.objectKey,
        method: 'PUT',
        headers: {
          'Content-Type': normalizedType,
        },
      });
    }

    // 2. FALLBACK PATH (When R2 credentials are not set in environment yet)
    // Create signed upload URL in Supabase Storage so local testing never breaks
    const ext = normalizedType.includes('png') ? 'png' : normalizedType.includes('webp') ? 'webp' : 'jpg';
    const randomId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
    const fallbackPath = `receipts/${Date.now()}_${randomId}.${ext}`;

    const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
      .from('receipts')
      .createSignedUploadUrl(fallbackPath);

    if (uploadErr || !uploadData) {
      throw new Error(`Failed to initialize upload: ${uploadErr?.message || 'Storage error'}`);
    }

    return NextResponse.json({
      storageProvider: 'supabase',
      uploadUrl: uploadData.signedUrl,
      objectKey: fallbackPath,
      method: 'PUT',
      headers: {
        'Content-Type': normalizedType,
      },
    });
  } catch (err: any) {
    console.error('Presigned upload generation error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
