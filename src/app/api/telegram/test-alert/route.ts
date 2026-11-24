import { NextRequest, NextResponse } from 'next/server';
import { enqueueNotificationJob } from '@/lib/notificationQueue';
import { sendTelegramMessageDirect } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shouldSend = searchParams.get('send') === '1' || searchParams.get('send') === 'true';

  if (!shouldSend) {
    return NextResponse.json({
      ok: true,
      message: 'نظام فحص التنبيهات جاهز ومحمي. لإرسال إشعار تجريبي عبر طابور المهام، أضف ?send=1.',
      example: 'https://donations-tau.vercel.app/api/telegram/test-alert?send=1',
      workerUrl: 'https://donations-tau.vercel.app/api/internal/telegram-worker',
    });
  }

  const chatId = searchParams.get('chat_id') || process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    return NextResponse.json({
      success: false,
      error: 'TELEGRAM_CHAT_ID is missing in environment variables',
    }, { status: 400 });
  }

  const isDirect = searchParams.get('direct') === '1';

  const testPayload = {
    text: `🌿 <b>إشعار تجريبي: فحص ربط طابور الإشعارات</b>\n` +
      `═════════════════════\n` +
      `✅ <b>الحالة:</b> نظام طابور الرسائل يعمل بنجاح!\n` +
      `🕒 <i>وقت الفحص: ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</i>`,
    parse_mode: 'HTML' as const,
  };

  if (isDirect) {
    // Direct send test
    const result = await sendTelegramMessageDirect(chatId, testPayload);
    return NextResponse.json({
      success: result.success,
      mode: 'direct',
      result,
    }, { status: result.success ? 200 : 400 });
  }

  // Queue-based test (Durable Queue)
  const enqueueResult = await enqueueNotificationJob({
    eventType: 'test_alert',
    destinationChatId: chatId,
    messagePayload: testPayload,
    idempotencyKey: `test_alert_${Date.now()}`,
  });

  return NextResponse.json({
    success: enqueueResult.success,
    mode: 'durable_queue',
    jobId: enqueueResult.jobId,
    message: 'تم إدراج الإشعار التجريبي في طابور المهام بنجاح 🚀 سيقوم الـ Worker بمعالجته فوراً.',
    tip: 'يمكنك استدعاء /api/internal/telegram-worker لتنفيذ الطابور لحظياً.',
  });
}
