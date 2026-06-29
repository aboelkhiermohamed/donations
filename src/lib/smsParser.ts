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
    // Example: "Apr 17, 2026 10:21:10 PM: Received EGP20 from 00201033318736 to Mobile Account Number 9964. Ref: 019252419734 Available Balance: 130.16"
    if (message.includes('Received EGP') || message.includes('Mobile Account Number') || message.includes('Received')) {
      const amountMatch = message.match(/Received EGP\s*(\d+(?:\.\d+)?)/i) || message.match(/Received\s*(\d+(?:\.\d+)?)/i);
      const phoneMatch = message.match(/from\s+(\d+)/i);
      const digitsMatch = message.match(/to Mobile Account Number\s+(\d+)/i) || message.match(/Account Number\s+(\d+)/i);
      const txMatch = message.match(/Ref:\s*(\d+)/i) || message.match(/Ref#\s*(\d+)/i) || message.match(/Ref\s*(\d+)/i);
 
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
    // تم استلام مبلغ 3400 جنيه من رقم 01009746581 المسجل بإسم Mohamed G Ghazy على رقم محفظتك 01015339426. رقم العملية: 019417068125
    const amountMatch = message.match(/تم استلام مبلغ\s+(\d+(?:\.\d+)?)\s*(?:جنيه|ج\.م|جم)/);
    const phoneMatch = message.match(/من رقم\s+(\d+)/);
    const nameMatch = message.match(/المسجل بإسم\s+([\s\S]+?)\s+على/) || message.match(/بإسم\s+([\s\S]+?)\s+على/);
    const txMatch = message.match(/رقم العملية:?\s*(\d+)/) || message.match(/العملية:?\s*(\d+)/);
     
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
 
  // 2. INSTAPAY (English & Arabic)
  if (
    normalizedSender === 'instapay' || 
    normalizedSender === 'ipn' || 
    message.toLowerCase().includes('ipn transfer') ||
    message.includes('تحويل لحظي') ||
    message.includes('مسبقة الدفع')
  ) {
    // Check if it's the Arabic template:
    // تم إضافة تحويل لحظي لبطاقتكم مسبقة الدفع بمبلغ 306.00 جم من MOHAMED AHMED MOHAMED ABO ELKHIER رقم مرجعي 314598988034 يوم 05-01 الساعة 14:41 للمزيد اتصل بـ 19623
    if (message.includes('تحويل لحظي') || message.includes('مسبقة الدفع') || message.includes('تحويل')) {
      const amountMatch = message.match(/بمبلغ\s+(\d+(?:\.\d+)?)\s*(?:جم|جم\.|ج\.م|جنيه)/) || message.match(/مبلغ\s+(\d+(?:\.\d+)?)/);
      const nameMatch = message.match(/من\s+([\s\S]+?)\s+رقم\s+مرجعي/i) || message.match(/من\s+([\s\S]+?)\s+رقم/i) || message.match(/من\s+([\s\S]+?)\s+يوم/i);
      const refMatch = message.match(/رقم\s+مرجعي\s*(\d+)/) || message.match(/العملية\s*(\d+)/) || message.match(/مرجع\s*(\d+)/) || message.match(/الرقم\s+المرجعي\s*(\d+)/);
 
      if (!amountMatch) {
        throw new Error('InstaPay Arabic SMS parsing failed: Amount not found');
      }
 
      return {
        payment_method: 'instapay',
        amount: parseFloat(amountMatch[1]),
        sender_name: nameMatch ? nameMatch[1].trim() : undefined,
        transaction_ref: refMatch ? refMatch[1].trim() : undefined,
        received_at: receivedAt,
      };
    }
 
    // English template:
    // IPN transfer received with amount of EGP 50.00 on 7425 on 24/06 at 08:07 PM. Ref# 883d1dd7. For more details call 16607.
    const amountMatch = message.match(/amount of EGP\s+(\d+(?:\.\d+)?)/i) || message.match(/EGP\s*(\d+(?:\.\d+)?)/i);
    const digitsMatch = message.match(/on\s+(\d+)\s+on/i) || message.match(/account\s+(\d+)/i) || message.match(/card\s+(\d+)/i);
    const refMatch = message.match(/Ref#\s*(\w+)/i) || message.match(/Ref:\s*(\w+)/i) || message.match(/Ref\s*(\w+)/i);
 
    if (!amountMatch) {
      throw new Error('InstaPay English SMS parsing failed: Amount not found');
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
