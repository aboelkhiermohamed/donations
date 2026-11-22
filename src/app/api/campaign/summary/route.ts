import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// High-Performance In-Memory Summary Cache
interface CachedSummary {
  data: {
    totalCollected: number;
    target: number;
    remaining: number;
    progressPercent: number;
    verifiedDonorsCount: number;
    totalDonationsCount: number;
    maxDonation: number;
    latestConfirmedAt: string | null;
  };
  cachedAt: number;
}

let cachedSummary: CachedSummary | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds in-memory TTL

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const forceFresh = searchParams.get('fresh') === 'true';
    const now = Date.now();

    // Serve from in-memory cache if fresh
    if (!forceFresh && cachedSummary && now - cachedSummary.cachedAt < CACHE_TTL_MS) {
      return NextResponse.json(cachedSummary.data, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'X-Cache': 'HIT',
        },
      });
    }

    // 1. Fetch Campaign Target
    const { data: campaign } = await supabaseAdmin
      .from('campaigns')
      .select('target_amount')
      .limit(1)
      .maybeSingle();

    const target = Number(campaign?.target_amount) || 350000;

    // 2. Fetch Aggregates using strictly minimal column projection
    // Try RPC first if migration was applied
    let totalCollected = 0;
    let totalDonationsCount = 0;
    let verifiedDonorsCount = 0;
    let maxDonation = 0;
    let latestConfirmedAt: string | null = null;

    try {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('get_campaign_aggregates');
      if (!rpcErr && rpcData) {
        totalCollected = Number(rpcData.total_collected || 0);
        totalDonationsCount = Number(rpcData.total_donations_count || 0);
        verifiedDonorsCount = Number(rpcData.verified_donors_count || 0);
        maxDonation = Number(rpcData.max_donation || 0);
        latestConfirmedAt = rpcData.latest_confirmed_at || null;
      } else {
        throw new Error('RPC not found, using optimized fallback');
      }
    } catch {
      // Optimized minimal column fallback (transfers only numbers & UUIDs, no donor PII)
      const { data: donations } = await supabaseAdmin
        .from('donations')
        .select('amount, donor_id, created_at')
        .in('status', ['auto_verified', 'manual_verified']);

      if (donations && donations.length > 0) {
        totalDonationsCount = donations.length;
        const donorSet = new Set<string>();

        donations.forEach((d: any) => {
          const amt = Number(d.amount) || 0;
          totalCollected += amt;
          if (amt > maxDonation) maxDonation = amt;
          if (d.donor_id) donorSet.add(d.donor_id);
          if (!latestConfirmedAt || new Date(d.created_at) > new Date(latestConfirmedAt)) {
            latestConfirmedAt = d.created_at;
          }
        });

        verifiedDonorsCount = donorSet.size;
      }
    }

    const remaining = Math.max(0, target - totalCollected);
    const progressPercent = Math.min(100, Math.round((totalCollected / target) * 100));

    const result = {
      totalCollected,
      target,
      remaining,
      progressPercent,
      verifiedDonorsCount,
      totalDonationsCount,
      maxDonation,
      latestConfirmedAt,
    };

    // Update in-memory cache
    cachedSummary = {
      data: result,
      cachedAt: now,
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'X-Cache': 'MISS',
      },
    });
  } catch (err: any) {
    console.error('Failed to compute campaign summary:', err);

    // Resilient fallback so public page never displays broken numbers
    const fallback = {
      totalCollected: 0,
      target: 350000,
      remaining: 350000,
      progressPercent: 0,
      verifiedDonorsCount: 0,
      totalDonationsCount: 0,
      maxDonation: 0,
      latestConfirmedAt: null,
    };

    return NextResponse.json(fallback, {
      status: 200,
      headers: { 'Cache-Control': 'public, s-maxage=30' },
    });
  }
}
