import { NextRequest, NextResponse } from 'next/server';
import { notifyNewDonation } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shouldSend = searchParams.get('send') === '1' || searchParams.get('send') === 'true';

  if (!shouldSend) {
    return NextResponse.json({
      ok: true,
      message: 'لإرسال إشعار تبرع تجريبي للجروب، أضف ?send=1 للرابط.',
      example: 'https://donations-tau.vercel.app/api/telegram/test-alert?send=1',
    });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json({
      success: false,
      error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing in Vercel environment variables',
      hasToken: !!token,
      hasChatId: !!chatId,
    }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '🌿 <b>إشعار تجريبي: فحص ربط البوت</b>\n\nنظام التنبيهات شغال بنجاح! 🚀',
        parse_mode: 'HTML',
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();

    return NextResponse.json({
      success: data.ok === true,
      chatId,
      telegramResponse: data,
    }, { status: data.ok ? 200 : 400 });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
    }, { status: 500 });
  }
}
