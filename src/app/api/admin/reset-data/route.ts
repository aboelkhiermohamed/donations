import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminRequest } from '@/lib/adminAuth';

export async function POST(req: NextRequest) {
  try {
    const adminCtx = await verifyAdminRequest(req);
    if (!adminCtx) {
      return NextResponse.json({ error: 'Unauthorized: Admin privileges required.' }, { status: 401 });
    }

    const body = await req.json();
    const confirmation = (body?.confirmation || '').trim();

    // Secure double confirmation
    if (confirmation !== 'تصفير' && confirmation !== 'RESET') {
      return NextResponse.json(
        { error: 'عبارة التأكيد غير صحيحة. يرجى كتابة "تصفير" أو "RESET" لتأكيد مسح البيانات.' },
        { status: 400 }
      );
    }

    console.log(`[RESET DATA] Initiated by admin: ${adminCtx.email} (${adminCtx.userId})`);

    // 1. Delete all donations
    const { error: donationsErr } = await supabaseAdmin
      .from('donations')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Deletes all rows

    if (donationsErr) {
      throw new Error(`Failed to reset donations: ${donationsErr.message}`);
    }

    // 2. Delete all incoming bank/SMS transactions
    const { error: txErr } = await supabaseAdmin
      .from('incoming_transactions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (txErr) {
      throw new Error(`Failed to reset transactions: ${txErr.message}`);
    }

    // 3. Delete all SMS logs
    const { error: smsErr } = await supabaseAdmin
      .from('sms_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (smsErr) {
      throw new Error(`Failed to reset SMS logs: ${smsErr.message}`);
    }

    // 4. Delete all donors
    const { error: donorsErr } = await supabaseAdmin
      .from('donors')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (donorsErr) {
      throw new Error(`Failed to reset donors: ${donorsErr.message}`);
    }

    // 5. Delete all old notifications
    try {
      await supabaseAdmin
        .from('notifications')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
    } catch {}

    // 6. Delete all report exports
    try {
      await supabaseAdmin
        .from('report_exports')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
    } catch {}

    // 7. Insert fresh reset notification and audit log
    try {
      await supabaseAdmin.from('notifications').insert({
        title: 'تم تصفير بيانات النظام بنجاح',
        message: `قام المشرف (${adminCtx.name || adminCtx.email}) بمسح كافة البيانات والمعاملات التجريبية استعداداً للإطلاق الرسمي.`,
        type: 'system',
      });

      await supabaseAdmin.from('audit_logs').insert({
        admin_id: adminCtx.userId,
        action: 'SYSTEM_RESET_DATA',
        target_table: 'all_data_tables',
        details: {
          resetBy: adminCtx.email,
          timestamp: new Date().toISOString(),
          tablesCleared: ['donations', 'incoming_transactions', 'sms_logs', 'donors', 'notifications', 'report_exports'],
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'تم تصفير ومسح كافة البيانات التجريبية بنجاح. النظام الآن جاهز تماماً للبدء الفعلي.',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error resetting database data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reset test data.' },
      { status: 500 }
    );
  }
}
