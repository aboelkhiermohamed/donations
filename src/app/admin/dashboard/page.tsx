'use client';

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import { 
  TrendingUp, 
  Coins, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  Smartphone
} from 'lucide-react';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const { language, t } = useLanguage();
  const [isMounted, setIsMounted] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Realtime subscription for instant dashboard updates
  useEffect(() => {
    const channel = supabase
      .channel('admin_dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['adminDashboardStats'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboardSmsLogs'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Fetch latest HTTP gateway logs (sms_logs)
  const { data: smsLogs, isLoading: isLogsLoading } = useQuery({
    queryKey: ['dashboardSmsLogs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sms_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 10000,
  });

  const getLogStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/60 border border-emerald-900 text-emerald-400">
            Success
          </span>
        );
      case 'duplicate':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 border border-slate-800 text-slate-400">
            Duplicate
          </span>
        );
      case 'failed_parsing':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950/40 border border-red-900/40 text-red-300">
            Failed
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">
            {status}
          </span>
        );
    }
  };

  // Fetch all donations for dashboard stats
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['adminDashboardStats'],
    queryFn: async () => {
      const { data: donations, error } = await supabase
        .from('donations')
        .select(`
          id,
          amount,
          status,
          payment_method,
          verification_method,
          created_at
        `);

      if (error) throw error;

      const items = donations || [];

      // Metrics
      const totalDonations = items.length;
      const approved = items.filter(d => d.status === 'auto_verified' || d.status === 'manual_verified');
      const pending = items.filter(d => d.status === 'pending');
      const rejected = items.filter(d => d.status === 'rejected');
      
      const autoVerified = items.filter(d => d.status === 'auto_verified');
      const manualVerified = items.filter(d => d.status === 'manual_verified');

      const totalRevenue = approved.reduce((sum, d) => sum + Number(d.amount), 0);
      const pendingRevenue = pending.reduce((sum, d) => sum + Number(d.amount), 0);

      // Calculations
      const autoVerifiedRate = approved.length > 0 
        ? Math.round((autoVerified.length / approved.length) * 100) 
        : 0;

      // Group by payment method
      const vfcTotal = approved.filter(d => d.payment_method === 'vodafone_cash').reduce((sum, d) => sum + Number(d.amount), 0);
      const instapayTotal = approved.filter(d => d.payment_method === 'instapay').reduce((sum, d) => sum + Number(d.amount), 0);

      const paymentDistribution = [
        { name: language === 'ar' ? 'فودافون كاش' : 'Vodafone Cash', value: vfcTotal },
        { name: language === 'ar' ? 'إنستاباي' : 'InstaPay', value: instapayTotal },
      ];

      // Group by daily donation totals for past 7 days
      const dailyMap: Record<string, number> = {};
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      }).reverse();

      dates.forEach(d => {
        dailyMap[d] = 0;
      });

      approved.forEach(d => {
        const dateStr = d.created_at.split('T')[0];
        if (dateStr in dailyMap) {
          dailyMap[dateStr] += Number(d.amount);
        }
      });

      const dailyDonations = Object.keys(dailyMap).map(key => ({
        date: key.substring(5), // MM-DD format
        amount: dailyMap[key]
      }));

      // Method comparison chart
      const verificationTypes = [
        { name: language === 'ar' ? 'تحقق تلقائي' : 'Auto Verified', count: autoVerified.length },
        { name: language === 'ar' ? 'تحقق يدوي' : 'Manual Verified', count: manualVerified.length },
        { name: language === 'ar' ? 'قيد الانتظار' : 'Pending', count: pending.length },
        { name: language === 'ar' ? 'مرفوض' : 'Rejected', count: rejected.length }
      ];

      return {
        totalDonations,
        approvedCount: approved.length,
        pendingCount: pending.length,
        rejectedCount: rejected.length,
        autoVerifiedCount: autoVerified.length,
        manualVerifiedCount: manualVerified.length,
        totalRevenue,
        pendingRevenue,
        autoVerifiedRate,
        paymentDistribution,
        dailyDonations,
        verificationTypes
      };
    },
    refetchInterval: 12000,
  });

  const COLORS = ['#10b981', '#06b6d4', '#e2e8f0', '#f43f5e'];

  if (isLoading || !dashboardData) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div className="h-10 w-48 bg-slate-900 rounded-lg animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 bg-slate-900 rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="h-80 lg:col-span-2 bg-slate-900 rounded-2xl animate-pulse" />
            <div className="h-80 bg-slate-900 rounded-2xl animate-pulse" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        
        {/* TOP TITLE */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">{t('db_overview')}</h1>
            <p className="text-slate-400 text-xs mt-1">
              {language === 'ar' ? 'إحصائيات فورية ومؤشرات نجاح التحقق التلقائي للحملة.' : 'Real-time stats and success rates of campaign matching engine.'}
            </p>
          </div>
        </div>

        {/* KPI CARDS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card: Total Collected */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-900 relative overflow-hidden flex flex-col justify-between min-h-[110px]">
            <div className="flex justify-between items-start">
              <span className="text-slate-400 text-xs font-semibold">{t('db_total')}</span>
              <Coins className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black text-white">
                {dashboardData.totalRevenue.toLocaleString()}{' '}
                <span className="text-xs font-bold text-emerald-400">{t('egp')}</span>
              </span>
            </div>
            <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-500/5 rounded-full blur-md" />
          </div>

          {/* Card: Pending Verification */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-900 relative overflow-hidden flex flex-col justify-between min-h-[110px]">
            <div className="flex justify-between items-start">
              <span className="text-slate-400 text-xs font-semibold">{t('stat_pending')}</span>
              <Clock className="w-5 h-5 text-teal-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-white">
                {dashboardData.pendingCount}{' '}
                <span className="text-xs text-slate-500 font-semibold">({dashboardData.pendingRevenue.toLocaleString()} EGP)</span>
              </span>
              <Link href="/admin/donations" className="text-[10px] text-emerald-400 font-bold hover:underline flex items-center gap-0.5">
                <span>{language === 'ar' ? 'مراجعة' : 'Review'}</span>
                <ArrowRight className="w-3 h-3 rtl-flip" />
              </Link>
            </div>
            <div className="absolute top-0 right-0 w-8 h-8 bg-teal-500/5 rounded-full blur-md" />
          </div>

          {/* Card: Auto Verified Rate */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-900 relative overflow-hidden flex flex-col justify-between min-h-[110px]">
            <div className="flex justify-between items-start">
              <span className="text-slate-400 text-xs font-semibold">{t('db_verification_rate')}</span>
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black text-emerald-400">
                {dashboardData.autoVerifiedRate}%
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {language === 'ar' ? `تمت مطابقة ${dashboardData.autoVerifiedCount} تبرع تلقائياً` : `Matched ${dashboardData.autoVerifiedCount} requests automatically`}
              </span>
            </div>
            <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-500/5 rounded-full blur-md" />
          </div>

          {/* Card: Total Donors */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-900 relative overflow-hidden flex flex-col justify-between min-h-[110px]">
            <div className="flex justify-between items-start">
              <span className="text-slate-400 text-xs font-semibold">{t('stat_total_donors')}</span>
              <UserCheck className="w-5 h-5 text-teal-400" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black text-white">
                {dashboardData.approvedCount}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {language === 'ar' ? 'متبرعون معتمدون بنجاح' : 'Donors verified successfully'}
              </span>
            </div>
            <div className="absolute top-0 right-0 w-8 h-8 bg-teal-500/5 rounded-full blur-md" />
          </div>

        </div>

        {/* CHARTS CONTAINER */}
        {isMounted && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Chart: Donation Growth (Daily) */}
            <div className="lg:col-span-8 glass-panel p-5 rounded-2xl border border-slate-900 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-450" />
                  {t('db_weekly_growth')}
                </h3>
                <span className="text-[10px] text-slate-500 font-semibold">{language === 'ar' ? 'الـ 7 أيام الماضية' : 'Past 7 Days'}</span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dashboardData.dailyDonations}>
                    <defs>
                      <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                      labelStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                      itemStyle={{ color: '#10b981', fontSize: '11px' }}
                    />
                    <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorAmount)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart: Payment Method Breakdown */}
            <div className="lg:col-span-4 glass-panel p-5 rounded-2xl border border-slate-900 space-y-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Coins className="w-4 h-4 text-teal-400" />
                  {language === 'ar' ? 'توزيع قنوات الدفع' : 'Payment Channels'}
                </h3>
              </div>

              <div className="h-48 w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dashboardData.paymentDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {dashboardData.paymentDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff', fontSize: '11px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                
                {/* Total overlay inside donut */}
                <div className="absolute text-center">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest">{t('collected')}</span>
                  <p className="text-lg font-black text-white">{dashboardData.totalRevenue.toLocaleString()}</p>
                </div>
              </div>

              {/* Legends details */}
              <div className="space-y-1">
                {dashboardData.paymentDistribution.map((entry, index) => (
                  <div key={entry.name} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                      <span className="text-slate-400 font-semibold">{entry.name}</span>
                    </div>
                    <span className="text-white font-bold">{entry.value.toLocaleString()} {t('egp')}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* BOTTOM SECTION: GATEWAY LOGS & METRICS */}
        {isMounted && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: HTTP Gateway Requests (SMS Logs) */}
            <div className="lg:col-span-7 glass-panel p-5 rounded-2xl border border-slate-900 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-455" />
                    {language === 'ar' ? 'سجلات طلبات HTTP (بوابة SMS)' : 'HTTP Gateway Requests (SMS Logs)'}
                  </h3>
                  <Link href="/admin/sms" className="text-[10px] text-emerald-400 font-bold hover:underline flex items-center gap-0.5">
                    <span>{language === 'ar' ? 'عرض الكل' : 'View All'}</span>
                    <ArrowRight className="w-3 h-3 rtl-flip" />
                  </Link>
                </div>
                
                <div className="mt-4 space-y-3">
                  {isLogsLoading ? (
                    <div className="space-y-2 py-4">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-12 bg-slate-900/60 rounded-xl animate-pulse" />
                      ))}
                    </div>
                  ) : !smsLogs || smsLogs.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-500">
                      {language === 'ar' ? 'لا توجد سجلات حالياً' : 'No logs available'}
                    </div>
                  ) : (
                    smsLogs.map((log: any) => (
                      <div key={log.id} className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">{log.sender}</span>
                            {getLogStatusBadge(log.status)}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-1.5" title={log.message}>
                            {log.message}
                          </p>
                          {log.error_message && (
                            <p className="text-[10px] text-red-400 mt-1 font-mono">
                              Error: {log.error_message}
                            </p>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 whitespace-nowrap text-right self-start mt-1">
                          {new Date(log.received_at || log.created_at).toLocaleTimeString(
                            language === 'ar' ? 'ar-EG' : 'en-US',
                            { hour: '2-digit', minute: '2-digit' }
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right: Verification Status Metrics */}
            <div className="lg:col-span-5 glass-panel p-5 rounded-2xl border border-slate-900 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-teal-400" />
                {language === 'ar' ? 'تحليل حالات التحقق' : 'Verification Status Metrics'}
              </h3>

              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboardData.verificationTypes} barSize={35}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={9} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={9} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff', fontSize: '10px' }}
                    />
                    <Bar dataKey="count" fill="#06b6d4" radius={[6, 6, 0, 0]}>
                      {dashboardData.verificationTypes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
