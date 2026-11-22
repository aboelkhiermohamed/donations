'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/LanguageContext';
import { Loader2, HeartHandshake } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

export default function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { language, dir } = useLanguage();

  const { data: maintenanceMode } = useQuery({
    queryKey: ['maintenanceMode'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'maintenance_mode')
          .maybeSingle();

        if (error) {
          return { enabled: false, message_ar: '', message_en: '' };
        }

        return data?.value || { enabled: false, message_ar: '', message_en: '' };
      } catch (err) {
        return { enabled: false, message_ar: '', message_en: '' };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes fresh in client cache
    refetchOnWindowFocus: false,
  });

  const isAdminRoute = pathname?.startsWith('/admin');
  const isApiRoute = pathname?.startsWith('/api');

  // Skip guard for admin paths and API calls
  if (isAdminRoute || isApiRoute) {
    return <>{children}</>;
  }

  if (maintenanceMode?.enabled) {
    return (
      <div
        className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1220] flex flex-col items-center justify-center p-6 text-center select-none relative font-arabic"
        dir={dir}
      >
        <div className="absolute top-6 end-6">
          <ThemeToggle />
        </div>

        <div className="max-w-lg w-full bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] rounded-2xl p-8 md:p-10 shadow-editorial relative z-10 space-y-6">
          {/* Institutional Badge */}
          <div className="mx-auto w-16 h-16 bg-[#F0F9F6] dark:bg-[#111C2D] border border-[#153C32]/10 dark:border-[#24B58A]/20 rounded-2xl flex items-center justify-center">
            <HeartHandshake className="w-8 h-8 text-[#153C32] dark:text-[#24B58A]" />
          </div>

          <div className="inline-block px-3 py-1 rounded-full bg-[#FAF8F2] dark:bg-[#111C2D] border border-[#B79B68]/30 dark:border-[#C5A876]/30 text-[#9E8047] dark:text-[#C5A876] text-xs font-semibold">
            {language === 'ar' ? 'الدفعة التاسعة — طب كفر الشيخ' : '9th Batch — Kafr El-Sheikh Medicine'}
          </div>

          <h1 className="text-2xl font-bold text-[#191F1C] dark:text-[#F3F5F4] tracking-tight">
            {language === 'ar' ? 'الموقع في فترة صيانة وتحديث مجدول' : 'Platform Under Scheduled Maintenance'}
          </h1>

          <p className="text-[#55625B] dark:text-[#A7B4B0] text-sm leading-relaxed font-normal">
            {language === 'ar'
              ? (maintenanceMode.message_ar || 'نقوم ببعض التحديثات المجدولة لتطوير وتأمين منصة الصدقة الجارية. سنعود للعمل بكامل الكفاءة قريبًا جدًا، شكرًا لتفهمكم ودعمكم المستمر.')
              : (maintenanceMode.message_en || 'We are performing scheduled improvements to ensure platform security and reliability. We will be back online shortly. Thank you for your support.')}
          </p>

          <div className="h-px bg-[#EAE8DE] dark:bg-[#283849]" />

          <div className="text-xs text-[#738079] dark:text-[#80918C]">
            {language === 'ar'
              ? 'لأي استفسارات عاجلة يرجى التواصل مع منسقي الدفعة التاسعة.'
              : 'For urgent inquiries, please contact the 9th Batch committee.'}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
