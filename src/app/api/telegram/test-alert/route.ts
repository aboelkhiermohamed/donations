import { NextRequest, NextResponse } from 'next/server';
import { callTelegramApi } from '@/lib/telegram';

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

  const token = searchParams.get('token') || process.env.TELEGRAM_BOT_TOKEN;
  let chatId = searchParams.get('chat_id') || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json({
      success: false,
      error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing in Vercel environment variables',
      hasToken: !!token,
      hasChatId: !!chatId,
    }, { status: 400 });
  }

  const payload = {
    chat_id: chatId,
    text: '🌿 <b>إشعار تجريبي: فحص ربط البوت</b>\n\nنظام التنبيهات شغال بنجاح! 🚀',
    parse_mode: 'HTML',
  };

  const data = await callTelegramApi('sendMessage', token, payload);

  return NextResponse.json({
    success: data.ok === true,
    chatId,
    telegramResponse: data,
  }, { status: data.ok ? 200 : 400 });
}
