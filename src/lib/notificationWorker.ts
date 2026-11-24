import crypto from 'node:crypto';
import {
  claimNotificationJobs,
  updateNotificationJobResult,
  isChatRateLimited,
  setChatRateLimitState,
  NotificationJob,
} from './notificationQueue';
import { sendTelegramMessageDirect } from './telegram';

export interface WorkerOptions {
  workerId?: string;
  batchSize?: number;
  maxBudgetMs?: number;
  interMessageDelayMs?: number;
}

export interface WorkerResult {
  ok: boolean;
  workerId: string;
  processedCount: number;
  successCount: number;
  rateLimitedCount: number;
  failedCount: number;
  rescheduledCount: number;
  durationMs: number;
  error?: string;
}

/**
 * Production-grade background worker for processing Telegram notification jobs.
 * - Claims jobs atomically with SKIP LOCKED.
 * - Respects global chat rate limits and Telegram 429 retry_after.
 * - Applies exponential backoff with jitter on transient errors.
 * - Enforces conservative message spacing (1500ms).
 * - Safe for Next.js 15 after() and serverless invocations.
 */
export async function runTelegramWorker(options: WorkerOptions = {}): Promise<WorkerResult> {
  const startTime = Date.now();
  const maxBudgetMs = options.maxBudgetMs ?? 45000;
  const batchSize = options.batchSize ?? 10;
  const interMessageDelayMs = options.interMessageDelayMs ?? 1500;
  const workerId = options.workerId ?? `worker_${crypto.randomUUID().slice(0, 8)}`;

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
      return {
        ok: true,
        workerId,
        processedCount: 0,
        successCount: 0,
        rateLimitedCount: 0,
        failedCount: 0,
        rescheduledCount: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Process claimed jobs sequentially with rate limit awareness
    for (const job of jobs) {
      // Check execution time budget before starting each job
      if (Date.now() - startTime > maxBudgetMs) {
        console.warn(`[Worker ${workerId}] Time budget exhausted (${Date.now() - startTime}ms). Releasing remaining jobs.`);
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
        if (interMessageDelayMs > 0) {
          await new Promise((r) => setTimeout(r, interMessageDelayMs));
        }
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

    return {
      ok: true,
      workerId,
      processedCount,
      successCount,
      rateLimitedCount,
      failedCount,
      rescheduledCount,
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    console.error(`[Worker ${workerId}] Fatal worker exception:`, err);
    return {
      ok: false,
      workerId,
      processedCount,
      successCount,
      rateLimitedCount,
      failedCount,
      rescheduledCount,
      durationMs: Date.now() - startTime,
      error: err?.message || String(err),
    };
  }
}
