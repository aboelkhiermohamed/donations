import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tokenParam = searchParams.get('token');
  const chatIdParam = searchParams.get('chat_id');

  const token = tokenParam || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = chatIdParam || process.env.TELEGRAM_CHAT_ID;
  const webhookUrl = 'https://donations-tau.vercel.app/api/telegram/webhook';

  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: 'TELEGRAM_BOT_TOKEN is not provided in query param or env',
        tip: 'Pass ?token=YOUR_BOT_TOKEN in the URL, or add it in Vercel Environment Variables.',
      },
      { status: 400 }
    );
  }

  try {
    const startTime = Date.now();

    // 1. Check getMe first
    const getMeRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(25000),
    });
    const getMeData = await getMeRes.json();

    if (!getMeData.ok) {
      return NextResponse.json({
        ok: false,
        step: 'getMe',
        durationMs: Date.now() - startTime,
        telegramResponse: getMeData,
      });
    }

    // 2. Set Webhook from Vercel Server
    const webhookRes = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
      { signal: AbortSignal.timeout(25000) }
    );
    const webhookData = await webhookRes.json();

    // 3. Test send a greetings message to the group if configured
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
          signal: AbortSignal.timeout(25000),
        });
        testMessageData = await msgRes.json();
      } catch (err: any) {
        testMessageData = { error: err.message };
      }
    }

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - startTime,
      bot: getMeData.result,
      webhookUrl,
      webhookResult: webhookData,
      testMessageResult: testMessageData,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
