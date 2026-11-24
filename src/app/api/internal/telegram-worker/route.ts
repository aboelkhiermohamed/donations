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
  
  // 1. Allow explicit manual test requests via browser
  const isManual = req.nextUrl.searchParams.get('manual') === 'true';
  if (isManual) {
    return true;
  }

  // 2. Allow secret passed as query param: ?secret=... or ?key=...
  const querySecret = req.nextUrl.searchParams.get('secret') || req.nextUrl.searchParams.get('key');
  if (cronSecret && querySecret && querySecret === cronSecret) {
    return true;
  }

  // 3. Allow Vercel Cron internal invocation
  const vercelCronHeader = req.headers.get('x-vercel-cron');
  if (vercelCronHeader) {
    return true;
  }

  // 4. If CRON_SECRET is configured, verify header
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    const customHeader = req.headers.get('x-cron-secret');
    if (authHeader === `Bearer ${cronSecret}` || customHeader === cronSecret) {
      return true;
    }
    return false;
  }

  // 5. Default allowed if CRON_SECRET is not configured yet
  return true;
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
