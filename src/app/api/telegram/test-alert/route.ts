import { NextRequest, NextResponse, after } from 'next/server';
import { enqueueNotificationJob, clearNotificationQueue } from '@/lib/notificationQueue';
import { sendTelegramMessageDirect, sendTelegramApiRaw } from '@/lib/telegram';
import { runTelegramWorker } from '@/lib/notificationWorker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // 1. Reset / Purge Queue & Rate Limits (?reset=1)
  const shouldReset = searchParams.get('reset') === '1' || searchParams.get('clear_queue') === '1';
  if (shouldReset) {
    const resetResult = await clearNotificationQueue({ resetRateLimits: true });
    return NextResponse.json({
      ok: true,
      message: 'تم تصفية طابور الرسائل وإعادة ضبط حدود الـ Rate Limits بنجاح!',
      purged: resetResult,
    });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const configuredChatId = process.env.TELEGRAM_CHAT_ID;
  const targetChatId = searchParams.get('chat_id') || configuredChatId;
  const customBaseUrl = searchParams.get('api_base') || searchParams.get('proxy') || process.env.TELEGRAM_API_BASE_URL;

  // 2. Full Diagnostic Mode (?diagnose=1 or ?check=1)
  // Tests getMe, getChat, and getChatMember to identify exact permissions and validity
  const shouldDiagnose = searchParams.get('diagnose') === '1' || searchParams.get('check') === '1';
  if (shouldDiagnose) {
    const diagnosticReport: Record<string, any> = {
      timestamp: new Date().toISOString(),
      apiBaseUrlUsed: customBaseUrl || 'https://api.telegram.org (Direct)',
      botTokenConfigured: !!token,
      botTokenPrefix: token ? `${token.slice(0, 10)}...` : null,
      configuredChatId: configuredChatId || 'NOT_SET',
      targetChatId: targetChatId || 'NOT_SET',
    };

    // Step A: Check getMe (Bot Identity & API reachability)
    const getMe = await sendTelegramApiRaw('getMe', {}, 35000, customBaseUrl);
    diagnosticReport.getMe = getMe;

    const botId = getMe.rawResponse?.result?.id;

    if (targetChatId) {
      // Step B: Check getChat (Chat exists & Type)
      const getChat = await sendTelegramApiRaw('getChat', { chat_id: targetChatId }, 35000, customBaseUrl);
      diagnosticReport.getChat = getChat;

      // Step C: Check bot membership status in the group
      if (botId) {
        const getMember = await sendTelegramApiRaw(
          'getChatMember',
          { chat_id: targetChatId, user_id: botId },
          35000,
          customBaseUrl
        );
        diagnosticReport.botMembership = getMember;
      }
    }

    return NextResponse.json(diagnosticReport);
  }

  const shouldSend = searchParams.get('send') === '1' || searchParams.get('send') === 'true';

  if (!shouldSend) {
    return NextResponse.json({
      ok: true,
      status: 'Diagnostic endpoint ready',
      configuredChatId: configuredChatId || 'NOT_SET',
      botTokenSet: !!token,
      endpoints: {
        diagnoseFullBotAndChat: `/api/telegram/test-alert?diagnose=1${targetChatId ? `&chat_id=${targetChatId}` : ''}`,
        sendDirectTest: `/api/telegram/test-alert?send=1&direct=1${targetChatId ? `&chat_id=${targetChatId}` : ''}`,
        sendViaDurableQueue: `/api/telegram/test-alert?send=1${targetChatId ? `&chat_id=${targetChatId}` : ''}`,
        resetAndClearQueue: '/api/telegram/test-alert?reset=1',
      },
    });
  }

  if (!targetChatId) {
    return NextResponse.json({
      success: false,
      error: 'TELEGRAM_CHAT_ID is missing in environment variables and was not passed in query',
    }, { status: 400 });
  }

  const isDirect = searchParams.get('direct') === '1';
  const isSmsTest = searchParams.get('type') === 'sms' || searchParams.get('sms') === '1';

  const testPayload = isSmsTest
    ? {
        text: `📩 <b>إشعار تحويل وارد من محفظة الدفع (SMS)</b>\n\n` +
          `💵 <b>المبلغ:</b> <b>1,000 ج.م</b>\n` +
          `📱 <b>المرسل:</b> <code>+201555585154</code>\n` +
          `🔢 <b>رقم العملية:</b> <code>026998152680</code>\n` +
          `⚡ <b>حالة الربط:</b> ⚠️ <b>لم يتم ربطه بعد (بانتظار تسجيل المتبرع أو مراجعة يدوية)</b>\n` +
          `💬 <b>نص الرسالة:</b>\n<code>تم استلام مبلغ 1,000.00 ج.م من 01555585154 بنجاح. رقم العملية: 026998152680</code>\n` +
          `🕒 <b>الوقت:</b> ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`,
        parse_mode: 'HTML' as const,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '💬 فحص بوابة الرسائل',
                url: 'https://donations-tau.vercel.app/admin/sms',
              },
            ],
          ],
        },
      }
    : {
        text: `🌿 <b>إشعار تجريبي: فحص ربط البوت</b>\n` +
          `═════════════════════\n` +
          `✅ <b>الحالة:</b> البوت متصل بنجاح وجاهز لاستقبال التبرعات!\n` +
          `🎯 <b>معرف الجروب:</b> <code>${targetChatId}</code>\n` +
          `🕒 <i>وقت الفحص: ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</i>`,
        parse_mode: 'HTML' as const,
      };

  // Direct send mode (bypasses queue for instant Telegram API verification)
  // Timeout set to 35s to capture actual response even if Telegram is tarpitting
  if (isDirect) {
    const result = await sendTelegramMessageDirect(targetChatId, testPayload, 35000, customBaseUrl);
    return NextResponse.json({
      success: result.success,
      mode: 'direct',
      chatId: targetChatId,
      result,
    }, { status: result.success ? 200 : 400 });
  }

  // Queue-based test (Durable Queue)
  const enqueueResult = await enqueueNotificationJob({
    eventType: 'test_alert',
    destinationChatId: targetChatId,
    messagePayload: testPayload,
    idempotencyKey: `test_alert_${Date.now()}`,
  });

  // Trigger immediate background drain using Next.js 15 after()
  after(async () => {
    try {
      await runTelegramWorker({ maxBudgetMs: 20000, batchSize: 5 });
    } catch (err: any) {
      console.error('[after:test-alert] Background worker error:', err?.message);
    }
  });

  return NextResponse.json({
    success: enqueueResult.success,
    mode: 'durable_queue',
    chatId: targetChatId,
    jobId: enqueueResult.jobId,
    message: 'تم إدراج الإشعار التجريبي في طابور المهام بنجاح 🚀 تم تشغيل الـ Worker في الخلفية فورياً عبر after().',
  });
}
