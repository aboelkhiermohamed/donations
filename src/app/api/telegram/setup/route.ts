import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Smart fetch helper for Telegram Bot API with automatic rate-limit cooldown handling
 */
async function fetchTelegramWithRetry(url: string, options: any = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json();

    // If rate-limited by Telegram (429), wait out the cooldown and retry automatically
    if (!data.ok && data.error_code === 429 && data.parameters?.retry_after) {
      const waitSec = Math.min(Number(data.parameters.retry_after) + 2, 35);
      console.warn(`[Telegram Setup] Rate limited (429). Waiting ${waitSec}s for cooldown...`);
      await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));

      const retryRes = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(12000),
      });
      return await retryRes.json();
    }

    return data;
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

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

  const startTime = Date.now();

  // 1. Verify Bot via getMe (with automatic rate-limit wait)
  const getMeData = await fetchTelegramWithRetry(
    `https://api.telegram.org/bot${token}/getMe`
  );

  if (!getMeData.ok) {
    return NextResponse.json(
      {
        ok: false,
        step: 'getMe',
        durationMs: Date.now() - startTime,
        error: getMeData.description || getMeData.error || 'Failed to connect to Telegram bot',
        details: getMeData,
      },
      { status: getMeData.error_code === 429 ? 429 : 500 }
    );
  }

  // 2. Set Webhook to our Vercel endpoint
  const webhookData = await fetchTelegramWithRetry(
    `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
  );

  // 3. Test sending a message to the group
  let testMessageData: any = null;
  if (chatId) {
    const text = `🌿 <b>تم تفعيل بوت التليجرام وربطه بالمنصة بنجاح!</b>\n\nستصل هنا جميع إشعارات التبرعات الجديدة ورسائل المحفظة لحظياً ⚡\nاكتب <b>/stats</b> للحصول على الإحصائيات الحالية في أي وقت.`;

    // Attempt with provided chat ID
    testMessageData = await fetchTelegramWithRetry(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      }
    );

    // If chat not found and ID starts with minus but not -100, try supergroup prefix -100
    if (
      !testMessageData.ok &&
      chatId.startsWith('-') &&
      !chatId.startsWith('-100')
    ) {
      const supergroupId = `-100${chatId.slice(1)}`;
      const supergroupAttempt = await fetchTelegramWithRetry(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: supergroupId,
            text,
            parse_mode: 'HTML',
          }),
        }
      );
      if (supergroupAttempt.ok) {
        testMessageData = {
          ...supergroupAttempt,
          note: `Used migrated supergroup ID: ${supergroupId}`,
        };
      }
    }
  }

  // Check if browser is requesting HTML
  const acceptsHtml = req.headers.get('accept')?.includes('text/html');

  if (acceptsHtml) {
    const isSuccess = webhookData.ok;
    const botUser = getMeData.result;

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>حالة تفعيل بوت التليجرام</title>
  <link href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Alexandria', sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 20px;
      padding: 32px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
      text-align: center;
    }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 22px; margin: 0 0 12px 0; color: #38bdf8; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; }
    .status-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #0f172a;
      padding: 12px 16px;
      border-radius: 12px;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .badge {
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-ok { background: #065f46; color: #34d399; }
    .badge-warn { background: #854d0e; color: #fde047; }
    .btn {
      display: inline-block;
      background: #0284c7;
      color: white;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      margin-top: 16px;
      transition: all 0.2s;
    }
    .btn:hover { background: #0369a1; transform: translateY(-1px); }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? '🚀' : '⏳'}</div>
    <h1>${isSuccess ? 'تم تفعيل بوت التليجرام بنجاح!' : 'جارٍ معالجة التفعيل'}</h1>
    <p>${isSuccess ? 'البوت متصل بالمنصة وسيرسل تنبيهات التبرعات ورسائل المحفظة لحظياً.' : 'يرجى مراجعة التفاصيل أدناه:'}</p>

    <div class="status-item">
      <span>اسم البوت</span>
      <span class="badge badge-ok">@${botUser?.username || 'متصل'}</span>
    </div>

    <div class="status-item">
      <span>تفعيل الويب هوك (Webhook)</span>
      <span class="badge ${webhookData.ok ? 'badge-ok' : 'badge-warn'}">
        ${webhookData.ok ? '✅ مفعل 100%' : '⚠️ فشل: ' + (webhookData.description || 'خطأ')}
      </span>
    </div>

    <div class="status-item">
      <span>رسالة تجريبية للجروب</span>
      <span class="badge ${testMessageData?.ok ? 'badge-ok' : 'badge-warn'}">
        ${testMessageData?.ok ? '✅ تم الإرسال للجروب' : '⚠️ ' + (testMessageData?.description || 'لم يتم الإرسال')}
      </span>
    </div>

    <a href="/admin/donations" class="btn">الانتقال للوحة التحكم ➔</a>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return NextResponse.json({
    success: webhookData.ok,
    durationMs: Date.now() - startTime,
    bot: getMeData.result,
    webhookUrl,
    webhookResult: webhookData,
    testMessageResult: testMessageData,
  });
}
