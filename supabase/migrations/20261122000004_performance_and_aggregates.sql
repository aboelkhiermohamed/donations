-- Migration: 20261122000004_performance_and_aggregates.sql
-- Optimizes query performance, adds targeted indexes to eliminate table scans,
-- and creates server-side campaign aggregates function to eliminate client-side egress.

-- 1. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_donations_status_created 
ON public.donations (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_donations_transaction_ref 
ON public.donations (transaction_ref);

CREATE INDEX IF NOT EXISTS idx_donors_phone 
ON public.donors (phone);

CREATE INDEX IF NOT EXISTS idx_incoming_tx_ref 
ON public.incoming_transactions (transaction_ref);

CREATE INDEX IF NOT EXISTS idx_incoming_tx_status 
ON public.incoming_transactions (status);

-- 2. Fast Campaign Aggregates Function
-- Computes financial totals inside PostgreSQL with zero row transfer over network
CREATE OR REPLACE FUNCTION get_campaign_aggregates(p_campaign_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_collected', COALESCE(SUM(amount), 0),
    'total_donations_count', COUNT(id),
    'verified_donors_count', COUNT(DISTINCT donor_id),
    'max_donation', COALESCE(MAX(amount), 0),
    'latest_confirmed_at', MAX(created_at)
  )
  INTO result
  FROM public.donations
  WHERE status IN ('auto_verified', 'manual_verified')
    AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id);

  RETURN result;
END;
$$;
