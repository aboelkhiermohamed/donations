import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const webhookUrl = 'https://donations-tau.vercel.app/api/telegram/webhook';

  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: 'TELEGRAM_BOT_TOKEN is not set in environment variables',
        tip: 'Please add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Vercel Project Settings -> Environment Variables, then Redeploy.',
      },
      { status: 400 }
    );
  }

  try {
    // 1. Set Webhook from Vercel Server
    const webhookRes = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const webhookData = await webhookRes.json();

    // 2. Test send a greetings message to the group if configured
    let testMessageData = null;
    if (chatId && webhookData.ok) {
      try {
        const msgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🌿 <b>تم تفعيل بوت التليجرام وربطه بالمنصة بنجاح!</b>\n\nستصل هنا جميع إشعارات التبرعات الجديدة ورسائل المحفظة لحظياً ⚡\nاكتب <b>/stats</b> للحصول على الإحصائيات الحالية في أي وقت.`,
            parse_mode: 'HTML',
          }),
          signal: AbortSignal.timeout(10000),
        });
        testMessageData = await msgRes.json();
      } catch (err: any) {
        testMessageData = { error: err.message };
      }
    }

    return NextResponse.json({
      success: true,
      webhookUrl,
      webhookResult: webhookData,
      testMessageResult: testMessageData,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
