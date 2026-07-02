import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const heartbeatRequestSchema = z.object({
  deviceId: z.string(),
  battery: z.number().int(),
  network: z.string(),
  pendingSms: z.number().int(),
  lastSms: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. API Key Verification
    const apiKey = req.headers.get('x-api-key');
    const expectedApiKey = process.env.SMS_GATEWAY_API_KEY;

    if (!expectedApiKey) {
      console.error('SMS_GATEWAY_API_KEY is not configured on the server.');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!apiKey || apiKey !== expectedApiKey) {
      return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 });
    }

    // 2. Validate Body
    const body = await req.json();
    const validation = heartbeatRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request body', details: validation.error.format() }, { status: 400 });
    }

    const { deviceId, battery, network, pendingSms, lastSms } = validation.data;

    // 3. Upsert Gateway Status in Settings table
    const { error } = await supabaseAdmin
      .from('settings')
      .upsert({
        key: 'gateway_status',
        value: {
          deviceId,
          battery,
          network,
          pendingSms,
          lastSms,
          lastHeartbeat: new Date().toISOString(),
        },
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Failed to update gateway status in database:', error);
      return NextResponse.json({ error: 'Failed to update gateway status' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Heartbeat error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
