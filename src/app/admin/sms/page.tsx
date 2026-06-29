'use client';

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IncomingTransaction, SMSLog } from '@/types';
import { 
  Smartphone, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  History,
  Link as LinkIcon,
  HelpCircle,
  TrendingUp,
  Loader2,
  Copy,
  Check
} from 'lucide-react';

export default function AdminSMSMonitorPage() {
  const { language, dir, t } = useLanguage();
  const queryClient = useQueryClient();

  // State
  const [selectedTx, setSelectedTx] = useState<IncomingTransaction | null>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkSearchTerm, setLinkSearchTerm] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copiedType, setCopiedType] = useState<string | null>(null);
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

      // Fetch actual local IPs from Next.js server
      fetch('/api/system-info')
        .then(res => res.json())
        .then(data => {
          if (data.localIps && data.localIps.length > 0) {
            setLocalIps(data.localIps);
            const primaryIp = data.localIps[0];
            setSelectedIp(primaryIp);
            
            // Auto replace localhost/127.0.0.1 with the primary local IP (which is physical first)
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
              const port = window.location.port ? `:${window.location.port}` : '';
              setWebhookUrl(`http://${primaryIp}${port}/api/sms`);
            }
          }
        })
        .catch(err => console.error('Failed to fetch system info:', err));
    }
  }, []);

  // Update Webhook URL when selected IP changes
  const handleIpChange = (ip: string) => {
    setSelectedIp(ip);
    if (typeof window !== 'undefined') {
      const port = window.location.port ? `:${window.location.port}` : '';
      setWebhookUrl(`http://${ip}${port}/api/sms`);
    }
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  // 1. Fetch Incoming Transactions
  const { data: incomingTxs, isLoading: isTxsLoading, error: txsError } = useQuery<IncomingTransaction[]>({
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
        .order('received_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // 2. Fetch SMS Logs
  const { data: smsLogs, isLoading: isLogsLoading } = useQuery<SMSLog[]>({
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
  });

  // 3. Fetch candidate pending donations to link
  const { data: pendingCandidates } = useQuery<any[]>({
    queryKey: ['pendingCandidates', selectedTx?.amount],
    enabled: !!selectedTx,
    queryFn: async () => {
      if (!selectedTx) return [];
      const { data, error } = await supabase
        .from('donations')
        .select(`
          id,
          amount,
          payment_method,
          created_at,
          donor:donors (
            name,
            phone
          )
        `)
        .eq('status', 'pending')
        .eq('amount', selectedTx.amount)
        .eq('payment_method', selectedTx.payment_method);
      
      if (error) throw error;
      return data || [];
    },
  });

  // 4. Supabase Realtime Listener Setup
  useEffect(() => {
    const channel = supabase
      .channel('sms_monitor_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incoming_transactions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['incomingTransactions'] });
        queryClient.invalidateQueries({ queryKey: ['adminDashboardStats'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['smsLogs'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 5. Perform Manual Link Action
  const handleLinkDonation = async (donationId: string) => {
    if (!selectedTx) return;
    setIsLinking(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // 1. Update Donation status to manual_verified
      const { error: donationError } = await supabase
        .from('donations')
        .update({
          status: 'manual_verified',
          verification_method: 'manual',
          verified_at: new Date().toISOString(),
          matched_transaction_id: selectedTx.id,
        })
        .eq('id', donationId);

      if (donationError) throw donationError;

      // 2. Update Incoming Transaction status to manual_match
      const { error: txError } = await supabase
        .from('incoming_transactions')
        .update({
          status: 'manual_match',
          matched_donation_id: donationId,
          matching_confidence: 100,
        })
        .eq('id', selectedTx.id);

      if (txError) throw txError;

      // 3. Create Audit Log entry
      await supabase.from('audit_logs').insert({
        admin_id: session?.user?.id || null,
        action: 'MANUAL_LINK_SMS_DONATION',
        target_table: 'incoming_transactions',
        target_id: selectedTx.id,
        details: { donation_id: donationId },
      });

      // Refetch queries
      queryClient.invalidateQueries({ queryKey: ['incomingTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['smsLogs'] });
      
      setIsLinkModalOpen(false);
      setSelectedTx(null);
    } catch (err: any) {
      console.error('Linking error:', err);
      alert(`Linking failed: ${err.message}`);
    } finally {
      setIsLinking(false);
    }
  };

  const getTxStatusBadge = (tx: IncomingTransaction) => {
    switch (tx.status) {
      case 'matched':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 border border-emerald-900 text-emerald-400 flex items-center gap-1 w-fit">
            <CheckCircle className="w-3 h-3" />
            <span>{language === 'ar' ? 'مطابق تلقائياً' : 'Auto Matched'}</span>
          </span>
        );
      case 'manual_match':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-950 border border-teal-900 text-teal-300 flex items-center gap-1 w-fit">
            <CheckCircle className="w-3 h-3" />
            <span>{language === 'ar' ? 'مطابق يدوياً' : 'Manual Matched'}</span>
          </span>
        );
      case 'unmatched':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-905 border border-slate-900 text-slate-350 flex items-center gap-1 w-fit">
            <HelpCircle className="w-3 h-3 text-emerald-400" />
            <span>{language === 'ar' ? 'غير مطابق' : 'Unmatched'}</span>
          </span>
        );
    }
  };

  const getLogStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-450 border border-emerald-900/40">Success</span>;
      case 'duplicate':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-slate-400 border border-slate-800">Duplicate</span>;
      case 'failed_parsing':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950/30 text-red-400 border border-red-900/30">Failed Parsing</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">{status}</span>;
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        
        {/* Title */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-white">{t('db_sms')}</h1>
            <p className="text-slate-400 text-xs mt-1">
              {language === 'ar' ? 'مراقبة الرسائل الواردة من الهاتف المخصص في الوقت الفعلي والتحقق من حالات معالجتها.' : 'Monitor incoming SMS notifications from gateway in real-time.'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 glow-green" />
            <span>{language === 'ar' ? 'بث مباشر نشط' : 'STREAMING LIVE'}</span>
          </div>
        </div>

        {/* Gateway Webhook Details Card */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-900 space-y-4 bg-slate-950/20">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white">
                {language === 'ar' ? 'رابط استقبال رسائل بوابة الأندرويد (Gateway Webhook)' : 'Android Gateway Webhook URL'}
              </h3>
              <p className="text-slate-500 text-[11px] mt-0.5">
                {language === 'ar' 
                  ? 'استخدم هذا الرابط لتكوين تطبيق إرسال الرسائل (مثل Tasker أو MacroDroid) على هاتف المحفظة. يتغير الرابط ديناميكياً إذا تم تغيير عنوان السيرفر.'
                  : 'Configure your SMS gateway application (like Tasker or MacroDroid) on the wallet device to POST to this URL.'}
              </p>
            </div>
          </div>
          
          {isLocalhost && (
            <div className="p-4 bg-yellow-950/20 border border-yellow-900/30 text-yellow-300 text-xs rounded-xl flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  {language === 'ar' 
                    ? 'ربط الموبايل والسيرفر المحلي (WiFi Connection):' 
                    : 'Local WiFi Connection Details:'}
                </p>
                <p className="mt-1 leading-relaxed text-slate-350">
                  {language === 'ar'
                    ? `لقد تم استكشاف عناوين الـ IP المحلية لجهازك. قمنا باختيار الـ IP المفضل لشبكة الـ Wi-Fi تلقائياً وهو (${selectedIp || 'جاري التحميل...'}). تأكد من اتصال هاتفك والكمبيوتر بنفس شبكة الـ Wi-Fi.`
                    : `We automatically detected your local network IP and selected the physical Wi-Fi IP: (${selectedIp || 'Loading...'}). Ensure both your phone and PC are connected to the same Wi-Fi network.`}
                </p>
                {localIps.length > 1 && (
                  <div className="mt-3 p-2 bg-slate-950/40 rounded-lg border border-slate-900 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {language === 'ar' ? 'تبديل الشبكة النشطة:' : 'Switch Active Network IP:'}
                    </span>
                    {localIps.map(ip => (
                      <button
                        key={ip}
                        type="button"
                        onClick={() => handleIpChange(ip)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                          selectedIp === ip
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {ip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 bg-slate-950/60 border border-slate-900 px-4 py-3 rounded-xl flex items-center justify-between gap-4">
              <code className="text-xs text-emerald-350 select-all font-mono break-all">
                {webhookUrl || 'Loading URL...'}
              </code>
              {webhookUrl && (
                <button 
                  onClick={() => handleCopy(webhookUrl, 'webhook')}
                  className="text-slate-400 hover:text-emerald-400 transition-colors flex-shrink-0"
                  title="Copy Webhook URL"
                >
                  {copiedType === 'webhook' ? <Check className="w-4 h-4 text-emerald-450" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>
            
            <div className="bg-slate-950/60 border border-slate-900 px-4 py-3 rounded-xl flex items-center justify-between md:w-80 gap-4">
              <span className="text-[11px] text-slate-500 font-semibold uppercase font-sans">Header: <code className="text-slate-350 font-mono text-xs">x-api-key</code></span>
              <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-2.5 py-1 rounded font-bold font-sans">
                {language === 'ar' ? 'معد من ملف البيئة' : 'CONFIGURED IN ENV'}
              </span>
            </div>
          </div>
        </div>

        {txsError && (
          <div className="p-4 bg-red-950/20 border border-red-900/20 text-red-300 text-xs rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>Error loading transactions: {txsError instanceof Error ? txsError.message : JSON.stringify(txsError)}</span>
          </div>
        )}

        {/* TWO COLUMN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT: INCOMING TRANSACTIONS STREAM */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-400" />
                {t('db_recent_sms')}
              </h3>
            </div>

            <div className="space-y-3">
              {isTxsLoading ? (
                <div className="text-center py-10">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
                </div>
              ) : !incomingTxs || incomingTxs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 bg-slate-900/20 border border-slate-900 rounded-2xl">
                  {language === 'ar' ? 'لم يتم استلام أي دفعات بعد.' : 'No transactions received yet.'}
                </div>
              ) : (
                incomingTxs.map((tx) => (
                  <div key={tx.id} className="glass-panel p-5 rounded-2xl border border-slate-900 space-y-3">
                    
                    {/* Top Row: Meta details */}
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2.5 py-0.5 rounded-md bg-slate-950 font-bold text-emerald-300">
                          {tx.amount} EGP
                        </span>
                        <span className="text-slate-500">•</span>
                        <span className="text-slate-450 uppercase font-semibold flex items-center gap-1.5">
                          <img 
                            src={tx.payment_method === 'vodafone_cash' ? '/vf_Logo.png' : '/InstaPay_Logo.png'} 
                            alt={tx.payment_method} 
                            className="w-4 h-4 object-contain rounded bg-white p-0.5" 
                          />
                          <span>{tx.payment_method === 'vodafone_cash' ? (language === 'ar' ? 'فودافون كاش' : 'Vodafone Cash') : 'InstaPay'}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {getTxStatusBadge(tx)}
                        <span className="text-slate-500 text-[10px]" dir="ltr">
                          {new Date(tx.received_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: Raw SMS */}
                    <p className="p-3 bg-slate-950 border border-slate-900 rounded-xl font-mono text-[11px] leading-relaxed text-slate-300">
                      {tx.raw_sms}
                    </p>

                    {/* Bottom Row: Match Results */}
                    <div className="flex justify-between items-center text-xs pt-1">
                      <div>
                        {tx.status !== 'unmatched' && tx.matched_donation ? (
                          <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-450" />
                            {language === 'ar' 
                              ? `مرتبط بالتبرع المقدم من: ${tx.matched_donation.donor?.name || 'فاعل خير'}`
                              : `Linked to donation from: ${tx.matched_donation.donor?.name || 'Anonymous'}`
                            }
                          </span>
                        ) : (
                          <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                            {language === 'ar' ? 'بانتظار المطابقة والربط يدوياً' : 'Awaiting manual match linking'}
                          </span>
                        )}
                      </div>

                      {tx.status === 'unmatched' && (
                        <button
                          onClick={() => {
                            setSelectedTx(tx);
                            setIsLinkModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-emerald-400 font-extrabold text-[10px] transition-colors flex items-center gap-1"
                        >
                          <LinkIcon className="w-3 h-3" />
                          <span>{language === 'ar' ? 'اربط التبرع' : 'Link Donation'}</span>
                        </button>
                      )}
                    </div>

                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT: SMS PARSING HISTORY / AUDIT LOG */}
          <div className="lg:col-span-4 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-teal-400" />
              {language === 'ar' ? 'سجل معالجة الرسائل' : 'Gateway Parsing Logs'}
            </h3>

            <div className="glass-panel rounded-2xl border border-slate-900 overflow-hidden divide-y divide-slate-900">
              {isLogsLoading ? (
                <div className="text-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-400" />
                </div>
              ) : !smsLogs || smsLogs.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  {language === 'ar' ? 'سجل المعالجة فارغ.' : 'Parsing history is empty.'}
                </div>
              ) : (
                smsLogs.map((log) => (
                  <div key={log.id} className="p-4 space-y-2 text-xs hover:bg-slate-900/10 transition-colors">
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-white text-[11px]">{log.sender}</span>
                      {getLogStatusBadge(log.status)}
                    </div>
                    <p className="text-slate-400 font-mono text-[10px] leading-relaxed truncate">{log.message}</p>
                    {log.error_message && (
                      <span className="text-red-400 text-[9px] block bg-red-950/20 p-1.5 rounded border border-red-900/20">
                        {log.error_message}
                      </span>
                    )}
                    <span className="text-[9px] text-slate-500 block text-right" dir="ltr">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* LINK TRANSACTIONS MODAL */}
        {isLinkModalOpen && selectedTx && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-xl glass-panel rounded-3xl p-6 md:p-8 space-y-6 max-h-[85vh] overflow-y-auto" dir={dir}>
              
              {/* Modal Header */}
              <div className="flex justify-between items-start border-b border-slate-900 pb-4">
                <div>
                  <h3 className="text-lg font-black text-white">{language === 'ar' ? 'ربط التبرع بـ SMS المستلم' : 'Link SMS to Donation Request'}</h3>
                  <p className="text-xs text-slate-550 mt-1">{language === 'ar' ? 'اختر طلباً تبرعاً معلقاً للمطابقة.' : 'Select a pending donation request to link.'}</p>
                </div>
                <button 
                  onClick={() => {
                    setIsLinkModalOpen(false);
                    setSelectedTx(null);
                  }}
                  className="p-1 rounded bg-slate-900 hover:bg-slate-850 text-slate-400"
                >
                  <XCircle className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* Transaction details card */}
              <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-2 text-xs">
                <span className="text-slate-500 block uppercase font-bold">{language === 'ar' ? 'تفاصيل الرسالة المحددة:' : 'Selected Message Details:'}</span>
                <div className="flex justify-between items-center font-bold text-white">
                  <span className="flex items-center gap-1.5">
                    <span>{selectedTx.amount} EGP</span>
                    <span className="text-slate-500">•</span>
                    <img 
                      src={selectedTx.payment_method === 'vodafone_cash' ? '/vf_Logo.png' : '/InstaPay_Logo.png'} 
                      alt={selectedTx.payment_method} 
                      className="w-4 h-4 object-contain rounded bg-white p-0.5" 
                    />
                    <span className="text-slate-350">{selectedTx.payment_method === 'vodafone_cash' ? (language === 'ar' ? 'فودافون كاش' : 'Vodafone Cash') : 'InstaPay'}</span>
                  </span>
                  <span dir="ltr">{new Date(selectedTx.received_at).toLocaleTimeString()}</span>
                </div>
                <p className="p-3 bg-slate-900 border border-slate-850 rounded-xl font-mono text-[10px] text-slate-350 leading-relaxed">
                  {selectedTx.raw_sms}
                </p>
              </div>

              {/* Candidate pending list */}
              <div className="space-y-3">
                <span className="text-xs text-slate-400 font-bold block">{language === 'ar' ? 'تبرعات معلقة بنفس القيمة مرشحة للمطابقة:' : 'Pending Donation Candidates:'}</span>
                
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {pendingCandidates && pendingCandidates.length > 0 ? (
                    pendingCandidates.map((candidate) => (
                      <div key={candidate.id} className="p-4 bg-slate-950 border border-slate-900 hover:border-emerald-500/20 rounded-2xl flex items-center justify-between gap-4 text-xs hover:bg-slate-900/20 transition-all">
                        <div className="space-y-1">
                          <span className="font-extrabold text-white text-sm"><bdi>{candidate.donor?.name}</bdi></span>
                          <span className="text-slate-500 block font-mono" dir="ltr">{candidate.donor?.phone}</span>
                          <span className="text-[10px] text-slate-500 block">
                            {language === 'ar' ? 'سجل في: ' : 'Submitted: '}{new Date(candidate.created_at).toLocaleString()}
                          </span>
                        </div>
                        <button
                          onClick={() => handleLinkDonation(candidate.id)}
                          disabled={isLinking}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs transition-colors flex items-center gap-1"
                        >
                          {isLinking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
                          <span>{language === 'ar' ? 'ربط' : 'Link'}</span>
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-slate-500 text-center py-6 bg-slate-950/20 border border-slate-900 rounded-2xl">
                      {language === 'ar' ? 'لا توجد طلبات تبرع معلقة بنفس القيمة.' : 'No pending donation requests match this amount.'}
                    </p>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
