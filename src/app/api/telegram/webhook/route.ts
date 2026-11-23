import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: 'Telegram Webhook is live and ready to receive updates',
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check if it's a message or callback_query
    const message = body.message || body.edited_message;
    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const text = message.text.trim();
    const chatId = message.chat.id;

    // Handle Commands
    const lowerText = text.toLowerCase();

    // 1. /start or /help
    if (lowerText.startsWith('/start') || lowerText.startsWith('/help') || text === 'مساعدة') {
      const welcome = `🌿 <b>أهلاً بك في بوت إدارة صدقة د. حسين الأمير ود. ندى هاني حامد</b>

يمكنك استخدام الأوامر التالية لمتابعة التبرعات والإحصائيات الحية:

📊 /stats - تقرير إجمالي الحصيلة والإحصائيات الحية
📅 /today - ملخص مساهمات اليوم
⏳ /pending - التبرعات المعلقة التي بانتظار الاعتماد
🔗 /links - روابط المنصة ولوحة التحكم

<i>البوت يرسل أيضاً إشعارات فورية وتلقائية عند تسجيل أي تبرع جديد أو وصول تحويل للمحفظة! ⚡</i>`;

      await sendToChat(chatId, welcome);
      return NextResponse.json({ ok: true });
    }

    // 2. /stats or /summary or "إحصائيات"
    if (
      lowerText.startsWith('/stats') ||
      lowerText.startsWith('/summary') ||
      text.includes('احصائيات') ||
      text.includes('إحصائيات') ||
      text.includes('الحصيلة')
    ) {
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

      const targetSetting = targetSettingRes?.data?.value;
      const isUnlimited = targetSetting?.is_unlimited === true;
      const target = isUnlimited
        ? 0
        : Number(targetSetting?.target_amount || campaignRes?.data?.target_amount) || 100000;

      const donations = donationsRes.data || [];
      const totalCollected = donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const donorSet = new Set(donations.map(d => d.donor_id).filter(Boolean));
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

      await sendToChat(chatId, statsMsg, {
        inline_keyboard: [
          [
            { text: '🌐 زيارة الموقع العام', url: 'https://donations-tau.vercel.app' },
            { text: '📋 لوحة الأدمن', url: 'https://donations-tau.vercel.app/admin/donations' },
          ],
        ],
      });
      return NextResponse.json({ ok: true });
    }

    // 3. /today or "اليوم"
    if (lowerText.startsWith('/today') || text.includes('اليوم')) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: todayDonations } = await supabaseAdmin
        .from('donations')
        .select('amount, status')
        .gte('created_at', todayStart.toISOString())
        .in('status', ['auto_verified', 'manual_verified']);

      const todayList = todayDonations || [];
      const todaySum = todayList.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

      const todayMsg = `📅 <b>حصيلة تبرعات اليوم (${new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}):</b>
═════════════════════
💰 <b>المبلغ المجموع اليوم:</b> <b>${todaySum.toLocaleString('en-US')} ج.م</b>
📝 <b>عدد التبرعات المعتمدة:</b> ${todayList.length} تبرع
═════════════════════
تقبل الله منا ومنكم صالح الأعمال 🌿`;

      await sendToChat(chatId, todayMsg);
      return NextResponse.json({ ok: true });
    }

    // 4. /pending or "معلق"
    if (lowerText.startsWith('/pending') || text.includes('معلق')) {
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
        await sendToChat(chatId, '✅ <b>رائع! لا توجد أي تبرعات معلقة حالياً، جميع المساهمات معتمدة وموثقة.</b>');
        return NextResponse.json({ ok: true });
      }

      let pendingMsg = `⏳ <b>التبرعات المعلقة التي تحتاج مراجعة (${pendingList.length}):</b>\n\n`;

      pendingList.forEach((d: any, idx) => {
        pendingMsg += `${idx + 1}. <b>${d.donor?.name || 'فاعل خير'}</b>: ${Number(d.amount).toLocaleString('en-US')} ج.م (${d.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'InstaPay'})\n   المرجع: <code>${d.transaction_ref || 'بدون'}</code>\n\n`;
      });

      pendingMsg += `🔗 <a href="https://donations-tau.vercel.app/admin/donations?status=pending">اعتماد التبرعات من لوحة الإدارة</a>`;

      await sendToChat(chatId, pendingMsg);
      return NextResponse.json({ ok: true });
    }

    // 5. /links
    if (lowerText.startsWith('/links') || lowerText.startsWith('/link') || text.includes('روابط')) {
      const linksMsg = `🔗 <b>روابط المنصة الأساسية:</b>

🌐 <b>الموقع العام للحملة:</b>
https://donations-tau.vercel.app

📋 <b>سجل الشفافية الكامل:</b>
https://donations-tau.vercel.app/transparency

👮‍♂️ <b>لوحة تحكم مسؤولي الحملة:</b>
https://donations-tau.vercel.app/admin/dashboard

💬 <b>بوابة رسائل المحفظة (SMS):</b>
https://donations-tau.vercel.app/admin/sms`;

      await sendToChat(chatId, linksMsg);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json({ ok: false, error: 'Internal Error' }, { status: 500 });
  }
}

// Helper to respond back to specific sender chat
async function sendToChat(chatId: number | string, text: string, reply_markup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error('Failed to send telegram message to chat:', err);
  }
}
