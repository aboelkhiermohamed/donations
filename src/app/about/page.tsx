'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';
import { Heart, Globe, ArrowLeft, ArrowRight, ShieldCheck, Cpu, Award } from 'lucide-react';

export default function AboutPage() {
  const { language, dir, toggleLanguage } = useLanguage();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center font-sans">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16 flex flex-col font-sans overflow-x-hidden bg-slate-950 text-slate-50 relative" dir={dir}>
      {/* Background Orbs */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-teal-500/5 rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* NAVBAR */}
      <header className="w-full max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-6 flex flex-row items-center justify-between z-10 gap-2">
        <Link href="/" className="flex items-center gap-1.5 md:gap-3 group">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0">
            <Heart className="w-4 h-4 md:w-5 md:h-5 text-slate-950 fill-slate-950" />
          </div>
          <span className="text-base md:text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 whitespace-nowrap">
            donations 9th Batch
          </span>
        </Link>

        <div className="flex items-center gap-1.5 md:gap-3 flex-shrink-0">
          <button 
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-2 md:px-4 py-1.5 md:py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs md:text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-450" />
            <span>{language === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 md:px-8 mt-8 space-y-10 z-10">
        
        {/* Back Link */}
        <div>
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400 hover:text-emerald-350 transition-colors bg-slate-900/40 border border-slate-900 py-2 px-4 rounded-xl hover:bg-slate-900/70"
          >
            {dir === 'rtl' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            <span>{language === 'ar' ? 'العودة للرئيسية' : 'Back to Home'}</span>
          </Link>
        </div>

        {/* Title */}
        <div className="space-y-4">
          <h1 className="text-3xl md:text-5xl font-black text-white leading-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-350">
            {language === 'ar' ? 'عن الحملة والمنصة' : 'About the Campaign & Platform'}
          </h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            {language === 'ar'
              ? 'مبادرة إنسانية رقمية تقودها الدفعة التاسعة من كلية الطب بجامعة كفر الشيخ لدعم الرعاية المركزة بأحدث الأجهزة الطبية.'
              : 'A digital humanitarian initiative led by the 9th Batch of Kafr El-Sheikh University Faculty of Medicine to equip the Intensive Care Unit with vital medical machinery.'}
          </p>
        </div>

        {/* Content Section: Campaign Goal */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl border border-slate-900 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Award className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white">
              {language === 'ar' ? 'هدف الحملة وغايتها الأساسية' : 'The Campaign Goal'}
            </h2>
          </div>
          
          <div className="space-y-4 text-xs md:text-sm text-slate-300 leading-relaxed">
            <p>
              {language === 'ar'
                ? 'تهدف هذه الحملة بشكل أساسي لتأمين وتوريد جهازين طبيين بالغة الأهمية لوحدة العناية المركزة بمستشفيات جامعة كفر الشيخ لخدمة المرضى ذوي الحالات الحرجة مجاناً وبأعلى جودة طبية:'
                : 'The primary objective of this campaign is to secure and deliver two highly critical medical devices for the Intensive Care Unit (ICU) at Kafr El-Sheikh University Hospital, saving lives and providing free high-quality care:'}
            </p>
            <ul className="list-disc list-inside space-y-2.5 pl-2">
              <li>
                <strong>{language === 'ar' ? 'جهاز تنفس صناعي حديث (Medical Ventilator):' : 'State-of-the-Art Ventilator:'}</strong>{' '}
                {language === 'ar'
                  ? 'جهاز تنفس صناعي فائق الكفاءة لدعم رئتي المرضى غير القادرين على التنفس بمفردهم نتيجة الفشل التنفسي أو الصدمات الحادة.'
                  : 'An advanced mechanical ventilator designed to support respiratory failure cases and assist ICU patients in critical conditions.'}
              </li>
              <li>
                <strong>{language === 'ar' ? 'جهاز تحليل غازات الدم (ABG Device):' : 'ABG (Arterial Blood Gas) Analyzer:'}</strong>{' '}
                {language === 'ar'
                  ? 'جهاز أساسي لتحليل نسبة الأكسجين وثاني أكسيد الكربون ودرجة الحموضة (pH) في الدم الشرياني بشكل فوري لتوجيه خطة علاج مرضى الرعاية بدقة بالغة.'
                  : 'A diagnostic device vital for measuring arterial oxygen, carbon dioxide levels, and blood pH in real time to guide critical medical treatment.'}
              </li>
            </ul>
          </div>
        </div>

        {/* Content Section: Platform Technology */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-900 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">
                {language === 'ar' ? 'نظام التحقق التلقائي المبتكر' : 'Automated Verification'}
              </h3>
            </div>
            <p className="text-xs text-slate-405 leading-relaxed">
              {language === 'ar'
                ? 'تتميز المنصة بنظام مطابقة تلقائي يربط تبرعك المسجل على الموقع بإشعارات الرسائل النصية القصيرة (SMS) المستلمة من فودافون كاش أو إنستاباي عبر هاتف بوابة مخصص، ليتم اعتماد تبرعك تلقائياً ونشره في لوحة الشفافية خلال ثوانٍ.'
                : 'The platform integrates an automated matching engine that verifies donation requests against real-time SMS alerts received from Vodafone Cash or InstaPay on our gateway device, validating contributions automatically within seconds.'}
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-slate-900 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-450">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">
                {language === 'ar' ? 'الشفافية الكاملة وحماية الهوية' : '100% Transparency & Privacy'}
              </h3>
            </div>
            <p className="text-xs text-slate-405 leading-relaxed">
              {language === 'ar'
                ? 'لضمان الثقة الكاملة، يتم عرض كافة التبرعات المعتمدة مباشرةً في لوحة الشفافية العامة. وبنفس الوقت، نقوم بحماية خصوصيتك عبر تشفير كامل لأرقام الهواتف وإخفاء أجزاء من أسماء المتبرعين لتجنب أي إساءة لاستخدام البيانات.'
                : 'To establish complete public trust, all approved donations are streamed in real time to the public ledger. Simultaneously, donor privacy is safeguarded by hashing phone numbers and partially masking names to prevent data misuse.'}
            </p>
          </div>
        </div>

        {/* Footer/Sign-off Card */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 md:p-8 rounded-2xl border border-slate-900 text-center space-y-4">
          <p className="text-xs text-slate-400">
            {language === 'ar'
              ? 'كل تبرع، مهما كانت قيمته، يقربنا خطوة إضافية نحو تأمين هذا العتاد الطبي وإنقاذ الأرواح.'
              : 'Every contribution, big or small, brings us closer to securing these vital medical devices and saving lives.'}
          </p>
          <div className="font-extrabold text-sm text-emerald-400">
            {language === 'ar' ? 'كلية الطب بجامعة كفر الشيخ - الدفعة التاسعة' : 'Kafr El-Sheikh University Faculty of Medicine - 9th Batch'}
          </div>
        </div>

      </main>
    </div>
  );
}
