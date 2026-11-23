import { NextRequest, NextResponse } from 'next/server';
import { callTelegramApi } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shouldSend = searchParams.get('send') === '1' || searchParams.get('send') === 'true';

  // Safeguard: Prevent accidental loops or crawlers from spamming Telegram API
  if (!shouldSend) {
    return NextResponse.json({
      ok: true,
      status: 'idle',
      message: 'نظام فحص تيليجرام جاهز ومحمي لمنع التكرار التلقائي. لإرسال الرسالة التجريبية أضف ?send=1 إلى الرابط.',
      exampleUrl: 'https://donations-tau.vercel.app/api/telegram/test-alert?send=1',
    });
  }

  const token = searchParams.get('token') || process.env.TELEGRAM_BOT_TOKEN;
  let chatId = searchParams.get('chat_id') || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json({
      success: false,
      error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing in environment variables',
    }, { status: 400 });
  }

  const startTime = Date.now();

  const testMessage = `🌿 <b>إشعار تجريبي: تسجيل مساهمة جديدة!</b>\n` +
    `═════════════════════\n` +
    `👤 <b>المساهم:</b> فاعل خير (تجربة نظام التنبيهات)\n` +
    `💰 <b>المبلغ:</b> <b>500 ج.م</b>\n` +
    `💳 <b>طريقة الدفع:</b> فودافون كاش 📱\n` +
    `🔖 <b>رقم العملية:</b> <code>TEST-2026-OK</code>\n` +
    `⏳ <b>الحالة:</b> قيد المراجعة والاعتماد ✅\n` +
    `═════════════════════\n` +
    `🕒 <i>وقت الإشعار: ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</i>`;

  const payload: any = {
    chat_id: chatId,
    text: testMessage,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📋 مراجعة التبرعات', url: 'https://donations-tau.vercel.app/admin/donations' },
          { text: '🌐 الموقع العام', url: 'https://donations-tau.vercel.app' },
        ],
      ],
    },
  };

  try {
    const result = await callTelegramApi('sendMessage', token, payload);
    const durationMs = Date.now() - startTime;

    if (result.ok) {
      return NextResponse.json({
        success: true,
        durationMs,
        chatId,
        message: 'تم إرسال إشعار التبرع التجريبي للجروب بنجاح! 🚀',
        telegramResult: result,
      });
    }

    return NextResponse.json(
      {
        success: false,
        durationMs,
        chatId,
        error: result.description || result.error || 'فشل إرسال الرسالة',
        tip: result.error_code === 400 || result.error_code === 403
          ? 'تأكد من إضافة البوت كعضو أو مشرف في الجروب ومنحه صلاحية إرسال الرسائل.'
          : result.description,
        telegramResult: result,
      },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        durationMs: Date.now() - startTime,
        error: err.message,
      },
      { status: 500 }
    );
  }
}
