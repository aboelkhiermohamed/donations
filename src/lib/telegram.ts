import https from 'node:https';
import dns from 'node:dns';
import { enqueueNotificationJob, NotificationPayload } from './notificationQueue';

// Ensure IPv4 resolution is prioritized across the Node.js process
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

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
 * Direct low-level dispatcher to api.telegram.org.
 * Enforces IPv4, request timeout, and comprehensive error classification.
 * NEVER exposes the bot token in logs.
 */
export async function sendTelegramApiRaw(
  endpoint: string,
  payload: Record<string, any>,
  timeoutMs: number = 8000
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

  const postData = JSON.stringify(payload);

  return new Promise((resolve) => {
    let resolved = false;

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/${endpoint}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'DonationsApp-Dispatcher/2.0',
        },
        family: 4,
        timeout: timeoutMs,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          if (resolved) return;
          resolved = true;

          try {
            const data = JSON.parse(raw);
            const statusCode = res.statusCode || 200;

            if (data.ok) {
              return resolve({
                success: true,
                messageId: data.result?.message_id,
                rawResponse: data,
              });
            }

            // Error Classification
            const description = data.description || 'Unknown Telegram API error';
            const retryAfter = data.parameters?.retry_after;

            if (statusCode === 429 || retryAfter) {
              return resolve({
                success: false,
                errorType: 'rate_limited',
                errorMessage: description,
                retryAfter: retryAfter || 30,
                isPermanentError: false,
                rawResponse: data,
              });
            }

            if (statusCode === 401) {
              return resolve({
                success: false,
                errorType: 'unauthorized',
                errorMessage: description,
                isPermanentError: true,
                rawResponse: data,
              });
            }

            if (statusCode === 403) {
              return resolve({
                success: false,
                errorType: 'forbidden',
                errorMessage: description,
                isPermanentError: true,
                rawResponse: data,
              });
            }

            if (statusCode === 400) {
              return resolve({
                success: false,
                errorType: 'invalid_request',
                errorMessage: description,
                isPermanentError: true,
                rawResponse: data,
              });
            }

            if (statusCode >= 500) {
              return resolve({
                success: false,
                errorType: 'server_error',
                errorMessage: `Telegram server error (${statusCode}): ${description}`,
                isPermanentError: false,
                rawResponse: data,
              });
            }

            return resolve({
              success: false,
              errorType: 'network_error',
              errorMessage: description,
              isPermanentError: false,
              rawResponse: data,
            });
          } catch {
            return resolve({
              success: false,
              errorType: 'network_error',
              errorMessage: 'Invalid JSON response from Telegram server',
              isPermanentError: false,
            });
          }
        });
      }
    );

    req.on('timeout', () => {
      if (resolved) return;
      resolved = true;
      req.destroy();
      return resolve({
        success: false,
        errorType: 'timeout',
        errorMessage: `Telegram request timed out after ${timeoutMs}ms`,
        isPermanentError: false,
      });
    });

    req.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      return resolve({
        success: false,
        errorType: 'network_error',
        errorMessage: err.message,
        isPermanentError: false,
      });
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Dispatch a message payload to Telegram with group migration handling.
 */
export async function sendTelegramMessageDirect(
  chatId: string,
  payload: NotificationPayload,
  timeoutMs: number = 8000
): Promise<TelegramSendResult> {
  const body = {
    chat_id: chatId,
    text: payload.text,
    parse_mode: payload.parse_mode || 'HTML',
    disable_web_page_preview: payload.disable_web_page_preview !== false,
    disable_notification: payload.disable_notification || false,
    ...(payload.reply_markup ? { reply_markup: payload.reply_markup } : {}),
  };

  const result = await sendTelegramApiRaw('sendMessage', body, timeoutMs);

  // Auto-handle group migrated to supergroup
  if (!result.success && result.rawResponse?.parameters?.migrate_to_chat_id) {
    const newChatId = String(result.rawResponse.parameters.migrate_to_chat_id);
    console.warn(`[Telegram] Group migrated to supergroup: ${newChatId}. Retrying with new ID...`);
    body.chat_id = newChatId;
    return sendTelegramApiRaw('sendMessage', body, timeoutMs);
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

// Backwards compatibility aliases for existing imports
export const notifyNewDonation = enqueueDonationNotification;
export const notifyIncomingSms = enqueueSmsNotification;
export const notifyDonationManualApproval = enqueueManualApprovalNotification;
