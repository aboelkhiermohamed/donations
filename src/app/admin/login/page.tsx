'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/LanguageContext';
import { Lock, Mail, HeartHandshake, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

export default function AdminLoginPage() {
  const { language, dir, t } = useLanguage();
  const router = useRouter();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Check if already logged in
  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/admin/dashboard');
      }
    }
    checkSession();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) throw error;

      // Verify that this user exists in our admins table
      const { data: adminProfile, error: profileError } = await supabase
        .from('admins')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError || !adminProfile) {
        await supabase.auth.signOut();
        throw new Error(language === 'ar' ? 'ليس لديك صلاحية الوصول إلى هذه اللوحة.' : 'You do not have administrative permissions.');
      }

      // Pre-warm admin cache so dashboard opens instantaneously
      try {
        sessionStorage.setItem('admin_session_cache', JSON.stringify({
          id: data.user.id,
          name: adminProfile.name || 'مسؤول الحملة',
          timestamp: Date.now()
        }));
      } catch {}

      router.replace('/admin/dashboard');
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMsg(err.message || 'بيانات الدخول غير صحيحة');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1220] flex items-center justify-center p-4 font-arabic relative transition-colors duration-200" dir={dir}>
      
      {/* Top Controls */}
      <div className="absolute top-6 start-6 end-6 flex items-center justify-between">
        <Link 
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-[#172436] border border-[#DDD9CC] dark:border-[#283849] text-xs font-bold text-[#153C32] dark:text-[#F3F5F4] hover:bg-[#F4F3ED] dark:hover:bg-[#1f3047] shadow-subtle transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 rtl-flip" />
          <span>{language === 'ar' ? 'العودة للمنصة' : 'Back to Site'}</span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] rounded-3xl p-8 sm:p-10 shadow-editorial space-y-8 relative">
        
        {/* Brand header */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-[#153C32] dark:bg-[#111C2D] border border-[#153C32] dark:border-[#283849] text-white flex items-center justify-center shadow-subtle mx-auto">
            <HeartHandshake className="w-7 h-7 text-[#E2F3EE] dark:text-[#24B58A]" />
          </div>

          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#B79B68] dark:text-[#C5A876]">
              {language === 'ar' ? 'بوابة مسؤولي الحملة' : 'Organizers Portal'}
            </span>
            <h1 className="text-2xl font-black text-[#153C32] dark:text-[#F3F5F4]">
              {language === 'ar' ? 'تسجيل دخول الإدارة' : 'Admin Authentication'}
            </h1>
            <p className="text-xs text-[#738079] dark:text-[#A7B4B0]">
              {language === 'ar' ? 'صدقة جارية — الدفعة التاسعة طب كفر الشيخ' : 'Sadaqah Jariyah — 9th Batch Medicine'}
            </p>
          </div>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300 text-xs rounded-xl text-center leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
              {language === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}
            </label>
            <div className="relative">
              <input 
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@charity.org"
                className="w-full py-3 ps-10 pe-4 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-sm text-[#191F1C] dark:text-[#F3F5F4] focus:bg-white dark:focus:bg-[#172436] focus:outline-none focus:border-[#153C32] dark:focus:border-[#24B58A] transition-colors"
              />
              <Mail className="w-4 h-4 text-[#738079] dark:text-[#A7B4B0] absolute top-1/2 -translate-y-1/2 start-3.5" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
              {language === 'ar' ? 'كلمة المرور' : 'Password'}
            </label>
            <div className="relative">
              <input 
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full py-3 ps-10 pe-4 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-sm text-[#191F1C] dark:text-[#F3F5F4] focus:bg-white dark:focus:bg-[#172436] focus:outline-none focus:border-[#153C32] dark:focus:border-[#24B58A] transition-colors"
              />
              <Lock className="w-4 h-4 text-[#738079] dark:text-[#A7B4B0] absolute top-1/2 -translate-y-1/2 start-3.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl bg-[#153C32] dark:bg-[#217A61] text-white text-sm font-bold shadow-elevated hover:bg-[#1C4E41] dark:hover:bg-[#24B58A] disabled:opacity-70 transition-all flex items-center justify-center gap-2 transform active:scale-[0.99] mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{language === 'ar' ? 'جارٍ التحقق...' : 'Signing in...'}</span>
              </>
            ) : (
              <span>{language === 'ar' ? 'دخول لوحة التحكم' : 'Sign In'}</span>
            )}
          </button>
        </form>

        <div className="pt-2 text-center text-[11px] text-[#738079] dark:text-[#A7B4B0]">
          <span>{language === 'ar' ? 'مخصص فقط للمنسقين المعتمدين لمتابعة الحسابات.' : 'Restricted to authorized coordinators.'}</span>
        </div>

      </div>

    </div>
  );
}
