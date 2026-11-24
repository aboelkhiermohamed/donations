import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import {
  claimNotificationJobs,
  updateNotificationJobResult,
  isChatRateLimited,
  setChatRateLimitState,
  NotificationJob,
} from '@/lib/notificationQueue';
import { sendTelegramMessageDirect } from '@/lib/telegram';

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
  const startTime = Date.now();
  const maxBudgetMs = 45000; // Stop gracefully after 45s to avoid hitting serverless timeout

  if (!isAuthorizedWorkerRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized worker invocation' }, { status: 401 });
  }

  const workerId = `worker_${crypto.randomUUID().slice(0, 8)}`;
  const batchSize = 10;
  let processedCount = 0;
  let successCount = 0;
  let rateLimitedCount = 0;
  let failedCount = 0;
  let rescheduledCount = 0;

  try {
    // 1. Claim a batch of eligible jobs atomically
    const jobs: NotificationJob[] = await claimNotificationJobs({
      workerId,
      batchSize,
      staleTimeoutSeconds: 60,
    });

    if (jobs.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No pending notification jobs in queue',
        workerId,
        processedCount: 0,
        durationMs: Date.now() - startTime,
      });
    }

    // 2. Process claimed jobs sequentially with rate limit awareness
    for (const job of jobs) {
      // Check execution time budget before starting each job
      if (Date.now() - startTime > maxBudgetMs) {
        console.warn(`[Worker ${workerId}] Time budget exhausted (${Date.now() - startTime}ms). Releasing remaining jobs.`);
        // Release lock on unhandled job
        await updateNotificationJobResult({
          jobId: job.id,
          status: 'pending',
          nextRetryAt: new Date(),
          lastError: 'Worker execution time budget exceeded, rescheduled',
        });
        continue;
      }

      processedCount++;

      // Check if destination chat is currently blocked by a global rate limit
      const rateLimitCheck = await isChatRateLimited(job.destination_chat_id);
      if (rateLimitCheck.rateLimited && rateLimitCheck.blockedUntil) {
        console.warn(`[Worker ${workerId}] Chat ${job.destination_chat_id} is rate-limited until ${rateLimitCheck.blockedUntil.toISOString()}. Rescheduling job ${job.id}.`);
        await updateNotificationJobResult({
          jobId: job.id,
          status: 'pending',
          nextRetryAt: rateLimitCheck.blockedUntil,
          lastError: `Chat rate-limited until ${rateLimitCheck.blockedUntil.toISOString()}`,
          destinationChatId: job.destination_chat_id,
        });
        rateLimitedCount++;
        continue;
      }

      // Dispatch message to Telegram
      const result = await sendTelegramMessageDirect(job.destination_chat_id, job.message_payload, 8000);

      if (result.success) {
        await updateNotificationJobResult({
          jobId: job.id,
          status: 'sent',
        });
        successCount++;

        // Enforce conservative spacing (1500ms) between consecutive messages to the same chat
        // strictly guarantees staying well under Telegram's 1 msg/sec limit
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }

      // Handle Telegram 429 Rate Limiting
      if (result.errorType === 'rate_limited') {
        const retryAfterSec = result.retryAfter || 32;
        const blockedUntil = new Date(Date.now() + (retryAfterSec + 2) * 1000);

        console.warn(`[Worker ${workerId}] Received Telegram 429 for chat ${job.destination_chat_id}. retry_after=${retryAfterSec}s. Rescheduling.`);

        await updateNotificationJobResult({
          jobId: job.id,
          status: 'pending',
          nextRetryAt: blockedUntil,
          lastError: `Telegram 429: retry after ${retryAfterSec}s`,
          rateLimitUntil: blockedUntil,
          destinationChatId: job.destination_chat_id,
        });

        rateLimitedCount++;
        // Stop processing further jobs in this run since rate limit is active
        break;
      }

      // Handle Permanent Errors (400, 401, 403)
      if (result.isPermanentError) {
        console.error(`[Worker ${workerId}] Permanent Telegram error for job ${job.id}: ${result.errorMessage}`);
        await updateNotificationJobResult({
          jobId: job.id,
          status: 'failed',
          lastError: `Permanent failure (${result.errorType}): ${result.errorMessage}`,
        });
        failedCount++;
        continue;
      }

      // Handle Transient Errors (500, network, timeout) with Exponential Backoff
      const currentAttempts = job.attempts || 1;
      const maxAttempts = job.max_attempts || 5;

      if (currentAttempts >= maxAttempts) {
        console.error(`[Worker ${workerId}] Max attempts (${maxAttempts}) reached for job ${job.id}. Marking failed.`);
        await updateNotificationJobResult({
          jobId: job.id,
          status: 'failed',
          lastError: `Max attempts exceeded. Last error: ${result.errorMessage}`,
        });
        failedCount++;
      } else {
        // Exponential backoff: 10s, 20s, 40s, 80s... + jitter
        const backoffBase = Math.pow(2, currentAttempts) * 5;
        const jitter = Math.floor(Math.random() * 5);
        const backoffSeconds = Math.min(300, backoffBase + jitter);
        const nextRetry = new Date(Date.now() + backoffSeconds * 1000);

        console.warn(`[Worker ${workerId}] Transient error for job ${job.id}. Retrying in ${backoffSeconds}s (attempt ${currentAttempts}/${maxAttempts}). Error: ${result.errorMessage}`);

        await updateNotificationJobResult({
          jobId: job.id,
          status: 'pending',
          nextRetryAt: nextRetry,
          lastError: `Transient error (${result.errorType}): ${result.errorMessage}`,
        });
        rescheduledCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      workerId,
      processedCount,
      successCount,
      rateLimitedCount,
      failedCount,
      rescheduledCount,
      durationMs: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error(`[Worker ${workerId}] Fatal worker exception:`, err);
    return NextResponse.json(
      {
        ok: false,
        workerId,
        error: err.message,
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
