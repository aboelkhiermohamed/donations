import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramApiRaw, sendTelegramMessageDirect } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const webhookUrl = 'https://donations-tau.vercel.app/api/telegram/webhook';
  const chatId = process.env.TELEGRAM_CHAT_ID;

  try {
    // 1. Verify Bot via getMe
    const getMeRes = await sendTelegramApiRaw('getMe');
    if (!getMeRes.success) {
      return NextResponse.json(
        {
          ok: false,
          step: 'getMe',
          error: getMeRes.errorMessage,
          details: getMeRes.rawResponse,
        },
        { status: 500 }
      );
    }

    // 2. Set Webhook with drop_pending_updates
    const setWebhookRes = await sendTelegramApiRaw('setWebhook', {
      url: webhookUrl,
      drop_pending_updates: true,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
    });

    // 3. Register Telegram Bot Commands Menu (so user sees [/] menu button in chat)
    const setCommandsRes = await sendTelegramApiRaw('setMyCommands', {
      commands: [
        { command: 'stats', description: '📊 إحصائيات الحصيلة المباشرة' },
        { command: 'today', description: '📅 ملخص مساهمات اليوم' },
        { command: 'pending', description: '⏳ التبرعات المعلقة للاعتماد' },
        { command: 'links', description: '🔗 روابط المنصة الأساسية' },
        { command: 'help', description: '🌿 مساعدة وشرح الأوامر' },
      ],
    });

    // 4. Optional greeting test to chat if requested via ?notify=1
    const { searchParams } = new URL(req.url);
    let testMsgResult = null;
    if (searchParams.get('notify') === '1' && chatId) {
      testMsgResult = await sendTelegramMessageDirect(chatId, {
        text: `🤖 <b>تم تفعيل أوامر البوت التفاعلية بنجاح!</b>\n\nاكتب <b>/stats</b> في أي وقت لمشاهدة إحصائيات التبرعات المباشرة 📊\nأو اضغط على زر القائمة <b>[/]</b> لاستعراض جميع الأوامر المتاحة.`,
      });
    }

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startTime,
      bot: getMeRes.rawResponse?.result,
      webhook: {
        targetUrl: webhookUrl,
        result: setWebhookRes,
      },
      commands: setCommandsRes,
      notificationTest: testMsgResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err.message,
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
