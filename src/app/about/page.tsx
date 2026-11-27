'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';
import { HeartHandshake, Globe, ArrowLeft, ArrowRight, ShieldCheck, Heart, Layers, Building2, UserCheck } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

export default function AboutPage() {
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
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2 sm:gap-4">
          <Link href="/" className="flex items-center gap-2 sm:gap-3.5 group min-w-0 flex-shrink">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-[#153C32] dark:bg-[#172436] border border-[#153C32] dark:border-[#283849] text-white flex items-center justify-center shadow-subtle flex-shrink-0">
              <HeartHandshake className="w-5 h-5 sm:w-6 sm:h-6 text-[#E2F3EE] dark:text-[#24B58A]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-sm sm:text-lg text-[#153C32] dark:text-[#F3F5F4] tracking-tight leading-tight whitespace-nowrap">
                {t('brand_title')}
              </span>
              <span className="text-[10px] sm:text-xs text-[#738079] dark:text-[#A7B4B0] font-medium truncate max-w-[125px] xs:max-w-[170px] sm:max-w-none">
                {t('brand_batch')}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
            <ThemeToggle compact />
            <button
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-[#DDD9CC] dark:border-[#283849] bg-white dark:bg-[#172436] text-xs font-semibold text-[#3D4742] dark:text-[#F3F5F4] hover:bg-[#F4F3ED] dark:hover:bg-[#1f3047] transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-[#153C32] dark:text-[#24B58A]" />
              <span className="hidden sm:inline">{language === 'ar' ? 'English' : 'العربية'}</span>
              <span className="inline sm:hidden font-mono">{language === 'ar' ? 'EN' : 'ع'}</span>
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-1 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-[#153C32] dark:bg-[#217A61] text-white text-xs font-bold hover:bg-[#1C4E41] dark:hover:bg-[#24B58A] transition-colors"
            >
              <span>{language === 'ar' ? 'الرئيسية' : 'Home'}</span>
              <ArrowLeft className="w-3.5 h-3.5 rtl-flip" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-12 md:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          {/* Header Card */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-[#172436] border border-[#DDD9CC] dark:border-[#283849] text-xs font-bold text-[#153C32] dark:text-[#24B58A] shadow-subtle">
              <span className="w-2 h-2 rounded-full bg-[#B79B68]" />
              <span>{language === 'ar' ? 'عن الحملة والغاية' : 'About the Campaign'}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-[#153C32] dark:text-[#F3F5F4] tracking-tight">
              {language === 'ar' ? 'صدقة جارية بأثرٍ يمتد' : 'Sadaqah Jariyah — An Enduring Impact'}
            </h1>

            <p className="text-sm sm:text-base text-[#55625B] dark:text-[#A7B4B0] max-w-2xl mx-auto leading-relaxed">
              {language === 'ar'
                ? 'مبادرة طبية إنسانية نظمتها الدفعة التاسعة بكلية الطب البشري جامعة كفر الشيخ، تخليدًا لذكرى زميلينا الراحلين الدكتور حسين علي الأمير والدكتورة ندى هاني حامد.'
                : 'A humanitarian medical initiative organized by the 9th Batch of Kafr El-Sheikh Medicine, commemorating our beloved late colleagues Dr. Hussein Ali El-Amir & Dr. Nada Hani Hamed.'}
            </p>
          </div>

          {/* Memorial Dedication Box */}
          <div className="p-8 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-4 border-r-4 border-r-[#B79B68]">
            <span className="text-xs font-bold uppercase tracking-wider text-[#9E8047] dark:text-[#C5A876]">
              {language === 'ar' ? 'إهداء المبادرة' : 'Dedication'}
            </span>
            <div className="text-2xl font-extrabold text-[#153C32] dark:text-[#F3F5F4]">
              د. حسين علي الأمير   •   د. ندى هاني حامد
            </div>
            <p className="text-sm text-[#55625B] dark:text-[#CBD5E1] leading-relaxed">
              {language === 'ar'
                ? 'رحم الله فقيدينا وأسكنهما فسيح جناته. كانا مثالاً للإخلاص ودماثة الخلق وحب الخير. ونسأل المولى عز وجل أن يجعل هذا العمل صدقة جارية ونورًا يرافقهما في ميزان حسناتهما إلى يوم القيامة.'
                : 'May Allah have mercy on our beloved colleagues and grant them eternal peace. They were shining examples of sincerity and virtue.'}
            </p>
          </div>

          {/* Pillars & Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="p-6 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#F0F9F6] dark:bg-[#217A61]/20 border border-[#153C32]/10 dark:border-[#217A61]/30 flex items-center justify-center text-[#153C32] dark:text-[#24B58A]">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg text-[#153C32] dark:text-[#F3F5F4]">
                {language === 'ar' ? 'الهدف الطبي للمشروع' : 'Medical Purpose'}
              </h3>
              <p className="text-sm text-[#55625B] dark:text-[#A7B4B0] leading-relaxed">
                {language === 'ar'
                  ? 'دعم وتجهيز وحدة العناية المركزة (ICU) بمستشفيات جامعة كفر الشيخ بأجهزة ومستلزمات طبية، لخدمة المرضى ذوي الحالات الحرجة ومصابي الطوارئ مجانًا.'
                  : 'Supporting and equipping the ICU at Kafr El-Sheikh University Hospitals with essential medical equipment to serve critical care patients free of charge.'}
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#F0F9F6] dark:bg-[#217A61]/20 border border-[#217A61]/20 dark:border-[#217A61]/30 flex items-center justify-center text-[#217A61] dark:text-[#24B58A]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg text-[#153C32] dark:text-[#F3F5F4]">
                {language === 'ar' ? 'الشفافية والمصداقية' : 'Transparency & Accountability'}
              </h3>
              <p className="text-sm text-[#55625B] dark:text-[#A7B4B0] leading-relaxed">
                {language === 'ar'
                  ? 'إدارة الحملة تخضع لمتابعة وإشراف مباشر من أطباء الدفعة التاسعة مع تسجيل آلي فوري لكافة التبرعات عبر لوحة الشفافية المعلنة للجميع.'
                  : 'The campaign is supervised by the 9th Batch physicians with real-time audit logs and complete donor transparency.'}
              </p>
            </div>

          </div>

          {/* Call to action */}
          <div className="p-8 rounded-3xl bg-[#153C32] dark:bg-[#111C2D] border border-[#153C32] dark:border-[#283849] text-white text-center space-y-4 shadow-elevated">
            <h3 className="text-xl sm:text-2xl font-bold">
              {language === 'ar' ? 'ساهم معنا في إكمال هذا الأثر' : 'Contribute to this Lasting Impact'}
            </h3>
            <p className="text-xs sm:text-sm text-[#E2F3EE]/80 dark:text-[#A7B4B0] max-w-lg mx-auto">
              {language === 'ar'
                ? 'كل مساهمة، مهما كانت بسيطة، تسهم في تجهيز العناية المركزة وإنقاذ الأرواح.'
                : 'Every contribution brings us closer to equipping the ICU and saving lives.'}
            </p>
            <div className="pt-2">
              <Link
                href="/#donate"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white dark:bg-[#24B58A] text-[#153C32] dark:text-[#0B1220] text-sm font-bold shadow-subtle hover:bg-[#F4F3ED] dark:hover:bg-[#209f79] transition-colors"
              >
                <Heart className="w-4 h-4 fill-current" />
                <span>{language === 'ar' ? 'ساهم الآن في الصدقة' : 'Contribute Now'}</span>
              </Link>
            </div>
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
