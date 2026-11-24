import { supabaseAdmin } from './supabaseAdmin';

export type JobStatus = 'pending' | 'processing' | 'sent' | 'failed';

export interface NotificationPayload {
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  reply_markup?: any;
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
}

export interface NotificationJob {
  id: string;
  event_type: string;
  destination_chat_id: string;
  message_payload: NotificationPayload;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  next_retry_at: string;
  locked_at: string | null;
  locked_by: string | null;
  sent_at: string | null;
  last_error: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

const FALLBACK_SETTINGS_KEY = 'notification_jobs_queue';
const RATE_LIMIT_SETTINGS_KEY = 'telegram_rate_limits_state';

let isTableAvailable: boolean | null = null;

async function checkTableAvailability(): Promise<boolean> {
  if (isTableAvailable !== null) return isTableAvailable;
  try {
    const { error } = await supabaseAdmin
      .from('notification_jobs')
      .select('id')
      .limit(1);

    if (error) {
      isTableAvailable = false;
      return false;
    }
    isTableAvailable = true;
    return true;
  } catch {
    isTableAvailable = false;
    return false;
  }
}

/**
 * Enqueue a notification job atomically with idempotency.
 * Completely decoupled from Telegram HTTP delivery.
 */
export async function enqueueNotificationJob(params: {
  eventType: string;
  destinationChatId: string;
  messagePayload: NotificationPayload;
  idempotencyKey: string;
  maxAttempts?: number;
}): Promise<{ success: boolean; jobId?: string; duplicate?: boolean; error?: string }> {
  const {
    eventType,
    destinationChatId,
    messagePayload,
    idempotencyKey,
    maxAttempts = 5,
  } = params;

  try {
    const tableReady = await checkTableAvailability();

    if (tableReady) {
      const { data, error } = await supabaseAdmin
        .from('notification_jobs')
        .insert({
          event_type: eventType,
          destination_chat_id: destinationChatId,
          message_payload: messagePayload,
          idempotency_key: idempotencyKey,
          status: 'pending',
          attempts: 0,
          max_attempts: maxAttempts,
          next_retry_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
          return { success: true, duplicate: true };
        }
        return enqueueFallbackJob(params);
      }

      return { success: true, jobId: data?.id };
    } else {
      return enqueueFallbackJob(params);
    }
  } catch (err: any) {
    return enqueueFallbackJob(params);
  }
}

async function enqueueFallbackJob(params: {
  eventType: string;
  destinationChatId: string;
  messagePayload: NotificationPayload;
  idempotencyKey: string;
  maxAttempts?: number;
}): Promise<{ success: boolean; jobId?: string; duplicate?: boolean; error?: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { data: row } = await supabaseAdmin
        .from('settings')
        .select('*')
        .eq('key', FALLBACK_SETTINGS_KEY)
        .maybeSingle();

      const jobs: NotificationJob[] = Array.isArray(row?.value) ? row.value : [];

      const existing = jobs.find(j => j.idempotency_key === params.idempotencyKey);
      if (existing) {
        return { success: true, jobId: existing.id, duplicate: true };
      }

      const nowIso = new Date().toISOString();
      const newJob: NotificationJob = {
        id: crypto.randomUUID(),
        event_type: params.eventType,
        destination_chat_id: params.destinationChatId,
        message_payload: params.messagePayload,
        status: 'pending',
        attempts: 0,
        max_attempts: params.maxAttempts || 5,
        next_retry_at: nowIso,
        locked_at: null,
        locked_by: null,
        sent_at: null,
        last_error: null,
        idempotency_key: params.idempotencyKey,
        created_at: nowIso,
        updated_at: nowIso,
      };

      jobs.push(newJob);
      const boundedJobs = jobs.slice(-500);

      if (row) {
        const { data: updated, error } = await supabaseAdmin
          .from('settings')
          .update({
            value: boundedJobs,
            updated_at: nowIso,
          })
          .eq('key', FALLBACK_SETTINGS_KEY)
          .eq('updated_at', row.updated_at)
          .select();

        if (!error && updated && updated.length > 0) {
          return { success: true, jobId: newJob.id };
        }
      } else {
        const { error } = await supabaseAdmin.from('settings').insert({
          key: FALLBACK_SETTINGS_KEY,
          value: boundedJobs,
          updated_at: nowIso,
        });
        if (!error) return { success: true, jobId: newJob.id };
      }

      await new Promise(r => setTimeout(r, 20 + Math.random() * 30));
    } catch {
      await new Promise(r => setTimeout(r, 20 + Math.random() * 30));
    }
  }

  return { success: false, error: 'Concurrency limit exceeded enqueuing job' };
}

/**
 * Claim pending jobs atomically with stale lock recovery.
 */
export async function claimNotificationJobs(params: {
  workerId: string;
  batchSize?: number;
  staleTimeoutSeconds?: number;
}): Promise<NotificationJob[]> {
  const { workerId, batchSize = 5, staleTimeoutSeconds = 60 } = params;
  const now = new Date();
  const nowIso = now.toISOString();
  const staleThreshold = new Date(now.getTime() - staleTimeoutSeconds * 1000).toISOString();

  try {
    const tableReady = await checkTableAvailability();

    if (tableReady) {
      // Step A: Recover stale abandoned jobs
      await supabaseAdmin
        .from('notification_jobs')
        .update({
          status: 'pending',
          locked_at: null,
          locked_by: null,
          last_error: 'Worker timeout / recovered from stale lock',
          updated_at: nowIso,
        })
        .eq('status', 'processing')
        .lt('locked_at', staleThreshold);

      // Step B: Fetch pending candidates
      const { data: candidates, error: fetchErr } = await supabaseAdmin
        .from('notification_jobs')
        .select('*')
        .eq('status', 'pending')
        .lte('next_retry_at', nowIso)
        .order('created_at', { ascending: true })
        .limit(batchSize);

      if (fetchErr || !candidates || candidates.length === 0) {
        return [];
      }

      // Step C: Atomically lock candidates
      const claimed: NotificationJob[] = [];
      for (const job of candidates) {
        const { data: updated, error: lockErr } = await supabaseAdmin
          .from('notification_jobs')
          .update({
            status: 'processing',
            locked_at: nowIso,
            locked_by: workerId,
            attempts: (job.attempts || 0) + 1,
            updated_at: nowIso,
          })
          .eq('id', job.id)
          .eq('status', 'pending')
          .select()
          .maybeSingle();

        if (!lockErr && updated) {
          claimed.push(updated as NotificationJob);
        }
      }

      return claimed;
    } else {
      return claimFallbackJobs(workerId, batchSize, staleThreshold);
    }
  } catch {
    return claimFallbackJobs(workerId, batchSize, staleThreshold);
  }
}

async function claimFallbackJobs(
  workerId: string,
  batchSize: number,
  staleThreshold: string
): Promise<NotificationJob[]> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { data: row } = await supabaseAdmin
        .from('settings')
        .select('*')
        .eq('key', FALLBACK_SETTINGS_KEY)
        .maybeSingle();

      if (!row || !Array.isArray(row.value)) return [];

      const jobs: NotificationJob[] = row.value;
      const nowIso = new Date().toISOString();
      const claimed: NotificationJob[] = [];

      for (const job of jobs) {
        // Recover stale
        if (job.status === 'processing' && job.locked_at && job.locked_at < staleThreshold) {
          job.status = 'pending';
          job.locked_at = null;
          job.locked_by = null;
          job.last_error = 'Worker timeout / recovered from stale lock';
        }

        // Claim eligible
        if (job.status === 'pending' && job.next_retry_at <= nowIso && claimed.length < batchSize) {
          job.status = 'processing';
          job.locked_at = nowIso;
          job.locked_by = workerId;
          job.attempts = (job.attempts || 0) + 1;
          job.updated_at = nowIso;
          claimed.push({ ...job });
        }
      }

      if (claimed.length === 0) {
        return [];
      }

      // Optimistic concurrency control: only update if updated_at matches
      const { data: updated, error } = await supabaseAdmin
        .from('settings')
        .update({
          value: jobs,
          updated_at: nowIso,
        })
        .eq('key', FALLBACK_SETTINGS_KEY)
        .eq('updated_at', row.updated_at)
        .select();

      if (!error && updated && updated.length > 0) {
        return claimed;
      }

      // Collided with another worker, retry with jitter
      await new Promise(r => setTimeout(r, 25 + Math.random() * 40));
    } catch {
      await new Promise(r => setTimeout(r, 25 + Math.random() * 40));
    }
  }

  return [];
}

/**
 * Update the state of a completed or failed notification job.
 */
export async function updateNotificationJobResult(params: {
  jobId: string;
  status: 'sent' | 'failed' | 'pending';
  nextRetryAt?: Date;
  lastError?: string;
  rateLimitUntil?: Date;
  destinationChatId?: string;
}): Promise<boolean> {
  const {
    jobId,
    status,
    nextRetryAt,
    lastError,
    rateLimitUntil,
    destinationChatId,
  } = params;

  const nowIso = new Date().toISOString();

  if (rateLimitUntil && destinationChatId) {
    await setChatRateLimitState(destinationChatId, rateLimitUntil);
  }

  try {
    const tableReady = await checkTableAvailability();

    if (tableReady) {
      const updateData: any = {
        status,
        updated_at: nowIso,
        locked_at: null,
        locked_by: null,
        last_error: lastError || null,
      };

      if (status === 'sent') {
        updateData.sent_at = nowIso;
      }

      if (status === 'pending' && nextRetryAt) {
        updateData.next_retry_at = nextRetryAt.toISOString();
      }

      const { error } = await supabaseAdmin
        .from('notification_jobs')
        .update(updateData)
        .eq('id', jobId);

      return !error;
    } else {
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: row } = await supabaseAdmin
          .from('settings')
          .select('*')
          .eq('key', FALLBACK_SETTINGS_KEY)
          .maybeSingle();

        if (!row || !Array.isArray(row.value)) return false;

        const jobs: NotificationJob[] = row.value;
        const target = jobs.find(j => j.id === jobId);
        if (!target) return false;

        target.status = status;
        target.locked_at = null;
        target.locked_by = null;
        target.last_error = lastError || null;
        target.updated_at = nowIso;

        if (status === 'sent') {
          target.sent_at = nowIso;
        }
        if (status === 'pending' && nextRetryAt) {
          target.next_retry_at = nextRetryAt.toISOString();
        }

        const { data: updated, error } = await supabaseAdmin
          .from('settings')
          .update({
            value: jobs,
            updated_at: nowIso,
          })
          .eq('key', FALLBACK_SETTINGS_KEY)
          .eq('updated_at', row.updated_at)
          .select();

        if (!error && updated && updated.length > 0) return true;
        await new Promise(r => setTimeout(r, 20 + Math.random() * 30));
      }
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Check if the destination chat is currently under a global rate limit cooldown.
 */
export async function isChatRateLimited(chatId: string): Promise<{ rateLimited: boolean; blockedUntil?: Date }> {
  try {
    const { data: row, error } = await supabaseAdmin
      .from('telegram_rate_limits')
      .select('blocked_until')
      .eq('chat_id', chatId)
      .maybeSingle();

    if (!error && row && row.blocked_until) {
      const blockedUntil = new Date(row.blocked_until);
      if (blockedUntil.getTime() > Date.now()) {
        return { rateLimited: true, blockedUntil };
      }
    }
  } catch {
    // ignore
  }

  // Fallback to checking settings table
  try {
    const { data: settingRow } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', RATE_LIMIT_SETTINGS_KEY)
      .maybeSingle();

    if (settingRow && settingRow.value && settingRow.value[chatId]) {
      const blockedUntil = new Date(settingRow.value[chatId]);
      if (blockedUntil.getTime() > Date.now()) {
        return { rateLimited: true, blockedUntil };
      }
    }
  } catch {
    // ignore
  }

  return { rateLimited: false };
}

/**
 * Record a persistent rate limit cooldown for a chat (shared across all Vercel instances).
 */
export async function setChatRateLimitState(chatId: string, blockedUntil: Date): Promise<void> {
  const nowIso = new Date().toISOString();
  const blockedUntilIso = blockedUntil.toISOString();

  try {
    await supabaseAdmin
      .from('telegram_rate_limits')
      .upsert({
        chat_id: chatId,
        blocked_until: blockedUntilIso,
        updated_at: nowIso,
      });
  } catch {
    // ignore
  }

  try {
    const { data: settingRow } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', RATE_LIMIT_SETTINGS_KEY)
      .maybeSingle();

    const limits = settingRow?.value && typeof settingRow.value === 'object' ? settingRow.value : {};
    limits[chatId] = blockedUntilIso;

    await supabaseAdmin.from('settings').upsert({
      key: RATE_LIMIT_SETTINGS_KEY,
      value: limits,
      updated_at: nowIso,
    });
  } catch (err: any) {
    console.error('[NotificationQueue] Save Rate Limit State Error:', err.message);
  }
}
