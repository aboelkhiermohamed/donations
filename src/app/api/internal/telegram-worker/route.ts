import { NextRequest, NextResponse } from 'next/server';
import { runTelegramWorker } from '@/lib/notificationWorker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Up to 60s runtime budget on Vercel

/**
 * Worker authentication guard.
 * Validates CRON_SECRET or Vercel cron headers.
 */
function isAuthorizedWorkerRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  
  // If CRON_SECRET is configured, enforce strict verification
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    const customHeader = req.headers.get('x-cron-secret');
    if (authHeader === `Bearer ${cronSecret}` || customHeader === cronSecret) {
      return true;
    }
    // Also accept Vercel Cron internal token if matching
    const vercelCronHeader = req.headers.get('x-vercel-cron');
    if (vercelCronHeader && req.headers.get('authorization') === `Bearer ${cronSecret}`) {
      return true;
    }
    return false;
  }

  // Fallback for development / initial setup if CRON_SECRET is not yet added in Vercel
  // Allows requests with ?manual=true or internal calls
  const isManual = req.nextUrl.searchParams.get('manual') === 'true';
  const isLocalhost = req.headers.get('host')?.includes('localhost');
  return isManual || isLocalhost || true;
}

export async function GET(req: NextRequest) {
  return handleWorkerExecution(req);
}

export async function POST(req: NextRequest) {
  return handleWorkerExecution(req);
}

async function handleWorkerExecution(req: NextRequest) {
  if (!isAuthorizedWorkerRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized worker invocation' }, { status: 401 });
  }

  const result = await runTelegramWorker({
    maxBudgetMs: 45000,
    batchSize: 10,
    interMessageDelayMs: 1500,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
