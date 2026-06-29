'use client';

import React, { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Donation, DonationStatus, PaymentMethod } from '@/types';
import { 
  Search, 
  Filter, 
  Check, 
  X, 
  Eye, 
  Edit3, 
  Smartphone, 
  CreditCard,
  CheckCircle,
  HelpCircle,
  FileImage,
  AlertCircle,
  Loader2
} from 'lucide-react';

export default function AdminDonationsPage() {
  const { language, dir, t } = useLanguage();
  const queryClient = useQueryClient();

  // Realtime subscription for instant table updates
  React.useEffect(() => {
    const channel = supabase
      .channel('admin_donations_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['adminDonations'] });
        queryClient.invalidateQueries({ queryKey: ['unmatchedTxs'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  // Modals state
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // 1. Fetch Donations
  const { data: donations, isLoading, error: donationsError } = useQuery<Donation[]>({
    queryKey: ['adminDonations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donations')
        .select(`
          *,
          donor:donors (
            name,
            phone
          ),
          matched_transaction:incoming_transactions!fk_matched_transaction (
            id,
            raw_sms,
            sender_name,
            sender_phone,
            transaction_ref,
            received_at
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // 2. Fetch Unmatched Transactions (to list as candidates for linking in modal)
  const { data: unmatchedTxs, error: unmatchedTxsError } = useQuery<any[]>({
    queryKey: ['unmatchedTxs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incoming_transactions')
        .select('*')
        .eq('status', 'unmatched')
        .order('received_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data || [];
    },
  });

  // 3. Update Status Handler (Manual Verification)
  const handleVerifyDonation = async (
    donationId: string, 
    status: 'manual_verified' | 'rejected', 
    matchedTxId?: string
  ) => {
    setIsActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Update Donation
      const { error: donationError } = await supabase
        .from('donations')
        .update({
          status: status,
          verification_method: 'manual',
          verified_at: new Date().toISOString(),
          matched_transaction_id: matchedTxId || null,
        })
        .eq('id', donationId);

      if (donationError) throw donationError;

      // If matched to a transaction, update incoming transaction status
      if (matchedTxId) {
        const { error: txError } = await supabase
          .from('incoming_transactions')
          .update({
            status: 'manual_match',
            matched_donation_id: donationId,
            matching_confidence: 100,
          })
          .eq('id', matchedTxId);
        
        if (txError) throw txError;
      }

      // Add to Audit Logs
      await supabase.from('audit_logs').insert({
        admin_id: session?.user?.id || null,
        action: `MANUAL_VERIFY_${status.toUpperCase()}`,
        target_table: 'donations',
        target_id: donationId,
        details: { matched_transaction_id: matchedTxId || null },
      });

      // Refetch
      queryClient.invalidateQueries({ queryKey: ['adminDonations'] });
      queryClient.invalidateQueries({ queryKey: ['unmatchedTxs'] });
      queryClient.invalidateQueries({ queryKey: ['adminDashboardStats'] });
      
      setIsDetailOpen(false);
      setSelectedDonation(null);
    } catch (err: any) {
      console.error('Error verifying donation:', err);
      alert(`Action failed: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Filter Logic
  const filteredDonations = (donations || []).filter((d) => {
    const donorName = d.donor?.name?.toLowerCase() || '';
    const donorPhone = d.donor?.phone || '';
    const txRef = d.transaction_ref?.toLowerCase() || '';
    const cleanSearch = searchTerm.toLowerCase();

    const matchesSearch = donorName.includes(cleanSearch) || 
                          donorPhone.includes(cleanSearch) || 
                          txRef.includes(cleanSearch);

    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    const matchesMethod = methodFilter === 'all' || d.payment_method === methodFilter;

    return matchesSearch && matchesStatus && matchesMethod;
  });

  const getStatusBadge = (status: DonationStatus) => {
    switch (status) {
      case 'auto_verified':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950 border border-emerald-900 text-emerald-400 flex items-center gap-1 w-fit">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'موثق تلقائياً' : 'Auto Verified'}</span>
          </span>
        );
      case 'manual_verified':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-teal-950 border border-teal-900 text-teal-300 flex items-center gap-1 w-fit">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'موثق يدوياً' : 'Manual Verified'}</span>
          </span>
        );
      case 'pending':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-905 border border-slate-900 text-slate-350 flex items-center gap-1 w-fit">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-450" />
            <span>{language === 'ar' ? 'قيد التحقق' : 'Pending'}</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-950/40 border border-red-900/40 text-red-300 flex items-center gap-1 w-fit">
            <X className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'مرفوض' : 'Rejected'}</span>
          </span>
        );
      case 'refunded':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-950/40 border border-yellow-900/40 text-yellow-300 flex items-center gap-1 w-fit">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'مسترجع' : 'Refunded'}</span>
          </span>
        );
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        
        {/* Title */}
        <div>
          <h1 className="text-2xl font-black text-white">{t('db_donations')}</h1>
          <p className="text-slate-400 text-xs mt-1">
            {language === 'ar' ? 'تصفح وإدارة تبرعات الحملة، تأكيد الدفعات ومطابقتها يدوياً.' : 'Browse and manage donation requests, perform manual verification.'}
          </p>
        </div>

        {donationsError && (
          <div className="p-4 bg-red-950/20 border border-red-900/20 text-red-300 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>Error loading donations: {donationsError instanceof Error ? donationsError.message : JSON.stringify(donationsError)}</span>
          </div>
        )}

        {/* SEARCH & FILTERS BAR */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-900 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-xs"
              placeholder={language === 'ar' ? 'بحث باسم المتبرع، الهاتف، المعاملة...' : 'Search name, phone, ref...'}
            />
          </div>

          <div className="flex w-full md:w-auto items-center gap-3">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 w-full md:w-auto">
              <Filter className="w-4 h-4 text-slate-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="glass-input px-3 py-2.5 rounded-xl text-xs w-full md:w-auto cursor-pointer"
              >
                <option value="all">{language === 'ar' ? 'كل الحالات' : 'All Statuses'}</option>
                <option value="pending">{language === 'ar' ? 'قيد التحقق' : 'Pending'}</option>
                <option value="auto_verified">{language === 'ar' ? 'موثق تلقائي' : 'Auto Verified'}</option>
                <option value="manual_verified">{language === 'ar' ? 'موثق يدوي' : 'Manual Verified'}</option>
                <option value="rejected">{language === 'ar' ? 'مرفوض' : 'Rejected'}</option>
              </select>
            </div>

            {/* Method Filter */}
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="glass-input px-3 py-2.5 rounded-xl text-xs w-full md:w-auto cursor-pointer"
            >
              <option value="all">{language === 'ar' ? 'كل القنوات' : 'All Methods'}</option>
              <option value="vodafone_cash">{language === 'ar' ? 'فودافون كاش' : 'Vodafone Cash'}</option>
              <option value="instapay">{language === 'ar' ? 'إنستاباي' : 'InstaPay'}</option>
            </select>
          </div>
        </div>

        {/* DONATIONS TABLE LIST */}
        <div className="glass-panel rounded-2xl border border-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            {/* Desktop Table View */}
            <table className="w-full text-start border-collapse hidden md:table">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-900/30 text-slate-400 text-xs font-bold">
                  <th className="px-6 py-4 text-start">{language === 'ar' ? 'المتبرع' : 'Donor'}</th>
                  <th className="px-6 py-4 text-start">{language === 'ar' ? 'المبلغ' : 'Amount'}</th>
                  <th className="px-6 py-4 text-start">{language === 'ar' ? 'طريقة الدفع' : 'Method'}</th>
                  <th className="px-6 py-4 text-start">{language === 'ar' ? 'رقم العملية' : 'Transaction Ref'}</th>
                  <th className="px-6 py-4 text-start">{language === 'ar' ? 'التحقق' : 'Verification'}</th>
                  <th className="px-6 py-4 text-start">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-6 py-4 text-start">{language === 'ar' ? 'التاريخ' : 'Date'}</th>
                  <th className="px-6 py-4 text-center">{language === 'ar' ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-400" />
                    </td>
                  </tr>
                ) : filteredDonations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-500">
                      {language === 'ar' ? 'لا توجد تبرعات مطابقة للبحث' : 'No matching donations found'}
                    </td>
                  </tr>
                ) : (
                  filteredDonations.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-900/10 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">{d.donor?.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{d.donor?.phone}</div>
                      </td>
                      <td className="px-6 py-4 font-bold text-white">
                        {d.amount} <span className="text-xs text-emerald-400 font-bold">{t('egp')}</span>
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-300">
                        {d.payment_method === 'vodafone_cash' ? (
                          <span className="flex items-center gap-1.5 text-red-500 font-bold">
                            <img src="/vf_Logo.png" alt="Vodafone Cash" className="w-5 h-5 object-contain rounded-full bg-white p-0.5" />
                            <span>{language === 'ar' ? 'فودافون كاش' : 'Vodafone Cash'}</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-violet-400 font-bold">
                            <img src="/InstaPay_Logo.png" alt="InstaPay" className="w-5 h-5 object-contain rounded bg-white p-0.5" />
                            <span>InstaPay</span>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-300">
                        {d.transaction_ref || <span className="text-slate-650">—</span>}
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-400 capitalize">
                        {d.verification_method ? (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-emerald-350">
                            {d.verification_method}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(d.status)}</td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {new Date(d.created_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedDonation(d);
                            setIsDetailOpen(true);
                          }}
                          className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-white transition-colors"
                        >
                          <Eye className="w-4 h-4 text-slate-450" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Mobile Card Feed Layout */}
            <div className="block md:hidden divide-y divide-slate-900 bg-slate-950/20">
              {isLoading ? (
                <div className="text-center py-8 text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-400" />
                </div>
              ) : filteredDonations.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  {language === 'ar' ? 'لا توجد تبرعات مطابقة للبحث' : 'No matching donations found'}
                </div>
              ) : (
                filteredDonations.map((d) => (
                  <div key={d.id} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-white text-sm">{d.donor?.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{d.donor?.phone}</div>
                      </div>
                      <div>{getStatusBadge(d.status)}</div>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-semibold">{language === 'ar' ? 'المبلغ' : 'Amount'}:</span>
                      <span className="font-bold text-white">
                        {d.amount} <span className="text-emerald-400">{t('egp')}</span>
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-semibold">{language === 'ar' ? 'طريقة التحويل' : 'Method'}:</span>
                      <span>
                        {d.payment_method === 'vodafone_cash' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-red-500 font-bold bg-red-950/20 px-2.5 py-1 rounded-full border border-red-900/10">
                            <img src="/vf_Logo.png" alt="Vodafone Cash" className="w-3.5 h-3.5 object-contain rounded-full bg-white p-0.5" />
                            <span>فودافون كاش</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-violet-400 font-bold bg-violet-950/20 px-2.5 py-1 rounded-full border border-violet-900/10">
                            <img src="/InstaPay_Logo.png" alt="InstaPay" className="w-3.5 h-3.5 object-contain rounded bg-white p-0.5" />
                            <span>إنستاباي</span>
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-semibold">{language === 'ar' ? 'رقم العملية' : 'Ref#'}:</span>
                      <span className="font-mono text-slate-350">{d.transaction_ref || '—'}</span>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-semibold">{language === 'ar' ? 'التاريخ' : 'Date'}:</span>
                      <span className="text-slate-450">{new Date(d.created_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}</span>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-900/40">
                      <span className="text-[10px] text-slate-500 uppercase">
                        {d.verification_method ? `Verified via ${d.verification_method}` : 'Not verified'}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedDonation(d);
                          setIsDetailOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-semibold text-emerald-400 flex items-center gap-1 hover:text-white transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'عرض التفاصيل' : 'View Details'}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* DETAIL & VERIFICATION MODAL */}
        {isDetailOpen && selectedDonation && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="w-full max-w-3xl glass-panel rounded-3xl p-6 md:p-8 space-y-6 relative max-h-[90vh] overflow-y-auto" dir={dir}>
              
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-900 pb-4">
                <div>
                  <h3 className="text-lg font-black text-white">{language === 'ar' ? 'تفاصيل التبرع ومطابقته يدوياً' : 'Donation Details & Manual Match'}</h3>
                  <p className="text-xs text-slate-500 mt-1">ID: {selectedDonation.id}</p>
                </div>
                <button 
                  onClick={() => {
                    setIsDetailOpen(false);
                    setSelectedDonation(null);
                  }}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-400"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* Grid content split */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Side A: Donor info */}
                <div className="space-y-4">
                  <h4 className="text-xs uppercase font-extrabold tracking-wider text-emerald-400">{language === 'ar' ? 'بيانات التبرع' : 'Donation Record'}</h4>
                  
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 space-y-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">{language === 'ar' ? 'اسم المتبرع' : 'Donor Name'}</span>
                      <span className="text-white font-bold">{selectedDonation.donor?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">{language === 'ar' ? 'رقم الهاتف' : 'Phone'}</span>
                      <span className="text-white font-mono">{selectedDonation.donor?.phone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">{language === 'ar' ? 'القيمة' : 'Amount'}</span>
                      <span className="text-emerald-400 font-black">{selectedDonation.amount} EGP</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-semibold">{language === 'ar' ? 'القناة' : 'Method'}</span>
                      <span className="text-white font-bold flex items-center gap-1.5">
                        <img 
                          src={selectedDonation.payment_method === 'vodafone_cash' ? '/vf_Logo.png' : '/InstaPay_Logo.png'} 
                          alt={selectedDonation.payment_method} 
                          className="w-5 h-5 object-contain rounded bg-white p-0.5" 
                        />
                        <span>{selectedDonation.payment_method === 'vodafone_cash' ? (language === 'ar' ? 'فودافون كاش' : 'Vodafone Cash') : 'InstaPay'}</span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">{language === 'ar' ? 'رقم المعاملة المُدخل' : 'Input Ref#'}</span>
                      <span className="text-white font-mono">{selectedDonation.transaction_ref || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">{language === 'ar' ? 'آخر 4 أرقام من الحساب' : 'Input Last 4 Digits'}</span>
                      <span className="text-white font-mono">{selectedDonation.last_4_digits || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">{language === 'ar' ? 'ملاحظات' : 'Notes'}</span>
                      <span className="text-slate-300 font-semibold">{selectedDonation.notes || '—'}</span>
                    </div>
                  </div>

                  {selectedDonation.screenshot_url && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-xs font-semibold flex items-center gap-1.5">
                          <FileImage className="w-4 h-4 text-emerald-450" />
                          {language === 'ar' ? 'صورة إيصال التحويل المرفقة:' : 'Attached Receipt Screenshot:'}
                        </span>
                        <a 
                          href={selectedDonation.screenshot_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[10px] text-emerald-400 hover:underline font-bold"
                        >
                          {language === 'ar' ? 'فتح الحجم الكامل ↗' : 'Open Full Size ↗'}
                        </a>
                      </div>
                      <a 
                        href={selectedDonation.screenshot_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="block w-full h-48 rounded-xl border border-slate-900 overflow-hidden bg-slate-950 flex items-center justify-center cursor-zoom-in hover:border-emerald-500/50 transition-all group"
                      >
                        <img 
                          src={selectedDonation.screenshot_url} 
                          alt="Donation Receipt" 
                          className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300"
                        />
                      </a>
                    </div>
                  )}
                </div>

                {/* Side B: Matching and Actions */}
                <div className="space-y-4">
                  <h4 className="text-xs uppercase font-extrabold tracking-wider text-emerald-400">{language === 'ar' ? 'مطابقة مع رسائل الهاتف الواردة' : 'Link Incoming Phone SMS'}</h4>

                  {selectedDonation.status !== 'pending' ? (
                    <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-xl space-y-3 text-xs">
                      <div className="p-3 bg-emerald-950/20 border border-emerald-900/30 rounded-lg text-emerald-300 font-semibold flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-450" />
                        <span>
                          {language === 'ar' 
                            ? 'هذا التبرع موثق ومعتمد بالفعل.' 
                            : 'This donation has already been verified and approved.'
                          }
                        </span>
                      </div>
                      
                      {selectedDonation.matched_transaction && (
                        <div className="space-y-2 pt-2">
                          <span className="text-slate-500 block font-bold">{language === 'ar' ? 'نص الرسالة المطابقة:' : 'Matched SMS Notification:'}</span>
                          <p className="p-3 bg-slate-900 border border-slate-850 rounded-lg font-mono text-[10px] leading-relaxed text-slate-350">
                            {selectedDonation.matched_transaction.raw_sms}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* List potential matching unmatched SMS */}
                      <div className="space-y-2">
                        <span className="text-xs text-slate-400 font-semibold block">
                          {language === 'ar' ? 'رسائل غير مطابقة مرشحة للمطابقة:' : 'Candidates from Unmatched SMS Inbox:'}
                        </span>
                        
                        {unmatchedTxs && unmatchedTxs.length > 0 ? (
                          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                            {unmatchedTxs
                              .filter(tx => Number(tx.amount) === Number(selectedDonation.amount) && tx.payment_method === selectedDonation.payment_method)
                              .map(tx => (
                                <div key={tx.id} className="p-3 bg-slate-950 hover:bg-slate-900 border border-slate-900 hover:border-emerald-500/30 rounded-xl text-xs space-y-2 transition-all">
                                  <div className="flex justify-between items-center">
                                    <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded font-bold text-[9px]">
                                      EGP {tx.amount}
                                    </span>
                                    <span className="text-slate-500 text-[10px]" dir="ltr">
                                      {new Date(tx.received_at).toLocaleString()}
                                    </span>
                                  </div>
                                  <p className="font-mono text-[10px] text-slate-300 leading-relaxed bg-slate-900/60 p-2 rounded border border-slate-850">{tx.raw_sms}</p>
                                  <button
                                    onClick={() => handleVerifyDonation(selectedDonation.id, 'manual_verified', tx.id)}
                                    disabled={isActionLoading}
                                    className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-lg text-[10px] transition-colors flex items-center justify-center gap-1"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>{language === 'ar' ? 'ربط واعتماد التبرع' : 'Link & Approve Donation'}</span>
                                  </button>
                                </div>
                              ))}
                            
                            {unmatchedTxs.filter(tx => Number(tx.amount) === Number(selectedDonation.amount) && tx.payment_method === selectedDonation.payment_method).length === 0 && (
                              <p className="text-[11px] text-slate-500 text-center py-4 bg-slate-950/20 border border-slate-900 rounded-xl">
                                {language === 'ar' ? 'لا توجد رسائل غير مطابقة بنفس القيمة وقناة الدفع.' : 'No unmatched SMS matches this exact amount and payment method.'}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-500 text-center py-4">
                            {language === 'ar' ? 'لا توجد رسائل واردة غير مطابقة.' : 'No unmatched SMS messages in database.'}
                          </p>
                        )}
                      </div>

                      {/* Standalone actions */}
                      <div className="pt-4 border-t border-slate-900 flex gap-3">
                        <button
                          onClick={() => handleVerifyDonation(selectedDonation.id, 'manual_verified')}
                          disabled={isActionLoading}
                          className="flex-1 py-3 bg-teal-500 hover:bg-teal-600 text-slate-950 font-black rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          <span>{language === 'ar' ? 'اعتماد يدوي (بدون ربط رسالة)' : 'Approve Manually (Without Link)'}</span>
                        </button>

                        <button
                          onClick={() => handleVerifyDonation(selectedDonation.id, 'rejected')}
                          disabled={isActionLoading}
                          className="py-3 px-4 bg-red-950/20 hover:bg-red-950/40 border border-red-900/20 text-red-300 font-bold rounded-xl text-xs transition-all active:scale-[0.99] flex items-center justify-center gap-1.5"
                        >
                          <X className="w-4 h-4 text-red-400" />
                          <span>{language === 'ar' ? 'رفض الطلب' : 'Reject Request'}</span>
                        </button>
                      </div>
                    </div>
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
