import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get('ids');
    const phoneParam = searchParams.get('phone');

    if (!idsParam && !phoneParam) {
      return NextResponse.json({ error: 'Missing query parameters: ids or phone' }, { status: 400 });
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
        donor:donors (
          name,
          phone
        )
      `)
      .order('created_at', { ascending: false });

    if (idsParam) {
      const ids = idsParam.split(',').filter(id => uuidRegex.test(id));
      if (ids.length === 0) {
        return NextResponse.json([]);
      }
      query = query.in('id', ids);
    } else if (phoneParam) {
      const phone = phoneParam.trim();
      if (!phone) {
        return NextResponse.json([]);
      }
      
      // Step 1: Find donor ids by phone
      const { data: donors, error: donorError } = await supabaseAdmin
        .from('donors')
        .select('id')
        .eq('phone', phone);

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
