import { enqueueNotificationJob, NotificationPayload } from './notificationQueue';

export type TelegramErrorType =
  | 'rate_limited'
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'server_error'
  | 'timeout'
  | 'network_error';

export interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  errorType?: TelegramErrorType;
  errorMessage?: string;
  retryAfter?: number; // In seconds
  isPermanentError?: boolean;
  rawResponse?: any;
}

export function isTelegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/**
 * Native fetch-based Telegram Bot API dispatcher.
 * Uses standard Next.js 15 global fetch (undici) with RFC 8305 Happy Eyeballs.
 * Enforces AbortSignal timeouts, comprehensive error classification, and never leaks bot token in logs.
 */
export async function sendTelegramApiRaw(
  endpoint: string,
  payload: Record<string, any> = {},
  timeoutMs: number = 25000,
  customBaseUrl?: string
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return {
      success: false,
      errorType: 'unauthorized',
      errorMessage: 'TELEGRAM_BOT_TOKEN is not configured in environment variables',
      isPermanentError: true,
    };
  }

  const base = (customBaseUrl || process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org').replace(/\/$/, '');
  const url = `${base}/bot${token}/${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const isGet = Object.keys(payload).length === 0;
    const res = await fetch(url, {
      method: isGet ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DonationsApp-Dispatcher/3.0',
      },
      ...(isGet ? {} : { body: JSON.stringify(payload) }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json().catch(() => null);
    if (!data) {
      return {
        success: false,
        errorType: 'network_error',
        errorMessage: `Empty or non-JSON response from Telegram server (HTTP ${res.status})`,
        isPermanentError: false,
      };
    }

    if (data.ok) {
      return {
        success: true,
        messageId: data.result?.message_id,
        rawResponse: data,
      };
    }

    const description = data.description || 'Unknown Telegram API error';
    const retryAfter = data.parameters?.retry_after;

    if (res.status === 429 || retryAfter) {
      return {
        success: false,
        errorType: 'rate_limited',
        errorMessage: description,
        retryAfter: retryAfter || 30,
        isPermanentError: false,
        rawResponse: data,
      };
    }

    if (res.status === 401) {
      return {
        success: false,
        errorType: 'unauthorized',
        errorMessage: description,
        isPermanentError: true,
        rawResponse: data,
      };
    }

    if (res.status === 403) {
      return {
        success: false,
        errorType: 'forbidden',
        errorMessage: description,
        isPermanentError: true,
        rawResponse: data,
      };
    }

    if (res.status === 400) {
      return {
        success: false,
        errorType: 'invalid_request',
        errorMessage: description,
        isPermanentError: true,
        rawResponse: data,
      };
    }

    return {
      success: false,
      errorType: res.status >= 500 ? 'server_error' : 'network_error',
      errorMessage: description,
      isPermanentError: false,
      rawResponse: data,
    };
  } catch (err: any) {
    clearTimeout(timer);
    const isTimeout =
      err.name === 'AbortError' ||
      err.name === 'TimeoutError' ||
      err.code === 20 ||
      err.message?.toLowerCase().includes('timeout') ||
      err.message?.toLowerCase().includes('aborted');

    return {
      success: false,
      errorType: isTimeout ? 'timeout' : 'network_error',
      errorMessage: isTimeout
        ? `Telegram request timed out after ${timeoutMs}ms (server unreachable or rate-limiting tarpit)`
        : err.message,
      isPermanentError: false,
    };
  }
}

/**
 * Dispatch a message payload to Telegram with group migration handling.
 */
export async function sendTelegramMessageDirect(
  chatId: string,
  payload: NotificationPayload,
  timeoutMs: number = 25000,
  customBaseUrl?: string
): Promise<TelegramSendResult> {
  const body = {
    chat_id: chatId,
    text: payload.text,
    parse_mode: payload.parse_mode || 'HTML',
    disable_web_page_preview: payload.disable_web_page_preview !== false,
    disable_notification: payload.disable_notification || false,
    ...(payload.reply_markup ? { reply_markup: payload.reply_markup } : {}),
  };

  const result = await sendTelegramApiRaw('sendMessage', body, timeoutMs, customBaseUrl);

  // Auto-handle group migrated to supergroup
  if (!result.success && result.rawResponse?.parameters?.migrate_to_chat_id) {
    const newChatId = String(result.rawResponse.parameters.migrate_to_chat_id);
    console.warn(`[Telegram] Group migrated to supergroup: ${newChatId}. Retrying with new ID...`);
    body.chat_id = newChatId;
    return sendTelegramApiRaw('sendMessage', body, timeoutMs, customBaseUrl);
  }

  return result;
}

// ==========================================
// BUSINESS EVENT ENQUEUEING FUNCTIONS
// ==========================================

/**
 * 1. Enqueue notification for newly registered donation
 */
export async function enqueueDonationNotification(donation: {
  id: string;
  name: string;
  amount: number;
  paymentMethod: string;
  ref?: string | null;
  status: string;
}) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.warn('[Telegram] Skipping notification: TELEGRAM_CHAT_ID is not configured');
    return { success: false, error: 'TELEGRAM_CHAT_ID not configured' };
  }

  const methodLabel = donation.paymentMethod === 'vodafone_cash' ? 'فودافون كاش 📱' : 'InstaPay ⚡';
  const statusLabel =
    donation.status === 'auto_verified'
      ? '✅ <b>معتمد ومطابق آلياً فوراً</b>'
      : '⏳ <b>معلق (بانتظار المراجعة والربط)</b>';

  const text = `🔔 <b>مساهمة جديدة تم تسجيلها على المنصة</b>\n\n` +
    `👤 <b>المساهم:</b> ${donation.name}\n` +
    `💰 <b>المبلغ:</b> <b>${Number(donation.amount).toLocaleString('en-US')} ج.م</b>\n` +
    `💳 <b>وسيلة الدفع:</b> ${methodLabel}\n` +
    `${donation.ref ? `🔢 <b>الرقم المرجعي:</b> <code>${donation.ref}</code>\n` : ''}` +
    `📊 <b>الحالة:</b> ${statusLabel}\n` +
    `🕒 <b>الوقت:</b> ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}\n\n` +
    `🌿 <i>صدقة جارية عن روح د. حسين علي الأمير ود. ندى هاني حامد</i>`;

  const inlineKeyboard = {
    inline_keyboard: [
      [
        {
          text: '📋 فتح سجل التبرعات',
          url: 'https://donations-tau.vercel.app/admin/donations',
        },
      ],
    ],
  };

  return enqueueNotificationJob({
    eventType: 'new_donation',
    destinationChatId: chatId,
    messagePayload: {
      text,
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard,
    },
    idempotencyKey: `donation_${donation.id}`,
  });
}

/**
 * 2. Enqueue notification for incoming wallet SMS
 */
export async function enqueueSmsNotification(sms: {
  id: string;
  sender: string;
  amount?: number | null;
  transactionRef?: string | null;
  matched: boolean;
  donorName?: string | null;
}) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.warn('[Telegram] Skipping notification: TELEGRAM_CHAT_ID is not configured');
    return { success: false, error: 'TELEGRAM_CHAT_ID not configured' };
  }

  const matchStatus = sms.matched
    ? `✅ <b>تمت المطابقة والاعتماد التلقائي!</b>\n👤 <b>المتبرع:</b> ${sms.donorName || 'مساهم'}`
    : '⚠️ <b>لم يتم ربطه بعد (بانتظار تسجيل المتبرع أو مراجعة يدوية)</b>';

  const text = `📩 <b>إشعار تحويل وارد من محفظة الدفع (SMS)</b>\n\n` +
    `💵 <b>المبلغ:</b> ${sms.amount ? `<b>${sms.amount.toLocaleString('en-US')} ج.م</b>` : 'غير محدد'}\n` +
    `📱 <b>المرسل:</b> <code>${sms.sender}</code>\n` +
    `${sms.transactionRef ? `🔢 <b>رقم العملية:</b> <code>${sms.transactionRef}</code>\n` : ''}` +
    `⚡ <b>حالة الربط:</b> ${matchStatus}\n` +
    `🕒 <b>الوقت:</b> ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;

  const inlineKeyboard = {
    inline_keyboard: [
      [
        {
          text: '💬 فحص بوابة الرسائل',
          url: 'https://donations-tau.vercel.app/admin/sms',
        },
      ],
    ],
  };

  return enqueueNotificationJob({
    eventType: 'incoming_sms',
    destinationChatId: chatId,
    messagePayload: {
      text,
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard,
    },
    idempotencyKey: `sms_${sms.id}`,
  });
}

/**
 * 3. Enqueue notification for manually verified donation
 */
export async function enqueueManualApprovalNotification(donation: {
  id: string;
  name: string;
  amount: number;
  adminName?: string;
  ref?: string | null;
}) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return { success: false, error: 'TELEGRAM_CHAT_ID not configured' };

  const text = `✅ <b>تم اعتماد توثيق تبرع يدوياً</b>\n\n` +
    `👤 <b>المساهم:</b> ${donation.name}\n` +
    `💰 <b>المبلغ:</b> <b>${Number(donation.amount).toLocaleString('en-US')} ج.م</b>\n` +
    `${donation.ref ? `🔢 <b>الرقم المرجعي:</b> <code>${donation.ref}</code>\n` : ''}` +
    `👮‍♂️ <b>المعتمد:</b> ${donation.adminName || 'مسؤول الحملة'}`;

  return enqueueNotificationJob({
    eventType: 'manual_approval',
    destinationChatId: chatId,
    messagePayload: {
      text,
      parse_mode: 'HTML',
    },
    idempotencyKey: `approval_${donation.id}`,
  });
}

// Backwards compatibility aliases
export const notifyNewDonation = enqueueDonationNotification;
export const notifyIncomingSms = enqueueSmsNotification;
export const notifyDonationManualApproval = enqueueManualApprovalNotification;
