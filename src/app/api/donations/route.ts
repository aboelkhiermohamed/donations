import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { findMatchForDonation } from '@/lib/matchingEngine';

const donationRequestSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  campaignId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.enum(['vodafone_cash', 'instapay']),
  transactionRef: z.string().nullable().optional(),
  last4Digits: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  screenshotUrl: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = donationRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.format() },
        { status: 400 }
      );
    }

    const {
      name,
      phone,
      campaignId,
      amount,
      paymentMethod,
      transactionRef,
      last4Digits,
      notes,
      screenshotUrl,
    } = validation.data;

    // 1. Insert or reuse Donor (Check if donor with phone already exists)
    let donorId: string;
    const { data: existingDonor, error: donorFetchError } = await supabaseAdmin
      .from('donors')
      .select('id')
      .eq('phone', phone.trim())
      .limit(1)
      .maybeSingle();

    if (donorFetchError) {
      throw new Error(`Failed to check existing donor: ${donorFetchError.message}`);
    }

    if (existingDonor) {
      donorId = existingDonor.id;
    } else {
      const { data: newDonor, error: donorInsertError } = await supabaseAdmin
        .from('donors')
        .insert({
          name: name.trim(),
          phone: phone.trim(),
        })
        .select('id')
        .single();

      if (donorInsertError || !newDonor) {
        throw new Error(`Failed to create new donor: ${donorInsertError?.message}`);
      }
      donorId = newDonor.id;
    }

    // 2. Create the Donation request in 'pending' status
    const { data: donation, error: donationInsertError } = await supabaseAdmin
      .from('donations')
      .insert({
        donor_id: donorId,
        campaign_id: campaignId,
        amount,
        payment_method: paymentMethod,
        transaction_ref: transactionRef?.trim() || null,
        last_4_digits: last4Digits?.trim() || null,
        notes: notes?.trim() || null,
        screenshot_url: screenshotUrl || null,
        status: 'pending',
      })
      .select(`
        id,
        amount,
        payment_method,
        transaction_ref,
        last_4_digits,
        created_at
      `)
      .single();

    if (donationInsertError || !donation) {
      throw new Error(`Failed to create donation request: ${donationInsertError?.message}`);
    }

    // 3. Query unmatched transactions for potential matching
    const { data: unmatchedTxs, error: txsError } = await supabaseAdmin
      .from('incoming_transactions')
      .select('id, amount, payment_method, sender_phone, sender_name, transaction_ref, receiver_digits, received_at')
      .eq('status', 'unmatched')
      .eq('amount', amount)
      .eq('payment_method', paymentMethod)
      .order('received_at', { ascending: false });

    if (txsError) {
      throw new Error(`Failed to query unmatched transactions: ${txsError.message}`);
    }

    // 4. Run reverse matching logic
    const matchResult = findMatchForDonation(
      {
        amount: Number(donation.amount),
        payment_method: donation.payment_method,
        donor_phone: phone,
        donor_name: name,
        transaction_ref: donation.transaction_ref,
        last_4_digits: donation.last_4_digits,
        created_at: donation.created_at,
      },
      unmatchedTxs || []
    );

    const matchOutcome = {
      matched: false,
      confidence: 0,
      transactionId: null as string | null,
      reason: matchResult.reason,
    };

    if (matchResult.transactionId) {
      matchOutcome.transactionId = matchResult.transactionId;
      matchOutcome.confidence = matchResult.confidence;

      if (matchResult.confidence === 100) {
        matchOutcome.matched = true;

        // Auto-approve the donation
        const { error: updateDonationError } = await supabaseAdmin
          .from('donations')
          .update({
            status: 'auto_verified',
            verification_method: 'auto',
            verified_at: new Date().toISOString(),
            matched_transaction_id: matchResult.transactionId,
          })
          .eq('id', donation.id);

        if (updateDonationError) {
          console.error('Failed to auto-verify donation:', updateDonationError);
        }

        // Update the incoming transaction
        const { error: updateTxError } = await supabaseAdmin
          .from('incoming_transactions')
          .update({
            status: 'matched',
            matched_donation_id: donation.id,
            matching_confidence: 100,
          })
          .eq('id', matchResult.transactionId);

        if (updateTxError) {
          console.error('Failed to update matched transaction:', updateTxError);
        }

        // Create Admin Notification for Auto Verification
        await supabaseAdmin.from('notifications').insert({
          title: 'Donation Auto-Verified (Retroactive)',
          message: `A donation of EGP ${amount} has been automatically matched to an existing unmatched transaction and approved.`,
          type: 'new_donation',
        });
      } else {
        // High confidence match, but not 100% (requires manual review)
        // Link the transaction, but keep status unmatched/pending
        const { error: updateTxError } = await supabaseAdmin
          .from('incoming_transactions')
          .update({
            matched_donation_id: donation.id,
            matching_confidence: matchResult.confidence,
          })
          .eq('id', matchResult.transactionId);

        if (updateTxError) {
          console.error('Failed to update transaction with potential match:', updateTxError);
        }

        // Create Admin Notification for potential match
        await supabaseAdmin.from('notifications').insert({
          title: 'Potential Donation Match Found',
          message: `A new donation of EGP ${amount} matches an unmatched transaction with ${matchResult.confidence}% confidence, requiring manual review. Reason: ${matchResult.reason}`,
          type: 'verification_failed',
        });
      }
    }

    return NextResponse.json({
      success: true,
      donationId: donation.id,
      match: matchOutcome,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error in donation submission API:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
