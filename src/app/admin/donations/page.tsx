'use client';

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Donation } from '@/types';
import { 
  Search, 
  Check, 
  X, 
  Eye, 
  CheckCircle2, 
  Loader2,
  Clock,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

export default function AdminDonationsPage() {
  const { language, dir, t } = useLanguage();
  const queryClient = useQueryClient();

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  // Modals state
  const [selectedDonation, setSelectedDonation] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [resolvedReceiptUrl, setResolvedReceiptUrl] = useState<string | null>(null);
  const [isResolvingReceipt, setIsResolvingReceipt] = useState(false);

  // Securely resolve receipt screenshot URL for Cloudflare R2 / legacy storage
  useEffect(() => {
    if (!selectedDonation?.screenshot_url) {
      setResolvedReceiptUrl(null);
      return;
    }

    const raw = selectedDonation.screenshot_url;
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      setResolvedReceiptUrl(raw);
      return;
    }

    async function resolveUrl() {
      setIsResolvingReceipt(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/admin/receipts?key=${encodeURIComponent(raw)}`, {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        if (res.ok) {
          const json = await res.json();
          setResolvedReceiptUrl(json.url);
        }
      } catch (err) {
        console.warn('Failed to resolve secure receipt URL:', err);
      } finally {
        setIsResolvingReceipt(false);
      }
    }

    resolveUrl();
  }, [selectedDonation?.screenshot_url]);

  // 1. Fetch Donations
  const { data: donations = [], isLoading } = useQuery<Donation[]>({
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
          ),
          verified_by:admins (
            name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // 2. Fetch Unmatched Transactions
  const { data: unmatchedTxs = [] } = useQuery<any[]>({
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

  const filteredDonations = donations.filter(d => {
    const sTerm = searchTerm.toLowerCase().trim();
    const donorName = (d.donor?.name || '').toLowerCase();
    const donorPhone = (d.donor?.phone || '').toLowerCase();
    const ref = (d.transaction_ref || '').toLowerCase();

    const matchesSearch = !sTerm || donorName.includes(sTerm) || donorPhone.includes(sTerm) || ref.includes(sTerm);
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    const matchesMethod = methodFilter === 'all' || d.payment_method === methodFilter;

    return matchesSearch && matchesStatus && matchesMethod;
  });

  const handleApprove = async (donationId: string) => {
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد من اعتماد هذا التبرع رسميًا؟' : 'Are you sure you want to approve this donation?')) return;

    setIsActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('donations')
        .update({
          status: 'manual_verified',
          verification_method: 'manual',
          verified_at: new Date().toISOString(),
          verified_by_admin_id: user?.id || null,
        })
        .eq('id', donationId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['adminDonations'] });
      setIsDetailOpen(false);
    } catch (err: any) {
      alert(`Error approving: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReject = async (donationId: string) => {
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد من رفض هذا التبرع؟' : 'Are you sure you want to reject this donation?')) return;

    setIsActionLoading(true);
    try {
      const { error } = await supabase
        .from('donations')
        .update({
          status: 'rejected',
        })
        .eq('id', donationId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['adminDonations'] });
      setIsDetailOpen(false);
    } catch (err: any) {
      alert(`Error rejecting: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLinkTransaction = async (donationId: string, txId: string) => {
    setIsActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      await supabase
        .from('donations')
        .update({
          status: 'manual_verified',
          verification_method: 'manual',
          verified_at: new Date().toISOString(),
          matched_transaction_id: txId,
          verified_by_admin_id: user?.id || null,
        })
        .eq('id', donationId);

      await supabase
        .from('incoming_transactions')
        .update({
          status: 'manual_match',
          matched_donation_id: donationId,
          matching_confidence: 100,
        })
        .eq('id', txId);

      queryClient.invalidateQueries({ queryKey: ['adminDonations'] });
      queryClient.invalidateQueries({ queryKey: ['unmatchedTxs'] });
      setIsDetailOpen(false);
    } catch (err: any) {
      alert(`Error linking: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#EAE8DE] dark:border-[#283849]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#153C32] dark:text-[#24B58A] tracking-tight">
              {language === 'ar' ? 'إدارة سجلات التبرع' : 'Donations Management'}
            </h1>
            <p className="text-xs sm:text-sm text-[#738079] dark:text-[#A7B4B0] mt-1">
              {language === 'ar'
                ? 'مراجعة وتوثيق المساهمات، التحقق من الإيصالات، والربط مع المعاملات البنكية.'
                : 'Review contributions, verify receipts, and link with incoming SMS transactions.'}
            </p>
          </div>
        </div>

        {/* Filters & Search Bar */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle grid grid-cols-1 sm:grid-cols-12 gap-3">
          
          <div className="sm:col-span-6 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={language === 'ar' ? 'بحث بالاسم، رقم الهاتف، أو الرقم المرجعي...' : 'Search by name, phone, or Ref#...'}
              className="w-full py-2.5 ps-9 pe-4 text-xs sm:text-sm rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none"
            />
            <Search className="w-4 h-4 text-[#738079] dark:text-[#A7B4B0] absolute top-1/2 -translate-y-1/2 start-3" />
          </div>

          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full py-2.5 px-3 text-xs sm:text-sm rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none"
            >
              <option value="all">{language === 'ar' ? 'كافة الحالات' : 'All Statuses'}</option>
              <option value="pending">{language === 'ar' ? 'قيد المراجعة' : 'Pending'}</option>
              <option value="auto_verified">{language === 'ar' ? 'موثق آليًا' : 'Auto Verified'}</option>
              <option value="manual_verified">{language === 'ar' ? 'معتمد يدويًا' : 'Manual Verified'}</option>
              <option value="rejected">{language === 'ar' ? 'مرفوض' : 'Rejected'}</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="w-full py-2.5 px-3 text-xs sm:text-sm rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none"
            >
              <option value="all">{language === 'ar' ? 'كافة وسائل الدفع' : 'All Methods'}</option>
              <option value="vodafone_cash">فودافون كاش</option>
              <option value="instapay">InstaPay</option>
            </select>
          </div>

        </div>

        {/* Table Container */}
        <div className="bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] rounded-3xl overflow-hidden shadow-subtle">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[#EAE8DE] dark:border-[#283849] bg-[#FAF9F5] dark:bg-[#111C2D] text-[#738079] dark:text-[#A7B4B0] font-bold">
                  <th className="py-3.5 px-5 text-start">{language === 'ar' ? 'المتبرع' : 'Donor'}</th>
                  <th className="py-3.5 px-5 text-start">{language === 'ar' ? 'المبلغ' : 'Amount'}</th>
                  <th className="py-3.5 px-5 text-start">{language === 'ar' ? 'وسيلة الدفع' : 'Method'}</th>
                  <th className="py-3.5 px-5 text-start">{language === 'ar' ? 'الرقم المرجعي' : 'Ref#'}</th>
                  <th className="py-3.5 px-5 text-start">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="py-3.5 px-5 text-start">{language === 'ar' ? 'التاريخ' : 'Date'}</th>
                  <th className="py-3.5 px-5 text-end">{language === 'ar' ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8DE] dark:divide-[#283849]">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#738079] dark:text-[#A7B4B0]">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#153C32] dark:text-[#24B58A]" />
                      <span>{t('loading')}</span>
                    </td>
                  </tr>
                ) : filteredDonations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#738079] dark:text-[#A7B4B0]">
                      {language === 'ar' ? 'لا توجد سجلات تطابق الفلتر الحالي' : 'No records match current filter'}
                    </td>
                  </tr>
                ) : (
                  filteredDonations.map(d => (
                    <tr key={d.id} className="hover:bg-[#FAF9F5] dark:hover:bg-[#111C2D] transition-colors">
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-[#191F1C] dark:text-[#F3F5F4]">{d.donor?.name || 'فاعل خير'}</div>
                        <div className="text-xs text-[#738079] dark:text-[#A7B4B0] font-mono" dir="ltr">{d.donor?.phone || '—'}</div>
                      </td>
                      <td className="py-3.5 px-5 font-black text-[#153C32] dark:text-[#24B58A]">
                        {Number(d.amount).toLocaleString('en-US')} {t('egp')}
                      </td>
                      <td className="py-3.5 px-5 text-[#3D4742] dark:text-[#A7B4B0]">
                        {d.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'InstaPay'}
                      </td>
                      <td className="py-3.5 px-5 font-mono text-xs text-[#55625B] dark:text-[#A7B4B0]">
                        {d.transaction_ref || '—'}
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                          d.status === 'auto_verified'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : d.status === 'manual_verified'
                            ? 'bg-[#F0F9F6] dark:bg-[#24B58A]/10 text-[#217A61] dark:text-[#24B58A] border border-[#217A61]/20 dark:border-[#24B58A]/30'
                            : d.status === 'pending'
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                        }`}>
                          {d.status === 'auto_verified' ? 'موثق آليًا' :
                           d.status === 'manual_verified' ? 'معتمد يدويًا' :
                           d.status === 'pending' ? 'قيد المراجعة' : 'مرفوض'}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-xs text-[#738079] dark:text-[#A7B4B0]">
                        {new Date(d.created_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3.5 px-5 text-end">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDonation(d);
                            setIsDetailOpen(true);
                          }}
                          className="p-1.5 rounded-lg border border-[#DDD9CC] dark:border-[#283849] bg-white dark:bg-[#111C2D] text-[#153C32] dark:text-[#24B58A] hover:bg-[#F4F3ED]"
                          title="تفاصيل التبرع"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DETAIL MODAL */}
        {isDetailOpen && selectedDonation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] rounded-3xl p-6 sm:p-8 shadow-editorial space-y-6 max-h-[90vh] overflow-y-auto">
              
              <div className="flex items-center justify-between pb-3 border-b border-[#EAE8DE] dark:border-[#283849]">
                <h3 className="text-lg font-bold text-[#153C32] dark:text-[#24B58A]">
                  {language === 'ar' ? 'تفاصيل سجل التبرع' : 'Donation Details'}
                </h3>
                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="p-1.5 rounded-lg text-[#738079] hover:bg-[#F4F3ED] dark:hover:bg-[#111C2D]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Data Summary */}
              <div className="grid grid-cols-2 gap-4 text-xs sm:text-sm">
                <div className="p-3 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849]">
                  <span className="text-[#738079] dark:text-[#A7B4B0] block mb-0.5">{language === 'ar' ? 'المتبرع' : 'Donor'}</span>
                  <span className="font-bold text-[#191F1C] dark:text-[#F3F5F4]">{selectedDonation.donor?.name || 'فاعل خير'}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849]">
                  <span className="text-[#738079] dark:text-[#A7B4B0] block mb-0.5">{language === 'ar' ? 'رقم الهاتف' : 'Phone'}</span>
                  <span className="font-mono font-bold text-[#191F1C] dark:text-[#F3F5F4]">{selectedDonation.donor?.phone || '—'}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849]">
                  <span className="text-[#738079] dark:text-[#A7B4B0] block mb-0.5">{language === 'ar' ? 'المبلغ' : 'Amount'}</span>
                  <span className="font-extrabold text-[#153C32] dark:text-[#24B58A]">{Number(selectedDonation.amount).toLocaleString('en-US')} {t('egp')}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849]">
                  <span className="text-[#738079] dark:text-[#A7B4B0] block mb-0.5">{language === 'ar' ? 'المرجع / Ref' : 'Reference'}</span>
                  <span className="font-mono font-bold text-[#191F1C] dark:text-[#F3F5F4]">{selectedDonation.transaction_ref || '—'}</span>
                </div>
              </div>

              {selectedDonation.notes && (
                <div className="p-3 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849] text-xs">
                  <span className="text-[#738079] dark:text-[#A7B4B0] block mb-1 font-semibold">{language === 'ar' ? 'ملاحظات / إهداء:' : 'Notes / Dedication:'}</span>
                  <p className="text-[#3D4742] dark:text-[#F3F5F4] leading-relaxed">{selectedDonation.notes}</p>
                </div>
              )}

              {selectedDonation.screenshot_url && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">{language === 'ar' ? 'صورة الإيصال المرفقة:' : 'Attached Screenshot:'}</span>
                  <div className="border border-[#DDD9CC] dark:border-[#283849] rounded-xl overflow-hidden p-2 bg-[#FAF9F5] dark:bg-[#111C2D] text-center">
                    {isResolvingReceipt ? (
                      <div className="py-8 flex items-center justify-center gap-2 text-xs text-[#738079] dark:text-[#A7B4B0]">
                        <Loader2 className="w-4 h-4 animate-spin text-[#153C32] dark:text-[#24B58A]" />
                        <span>{language === 'ar' ? 'جارٍ تحميل الصورة الآمنة من R2...' : 'Loading secure receipt from R2...'}</span>
                      </div>
                    ) : resolvedReceiptUrl ? (
                      <div className="space-y-2">
                        <img 
                          src={resolvedReceiptUrl} 
                          alt="Transfer Proof" 
                          className="max-h-64 mx-auto object-contain rounded-lg shadow-subtle"
                        />
                        <a
                          href={resolvedReceiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-[#153C32] dark:text-[#24B58A] hover:underline font-bold"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'فتح الصورة بالحجم الكامل' : 'Open full image in new tab'}</span>
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-[#738079] dark:text-[#A7B4B0] py-4">
                        {language === 'ar' ? 'تعذر تحميل صورة الإيصال.' : 'Unable to load receipt image.'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {selectedDonation.status === 'pending' && unmatchedTxs.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#EAE8DE] dark:border-[#283849]">
                  <span className="text-xs font-bold text-[#153C32] dark:text-[#24B58A]">
                    {language === 'ar' ? 'معاملات SMS غير مطابقة متاحة للربط اليدوي:' : 'Available Unmatched SMS Transactions:'}
                  </span>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {unmatchedTxs.map((tx: any) => (
                      <div key={tx.id} className="p-2.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-[#153C32] dark:text-[#24B58A]">{Number(tx.amount).toLocaleString('en-US')} {t('egp')}</span>
                          <span className="text-[#738079] dark:text-[#A7B4B0] ms-2">{tx.sender_phone || tx.sender_name || 'SMS'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLinkTransaction(selectedDonation.id, tx.id)}
                          disabled={isActionLoading}
                          className="px-2.5 py-1 rounded-lg bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-[11px] font-bold"
                        >
                          {language === 'ar' ? 'ربط واعتماد' : 'Link & Verify'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#EAE8DE] dark:border-[#283849]">
                {selectedDonation.status !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => handleReject(selectedDonation.id)}
                    disabled={isActionLoading}
                    className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-xs font-bold hover:bg-red-100"
                  >
                    {language === 'ar' ? 'رفض الطلب' : 'Reject'}
                  </button>
                )}

                {selectedDonation.status !== 'manual_verified' && selectedDonation.status !== 'auto_verified' && (
                  <button
                    type="button"
                    onClick={() => handleApprove(selectedDonation.id)}
                    disabled={isActionLoading}
                    className="px-5 py-2 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-xs font-bold"
                  >
                    {language === 'ar' ? 'اعتماد التبرع يدويًا' : 'Approve Donation'}
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
