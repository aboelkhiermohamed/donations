import { NextRequest, NextResponse, after } from 'next/server';
import { enqueueNotificationJob, clearNotificationQueue } from '@/lib/notificationQueue';
import { sendTelegramMessageDirect, sendTelegramApiRaw } from '@/lib/telegram';
import { runTelegramWorker } from '@/lib/notificationWorker';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // 1. Handle Queue / Rate Limit Reset if requested (?reset=1 or ?clear_queue=1)
  const shouldReset = searchParams.get('reset') === '1' || searchParams.get('clear_queue') === '1';
  if (shouldReset) {
    const resetResult = await clearNotificationQueue({ resetRateLimits: true });
    return NextResponse.json({
      ok: true,
      message: 'تم تصفية طابور الرسائل وإعادة ضبط حدود الـ Rate Limits بنجاح!',
      purged: resetResult,
    });
  }

  // 2. Handle Bot Diagnostic / getMe (?get_me=1)
  if (searchParams.get('get_me') === '1') {
    const getMeResult = await sendTelegramApiRaw('getMe', {}, 6000);
    return NextResponse.json({
      ok: getMeResult.success,
      botTokenConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
      configuredChatId: process.env.TELEGRAM_CHAT_ID || 'NOT_CONFIGURED',
      getMe: getMeResult,
    });
  }

  const shouldSend = searchParams.get('send') === '1' || searchParams.get('send') === 'true';

  if (!shouldSend) {
    return NextResponse.json({
      ok: true,
      status: 'Diagnostic endpoint ready',
      configuredChatId: process.env.TELEGRAM_CHAT_ID || 'NOT_SET',
      botTokenSet: !!process.env.TELEGRAM_BOT_TOKEN,
      examples: {
        sendViaQueue: '/api/telegram/test-alert?send=1',
        sendDirectWithChatId: '/api/telegram/test-alert?send=1&direct=1&chat_id=-1004417332581',
        clearOldStuckQueue: '/api/telegram/test-alert?reset=1',
        checkBotIdentity: '/api/telegram/test-alert?get_me=1',
      },
    });
  }

  const chatId = searchParams.get('chat_id') || process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    return NextResponse.json({
      success: false,
      error: 'TELEGRAM_CHAT_ID is missing in environment variables and was not passed in query',
    }, { status: 400 });
  }

  const isDirect = searchParams.get('direct') === '1';

  const testPayload = {
    text: `🌿 <b>إشعار تجريبي: فحص ربط البوت</b>\n` +
      `═════════════════════\n` +
      `✅ <b>الحالة:</b> البوت متصل بنجاح وجاهز لاستقبال التبرعات!\n` +
      `🎯 <b>معرف الجروب:</b> <code>${chatId}</code>\n` +
      `🕒 <i>وقت الفحص: ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</i>`,
    parse_mode: 'HTML' as const,
  };

  // Direct send mode (bypasses queue for instant Telegram API verification)
  if (isDirect) {
    const result = await sendTelegramMessageDirect(chatId, testPayload, 10000);
    return NextResponse.json({
      success: result.success,
      mode: 'direct',
      chatId,
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

  // Trigger immediate background drain using Next.js 15 after()
  after(async () => {
    try {
      await runTelegramWorker({ maxBudgetMs: 15000, batchSize: 5 });
    } catch (err: any) {
      console.error('[after:test-alert] Background worker error:', err?.message);
    }
  });

  return NextResponse.json({
    success: enqueueResult.success,
    mode: 'durable_queue',
    chatId,
    jobId: enqueueResult.jobId,
    message: 'تم إدراج الإشعار التجريبي في طابور المهام بنجاح 🚀 تم تشغيل الـ Worker في الخلفية فورياً عبر after().',
  });
}
