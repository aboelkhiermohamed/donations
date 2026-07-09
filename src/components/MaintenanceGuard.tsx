'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/LanguageContext';
import { Loader2, Settings } from 'lucide-react';

export default function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { language, dir } = useLanguage();

  const { data: maintenanceMode, isLoading } = useQuery({
    queryKey: ['maintenanceMode'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'maintenance_mode')
        .maybeSingle();

      if (error) {
        console.error('Error fetching maintenance mode:', error);
        throw error;
      }

      return data?.value || { enabled: false, message_ar: '', message_en: '' };
    },
    refetchInterval: 30000, // Poll every 30 seconds
  });

  const isAdminRoute = pathname?.startsWith('/admin');
  const isApiRoute = pathname?.startsWith('/api');

  // Skip guard for admin paths and API calls
  if (isAdminRoute || isApiRoute) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (maintenanceMode?.enabled) {
    return (
      <div 
        className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none overflow-hidden relative font-cairo"
        dir={dir}
      >
        {/* Background Glowing Gradients */}
        <div className="absolute top-0 inset-x-0 h-80 bg-gradient-to-b from-emerald-500/10 to-transparent pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-emerald-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-md w-full bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-8 shadow-2xl relative z-10 animate-fade-in">
          {/* Logo or Icon Container */}
          <div className="mx-auto w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-6">
            <Settings className="w-10 h-10 text-emerald-400 animate-spin" style={{ animationDuration: '8s' }} />
          </div>

          <h1 className="text-2xl font-black text-white mb-4 tracking-tight">
            {language === 'ar' ? 'الموقع في وضع الصيانة' : 'Site Under Maintenance'}
          </h1>
          
          <p className="text-slate-400 text-sm leading-relaxed mb-6 font-medium">
            {language === 'ar' 
              ? (maintenanceMode.message_ar || 'نقوم ببعض التحديثات وأعمال الصيانة المجدولة لتطوير وتأمين المنصة. سنعود للعمل قريباً جداً، شكراً لتفهمكم وصبركم!')
              : (maintenanceMode.message_en || 'We are performing scheduled maintenance and updates to improve and secure the platform. We will be back online shortly. Thank you for your patience!')}
          </p>

          <div className="h-[1px] bg-slate-800/60 my-6" />

          {/* Additional details */}
          <div className="text-xs text-slate-500 font-semibold">
            {language === 'ar' 
              ? 'إذا كان لديك استفسار عاجل، يرجى مراجعة مسؤولي الدفعة.' 
              : 'If you have any urgent inquiries, please contact the batch organizers.'}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
