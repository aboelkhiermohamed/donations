-- Migration: 20261124000000_notification_jobs_queue.sql
-- Description: Production-grade durable notification queue & rate limiter for Telegram integration

-- 1. Create notification_jobs table
CREATE TABLE IF NOT EXISTS public.notification_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    destination_chat_id TEXT NOT NULL,
    message_payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    sent_at TIMESTAMPTZ,
    last_error TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create persistent Telegram rate limiter state table
CREATE TABLE IF NOT EXISTS public.telegram_rate_limits (
    chat_id TEXT PRIMARY KEY,
    blocked_until TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes for ultra-fast polling, lock recovery, and idempotency
CREATE INDEX IF NOT EXISTS idx_notif_jobs_poll 
ON public.notification_jobs (status, next_retry_at) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notif_jobs_stale 
ON public.notification_jobs (status, locked_at) 
WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_notif_jobs_created 
ON public.notification_jobs (created_at DESC);

-- 4. Enable RLS and restrict to service_role
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'notification_jobs' AND policyname = 'Allow service_role full access to notification_jobs'
    ) THEN
        CREATE POLICY "Allow service_role full access to notification_jobs"
        ON public.notification_jobs
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'telegram_rate_limits' AND policyname = 'Allow service_role full access to telegram_rate_limits'
    ) THEN
        CREATE POLICY "Allow service_role full access to telegram_rate_limits"
        ON public.telegram_rate_limits
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- 5. RPC: Atomic Enqueue with Idempotency
CREATE OR REPLACE FUNCTION public.enqueue_notification_job(
    p_event_type TEXT,
    p_destination_chat_id TEXT,
    p_message_payload JSONB,
    p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_job_id UUID;
BEGIN
    INSERT INTO public.notification_jobs (
        event_type,
        destination_chat_id,
        message_payload,
        idempotency_key,
        status,
        next_retry_at
    )
    VALUES (
        p_event_type,
        p_destination_chat_id,
        p_message_payload,
        p_idempotency_key,
        'pending',
        now()
    )
    ON CONFLICT (idempotency_key) DO UPDATE
        SET updated_at = now()
    RETURNING id INTO v_job_id;

    RETURN v_job_id;
END;
$$;

-- 6. RPC: Atomic Job Claiming with Stale Lock Recovery & SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_notification_jobs(
    p_worker_id TEXT,
    p_batch_size INT DEFAULT 5,
    p_stale_timeout_seconds INT DEFAULT 60
)
RETURNS SETOF public.notification_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Step A: Recover abandoned/stale jobs from crashed workers
    UPDATE public.notification_jobs
    SET status = 'pending',
        locked_at = NULL,
        locked_by = NULL,
        last_error = 'Worker timeout / recovered from stale lock',
        updated_at = now()
    WHERE status = 'processing'
      AND locked_at < (now() - (p_stale_timeout_seconds || ' seconds')::INTERVAL);

    -- Step B: Claim available pending jobs using FOR UPDATE SKIP LOCKED
    RETURN QUERY
    WITH available_jobs AS (
        SELECT id
        FROM public.notification_jobs
        WHERE status = 'pending'
          AND next_retry_at <= now()
        ORDER BY created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.notification_jobs j
    SET status = 'processing',
        locked_at = now(),
        locked_by = p_worker_id,
        attempts = j.attempts + 1,
        updated_at = now()
    FROM available_jobs a
    WHERE j.id = a.id
    RETURNING j.*;
END;
$$;
