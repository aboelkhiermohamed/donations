'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/LanguageContext';
import { Lock, Mail, Heart, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

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
        // If not found in admins, sign them out and throw error
        await supabase.auth.signOut();
        throw new Error(language === 'ar' ? 'ليس لديك صلاحية الوصول إلى هذه اللوحة.' : 'You do not have access permissions for this dashboard.');
      }

      router.replace('/admin/dashboard');
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMsg(err.message || 'Invalid credentials');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 font-sans" dir={dir}>
      {/* Background Orbs */}
      <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[300px] h-[300px] bg-teal-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Back button */}
      <Link 
        href="/"
        className="absolute top-6 left-6 md:left-8 flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-sm font-semibold hover:bg-slate-850 hover:text-white transition-all text-slate-350"
      >
        <ArrowLeft className="w-4 h-4 rtl-flip text-emerald-400" />
        <span>{language === 'ar' ? 'العودة للرئيسية' : 'Back to Home'}</span>
      </Link>

      <div className="w-full max-w-md glass-panel rounded-3xl p-8 space-y-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
        
        {/* Branding header */}
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 mx-auto">
            <Heart className="w-6 h-6 text-slate-950 fill-slate-950" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">{t('login_title')}</h2>
          <p className="text-slate-400 text-xs">
            {language === 'ar' ? 'أدخل بيانات الاعتماد الخاصة بك للوصول للوحة التحكم' : 'Enter your credentials to access control panel'}
          </p>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="p-4 bg-red-950/40 border border-red-900/40 text-red-300 text-xs rounded-xl text-center leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-slate-300 text-xs font-semibold">
              {language === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full glass-input pl-11 pr-4 py-3 rounded-xl text-sm"
                placeholder="admin@charity.org"
                dir="ltr"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-slate-300 text-xs font-semibold">
              {language === 'ar' ? 'كلمة المرور' : 'Password'}
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full glass-input pl-11 pr-4 py-3 rounded-xl text-sm"
                placeholder="••••••••"
                dir="ltr"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-4 bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-extrabold text-sm py-3.5 rounded-xl shadow-lg shadow-emerald-500/20 hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{language === 'ar' ? 'جاري التحقق...' : 'Verifying...'}</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>{t('login_btn')}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
