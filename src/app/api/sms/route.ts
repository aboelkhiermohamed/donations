import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parseSMS } from '@/lib/smsParser';
import { findMatch } from '@/lib/matchingEngine';

const smsRequestSchema = z.object({
  sender: z.string().min(1),
  message: z.string().min(1),
  receivedAt: z.string().min(1),
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

    // 2. Body Validation
    const body = await req.json();
    const validation = smsRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request body', details: validation.error.format() }, { status: 400 });
    }

    const { sender, message, receivedAt } = validation.data;

    // Resilient timestamp parsing: if malformed or has unparsed placeholders, fallback to current server time
    let finalReceivedAt = receivedAt;
    if (isNaN(Date.parse(receivedAt)) || receivedAt.includes('{')) {
      finalReceivedAt = new Date().toISOString();
    }

    // 3. Deduplication Hash
    const rawHashString = `${sender.trim()}:${message.trim()}:${finalReceivedAt.trim()}`;
    const processingHash = crypto.createHash('sha256').update(rawHashString).digest('hex');

    // Check if SMS already exists in incoming_transactions
    const { data: existingTx } = await supabaseAdmin
      .from('incoming_transactions')
      .select('id')
      .eq('processing_hash', processingHash)
      .maybeSingle();

    if (existingTx) {
      // Log as duplicate
      await supabaseAdmin.from('sms_logs').insert({
        sender,
        message,
        received_at: finalReceivedAt,
        status: 'duplicate',
        error_message: 'Duplicate SMS received and ignored.',
      });

      return NextResponse.json({ success: true, message: 'Duplicate SMS ignored' });
    }

    // 4. Parse SMS
    let parsedSMS;
    try {
      parsedSMS = parseSMS(sender, message, finalReceivedAt);
    } catch (parseError: any) {
      // Log parsing failure
      await supabaseAdmin.from('sms_logs').insert({
        sender,
        message,
        received_at: finalReceivedAt,
        status: 'failed_parsing',
        error_message: parseError.message || 'Unknown parsing error',
      });

      // Create Admin Notification for Parsing Failure
      await supabaseAdmin.from('notifications').insert({
        title: 'SMS Parsing Failed',
        message: `Failed to parse SMS from ${sender}. Message: "${message.substring(0, 60)}..."`,
        type: 'verification_failed',
      });

      return NextResponse.json({ success: false, error: 'SMS parsing failed', details: parseError.message }, { status: 400 });
    }

    // 5. Store Incoming Transaction (initial unmatched state)
    const { data: insertedTx, error: txError } = await supabaseAdmin
      .from('incoming_transactions')
      .insert({
        payment_method: parsedSMS.payment_method,
        amount: parsedSMS.amount,
        sender_phone: parsedSMS.sender_phone || null,
        sender_name: parsedSMS.sender_name || null,
        transaction_ref: parsedSMS.transaction_ref || null,
        receiver_digits: parsedSMS.receiver_digits || null,
        received_at: parsedSMS.received_at,
        status: 'unmatched',
        matching_confidence: 0,
        raw_sms: message,
        processing_hash: processingHash,
      })
      .select()
      .single();

    if (txError || !insertedTx) {
      throw new Error(`Failed to store incoming transaction: ${txError?.message}`);
    }

    // Log SMS parsing success
    await supabaseAdmin.from('sms_logs').insert({
      sender,
      message,
      received_at: finalReceivedAt,
      status: 'success',
    });

    // 6. Fetch Pending Donations
    const { data: pendingDonations, error: donationsError } = await supabaseAdmin
      .from('donations')
      .select(`
        id,
        donor_id,
        campaign_id,
        amount,
        payment_method,
        status,
        transaction_ref,
        last_4_digits,
        notes,
        created_at,
        donor:donors (
          id,
          name,
          phone
        )
      `)
      .eq('status', 'pending');

    if (donationsError) {
      throw new Error(`Failed to fetch pending donations: ${donationsError.message}`);
    }

    // Cast response for matching engine format
    const formattedPending = (pendingDonations || []).map((d: any) => ({
      ...d,
      donor: {
        id: d.donor?.id || '',
        name: d.donor?.name || '',
        phone: d.donor?.phone || '',
      },
    }));

    // 7. Execute Matching Engine
    const matchResult = findMatch(
      {
        amount: parsedSMS.amount,
        payment_method: parsedSMS.payment_method,
        sender_phone: parsedSMS.sender_phone,
        transaction_ref: parsedSMS.transaction_ref,
        receiver_digits: parsedSMS.receiver_digits,
        received_at: parsedSMS.received_at,
      },
      formattedPending
    );

    // 8. Update DB based on Matching Outcome
    if (matchResult.donationId) {
      if (matchResult.confidence === 100) {
        // Auto-approve the donation
        await supabaseAdmin.from('donations').update({
          status: 'auto_verified',
          verification_method: 'auto',
          verified_at: new Date().toISOString(),
          matched_transaction_id: insertedTx.id,
        }).eq('id', matchResult.donationId);

        // Update the incoming transaction
        await supabaseAdmin.from('incoming_transactions').update({
          status: 'matched',
          matched_donation_id: matchResult.donationId,
          matching_confidence: 100,
        }).eq('id', insertedTx.id);

        // Create Admin Notification for Auto Verification
        await supabaseAdmin.from('notifications').insert({
          title: 'Donation Auto-Verified',
          message: `A donation of EGP ${parsedSMS.amount} has been automatically matched and approved.`,
          type: 'new_donation',
        });
      } else {
        // High confidence match, but not 100% (requires manual review)
        // Update transaction with potential match, but keep donation pending
        await supabaseAdmin.from('incoming_transactions').update({
          matched_donation_id: matchResult.donationId,
          matching_confidence: matchResult.confidence,
          status: 'unmatched', // remains unmatched until admin confirms
        }).eq('id', insertedTx.id);

        // Create Admin Notification for Verification Failure
        await supabaseAdmin.from('notifications').insert({
          title: 'Automatic Verification Failed',
          message: `SMS received for EGP ${parsedSMS.amount}. Potential match found (${matchResult.confidence}%), but requires manual review. Reason: ${matchResult.reason}`,
          type: 'verification_failed',
        });
      }
    } else {
      // No match found
      await supabaseAdmin.from('notifications').insert({
        title: 'Unmatched SMS Received',
        message: `Received SMS for EGP ${parsedSMS.amount} via ${parsedSMS.payment_method.toUpperCase()} but no pending donations matched.`,
        type: 'new_sms',
      });
    }

    // If large donation (>5000 EGP) received, create special notification
    if (parsedSMS.amount >= 5000) {
      await supabaseAdmin.from('notifications').insert({
        title: 'Large SMS Transaction Alert',
        message: `A large SMS transaction of EGP ${parsedSMS.amount} was received via ${parsedSMS.payment_method.toUpperCase()}.`,
        type: 'large_donation',
      });
    }

    return NextResponse.json({
      success: true,
      matched: matchResult.confidence === 100,
      confidence: matchResult.confidence,
      donationId: matchResult.donationId,
      reason: matchResult.reason,
    });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
