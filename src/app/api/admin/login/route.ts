import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getClientIp, checkAdminLoginRateLimit, resetAdminLoginRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const body = await req.json().catch(() => ({}));
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.' },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // 1. Check Rate Limit (5 attempts per 15 minutes per IP or Email)
    const rateLimit = checkAdminLoginRateLimit(ip, cleanEmail);

    if (!rateLimit.allowed) {
      const waitMinutes = Math.ceil(rateLimit.retryAfterSeconds / 60);
      return NextResponse.json(
        {
          error: `تم حظر محاولات تسجيل الدخول مؤقتاً لتكرار المحاولات الخاطئة (الحد الأقصى 5 محاولات). يرجى الانتظار ${waitMinutes} دقيقة قبل المحاولة مرة أخرى.`,
          retryAfter: rateLimit.retryAfterSeconds,
          isLocked: true,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    // 2. Perform Authentication via Supabase Client
    const supabaseAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data, error: authError } = await supabaseAnon.auth.signInWithPassword({
      email: cleanEmail,
      password: String(password),
    });

    if (authError || !data?.user || !data?.session) {
      const remaining = Math.max(0, rateLimit.remaining);
      const remainingMsg = remaining > 0 ? ` (المحاولات المتبقية قبل التجميد: ${remaining})` : '';

      return NextResponse.json(
        {
          error: `بيانات الدخول غير صحيحة.${remainingMsg}`,
          remainingAttempts: remaining,
        },
        { status: 401 }
      );
    }

    // 3. Verify Admin Profile in Database
    const { data: adminProfile, error: profileError } = await supabaseAdmin
      .from('admins')
      .select('id, name, email, role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !adminProfile) {
      return NextResponse.json(
        { error: 'ليس لديك صلاحية الوصول إلى هذه اللوحة.' },
        { status: 403 }
      );
    }

    // 4. Successful login: Clear rate limit for this IP and email
    resetAdminLoginRateLimit(ip, cleanEmail);

    return NextResponse.json({
      success: true,
      session: data.session,
      admin: adminProfile,
    });
  } catch (error: any) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ داخلي أثناء تسجيل الدخول. يرجى المحاولة لاحقاً.' },
      { status: 500 }
    );
  }
}
