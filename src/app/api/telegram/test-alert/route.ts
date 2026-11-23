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

  const success = await notifyNewDonation({
    name: 'فاعل خير (تجربة نظام التنبيهات)',
    amount: 500,
    payment_method: 'vodafone_cash',
    ref: 'TEST-ALERT-OK',
    status: 'auto_verified',
  });

  if (success) {
    return NextResponse.json({
      success: true,
      message: 'تم إرسال إشعار التبرع التجريبي إلى جروب تليجرام بنجاح! 🚀',
    });
  }

  return NextResponse.json(
    {
      success: false,
      message: 'فشل إرسال الإشعار. تأكد من صحة التوكن في Environment Variables وإضافة البوت للجروب.',
    },
    { status: 500 }
  );
}
