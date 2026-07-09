'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';
import { Heart, Globe, ArrowLeft, ArrowRight, ShieldAlert, Lock, EyeOff, Coins } from 'lucide-react';

export default function PrivacyPolicyPage() {
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
            {language === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'}
          </h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            {language === 'ar'
              ? 'نهتم بحماية بياناتك والتحقق من التبرعات بأمان تام. تفاصيل واضحة حول البيانات التي نعالجها ونحميها.'
              : 'We care about your data protection and secure donation validation. Clear details on what data we process and safeguard.'}
          </p>
        </div>

        {/* Section List */}
        <div className="space-y-6">
          
          {/* Policy Card 1: SMS Parsing */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-900 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-white">
                {language === 'ar' ? 'أمان رسائل التحويل النصية (SMS)' : 'SMS Alert Safety'}
              </h2>
            </div>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              {language === 'ar'
                ? 'يتم تشغيل بوابة Android مغلقة وخاصة لاستلام الرسائل النصية القصيرة الرسمية الصادرة من (فودافون كاش أو إنستاباي) فقط. يقوم المحرك بفحص النص مباشرة، ومطابقة البيانات الحيوية (المبلغ المالي والرقم المرجعي)، ثم تحديث حالة التبرع. لا يتم تخزين تفاصيل الرسائل العشوائية أو الشخصية، ويتم حذف السجلات بشكل دوري.'
                : 'We operate a private, secure Android gateway that listens strictly for official transaction SMS alerts (from Vodafone Cash or InstaPay). The engine parses only transaction-critical values (amounts, dates, reference codes) to approve contributions. Unrelated messages are filtered and discarded instantly.'}
            </p>
          </div>

          {/* Policy Card 2: Identity Masking */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-900 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-450">
                <EyeOff className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-white">
                {language === 'ar' ? 'إخفاء الهوية في السجل العام' : 'Identity Masking on Ledger'}
              </h2>
            </div>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              {language === 'ar'
                ? 'لحماية هوية وخصوصية المتبرعين، لا يعرض سجل المعاملات العام أي أرقام هواتف كاملة أو أسماء كاملة. يتم تمويه الأسماء (مثل: Mohamed A.) ويتم إخفاء أرقام الهواتف لعرض آخر 3 أو 4 أرقام فقط (مثل: ********381) لضمان الخصوصية التامة مع الحفاظ على شفافية المنصة.'
                : 'To respect donor anonymity, our public ledger masks all donor phone numbers and full names. Phone numbers only show partial endings (e.g., ********381) and names are masked to initial letters (e.g., Mohamed A.). Full records are restricted strictly to campaign administrators.'}
            </p>
          </div>

          {/* Policy Card 3: Storage */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-900 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-white">
                {language === 'ar' ? 'حماية تخزين البيانات والتأمين' : 'Secure Storage'}
              </h2>
            </div>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              {language === 'ar'
                ? 'تُخزن جميع البيانات في قواعد بيانات مؤمنة وسحابية (Supabase) مع تمكين سياسات الحماية على مستوى الصف (RLS). لا توجد إمكانية للوصول الخارجي للبيانات أو تفاصيل المتبرعين غير الموثقين، ويتم تشفير الاتصالات بالكامل باستخدام بروتوكول SSL/TLS.'
                : 'All database transactions are secured using PostgreSQL Row Level Security (RLS) hosted on Supabase. Access to raw donor directories is sealed and encrypted via SSL/TLS. External network request authentication protects configurations and audit files.'}
            </p>
          </div>

          {/* Policy Card 4: Donation Disclaimer */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-900 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                <Coins className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-white">
                {language === 'ar' ? 'تنويه هام وإخلاء مسؤولية مالي' : 'Important Disclaimer & Funds Notice'}
              </h2>
            </div>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              {language === 'ar'
                ? 'تقتصر وظيفة المنصة فقط على تأكيد وتوثيق التبرعات الواردة. نود التنويه بأن جميع التبرعات تذهب مباشرة وتوجد في المحافظ الشخصية للأشخاص المسؤولين عنها، وليس للمنصة أي صلاحية أو إمكانية للوصول إلى أي أموال أو حسابات خاصة بالمتبرعين.'
                : 'The platform\'s role is strictly limited to confirming and documenting incoming donations. All donations are sent directly to and remain within the personal wallets of the responsible individuals. The platform does not have any access, control, or authority over any donor funds or private accounts.'}
            </p>
          </div>

        </div>

      </main>
    </div>
  );
}
