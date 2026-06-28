// TypeScript definitions for the Donation Platform

export interface Campaign {
  id: string;
  name: string;
  name_ar: string;
  description: string;
  description_ar: string;
  target_amount: number;
  collected_amount: number;
  organizer: string;
  organizer_ar: string;
  cover_image?: string;
  created_at: string;
  updated_at: string;
}

export interface Donor {
  id: string;
  name: string;
  phone: string;
  created_at: string;
}

export type DonationStatus = 'pending' | 'auto_verified' | 'manual_verified' | 'rejected' | 'refunded';
export type PaymentMethod = 'vodafone_cash' | 'instapay';

export interface Donation {
  id: string;
  donor_id: string;
  campaign_id: string;
  amount: number;
  payment_method: PaymentMethod;
  status: DonationStatus;
  transaction_ref?: string;
  last_4_digits?: string;
  notes?: string;
  screenshot_url?: string;
  verification_method?: 'auto' | 'manual';
  verified_at?: string;
  matched_transaction_id?: string;
  created_at: string;
  updated_at: string;
  
  // Relations
  donor?: Donor;
  campaign?: Campaign;
  matched_transaction?: IncomingTransaction;
}

export type TransactionStatus = 'unmatched' | 'matched' | 'manual_match';

export interface IncomingTransaction {
  id: string;
  payment_method: PaymentMethod;
  amount: number;
  sender_phone?: string;
  sender_name?: string;
  transaction_ref?: string;
  receiver_digits?: string;
  received_at: string;
  matched_donation_id?: string;
  matching_confidence: number;
  status: TransactionStatus;
  raw_sms: string;
  processing_hash: string;
  created_at: string;

  // Relations
  matched_donation?: Donation;
}

export interface SMSLog {
  id: string;
  sender: string;
  message: string;
  received_at: string;
  status: 'success' | 'duplicate' | 'failed_parsing';
  error_message?: string;
  created_at: string;
}

export interface Admin {
  id: string;
  name: string;
  email: string;
  role: 'superadmin' | 'admin';
  created_at: string;
}

export interface AuditLog {
  id: string;
  admin_id?: string;
  action: string;
  target_table?: string;
  target_id?: string;
  details?: Record<string, any>;
  created_at: string;
}

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  type: 'new_donation' | 'new_sms' | 'verification_failed' | 'large_donation';
  is_read: boolean;
  created_at: string;
}
