import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { z } from 'zod';

const createAdminSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'superadmin']).default('admin'),
});

// GET /api/admin/users - List all administrators
export async function GET(req: NextRequest) {
  try {
    const adminCtx = await verifyAdminRequest(req);
    if (!adminCtx) {
      return NextResponse.json({ error: 'Unauthorized: Admin authentication required.' }, { status: 401 });
    }

    const { data: adminsList, error } = await supabaseAdmin
      .from('admins')
      .select('id, name, email, role, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      admins: adminsList || [],
      currentUserId: adminCtx.userId,
    });
  } catch (error: any) {
    console.error('Error fetching admins:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch admins.' }, { status: 500 });
  }
}

// POST /api/admin/users - Create new administrator
export async function POST(req: NextRequest) {
  try {
    const adminCtx = await verifyAdminRequest(req);
    if (!adminCtx) {
      return NextResponse.json({ error: 'Unauthorized: Admin authentication required.' }, { status: 401 });
    }

    const body = await req.json();
    const validation = createAdminSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { name, email, password, role } = validation.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already exists in admins
    const { data: existingAdmin } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingAdmin) {
      return NextResponse.json(
        { error: 'المشرف مسجل بالفعل بهذا البريد الإلكتروني.' },
        { status: 400 }
      );
    }

    // 1. Create User in Supabase Auth via Admin API
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { name: name.trim() },
    });

    if (authError || !authUser.user) {
      throw new Error(`Failed to create auth user: ${authError?.message}`);
    }

    // 2. Insert into admins table
    const { data: newAdminRecord, error: insertError } = await supabaseAdmin
      .from('admins')
      .insert({
        id: authUser.user.id,
        name: name.trim(),
        email: normalizedEmail,
        role,
      })
      .select('id, name, email, role, created_at')
      .single();

    if (insertError) {
      // Rollback auth user if profile insertion failed
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      throw new Error(`Failed to create admin profile: ${insertError.message}`);
    }

    // 3. Log Audit
    try {
      await supabaseAdmin.from('audit_logs').insert({
        admin_id: adminCtx.userId,
        action: 'ADMIN_CREATED',
        target_table: 'admins',
        target_id: newAdminRecord.id,
        details: {
          createdAdminEmail: normalizedEmail,
          createdAdminName: name.trim(),
          role,
          createdBy: adminCtx.email,
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      admin: newAdminRecord,
    });
  } catch (error: any) {
    console.error('Error creating admin:', error);
    return NextResponse.json({ error: error.message || 'Failed to create admin.' }, { status: 500 });
  }
}

// DELETE /api/admin/users?id=... - Delete an administrator
export async function DELETE(req: NextRequest) {
  try {
    const adminCtx = await verifyAdminRequest(req);
    if (!adminCtx) {
      return NextResponse.json({ error: 'Unauthorized: Admin authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetAdminId = searchParams.get('id');

    if (!targetAdminId) {
      return NextResponse.json({ error: 'Missing admin id parameter.' }, { status: 400 });
    }

    // Prevent self-deletion
    if (targetAdminId === adminCtx.userId) {
      return NextResponse.json(
        { error: 'لا يمكنك حذف حسابك الحالي المسجل به الدخول.' },
        { status: 400 }
      );
    }

    // Check how many admins remain to ensure at least one remains
    const { count } = await supabaseAdmin
      .from('admins')
      .select('*', { count: 'exact', head: true });

    if (count !== null && count <= 1) {
      return NextResponse.json(
        { error: 'لا يمكن حذف المشرف الأخير في النظام.' },
        { status: 400 }
      );
    }

    // 1. Delete from Supabase Auth
    const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(targetAdminId);
    if (deleteAuthErr) {
      console.warn('Failed to delete auth user, attempting table deletion:', deleteAuthErr.message);
    }

    // 2. Delete from admins table (if not cascaded)
    await supabaseAdmin
      .from('admins')
      .delete()
      .eq('id', targetAdminId);

    // 3. Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        admin_id: adminCtx.userId,
        action: 'ADMIN_DELETED',
        target_table: 'admins',
        target_id: targetAdminId,
        details: {
          deletedAdminId: targetAdminId,
          deletedBy: adminCtx.email,
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'تم حذف المشرف بنجاح.',
    });
  } catch (error: any) {
    console.error('Error deleting admin:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete admin.' }, { status: 500 });
  }
}
