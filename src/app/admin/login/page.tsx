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
  const [isLocked, setIsLocked] = useState(false);
  const [lockSeconds, setLockSeconds] = useState(0);

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

  // Lockout countdown timer
  useEffect(() => {
    if (!isLocked || lockSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockSeconds((prev) => {
        if (prev <= 1) {
          setIsLocked(false);
          setErrorMsg('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isLocked, lockSeconds]);

  const formatLockTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || isLocked) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 429) {
          setIsLocked(true);
          setLockSeconds(result.retryAfter || 900);
        }
        throw new Error(result.error || (language === 'ar' ? 'بيانات الدخول غير صحيحة' : 'Invalid credentials'));
      }

      // Establish session in browser Supabase client
      if (result.session) {
        await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
      }

      // Pre-warm admin cache so dashboard opens instantaneously
      try {
        sessionStorage.setItem('admin_session_cache', JSON.stringify({
          id: result.session?.user?.id || result.admin?.id,
          name: result.admin?.name || 'مسؤول الحملة',
          timestamp: Date.now()
        }));
      } catch {}

      router.replace('/admin/dashboard');
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMsg(err.message || (language === 'ar' ? 'بيانات الدخول غير صحيحة' : 'Invalid credentials'));
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
          <div className={`p-4 ${isLocked ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200' : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300'} border text-xs rounded-xl text-center leading-relaxed font-medium`}>
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
                disabled={isLoading || isLocked}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@charity.org"
                className="w-full py-3 ps-10 pe-4 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-sm text-[#191F1C] dark:text-[#F3F5F4] focus:bg-white dark:focus:bg-[#172436] focus:outline-none focus:border-[#153C32] dark:focus:border-[#24B58A] disabled:opacity-50 transition-colors"
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
                disabled={isLoading || isLocked}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full py-3 ps-10 pe-4 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-sm text-[#191F1C] dark:text-[#F3F5F4] focus:bg-white dark:focus:bg-[#172436] focus:outline-none focus:border-[#153C32] dark:focus:border-[#24B58A] disabled:opacity-50 transition-colors"
              />
              <Lock className="w-4 h-4 text-[#738079] dark:text-[#A7B4B0] absolute top-1/2 -translate-y-1/2 start-3.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || isLocked}
            className="w-full py-3.5 rounded-xl bg-[#153C32] dark:bg-[#217A61] text-white text-sm font-bold shadow-elevated hover:bg-[#1C4E41] dark:hover:bg-[#24B58A] disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 transform active:scale-[0.99] mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{language === 'ar' ? 'جارٍ التحقق...' : 'Signing in...'}</span>
              </>
            ) : isLocked ? (
              <span>{language === 'ar' ? `محظور مؤقتاً (${formatLockTime(lockSeconds)})` : `Locked (${formatLockTime(lockSeconds)})`}</span>
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
