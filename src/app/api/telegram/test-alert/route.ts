import { NextRequest, NextResponse } from 'next/server';
import { callTelegramApi } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') || process.env.TELEGRAM_BOT_TOKEN || '9104128470:AAGnsqLdgfyUg0giXHup4a8DdFbZEfImSQw';
  let chatId = searchParams.get('chat_id') || process.env.TELEGRAM_CHAT_ID || '-5508827945';

  const startTime = Date.now();

  // 1. First check getMe to verify the bot token health
  const me = await callTelegramApi('getMe', token);
  if (!me.ok) {
    return NextResponse.json({
      success: false,
      step: 'getMe',
      tokenUsed: token.slice(0, 10) + '...',
      durationMs: Date.now() - startTime,
      error: me.description || me.error || 'Failed to authenticate bot',
      details: me,
    }, { status: 400 });
  }

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
    // 1. Try sending to the specified chat ID
    let result = await callTelegramApi('sendMessage', token, payload);

    // 2. Only retry if Telegram explicitly responded with "chat not found"
    if (!result.ok && result.error_code === 400 && chatId.startsWith('-') && !chatId.startsWith('-100')) {
      const supergroupId = `-100${chatId.slice(1)}`;
      payload.chat_id = supergroupId;
      const superResult = await callTelegramApi('sendMessage', token, payload);
      if (superResult.ok) {
        result = {
          ...superResult,
          note: `Auto-switched from ${chatId} to supergroup ${supergroupId}`,
        };
        chatId = supergroupId;
      }
    }

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
          ? 'تأكد من إضافة البوت الجديد كعضو أو مسؤول في الجروب ومنحه صلاحية إرسال الرسائل.'
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
