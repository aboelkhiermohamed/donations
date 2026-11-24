import https from 'node:https';
import dns from 'node:dns';

// Force IPv4 DNS resolution across Node.js process to bypass Vercel/AWS Lambda IPv6 blackhole
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

/**
 * Direct Telegram API caller forcing IPv4 (family: 4).
 * Completely eliminates the AWS Lambda / Vercel IPv6 blackhole timeout.
 */
export async function callTelegramApi(endpoint: string, token: string, body?: any): Promise<any> {
  return new Promise((resolve) => {
    const postData = body ? JSON.stringify(body) : '';
    const headers: Record<string, string | number> = {
      'User-Agent': 'DonationsApp/1.0',
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/${endpoint}`,
        method: body ? 'POST' : 'GET',
        headers,
        family: 4,
        timeout: 10000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve({ ok: false, error: 'Invalid JSON response from Telegram', raw });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Telegram connection timed out (10s)' });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    if (body) {
      req.write(postData);
    }
    req.end();
  });
}

export function isTelegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

interface SendTelegramOptions {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  reply_markup?: any;
  silent?: boolean;
}

/**
 * Core function to send a message to the configured Telegram chat.
 */
export async function sendTelegramMessage(
  text: string,
  options: SendTelegramOptions = { parse_mode: 'HTML' }
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment');
    return false;
  }

  try {
    const payload: any = {
      chat_id: chatId,
      text: text,
      parse_mode: options.parse_mode || 'HTML',
      disable_web_page_preview: true,
      disable_notification: options.silent || false,
    };

    if (options.reply_markup) {
      payload.reply_markup = options.reply_markup;
    }

    const data = await callTelegramApi('sendMessage', token, payload);

    // If group migrated to supergroup, auto-update chat_id and retry once
    if (!data.ok && data.parameters?.migrate_to_chat_id) {
      const newChatId = data.parameters.migrate_to_chat_id;
      console.warn(`[Telegram] Group migrated to supergroup: ${newChatId}. Retrying...`);
      payload.chat_id = newChatId;
      const retryData = await callTelegramApi('sendMessage', token, payload);
      return retryData.ok === true;
    }

    if (!data.ok) {
      console.error('[Telegram] API Error:', data.description || data.error || data);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error('[Telegram] Dispatch Error:', err.message);
    return false;
  }
}

/**
 * 1. Notify organizers when a new donation submission is registered
 */
export async function notifyNewDonation(donation: {
  id?: string;
  name: string;
  amount: number;
  payment_method: string;
  ref?: string | null;
  status: string;
}) {
  const methodLabel = donation.payment_method === 'vodafone_cash' ? 'فودافون كاش 📱' : 'InstaPay ⚡';
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

  return sendTelegramMessage(text, { parse_mode: 'HTML', reply_markup: inlineKeyboard });
}

/**
 * 2. Notify organizers when an incoming SMS arrives on the Gateway
 */
export async function notifyIncomingSms(sms: {
  sender: string;
  amount?: number | null;
  transactionRef?: string | null;
  matched: boolean;
  donorName?: string | null;
}) {
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

  return sendTelegramMessage(text, { parse_mode: 'HTML', reply_markup: inlineKeyboard });
}

/**
 * 3. Notify organizers when a donation is manually verified by an admin
 */
export async function notifyDonationManualApproval(donation: {
  name: string;
  amount: number;
  adminName?: string;
  ref?: string | null;
}) {
  const text = `✅ <b>تم اعتماد توثيق تبرع يدوياً</b>\n\n` +
    `👤 <b>المساهم:</b> ${donation.name}\n` +
    `💰 <b>المبلغ:</b> <b>${Number(donation.amount).toLocaleString('en-US')} ج.م</b>\n` +
    `${donation.ref ? `🔢 <b>الرقم المرجعي:</b> <code>${donation.ref}</code>\n` : ''}` +
    `👮‍♂️ <b>المعتمد:</b> ${donation.adminName || 'مسؤول الحملة'}`;

  return sendTelegramMessage(text, { parse_mode: 'HTML' });
}
