import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendTelegramMessageDirect, sendTelegramApiRaw } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: 'Telegram Webhook is live and ready to receive updates',
    supportedCommands: ['/stats', '/today', '/pending', '/links', '/start', '/help'],
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Handle Callback Query (e.g. Inline keyboard buttons)
    if (body.callback_query) {
      const cb = body.callback_query;
      const cbData = cb.data;
      const cbChatId = cb.message?.chat?.id;

      if (cbData === 'refresh_stats' && cbChatId) {
        const statsMsg = await generateStatsMessage();
        await sendTelegramMessageDirect(String(cbChatId), {
          text: statsMsg.text,
          reply_markup: statsMsg.reply_markup,
        });
      }

      // Acknowledge callback query to stop loading spinner on button
      await sendTelegramApiRaw('answerCallbackQuery', {
        callback_query_id: cb.id,
      });

      return NextResponse.json({ ok: true });
    }

    // 2. Handle Message
    const message = body.message || body.edited_message;
    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const rawText = message.text.trim();
    const lowerText = rawText.toLowerCase();
    const chatId = message.chat.id;

    // Helper to check command (supports /cmd, /cmd arg, and /cmd@bot_username)
    const matchesCommand = (cmd: string) => {
      return (
        lowerText === `/${cmd}` ||
        lowerText.startsWith(`/${cmd} `) ||
        lowerText.startsWith(`/${cmd}@`)
      );
    };

    // 1. /start or /help or "مساعدة"
    if (matchesCommand('start') || matchesCommand('help') || rawText === 'مساعدة') {
      const welcome = `🌿 <b>أهلاً بك في بوت إدارة صدقة د. حسين الأمير ود. ندى هاني حامد</b>

يمكنك استخدام الأوامر التالية لمتابعة التبرعات والإحصائيات الحية:

📊 <b>/stats</b> - تقرير إجمالي الحصيلة والإحصائيات الحية
📅 <b>/today</b> - ملخص مساهمات اليوم
⏳ <b>/pending</b> - التبرعات المعلقة التي بانتظار الاعتماد
🔗 <b>/links</b> - روابط المنصة ولوحة التحكم

<i>⚡ البوت يرسل أيضاً إشعارات فورية وتلقائية عند تسجيل أي تبرع جديد أو وصول تحويل للمحفظة!</i>`;

      await sendTelegramMessageDirect(String(chatId), {
        text: welcome,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 عرض الإحصائيات الحية', callback_data: 'refresh_stats' },
              { text: '🌐 الموقع العام', url: 'https://donations-tau.vercel.app' },
            ],
          ],
        },
      });
      return NextResponse.json({ ok: true });
    }

    // 2. /stats or /summary or "إحصائيات" or "الحصيلة"
    if (
      matchesCommand('stats') ||
      matchesCommand('summary') ||
      rawText.includes('احصائيات') ||
      rawText.includes('إحصائيات') ||
      rawText.includes('الحصيلة')
    ) {
      const statsMsg = await generateStatsMessage();
      await sendTelegramMessageDirect(String(chatId), {
        text: statsMsg.text,
        reply_markup: statsMsg.reply_markup,
      });
      return NextResponse.json({ ok: true });
    }

    // 3. /today or "اليوم"
    if (matchesCommand('today') || rawText.includes('اليوم')) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: todayDonations } = await supabaseAdmin
        .from('donations')
        .select('amount, status')
        .gte('created_at', todayStart.toISOString())
        .in('status', ['auto_verified', 'manual_verified']);

      const todayList = todayDonations || [];
      const todaySum = todayList.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);

      const todayMsg = `📅 <b>حصيلة تبرعات اليوم (${new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}):</b>
═════════════════════
💰 <b>المبلغ المجموع اليوم:</b> <b>${todaySum.toLocaleString('en-US')} ج.م</b>
📝 <b>عدد التبرعات المعتمدة:</b> ${todayList.length} تبرع
═════════════════════
تقبل الله منا ومنكم صالح الأعمال 🌿`;

      await sendTelegramMessageDirect(String(chatId), {
        text: todayMsg,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 الإحصائيات الشاملة', callback_data: 'refresh_stats' },
              { text: '🌐 زيارة الموقع', url: 'https://donations-tau.vercel.app' },
            ],
          ],
        },
      });
      return NextResponse.json({ ok: true });
    }

    // 4. /pending or "معلق"
    if (matchesCommand('pending') || rawText.includes('معلق')) {
      const { data: pendingList } = await supabaseAdmin
        .from('donations')
        .select(
          `
          id,
          amount,
          payment_method,
          transaction_ref,
          created_at,
          donor:donors (name, phone)
        `
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!pendingList || pendingList.length === 0) {
        await sendTelegramMessageDirect(String(chatId), {
          text: '✅ <b>رائع! لا توجد أي تبرعات معلقة حالياً، جميع المساهمات معتمدة وموثقة.</b>',
        });
        return NextResponse.json({ ok: true });
      }

      let pendingMsg = `⏳ <b>التبرعات المعلقة التي تحتاج مراجعة (${pendingList.length}):</b>\n\n`;

      pendingList.forEach((d: any, idx: number) => {
        const donorName = d.donor?.name || 'فاعل خير';
        const method = d.payment_method === 'vodafone_cash' ? 'فودافون كاش 📱' : 'InstaPay ⚡';
        pendingMsg += `${idx + 1}. <b>${donorName}</b>: ${Number(d.amount).toLocaleString('en-US')} ج.م (${method})\n   المرجع: <code>${d.transaction_ref || 'بدون'}</code>\n\n`;
      });

      pendingMsg += `🔗 <a href="https://donations-tau.vercel.app/admin/donations?status=pending">اعتماد التبرعات من لوحة الإدارة</a>`;

      await sendTelegramMessageDirect(String(chatId), {
        text: pendingMsg,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📋 فتح صفحة المراجعة والاعتماد',
                url: 'https://donations-tau.vercel.app/admin/donations?status=pending',
              },
            ],
          ],
        },
      });
      return NextResponse.json({ ok: true });
    }

    // 5. /links or "روابط"
    if (matchesCommand('links') || matchesCommand('link') || rawText.includes('روابط')) {
      const linksMsg = `🔗 <b>روابط المنصة الأساسية:</b>

🌐 <b>الموقع العام للحملة:</b>
https://donations-tau.vercel.app

📋 <b>سجل الشفافية الكامل:</b>
https://donations-tau.vercel.app/transparency

👮‍♂️ <b>لوحة تحكم مسؤولي الحملة:</b>
https://donations-tau.vercel.app/admin/dashboard

💬 <b>بوابة رسائل المحفظة (SMS):</b>
https://donations-tau.vercel.app/admin/sms`;

      await sendTelegramMessageDirect(String(chatId), {
        text: linksMsg,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🌐 الموقع العام', url: 'https://donations-tau.vercel.app' },
              { text: '📋 لوحة الأدمن', url: 'https://donations-tau.vercel.app/admin/dashboard' },
            ],
          ],
        },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

async function generateStatsMessage() {
  const [campaignRes, targetSettingRes, donationsRes, pendingRes] = await Promise.all([
    supabaseAdmin.from('campaigns').select('target_amount').limit(1).maybeSingle(),
    supabaseAdmin.from('settings').select('value').eq('key', 'campaign_target').maybeSingle(),
    supabaseAdmin
      .from('donations')
      .select('amount, donor_id, created_at')
      .in('status', ['auto_verified', 'manual_verified']),
    supabaseAdmin
      .from('donations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  const targetSetting = targetSettingRes?.data?.value as any;
  const isUnlimited = targetSetting?.is_unlimited === true;
  const target = isUnlimited
    ? 0
    : Number(targetSetting?.target_amount || campaignRes?.data?.target_amount) || 100000;

  const donations = (donationsRes.data as any[]) || [];
  const totalCollected = donations.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
  const donorSet = new Set(donations.map((d: any) => d.donor_id).filter(Boolean));
  const pendingCount = pendingRes.count || 0;

  const progressPercent = isUnlimited
    ? 100
    : Math.min(100, Math.round((totalCollected / (target || 1)) * 100));

  const statsMsg = `📊 <b>تقرير إحصائيات الحملة المباشر</b>
═════════════════════
💰 <b>إجمالي الحصيلة:</b> <b>${totalCollected.toLocaleString('en-US')} ج.م</b>
🎯 <b>المستهدف:</b> ${isUnlimited ? '<b>هدف مفتوح (غير محدود)</b> ♾️' : `<b>${target.toLocaleString('en-US')} ج.م</b> (${progressPercent}%)`}
👥 <b>عدد المساهمين:</b> ${donorSet.size} مساهم (${donations.length} عملية موثقة)
⏳ <b>تبرعات معلقة للمراجعة:</b> <b>${pendingCount}</b> ${pendingCount > 0 ? '⚠️' : '✅'}
═════════════════════
🕒 <i>محدث لحظياً: ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</i>`;

  return {
    text: statsMsg,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔄 تحديث الإحصائيات', callback_data: 'refresh_stats' },
          { text: '🌐 الموقع العام', url: 'https://donations-tau.vercel.app' },
        ],
        [
          { text: '📋 لوحة الأدمن', url: 'https://donations-tau.vercel.app/admin/donations' },
        ],
      ],
    },
  };
}
