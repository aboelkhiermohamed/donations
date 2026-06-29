import { Donation } from '@/types';

export interface MatchResult {
  donationId: string | null;
  confidence: number;
  reason: string;
}

function isNameMatch(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  const normalize = (name: string) => 
    name.toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  if (n1 === n2) return true;
  
  // Substring match
  if (n1.length > 5 && n2.length > 5 && (n1.includes(n2) || n2.includes(n1))) return true;
  
  // Word overlaps
  const words1 = n1.split(' ').filter(w => w.length > 2);
  const words2 = n2.split(' ').filter(w => w.length > 2);
  
  if (words1.length > 0 && words2.length > 0) {
    let matchesCount = 0;
    for (const w1 of words1) {
      if (words2.includes(w1)) matchesCount++;
    }
    if (matchesCount >= 2) return true;
  }
  
  return false;
}

export function findMatch(
  tx: {
    amount: number;
    payment_method: string;
    sender_phone?: string;
    sender_name?: string;
    transaction_ref?: string;
    receiver_digits?: string;
    received_at: string;
  },
  pendingDonations: (Donation & { donor: { phone: string; name: string } })[]
): MatchResult {
  // If no pending donations, return unmatched
  if (pendingDonations.length === 0) {
    return { donationId: null, confidence: 0, reason: 'No pending donations found' };
  }

  const matches: { donationId: string; confidence: number; priority: number; reason: string }[] = [];

  for (const donation of pendingDonations) {
    // Basic checks: amount and payment method must match
    if (Number(donation.amount) !== Number(tx.amount)) continue;
    if (donation.payment_method !== tx.payment_method) continue;

    // Normalize phone numbers for comparison
    const cleanDonationPhone = donation.donor?.phone.replace(/\D/g, '') || '';
    const cleanTxPhone = tx.sender_phone?.replace(/\D/g, '') || '';

    // Priority 2: Transaction Reference Match (100% confidence)
    if (tx.transaction_ref && donation.transaction_ref && 
        tx.transaction_ref.trim().toLowerCase() === donation.transaction_ref.trim().toLowerCase()) {
      matches.push({
        donationId: donation.id,
        confidence: 100,
        priority: 2,
        reason: `Matched transaction reference: ${tx.transaction_ref}`,
      });
      continue;
    }

    // Priority 1: Phone Number Match + Amount Match (100% confidence)
    if (cleanTxPhone && cleanDonationPhone && 
        (cleanDonationPhone.endsWith(cleanTxPhone) || cleanTxPhone.endsWith(cleanDonationPhone))) {
      matches.push({
        donationId: donation.id,
        confidence: 100,
        priority: 1,
        reason: `Matched phone number (${donation.donor?.phone}) and amount (${donation.amount} EGP)`,
      });
      continue;
    }

    // Priority 5: Amount Match + Name Match (100% confidence)
    if (tx.sender_name && donation.donor?.name && 
        isNameMatch(tx.sender_name, donation.donor.name)) {
      matches.push({
        donationId: donation.id,
        confidence: 100,
        priority: 5,
        reason: `Matched donor name (${donation.donor.name}) and amount (${donation.amount} EGP)`,
      });
      continue;
    }

    // Priority 4: Amount Match + Last 4 Digits Match (100% confidence)
    if (tx.receiver_digits && donation.last_4_digits && 
        tx.receiver_digits.trim() === donation.last_4_digits.trim()) {
      matches.push({
        donationId: donation.id,
        confidence: 100,
        priority: 4,
        reason: `Matched last 4 digits of sender account (${tx.receiver_digits})`,
      });
      continue;
    }

    // Priority 3: Amount Match + Time Window Match (90% confidence)
    const txTime = new Date(tx.received_at).getTime();
    const donationTime = new Date(donation.created_at).getTime();
    const diffMinutes = Math.abs(txTime - donationTime) / (1000 * 60);
    
    if (diffMinutes <= 30) {
      matches.push({
        donationId: donation.id,
        confidence: 90,
        priority: 3,
        reason: `Matched amount and time window (diff: ${Math.round(diffMinutes)} mins)`,
      });
      continue;
    }
  }

  // If no matches found
  if (matches.length === 0) {
    return { 
      donationId: null, 
      confidence: 0, 
      reason: 'No matching pending donation found for this amount and payment method' 
    };
  }

  // Never automatically approve when multiple matches exist
  if (matches.length > 1) {
    // Find the match with the highest confidence
    const highestMatch = matches.reduce(
      (prev, current) => (current.priority < prev.priority ? current : prev), 
      matches[0]
    );
    
    return {
      donationId: highestMatch.donationId,
      confidence: Math.min(highestMatch.confidence, 80), // Cap at 80% to force manual verification
      reason: `Multiple possible matches found (count: ${matches.length}). Highest candidate matches by: ${highestMatch.reason}`,
    };
  }

  // If there's a unique match
  return {
    donationId: matches[0].donationId,
    confidence: matches[0].confidence,
    reason: matches[0].reason,
  };
}

export interface MatchTxResult {
  transactionId: string | null;
  confidence: number;
  reason: string;
}

export function findMatchForDonation(
  donation: {
    amount: number;
    payment_method: string;
    donor_phone: string;
    donor_name?: string;
    transaction_ref?: string | null;
    last_4_digits?: string | null;
    created_at: string;
  },
  unmatchedTxs: {
    id: string;
    amount: number;
    payment_method: string;
    sender_phone?: string | null;
    sender_name?: string | null;
    transaction_ref?: string | null;
    receiver_digits?: string | null;
    received_at: string;
  }[]
): MatchTxResult {
  // If no unmatched transactions, return unmatched
  if (unmatchedTxs.length === 0) {
    return { transactionId: null, confidence: 0, reason: 'No unmatched transactions found' };
  }

  const matches: { transactionId: string; confidence: number; priority: number; reason: string }[] = [];

  for (const tx of unmatchedTxs) {
    // Basic checks: amount and payment method must match
    if (Number(tx.amount) !== Number(donation.amount)) continue;
    if (tx.payment_method !== donation.payment_method) continue;

    // Normalize phone numbers for comparison
    const cleanDonationPhone = donation.donor_phone.replace(/\D/g, '') || '';
    const cleanTxPhone = tx.sender_phone?.replace(/\D/g, '') || '';

    // Priority 2: Transaction Reference Match (100% confidence)
    if (tx.transaction_ref && donation.transaction_ref && 
        tx.transaction_ref.trim().toLowerCase() === donation.transaction_ref.trim().toLowerCase()) {
      matches.push({
        transactionId: tx.id,
        confidence: 100,
        priority: 2,
        reason: `Matched transaction reference: ${tx.transaction_ref}`,
      });
      continue;
    }

    // Priority 1: Phone Number Match + Amount Match (100% confidence)
    if (cleanTxPhone && cleanDonationPhone && 
        (cleanDonationPhone.endsWith(cleanTxPhone) || cleanTxPhone.endsWith(cleanDonationPhone))) {
      matches.push({
        transactionId: tx.id,
        confidence: 100,
        priority: 1,
        reason: `Matched phone number (${donation.donor_phone}) and amount (${donation.amount} EGP)`,
      });
      continue;
    }

    // Priority 5: Amount Match + Name Match (100% confidence)
    if (tx.sender_name && donation.donor_name && 
        isNameMatch(tx.sender_name, donation.donor_name)) {
      matches.push({
        transactionId: tx.id,
        confidence: 100,
        priority: 5,
        reason: `Matched donor name (${donation.donor_name}) and amount (${donation.amount} EGP)`,
      });
      continue;
    }

    // Priority 4: Amount Match + Last 4 Digits Match (100% confidence)
    if (tx.receiver_digits && donation.last_4_digits && 
        tx.receiver_digits.trim() === donation.last_4_digits.trim()) {
      matches.push({
        transactionId: tx.id,
        confidence: 100,
        priority: 4,
        reason: `Matched last 4 digits of sender account (${tx.receiver_digits})`,
      });
      continue;
    }

    // Priority 3: Amount Match + Time Window Match (90% confidence)
    const txTime = new Date(tx.received_at).getTime();
    const donationTime = new Date(donation.created_at).getTime();
    const diffMinutes = Math.abs(txTime - donationTime) / (1000 * 60);
    
    if (diffMinutes <= 30) {
      matches.push({
        transactionId: tx.id,
        confidence: 90,
        priority: 3,
        reason: `Matched amount and time window (diff: ${Math.round(diffMinutes)} mins)`,
      });
      continue;
    }
  }

  // If no matches found
  if (matches.length === 0) {
    return { 
      transactionId: null, 
      confidence: 0, 
      reason: 'No matching unmatched transaction found for this amount and payment method' 
    };
  }

  // Never automatically approve when multiple matches exist
  if (matches.length > 1) {
    // Find the match with the highest confidence
    const highestMatch = matches.reduce(
      (prev, current) => (current.priority < prev.priority ? current : prev), 
      matches[0]
    );
    
    return {
      transactionId: highestMatch.transactionId,
      confidence: Math.min(highestMatch.confidence, 80), // Cap at 80% to force manual verification
      reason: `Multiple possible matches found (count: ${matches.length}). Highest candidate matches by: ${highestMatch.reason}`,
    };
  }

  // If there's a unique match
  return {
    transactionId: matches[0].transactionId,
    confidence: matches[0].confidence,
    reason: matches[0].reason,
  };
}

