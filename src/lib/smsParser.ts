import { PaymentMethod } from '@/types';

export interface ParsedSMS {
  payment_method: PaymentMethod;
  amount: number;
  sender_phone?: string;
  sender_name?: string;
  transaction_ref?: string;
  receiver_digits?: string;
  received_at: string;
}

export function parseSMS(sender: string, message: string, receivedAt: string): ParsedSMS {
  const normalizedSender = sender.toLowerCase().trim();
  
  // 1. VODAFONE CASH
  if (
    normalizedSender === 'vodafone cash' || 
    normalizedSender === 'vf-cash' ||
    message.includes('تم استلام مبلغ') || 
    message.includes('رقم العملية') ||
    message.includes('Received EGP') ||
    message.includes('Mobile Account Number')
  ) {
    // English / InstaPay-to-VFC transfer SMS
    // Example: "May 1, 2026 9:54:33 AM: Received EGP47 from 00201015339426 to Mobile Account Number 9964. Ref: 019610439425 Available Balance: 48.16"
    if (message.includes('Received EGP') || message.includes('Mobile Account Number')) {
      const amountMatch = message.match(/Received EGP\s*(\d+(?:\.\d+)?)/i);
      const phoneMatch = message.match(/from\s+(\d+)/i);
      const digitsMatch = message.match(/to Mobile Account Number\s+(\d+)/i);
      const txMatch = message.match(/Ref:\s*(\d+)/i);

      if (!amountMatch) {
        throw new Error('Vodafone Cash English SMS parsing failed: Amount not found');
      }

      let senderPhone = phoneMatch ? phoneMatch[1].trim() : undefined;
      if (senderPhone) {
        if (senderPhone.startsWith('002')) {
          senderPhone = senderPhone.substring(2);
        }
        if (senderPhone.startsWith('2')) {
          senderPhone = senderPhone.substring(1);
        }
      }

      return {
        payment_method: 'vodafone_cash',
        amount: parseFloat(amountMatch[1]),
        sender_phone: senderPhone,
        transaction_ref: txMatch ? txMatch[1].trim() : undefined,
        receiver_digits: digitsMatch ? digitsMatch[1].trim() : undefined,
        received_at: receivedAt,
      };
    }

    // Expected Arabic message example:
    // تم استلام مبلغ 460 جنيه من رقم 01020226381 المسجل بإسم Samer M Abouelkheir على رقم محفظتك 01015339426. رقم العملية: 020493825433
    const amountMatch = message.match(/تم استلام مبلغ\s+(\d+(?:\.\d+)?)\s+جنيه/);
    const phoneMatch = message.match(/من رقم\s+(\d+)/);
    const nameMatch = message.match(/المسجل بإسم\s+(.+?)\s+على/);
    const txMatch = message.match(/رقم العملية:\s*(\d+)/);
    
    if (!amountMatch) {
      throw new Error('Vodafone Cash SMS parsing failed: Amount not found');
    }

    let senderPhone = phoneMatch ? phoneMatch[1].trim() : undefined;
    if (senderPhone) {
      if (senderPhone.startsWith('002')) {
        senderPhone = senderPhone.substring(2);
      }
      if (senderPhone.startsWith('2')) {
        senderPhone = senderPhone.substring(1);
      }
    }

    return {
      payment_method: 'vodafone_cash',
      amount: parseFloat(amountMatch[1]),
      sender_phone: senderPhone,
      sender_name: nameMatch ? nameMatch[1].trim() : undefined,
      transaction_ref: txMatch ? txMatch[1].trim() : undefined,
      received_at: receivedAt,
    };
  }

  // 2. INSTAPAY
  if (normalizedSender === 'instapay' || normalizedSender === 'ipn' || message.toLowerCase().includes('ipn transfer')) {
    // Expected message example:
    // IPN transfer received with amount of EGP 4000.00 on 7425 on 23/06 at 03:40 PM. Ref# 4a36aa42
    
    const amountMatch = message.match(/amount of EGP\s+(\d+(?:\.\d+)?)/i);
    const digitsMatch = message.match(/on\s+(\d+)\s+on/i);
    const refMatch = message.match(/Ref#\s*(\w+)/i);

    if (!amountMatch) {
      throw new Error('InstaPay SMS parsing failed: Amount not found');
    }

    return {
      payment_method: 'instapay',
      amount: parseFloat(amountMatch[1]),
      receiver_digits: digitsMatch ? digitsMatch[1].trim() : undefined,
      transaction_ref: refMatch ? refMatch[1].trim() : undefined,
      received_at: receivedAt,
    };
  }

  throw new Error(`Unsupported SMS sender or format: ${sender}`);
}
