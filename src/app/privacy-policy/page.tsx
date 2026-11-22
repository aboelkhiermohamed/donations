'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';
import { HeartHandshake, Globe, ArrowLeft, ShieldCheck, Lock, EyeOff } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

export default function PrivacyPolicyPage() {
  const { language, dir, toggleLanguage, t } = useLanguage();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1220] text-[#191F1C] dark:text-[#F3F5F4] flex items-center justify-center font-arabic">
        <div className="w-8 h-8 border-3 border-[#153C32] dark:border-[#24B58A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-arabic bg-[#FAF9F5] dark:bg-[#0B1220] text-[#191F1C] dark:text-[#F3F5F4] relative transition-colors duration-200" dir={dir}>
      
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-[#FAF9F5]/90 dark:bg-[#0B1220]/90 backdrop-blur-md border-b border-[#EAE8DE] dark:border-[#283849]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3.5 group">
            <div className="w-11 h-11 rounded-xl bg-[#153C32] dark:bg-[#172436] border border-[#153C32] dark:border-[#283849] text-white flex items-center justify-center shadow-subtle flex-shrink-0">
              <HeartHandshake className="w-6 h-6 text-[#E2F3EE] dark:text-[#24B58A]" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg text-[#153C32] dark:text-[#F3F5F4] tracking-tight leading-tight">
                {t('brand_title')}
              </span>
              <span className="text-xs text-[#738079] dark:text-[#A7B4B0] font-medium">
                {t('brand_batch')}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#DDD9CC] dark:border-[#283849] bg-white dark:bg-[#172436] text-xs font-semibold text-[#3D4742] dark:text-[#F3F5F4] hover:bg-[#F4F3ED] dark:hover:bg-[#1f3047] transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-[#153C32] dark:text-[#24B58A]" />
              <span>{language === 'ar' ? 'English' : 'العربية'}</span>
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-[#153C32] dark:bg-[#217A61] text-white text-xs font-bold hover:bg-[#1C4E41] dark:hover:bg-[#24B58A] transition-colors"
            >
              <span>{language === 'ar' ? 'الرئيسية' : 'Home'}</span>
              <ArrowLeft className="w-3.5 h-3.5 rtl-flip" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-12 md:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-[#172436] border border-[#DDD9CC] dark:border-[#283849] text-xs font-bold text-[#153C32] dark:text-[#24B58A] shadow-subtle">
              <Lock className="w-3.5 h-3.5 text-[#217A61] dark:text-[#24B58A]" />
              <span>{language === 'ar' ? 'حماية البيانات والخصوصية' : 'Privacy & Security'}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-[#153C32] dark:text-[#F3F5F4]">
              {language === 'ar' ? 'سياسة الخصوصية وحماية المتبرعين' : 'Donor Privacy Policy'}
            </h1>
            <p className="text-xs sm:text-sm text-[#738079] dark:text-[#A7B4B0]">
              {language === 'ar' ? 'آخر تحديث: نوفمبر 2026' : 'Last updated: November 2026'}
            </p>
          </div>

          <div className="bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] rounded-3xl p-8 sm:p-10 shadow-subtle space-y-8 text-sm text-[#3D4742] dark:text-[#CBD5E1] leading-relaxed">
            
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[#153C32] dark:text-[#F3F5F4] flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#217A61] dark:text-[#24B58A]" />
                <span>{language === 'ar' ? '1. حماية بيانات المتبرعين' : '1. Protection of Donor Information'}</span>
              </h2>
              <p>
                {language === 'ar'
                  ? 'نلتزم التزامًا كاملاً بحماية خصوصية جميع المساهمين والمتبرعين في حملة الصدقة الجارية. البيانات التي يتم إدخالها تُستخدم حصراً لغرض التحقق من صحة التحويلات البنكية والمحافظ وربطها بالمطابقة المحاسبية.'
                  : 'We are committed to safeguarding the privacy of all contributors. Information collected is used strictly for transaction matching and verification.'}
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[#153C32] dark:text-[#F3F5F4] flex items-center gap-2">
                <EyeOff className="w-5 h-5 text-[#217A61] dark:text-[#24B58A]" />
                <span>{language === 'ar' ? '2. إخفاء الهوية في لوحة الشفافية' : '2. Anonymization in Public Ledger'}</span>
              </h2>
              <p>
                {language === 'ar'
                  ? 'في لوحة الشفافية العامة، لا يتم عرض أرقام الهواتف أو أرقام المعاملات كاملة على الإطلاق. كما يتم حجب جزء من الاسم أو عرضه كـ (فاعل خير) إذا رغب المتبرع في ذلك، لضمان أعلى درجات الخصوصية.'
                  : 'On the public ledger, phone numbers and transaction references are masked. Donor names are anonymized to protect individual privacy.'}
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[#153C32] dark:text-[#F3F5F4] flex items-center gap-2">
                <Lock className="w-5 h-5 text-[#217A61] dark:text-[#24B58A]" />
                <span>{language === 'ar' ? '3. عدم مشاركة البيانات' : '3. Zero Data Sharing'}</span>
              </h2>
              <p>
                {language === 'ar'
                  ? 'لا يتم بيع أو مشاركة أو تداول أي بيانات تخص المتبرعين مع أي أطراف ثالثة أو شركات إعلانية. الوصول للبيانات الكاملة مقتصر فقط على المسؤولين المعتمدين من أطباء الدفعة التاسعة للمراجعة والتدقيق المالي.'
                  : 'No donor data is ever sold or shared with third parties. Administrative access is strictly limited to authorized 9th batch physicians.'}
              </p>
            </section>

          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#EAE8DE] dark:border-[#283849] bg-white dark:bg-[#111C2D] py-8 text-center text-xs text-[#738079] dark:text-[#A7B4B0]">
        <span>جميع الحقوق محفوظة © الدفعة التاسعة طب كفر الشيخ</span>
      </footer>

    </div>
  );
}
