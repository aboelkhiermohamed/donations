import { NextRequest, NextResponse } from 'next/server';
import { callTelegramApi } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tokenParam = searchParams.get('token');
  const chatIdParam = searchParams.get('chat_id');

  const token = tokenParam || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = chatIdParam || process.env.TELEGRAM_CHAT_ID;
  const webhookUrl = 'https://donations-tau.vercel.app/api/telegram/webhook';

  const acceptsHtml = req.headers.get('accept')?.includes('text/html');

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

  try {
    // 1. Directly call setWebhook (validates token & activates webhook in 1 single step)
    const webhookData = await callTelegramApi('setWebhook', token, {
      url: webhookUrl,
      drop_pending_updates: true,
    });

    // 2. Handle 429 Rate Limit directly and gracefully
    if (!webhookData.ok && webhookData.error_code === 429) {
      const retryAfter = webhookData.parameters?.retry_after || 25;

      if (acceptsHtml) {
        const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>جارٍ تفعيل البوت... انتظر ثوانٍ</title>
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
      padding: 36px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
      text-align: center;
    }
    .icon { font-size: 56px; margin-bottom: 16px; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
    h1 { font-size: 20px; margin: 0 0 12px 0; color: #38bdf8; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; }
    .countdown-box {
      background: #0f172a;
      border: 1px solid #0284c7;
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .number { font-size: 42px; font-weight: 700; color: #38bdf8; font-family: monospace; }
    .label { font-size: 13px; color: #64748b; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⏳</div>
    <h1>تبريد أمان مؤقت من تيليجرام</h1>
    <p>لحماية البوت، تيليجرام يطلب الانتظار ثوانٍ معدودة قبل إتمام الربط. سيتم التفعيل تلقائياً فور انتهاء العداد دون الحاجة للضغط على أي شيء:</p>
    
    <div class="countdown-box">
      <div class="number" id="timer">${retryAfter}</div>
      <div class="label">ثانية متبقية لإتمام التفعيل التلقائي</div>
    </div>

    <p style="font-size: 12px; color: #64748b; margin: 0;">من فضلك لا تغلق هذه الصفحة، سيتم التحديث تلقائياً ⚡</p>
  </div>

  <script>
    let remaining = ${retryAfter};
    const timer = document.getElementById('timer');
    const interval = setInterval(() => {
      remaining--;
      if (timer) timer.innerText = remaining;
      if (remaining <= 0) {
        clearInterval(interval);
        window.location.reload();
      }
    }, 1000);
  </script>
</body>
</html>`;
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      return NextResponse.json(
        {
          ok: false,
          rateLimited: true,
          retryAfter,
          durationMs: Date.now() - startTime,
          message: `Telegram rate limit in effect. Retry after ${retryAfter} seconds.`,
        },
        { status: 429 }
      );
    }

    if (!webhookData.ok) {
      return NextResponse.json(
        {
          ok: false,
          step: 'setWebhook',
          durationMs: Date.now() - startTime,
          error: webhookData.description || 'Failed to set webhook',
          details: webhookData,
        },
        { status: 500 }
      );
    }

    // 3. Test sending greeting message to group (non-blocking)
    let testMessageData: any = null;
    if (chatId) {
      const text = `🌿 <b>تم تفعيل بوت التليجرام وربطه بالمنصة بنجاح!</b>\n\nستصل هنا جميع إشعارات التبرعات الجديدة ورسائل المحفظة لحظياً ⚡\nاكتب <b>/stats</b> للحصول على الإحصائيات الحالية في أي وقت.`;

      try {
        testMessageData = await callTelegramApi('sendMessage', token, {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        });

        // If chat not found and ID starts with minus but not -100, try supergroup prefix -100
        if (
          !testMessageData.ok &&
          chatId.startsWith('-') &&
          !chatId.startsWith('-100')
        ) {
          const supergroupId = `-100${chatId.slice(1)}`;
          const supergroupData = await callTelegramApi('sendMessage', token, {
            chat_id: supergroupId,
            text,
            parse_mode: 'HTML',
          });
          if (supergroupData.ok) {
            testMessageData = {
              ...supergroupData,
              note: `Used migrated supergroup ID: ${supergroupId}`,
            };
          }
        }
      } catch (err: any) {
        testMessageData = { error: err.message };
      }
    }

    if (acceptsHtml) {
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
      padding: 36px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
      text-align: center;
    }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 22px; margin: 0 0 12px 0; color: #34d399; }
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
    <div class="icon">🚀</div>
    <h1>تم تفعيل بوت التليجرام بنجاح!</h1>
    <p>البوت متصل بالمنصة الآن وسيرسل تنبيهات التبرعات ورسائل المحفظة لحظياً ⚡</p>

    <div class="status-item">
      <span>ربط الويب هوك (Webhook)</span>
      <span class="badge badge-ok">✅ مفعل 100%</span>
    </div>

    <div class="status-item">
      <span>رسالة تجريبية للجروب</span>
      <span class="badge ${testMessageData?.ok ? 'badge-ok' : 'badge-warn'}">
        ${testMessageData?.ok ? '✅ تم الإرسال للجروب' : '⚠️ ' + (testMessageData?.description || 'تأكد من إضافة البوت للجروب')}
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
      success: true,
      durationMs: Date.now() - startTime,
      webhookResult: webhookData,
      testMessageResult: testMessageData,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        durationMs: Date.now() - startTime,
        error: err.message,
      },
      { status: 500 }
    );
  }
}
