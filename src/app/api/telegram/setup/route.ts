import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'نظام إشعارات تليجرام يعمل بنمط الإرسال المباشر (Direct Dispatch) بدون الحاجة إلى Webhook.',
    testAlertUrl: 'https://donations-tau.vercel.app/api/telegram/test-alert',
  });
}
