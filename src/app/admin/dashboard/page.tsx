'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  TrendingUp, 
  Coins, 
  Clock, 
  CheckCircle2, 
  UserCheck, 
  Smartphone, 
  Battery, 
  Wifi, 
  Edit3, 
  Check, 
  X, 
  Loader2 
} from 'lucide-react';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const { language, dir, t } = useLanguage();
  const { resolvedTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const queryClient = useQueryClient();

  const [editingDevice, setEditingDevice] = useState<string | null>(null);
  const [newNickname, setNewNickname] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin_dashboard_realtime_redesign')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['adminDashboardDonations'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboardSmsLogs'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 1. Fetch Campaign Info (minimal column projection)
  const { data: campaign } = useQuery({
    queryKey: ['adminCampaignData'],
    queryFn: async () => {
      const { data } = await supabase.from('campaigns').select('id, target_amount, collected_amount').limit(1).maybeSingle();
      return data || { target_amount: 350000, collected_amount: 0 };
    },
    staleTime: 60000,
  });

  // 2. Fetch Donations for Stats & Charts
  const { data: donations = [], isLoading: isDonationsLoading } = useQuery({
    queryKey: ['adminDashboardDonations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donations')
        .select(`
          id,
          amount,
          status,
          payment_method,
          created_at,
          transaction_ref,
          donor:donors (
            name,
            phone
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  // 3. Fetch Gateway Status & Nicknames (relaxed polling)
  const { data: gateways = [] } = useQuery({
    queryKey: ['adminGatewayStatus'],
    queryFn: async () => {
      const { data } = await supabase
        .from('settings')
        .select('key, value')
        .like('key', 'gateway_status_%');

      return (data || []).map(row => row.value) || [];
    },
    refetchInterval: 30000,
    staleTime: 25000,
  });

  const { data: nicknames = {} } = useQuery<Record<string, string>>({
    queryKey: ['adminGatewayNicknames'],
    queryFn: async () => {
      const { data } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'gateway_nicknames')
        .maybeSingle();

      return data?.value || {};
    },
  });

  // Calculate Metrics
  const metrics = useMemo(() => {
    let verifiedSum = 0;
    let pendingCount = 0;
    let verifiedCount = 0;
    let rejectedCount = 0;
    const donorPhoneSet = new Set();

    donations.forEach((d: any) => {
      const isVerified = d.status === 'auto_verified' || d.status === 'manual_verified';
      if (isVerified) {
        verifiedSum += Number(d.amount || 0);
        verifiedCount++;
        if (d.donor?.phone) donorPhoneSet.add(d.donor.phone);
      } else if (d.status === 'pending') {
        pendingCount++;
      } else if (d.status === 'rejected') {
        rejectedCount++;
      }
    });

    const target = Number(campaign?.target_amount) || 350000;
    const remaining = Math.max(0, target - verifiedSum);
    const progress = Math.min(100, Math.round((verifiedSum / target) * 100));

    return {
      target,
      verifiedSum,
      remaining,
      progress,
      verifiedCount,
      pendingCount,
      rejectedCount,
      totalCount: donations.length,
      uniqueDonorsCount: donorPhoneSet.size,
    };
  }, [donations, campaign]);

  // Chart Data: Last 7 Days
  const chartData = useMemo(() => {
    const daysMap: Record<string, number> = {};
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      daysMap[key] = 0;
    }

    donations.forEach((d: any) => {
      const isVerified = d.status === 'auto_verified' || d.status === 'manual_verified';
      if (isVerified && d.created_at) {
        const dayKey = d.created_at.split('T')[0];
        if (daysMap[dayKey] !== undefined) {
          daysMap[dayKey] += Number(d.amount || 0);
        }
      }
    });

    return Object.keys(daysMap).map(k => {
      const dateObj = new Date(k);
      const label = dateObj.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
      return {
        date: label,
        amount: daysMap[k],
      };
    });
  }, [donations, language]);

  // Method Distribution Data
  const methodData = useMemo(() => {
    let vfc = 0;
    let ipn = 0;
    donations.forEach((d: any) => {
      const isVerified = d.status === 'auto_verified' || d.status === 'manual_verified';
      if (isVerified) {
        if (d.payment_method === 'vodafone_cash') vfc += Number(d.amount);
        else ipn += Number(d.amount);
      }
    });
    return [
      { name: 'فودافون كاش', value: vfc, color: resolvedTheme === 'dark' ? '#24B58A' : '#153C32' },
      { name: 'InstaPay', value: ipn, color: resolvedTheme === 'dark' ? '#C5A876' : '#B79B68' },
    ];
  }, [donations, resolvedTheme]);

  const handleSaveNickname = async (deviceId: string) => {
    setIsSavingNickname(true);
    try {
      const updated = { ...nicknames, [deviceId]: newNickname.trim() };
      await supabase
        .from('settings')
        .upsert({
          key: 'gateway_nicknames',
          value: updated,
          updated_at: new Date().toISOString(),
        });
      queryClient.invalidateQueries({ queryKey: ['adminGatewayNicknames'] });
      setEditingDevice(null);
    } catch (err) {
      console.error('Save nickname failed:', err);
    } finally {
      setIsSavingNickname(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#EAE8DE] dark:border-[#283849]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#153C32] dark:text-[#24B58A] tracking-tight">
              {language === 'ar' ? 'لوحة المتابعة والتحكم' : 'Operations Dashboard'}
            </h1>
            <p className="text-xs sm:text-sm text-[#738079] dark:text-[#A7B4B0] mt-1">
              {language === 'ar'
                ? 'متابعة حية للمساهمات المالية، حالة بوابات الـ SMS، ومعدل إنجاز الصدقة الجارية.'
                : 'Live tracking of contributions, Android gateway health, and campaign target.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/admin/donations?status=pending"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
            >
              <Clock className="w-4 h-4 text-amber-600" />
              <span>{metrics.pendingCount} {language === 'ar' ? 'معاملة معلقة' : 'Pending Requests'}</span>
            </Link>
          </div>
        </div>

        {/* 1. PRIMARY KPI TILES */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="p-5 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-2">
            <div className="flex items-center justify-between text-[#738079] dark:text-[#A7B4B0]">
              <span className="text-xs font-bold">{t('collected')}</span>
              <Coins className="w-4 h-4 text-[#153C32] dark:text-[#24B58A]" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#153C32] dark:text-[#24B58A]">
              {metrics.verifiedSum.toLocaleString('en-US')}{' '}
              <span className="text-xs font-bold text-[#738079] dark:text-[#A7B4B0]">{t('egp')}</span>
            </div>
            <span className="text-[11px] font-semibold text-[#217A61] dark:text-[#24B58A] block">
              {metrics.progress}% {language === 'ar' ? 'من الهدف' : 'of target'}
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-2">
            <div className="flex items-center justify-between text-[#738079] dark:text-[#A7B4B0]">
              <span className="text-xs font-bold">{t('target')}</span>
              <TrendingUp className="w-4 h-4 text-[#B79B68] dark:text-[#C5A876]" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#191F1C] dark:text-[#F3F5F4]">
              {metrics.target.toLocaleString('en-US')}{' '}
              <span className="text-xs font-bold text-[#738079] dark:text-[#A7B4B0]">{t('egp')}</span>
            </div>
            <span className="text-[11px] text-[#738079] dark:text-[#A7B4B0] block">
              {t('remaining')}: {metrics.remaining.toLocaleString('en-US')} {t('egp')}
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-2">
            <div className="flex items-center justify-between text-[#738079] dark:text-[#A7B4B0]">
              <span className="text-xs font-bold">{t('verified_donors_count')}</span>
              <UserCheck className="w-4 h-4 text-[#217A61] dark:text-[#24B58A]" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#153C32] dark:text-[#24B58A]">
              {metrics.uniqueDonorsCount}
            </div>
            <span className="text-[11px] text-[#738079] dark:text-[#A7B4B0] block">
              {metrics.verifiedCount} {language === 'ar' ? 'عملية موثقة' : 'Verified Gifts'}
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-2">
            <div className="flex items-center justify-between text-[#738079] dark:text-[#A7B4B0]">
              <span className="text-xs font-bold">{language === 'ar' ? 'قيد المراجعة' : 'Pending Review'}</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-700 dark:text-amber-400">
              {metrics.pendingCount}
            </div>
            <Link
              href="/admin/donations?status=pending"
              className="text-[11px] font-bold text-[#153C32] dark:text-[#24B58A] hover:underline block"
            >
              {language === 'ar' ? 'مراجعة الآن ←' : 'Review Now →'}
            </Link>
          </div>

        </div>

        {/* 2. CHARTS SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <div className="lg:col-span-8 p-6 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base text-[#153C32] dark:text-[#F3F5F4]">
                  {language === 'ar' ? 'مسار التبرعات خلال آخر 7 أيام' : '7-Day Contributions Trajectory'}
                </h3>
                <span className="text-xs text-[#738079] dark:text-[#A7B4B0]">
                  {language === 'ar' ? 'المبالغ المعتمدة بالجنيه المصري' : 'Verified amounts in EGP'}
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="forestArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={resolvedTheme === 'dark' ? '#24B58A' : '#153C32'} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={resolvedTheme === 'dark' ? '#24B58A' : '#153C32'} stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={resolvedTheme === 'dark' ? '#283849' : '#EAE8DE'} vertical={false} />
                    <XAxis dataKey="date" stroke="#94A099" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94A099" fontSize={11} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: resolvedTheme === 'dark' ? '#111C2D' : '#FFFFFF', 
                        borderColor: resolvedTheme === 'dark' ? '#283849' : '#DDD9CC', 
                        color: resolvedTheme === 'dark' ? '#F3F5F4' : '#191F1C',
                        borderRadius: '12px', 
                        fontSize: '12px' 
                      }}
                      formatter={(val: any) => [`${Number(val).toLocaleString('en-US')} ${t('egp')}`, language === 'ar' ? 'المبلغ' : 'Amount']}
                    />
                    <Area type="monotone" dataKey="amount" stroke={resolvedTheme === 'dark' ? '#24B58A' : '#153C32'} strokeWidth={2.5} fillOpacity={1} fill="url(#forestArea)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 p-6 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-4">
            <h3 className="font-extrabold text-base text-[#153C32] dark:text-[#F3F5F4]">
              {language === 'ar' ? 'توزيع وسائل التحويل' : 'Payment Distribution'}
            </h3>

            <div className="h-44 w-full">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={methodData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {methodData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: resolvedTheme === 'dark' ? '#111C2D' : '#FFFFFF', 
                        borderColor: resolvedTheme === 'dark' ? '#283849' : '#DDD9CC',
                        color: resolvedTheme === 'dark' ? '#F3F5F4' : '#191F1C',
                        borderRadius: '12px', 
                        fontSize: '12px' 
                      }}
                      formatter={(val: any) => [`${Number(val).toLocaleString('en-US')} ${t('egp')}`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-[#EAE8DE] dark:border-[#283849] text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold text-[#191F1C] dark:text-[#F3F5F4]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#153C32] dark:bg-[#24B58A]" />
                  فودافون كاش
                </span>
                <span className="font-bold text-[#153C32] dark:text-[#24B58A]">
                  {methodData[0].value.toLocaleString('en-US')} {t('egp')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold text-[#191F1C] dark:text-[#F3F5F4]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#B79B68] dark:bg-[#C5A876]" />
                  إنستاباي (InstaPay)
                </span>
                <span className="font-bold text-[#B79B68] dark:text-[#C5A876]">
                  {methodData[1].value.toLocaleString('en-US')} {t('egp')}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* 3. GATEWAY HEALTH & RECENT TRANSACTIONS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          <div className="lg:col-span-5 p-6 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8DE] dark:border-[#283849]">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-[#153C32] dark:text-[#24B58A]" />
                <h3 className="font-extrabold text-base text-[#153C32] dark:text-[#F3F5F4]">
                  {language === 'ar' ? 'أجهزة بوابة الـ SMS' : 'Active SMS Gateways'}
                </h3>
              </div>
              <Link href="/admin/sms" className="text-xs font-bold text-[#153C32] dark:text-[#24B58A] hover:underline">
                {language === 'ar' ? 'إدارة ←' : 'Manage →'}
              </Link>
            </div>

            {gateways.length === 0 ? (
              <p className="text-xs text-[#738079] dark:text-[#A7B4B0] py-4 text-center">
                {language === 'ar' ? 'لم يتم ربط أجهزة حتى الآن عبر تطبيق الأندرويد.' : 'No active gateway devices detected.'}
              </p>
            ) : (
              <div className="space-y-3">
                {gateways.map((g: any, idx: number) => {
                  const id = g.deviceId || `device_${idx}`;
                  const customName = nicknames[id] || `هاتف البوابة ${idx + 1}`;
                  const isOnline = g.lastHeartbeat && (Date.now() - new Date(g.lastHeartbeat).getTime()) < 1000 * 60 * 30;

                  return (
                    <div key={id} className="p-4 rounded-2xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849] space-y-2">
                      <div className="flex items-center justify-between">
                        {editingDevice === id ? (
                          <div className="flex items-center gap-1.5 flex-1 me-2">
                            <input
                              type="text"
                              value={newNickname}
                              onChange={e => setNewNickname(e.target.value)}
                              className="py-1 px-2 text-xs rounded-lg border border-[#DDD9CC] dark:border-[#283849] bg-white dark:bg-[#172436] text-[#191F1C] dark:text-[#F3F5F4]"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveNickname(id)}
                              disabled={isSavingNickname}
                              className="p-1 rounded bg-[#153C32] dark:bg-[#24B58A] text-white"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDevice(null)}
                              className="p-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[#191F1C] dark:text-[#F3F5F4]">{customName}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDevice(id);
                                setNewNickname(customName);
                              }}
                              className="text-[#738079] hover:text-[#153C32] dark:hover:text-[#24B58A]"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          isOnline 
                            ? 'bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300' 
                            : 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-600' : 'bg-red-600'}`} />
                          {isOnline ? 'متصل' : 'غير متصل'}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-[#738079] dark:text-[#A7B4B0]">
                        <span className="flex items-center gap-1">
                          <Battery className="w-3.5 h-3.5" />
                          <span>{g.battery ?? '—'}%</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Wifi className="w-3.5 h-3.5" />
                          <span>{g.network || 'WiFi'}</span>
                        </span>
                        <span className="text-[11px] font-mono text-[#94A099]">
                          ID: {id.substring(0, 8)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-7 p-6 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8DE] dark:border-[#283849]">
              <h3 className="font-extrabold text-base text-[#153C32] dark:text-[#F3F5F4]">
                {language === 'ar' ? 'آخر التبرعات المسجلة' : 'Recent Submissions'}
              </h3>
              <Link href="/admin/donations" className="text-xs font-bold text-[#153C32] dark:text-[#24B58A] hover:underline">
                {language === 'ar' ? 'عرض السجل الكامل ←' : 'View All →'}
              </Link>
            </div>

            <div className="divide-y divide-[#EAE8DE] dark:divide-[#283849]">
              {donations.slice(0, 5).map((d: any) => (
                <div key={d.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="font-bold text-sm text-[#191F1C] dark:text-[#F3F5F4] block">
                      {d.donor?.name || 'فاعل خير'}
                    </span>
                    <span className="text-xs text-[#738079] dark:text-[#A7B4B0]">
                      {d.donor?.phone || '—'} • {d.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'InstaPay'}
                    </span>
                  </div>

                  <div className="text-end space-y-1">
                    <span className="font-extrabold text-sm text-[#153C32] dark:text-[#24B58A] block">
                      {Number(d.amount).toLocaleString('en-US')} {t('egp')}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                      d.status === 'auto_verified' || d.status === 'manual_verified'
                        ? 'bg-[#F0F9F6] dark:bg-[#24B58A]/10 text-[#217A61] dark:text-[#24B58A]'
                        : d.status === 'pending'
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                        : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                    }`}>
                      {d.status === 'auto_verified'
                        ? 'موثق آليًا'
                        : d.status === 'manual_verified'
                        ? 'معتمد يدويًا'
                        : d.status === 'pending'
                        ? 'قيد المراجعة'
                        : 'مرفوض'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </AdminLayout>
  );
}
