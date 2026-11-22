'use client';

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IncomingTransaction, SMSLog } from '@/types';
import { 
  Smartphone, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  History,
  Link as LinkIcon,
  HelpCircle,
  TrendingUp,
  Loader2,
  Copy,
  Check,
  Search,
  ExternalLink
} from 'lucide-react';

export default function AdminSMSMonitorPage() {
  const { language, dir, t } = useLanguage();
  const queryClient = useQueryClient();

  const [webhookUrl, setWebhookUrl] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [localIps, setLocalIps] = useState<string[]>([]);
  const [selectedIp, setSelectedIp] = useState('');
  const [isLocalhost, setIsLocalhost] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      setWebhookUrl(`${origin}/api/sms`);
      
      const hostname = window.location.hostname;
      const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.');
      setIsLocalhost(isLocal);

      fetch('/api/system-info')
        .then(res => res.json())
        .then(data => {
          if (data.localIps && data.localIps.length > 0) {
            setLocalIps(data.localIps);
            const primaryIp = data.localIps[0];
            setSelectedIp(primaryIp);
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
              const port = window.location.port ? `:${window.location.port}` : '';
              setWebhookUrl(`http://${primaryIp}${port}/api/sms`);
            }
          }
        })
        .catch(err => console.error('Failed to fetch system info:', err));
    }
  }, []);

  const handleIpChange = (ip: string) => {
    setSelectedIp(ip);
    if (typeof window !== 'undefined') {
      const port = window.location.port ? `:${window.location.port}` : '';
      setWebhookUrl(`http://${ip}${port}/api/sms`);
    }
  };

  const handleCopy = (text: string, key: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  };

  // 1. Fetch Incoming Transactions
  const { data: incomingTxs = [], isLoading: isTxsLoading } = useQuery<IncomingTransaction[]>({
    queryKey: ['incomingTransactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incoming_transactions')
        .select(`
          *,
          matched_donation:donations!incoming_transactions_matched_donation_id_fkey (
            id,
            amount,
            donor:donors (
              name
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 10000,
  });

  // 2. Fetch SMS Logs
  const { data: smsLogs = [], isLoading: isLogsLoading } = useQuery<SMSLog[]>({
    queryKey: ['smsLogs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sms_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 10000,
  });

  return (
    <AdminLayout>
      <div className="space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#EAE8DE] dark:border-[#283849]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#153C32] dark:text-[#F3F5F4] tracking-tight">
              {language === 'ar' ? 'مراقبة بوابة الرسائل (SMS Gateway)' : 'SMS Gateway Monitor'}
            </h1>
            <p className="text-xs sm:text-sm text-[#738079] dark:text-[#A7B4B0] mt-1">
              {language === 'ar'
                ? 'متابعة تدفق رسائل التحويل الواردة من تطبيق الأندرويد، وفحص المطابقة الآلية.'
                : 'Monitor incoming payment SMS alerts from Android devices and inspect automated matching.'}
            </p>
          </div>
        </div>

        {/* Webhook Endpoint Configuration Box */}
        <div className="p-6 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-[#153C32] dark:text-[#24B58A]" />
            <h3 className="font-extrabold text-base text-[#153C32] dark:text-[#F3F5F4]">
              {language === 'ar' ? 'عنوان Webhook الخاص بتطبيق الأندرويد' : 'Android Webhook Endpoint'}
            </h3>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex-1 p-3 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] font-mono text-xs sm:text-sm text-[#191F1C] dark:text-[#F3F5F4] break-all select-all" dir="ltr">
              {webhookUrl}
            </div>
            <button
              type="button"
              onClick={() => handleCopy(webhookUrl, 'wh')}
              className="px-4 py-3 rounded-xl bg-[#153C32] dark:bg-[#217A61] text-white text-xs font-bold hover:bg-[#1C4E41] dark:hover:bg-[#24B58A] flex items-center justify-center gap-2 transition-colors"
            >
              {copiedKey === 'wh' ? (
                <>
                  <Check className="w-4 h-4 text-[#217A61] dark:text-[#F3F5F4]" />
                  <span>{t('copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>{t('copy')}</span>
                </>
              )}
            </button>
          </div>

          {/* Local IP Selector for local testing */}
          {localIps.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-[#738079] dark:text-[#A7B4B0] pt-1">
              <span>{language === 'ar' ? 'تغيير عنوان IP المحلي للهاتف:' : 'Select Local IP for Device:'}</span>
              <select
                value={selectedIp}
                onChange={e => handleIpChange(e.target.value)}
                className="py-1 px-2 rounded-lg bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] font-mono text-xs text-[#191F1C] dark:text-[#F3F5F4]"
              >
                {localIps.map(ip => (
                  <option key={ip} value={ip}>{ip}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 1. INCOMING TRANSACTIONS TABLE */}
        <div className="space-y-4">
          <h3 className="font-extrabold text-lg text-[#153C32] dark:text-[#F3F5F4]">
            {language === 'ar' ? 'المعاملات البنكية الملتقطة (Incoming Transactions)' : 'Captured Transactions'}
          </h3>

          <div className="bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] rounded-3xl overflow-hidden shadow-subtle">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-[#EAE8DE] dark:border-[#283849] bg-[#FAF9F5] dark:bg-[#111C2D] text-[#738079] dark:text-[#A7B4B0] font-bold">
                    <th className="py-3 px-4 text-start">{language === 'ar' ? 'وسيلة التحويل' : 'Method'}</th>
                    <th className="py-3 px-4 text-start">{language === 'ar' ? 'المبلغ' : 'Amount'}</th>
                    <th className="py-3 px-4 text-start">{language === 'ar' ? 'بيانات الراسل' : 'Sender'}</th>
                    <th className="py-3 px-4 text-start">{language === 'ar' ? 'الرقم المرجعي' : 'Ref#'}</th>
                    <th className="py-3 px-4 text-start">{language === 'ar' ? 'حالة المطابقة' : 'Match Status'}</th>
                    <th className="py-3 px-4 text-start">{language === 'ar' ? 'وقت الوصول' : 'Received At'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE8DE] dark:divide-[#283849]">
                  {isTxsLoading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#738079] dark:text-[#A7B4B0]">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[#153C32] dark:text-[#24B58A]" />
                        <span>{t('loading')}</span>
                      </td>
                    </tr>
                  ) : incomingTxs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#738079] dark:text-[#A7B4B0]">
                        {language === 'ar' ? 'لم يتم استلام أي معاملات حتى الآن' : 'No transactions captured yet'}
                      </td>
                    </tr>
                  ) : (
                    incomingTxs.map(tx => (
                      <tr key={tx.id} className="hover:bg-[#FAF9F5] dark:hover:bg-[#111C2D]/50 transition-colors">
                        <td className="py-3 px-4 font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                          {tx.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'InstaPay'}
                        </td>
                        <td className="py-3 px-4 font-black text-[#153C32] dark:text-[#24B58A]">
                          {Number(tx.amount).toLocaleString('en-US')} {t('egp')}
                        </td>
                        <td className="py-3 px-4 text-[#3D4742] dark:text-[#E2E8F0]">
                          <div>{tx.sender_name || '—'}</div>
                          <div className="text-xs text-[#738079] dark:text-[#A7B4B0] font-mono" dir="ltr">{tx.sender_phone || ''}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-[#55625B] dark:text-[#CBD5E1]">
                          {tx.transaction_ref || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                            tx.status === 'matched' || tx.status === 'manual_match'
                              ? 'bg-[#F0F9F6] text-[#217A61] dark:bg-[#217A61]/20 dark:text-[#24B58A]'
                              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                          }`}>
                            {tx.status === 'matched' ? 'مطابق آليًا' :
                             tx.status === 'manual_match' ? 'مطابق يدويًا' : 'غير مطابق'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-[#738079] dark:text-[#A7B4B0]">
                          {new Date(tx.received_at).toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 2. SMS RAW LOGS */}
        <div className="space-y-4">
          <h3 className="font-extrabold text-lg text-[#153C32] dark:text-[#F3F5F4]">
            {language === 'ar' ? 'سجل رسائل الـ SMS الخام (Raw SMS Logs)' : 'Raw SMS Logs'}
          </h3>

          <div className="bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] rounded-3xl p-5 shadow-subtle divide-y divide-[#EAE8DE] dark:divide-[#283849]">
            {smsLogs.length === 0 ? (
              <p className="text-xs text-[#738079] dark:text-[#A7B4B0] text-center py-4">
                {language === 'ar' ? 'لا توجد سجلات رسائل نصية.' : 'No SMS logs recorded.'}
              </p>
            ) : (
              smsLogs.map(log => (
                <div key={log.id} className="py-3 first:pt-0 last:pb-0 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#153C32] dark:text-[#24B58A]">{log.sender}</span>
                    <span className="text-[#738079] dark:text-[#A7B4B0] text-[11px]">
                      {new Date(log.received_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-[#3D4742] dark:text-[#CBD5E1] leading-relaxed font-mono text-[11px] bg-[#FAF9F5] dark:bg-[#111C2D] p-2 rounded-lg border border-[#EAE8DE] dark:border-[#283849]" dir="ltr">
                    {log.message}
                  </p>
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      log.status === 'success' ? 'bg-green-100 text-green-800 dark:bg-emerald-950/40 dark:text-emerald-300' :
                      log.status === 'duplicate' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                    }`}>
                      {log.status}
                    </span>
                    {log.error_message && (
                      <span className="text-[10px] text-red-600 dark:text-red-400">{log.error_message}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
