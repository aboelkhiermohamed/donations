import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sliding-window rate limiter: max 30 status checks per IP per minute
const statusRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

function isStatusRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = statusRateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    statusRateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  entry.count += 1;
  return false;
}

// Periodic cleanup of rate limiter entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of statusRateLimitMap.entries()) {
    if (now > entry.resetAt) {
      statusRateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref?.();

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (isStatusRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many status check requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get('ids');
    const phoneParam = searchParams.get('phone');
    const refParam = searchParams.get('ref');

    if (!idsParam && !phoneParam && !refParam) {
      return NextResponse.json({ error: 'Missing query parameters: ids, phone, or ref' }, { status: 400 });
    }

    let query = supabaseAdmin
      .from('donations')
      .select(`
        id,
        amount,
        status,
        payment_method,
        transaction_ref,
        created_at,
        verification_method,
        verified_at,
        verified_by:admins (
          name
        ),
        donor:donors (
          name,
          phone
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (idsParam) {
      const ids = idsParam
        .split(',')
        .filter(id => uuidRegex.test(id))
        .slice(0, 20);

      if (ids.length === 0) {
        return NextResponse.json([]);
      }
      query = query.in('id', ids);
    } else if (refParam) {
      const ref = refParam.trim().slice(0, 50);
      if (!ref) {
        return NextResponse.json([]);
      }
      query = query.ilike('transaction_ref', `%${ref}%`);
    } else if (phoneParam) {
      const phone = phoneParam.trim().slice(0, 20);
      if (!phone) {
        return NextResponse.json([]);
      }
      
      // Step 1: Find donor ids by phone (max 10 donors)
      const { data: donors, error: donorError } = await supabaseAdmin
        .from('donors')
        .select('id')
        .eq('phone', phone)
        .limit(10);

      if (donorError) {
        throw donorError;
      }

      if (!donors || donors.length === 0) {
        return NextResponse.json([]);
      }

      const donorIds = donors.map(d => d.id);
      query = query.in('donor_id', donorIds);
    }

    const { data: donations, error } = await query;

    if (error) {
      throw error;
    }

    // Securely mask details to avoid leaking PII on open endpoint
    const maskedDonations = (donations || []).map((d: any) => {
      const name = d.donor?.name || '';
      const phone = d.donor?.phone || '';
      
      let maskedName = 'فاعل خير';
      if (name) {
        const parts = name.trim().split(' ');
        if (parts.length === 1) {
          maskedName = parts[0].substring(0, 3) + '...';
        } else {
          maskedName = `${parts[0]} ${parts[1].charAt(0)}.`;
        }
      }

      let maskedPhone = '—';
      if (phone) {
        maskedPhone = phone.substring(0, 4) + '***' + phone.substring(phone.length - 4);
      }

      return {
        id: d.id,
        amount: d.amount,
        status: d.status,
        payment_method: d.payment_method,
        transaction_ref: d.transaction_ref,
        created_at: d.created_at,
        verification_method: d.verification_method,
        verified_at: d.verified_at,
        verified_by: d.verified_by ? { name: d.verified_by.name } : null,
        donor: {
          name: maskedName,
          phone: maskedPhone,
        }
      };
    });

    return NextResponse.json(maskedDonations);
  } catch (error: any) {
    console.error('Error fetching donation status:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
