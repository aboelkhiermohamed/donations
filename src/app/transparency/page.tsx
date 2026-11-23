'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/LanguageContext';
import ThemeToggle from '@/components/ThemeToggle';
import {
  HeartHandshake,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Search,
  Check,
  Loader2,
  Calendar,
  Wallet,
  Globe,
  Coins,
  Users,
  TrendingUp,
  RotateCcw
} from 'lucide-react';

interface ConfirmedDonation {
  id: string;
  amount: number;
  payment_method: string;
  created_at: string;
  donor?: {
    name?: string | null;
  } | null;
}

const PAGE_SIZE = 25;

export default function FullTransparencyLedgerPage() {
  const { language, dir, toggleLanguage, t } = useLanguage();

  // State
  const [donations, setDonations] = useState<ConfirmedDonation[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalSum, setTotalSum] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  // Filters
  const [selectedMethod, setSelectedMethod] = useState<'all' | 'vodafone_cash' | 'instapay'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'amount_desc'>('newest');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Safe Name Masking (Same logic as Home Page)
  const getMaskedName = useCallback((rawName?: string | null) => {
    if (!rawName || rawName === 'فاعل خير') return 'فاعل خير';
    const parts = rawName.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].substring(0, 3) + '...';
    }
    return `${parts[0]} ${parts[1].charAt(0)}.`;
  }, []);

  // Fetch a slice/chunk of verified donations from Supabase
  const loadDonations = useCallback(
    async (pageToFetch: number, isInitial = false) => {
      try {
        if (isInitial) {
          setIsLoading(true);
        } else {
          setIsLoadingMore(true);
        }

        const from = pageToFetch * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabase
          .from('donations')
          .select(
            `
            id,
            amount,
            payment_method,
            created_at,
            donor:donors (
              name
            )
          `,
            { count: 'exact' }
          )
          .in('status', ['auto_verified', 'manual_verified']);

        // Payment Method Filter
        if (selectedMethod !== 'all') {
          query = query.eq('payment_method', selectedMethod);
        }

        // Sorting
        if (sortBy === 'amount_desc') {
          query = query.order('amount', { ascending: false });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        query = query.range(from, to);

        const { data, count, error } = await query;

        if (error) throw error;

        const fetchedList = (data as unknown as ConfirmedDonation[]) || [];

        if (isInitial) {
          setDonations(fetchedList);
          setTotalCount(count || 0);
        } else {
          setDonations(prev => [...prev, ...fetchedList]);
        }

        // Check if there are more items to fetch
        const currentTotal = isInitial ? fetchedList.length : donations.length + fetchedList.length;
        setHasMore(currentTotal < (count || 0));
        setPage(pageToFetch);
      } catch (err) {
        console.error('Error fetching transparency ledger:', err);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [selectedMethod, sortBy, donations.length]
  );

  // Initial fetch and on filter/sort change
  useEffect(() => {
    loadDonations(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMethod, sortBy]);

  // Fetch campaign overall total for summary stats once
  useEffect(() => {
    async function fetchOverallSummary() {
      try {
        const res = await fetch('/api/campaign/summary');
        if (res.ok) {
          const json = await res.json();
          if (json.totalCollected) setTotalSum(json.totalCollected);
        }
      } catch {}
    }
    fetchOverallSummary();
  }, []);

  // Filter in-memory by search query
  const filteredDonations = useMemo(() => {
    if (!searchQuery.trim()) return donations;
    const query = searchQuery.trim().toLowerCase();
    return donations.filter(d => {
      const masked = getMaskedName(d.donor?.name).toLowerCase();
      const raw = (d.donor?.name || '').toLowerCase();
      const amt = String(d.amount);
      return masked.includes(query) || raw.includes(query) || amt.includes(query);
    });
  }, [donations, searchQuery, getMaskedName]);

  // Load next chunk
  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      loadDonations(page + 1, false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-arabic bg-[#FAF9F5] dark:bg-[#0B1220] text-[#191F1C] dark:text-[#F3F5F4] transition-colors duration-200" dir={dir}>
      
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-[#FAF9F5]/90 dark:bg-[#0B1220]/90 backdrop-blur-md border-b border-[#EAE8DE] dark:border-[#283849]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-3">
          
          <Link href="/" className="flex items-center gap-2.5 sm:gap-3.5 group min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-[#153C32] dark:bg-[#172436] border border-[#153C32] dark:border-[#283849] text-white flex items-center justify-center shadow-subtle flex-shrink-0">
              <HeartHandshake className="w-5 h-5 sm:w-6 sm:h-6 text-[#E2F3EE] dark:text-[#24B58A]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-sm sm:text-lg text-[#153C32] dark:text-[#F3F5F4] tracking-tight whitespace-nowrap">
                {t('brand_title')}
              </span>
              <span className="text-[10px] sm:text-xs text-[#738079] dark:text-[#A7B4B0] font-medium truncate max-w-[140px] xs:max-w-[200px] sm:max-w-none">
                {t('brand_batch')}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle compact />
            
            <button
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-[#DDD9CC] dark:border-[#283849] bg-white dark:bg-[#172436] text-xs font-semibold text-[#3D4742] dark:text-[#F3F5F4] hover:bg-[#F4F3ED] dark:hover:bg-[#1f3047] transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-[#153C32] dark:text-[#24B58A]" />
              <span className="hidden sm:inline">{language === 'ar' ? 'English' : 'العربية'}</span>
              <span className="inline sm:hidden font-mono">{language === 'ar' ? 'EN' : 'ع'}</span>
            </button>

            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-[#153C32] dark:bg-[#217A61] text-white text-xs font-bold hover:bg-[#1C4E41] dark:hover:bg-[#24B58A] shadow-subtle transition-colors"
            >
              <span>{language === 'ar' ? 'الرئيسية' : 'Home'}</span>
              <ArrowLeft className="w-3.5 h-3.5 rtl-flip" />
            </Link>
          </div>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-10 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">

          {/* Breadcrumb & Header */}
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs font-bold text-emerald-800 dark:text-emerald-300">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{language === 'ar' ? 'سجل الشفافية وقائمة الشرف الكاملة' : 'Full Transparency Ledger'}</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black text-[#153C32] dark:text-[#F3F5F4]">
              {language === 'ar' ? 'جميع المساهمات الموثقة' : 'All Verified Contributions'}
            </h1>

            <p className="text-xs sm:text-sm text-[#55625B] dark:text-[#A7B4B0] leading-relaxed">
              {language === 'ar'
                ? 'عرض تفصيلي لجميع التبرعات المعتمدة للحملة يتم جلبه تدريجياً لضمان السرعة الفائقة، مع الحفاظ الكامل على الخصوصية وحجب أجزاء من الأسماء والأرقام.'
                : 'Complete verified ledger loaded on-demand for maximum performance, with donor privacy masking strictly preserved.'}
            </p>
          </div>

          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
            
            <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle text-center space-y-1">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <Coins className="w-4 h-4" />
              </div>
              <span className="text-[11px] sm:text-xs text-[#738079] dark:text-[#A7B4B0] font-medium block">
                {language === 'ar' ? 'إجمالي الحصيلة' : 'Total Raised'}
              </span>
              <span className="text-lg sm:text-2xl font-black text-[#153C32] dark:text-[#24B58A] block">
                {totalSum > 0 ? totalSum.toLocaleString('en-US') : '—'} {t('egp')}
              </span>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle text-center space-y-1">
              <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-[#B79B68] dark:text-[#C5A876] flex items-center justify-center mx-auto mb-2">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-[11px] sm:text-xs text-[#738079] dark:text-[#A7B4B0] font-medium block">
                {language === 'ar' ? 'المساهمات الموثقة' : 'Verified Donations'}
              </span>
              <span className="text-lg sm:text-2xl font-black text-[#191F1C] dark:text-[#F3F5F4] block">
                {totalCount.toLocaleString('en-US')}
              </span>
            </div>

            <div className="col-span-2 sm:col-span-1 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle text-center space-y-1">
              <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-2">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="text-[11px] sm:text-xs text-[#738079] dark:text-[#A7B4B0] font-medium block">
                {language === 'ar' ? 'طريقة التحميل' : 'Loading Engine'}
              </span>
              <span className="text-xs sm:text-sm font-bold text-[#153C32] dark:text-[#24B58A] block pt-1">
                {language === 'ar' ? 'دفعات ذكية (25 بكل دفعة)' : 'Smart Chunks (25/chunk)'}
              </span>
            </div>

          </div>

          {/* Controls: Search, Filters & Sorters */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
            
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#738079] dark:text-[#A7B4B0] absolute top-1/2 -translate-y-1/2 start-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={language === 'ar' ? 'بحث بالاسم المقنّع أو المبلغ...' : 'Search by masked name or amount...'}
                className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-[#DDD9CC] dark:border-[#283849] bg-[#FAF9F5] dark:bg-[#111C2D] text-xs sm:text-sm text-[#191F1C] dark:text-[#F3F5F4] placeholder-[#80918C] focus:outline-none focus:ring-2 focus:ring-[#153C32] dark:focus:ring-[#24B58A]"
              />
            </div>

            {/* Filters Group */}
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Payment Method */}
              <div className="flex items-center gap-1 p-1 bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setSelectedMethod('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    selectedMethod === 'all'
                      ? 'bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] shadow-subtle'
                      : 'text-[#738079] dark:text-[#A7B4B0] hover:text-[#191F1C]'
                  }`}
                >
                  {language === 'ar' ? 'الكل' : 'All'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMethod('vodafone_cash')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    selectedMethod === 'vodafone_cash'
                      ? 'bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] shadow-subtle'
                      : 'text-[#738079] dark:text-[#A7B4B0] hover:text-[#191F1C]'
                  }`}
                >
                  {language === 'ar' ? 'فودافون كاش' : 'VF Cash'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMethod('instapay')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    selectedMethod === 'instapay'
                      ? 'bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] shadow-subtle'
                      : 'text-[#738079] dark:text-[#A7B4B0] hover:text-[#191F1C]'
                  }`}
                >
                  InstaPay
                </button>
              </div>

              {/* Sorter */}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-[#DDD9CC] dark:border-[#283849] bg-[#FAF9F5] dark:bg-[#111C2D] text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none"
              >
                <option value="newest">{language === 'ar' ? 'الأحدث أولاً' : 'Newest'}</option>
                <option value="amount_desc">{language === 'ar' ? 'الأكبر مبلغاً' : 'Highest Amount'}</option>
              </select>

            </div>

          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block bg-[#FAF9F5] dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] rounded-3xl overflow-hidden shadow-subtle">
            <table className="w-full text-start text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[#EAE8DE] dark:border-[#283849] bg-white dark:bg-[#111C2D] text-[#738079] dark:text-[#A7B4B0] font-bold">
                  <th className="py-4 px-6 text-start">#</th>
                  <th className="py-4 px-6 text-start">{t('col_donor')}</th>
                  <th className="py-4 px-6 text-start">{t('col_amount')}</th>
                  <th className="py-4 px-6 text-start">{t('col_method')}</th>
                  <th className="py-4 px-6 text-start">{t('col_date')}</th>
                  <th className="py-4 px-6 text-end">{t('col_status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8DE] dark:divide-[#283849]">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-[#738079] dark:text-[#A7B4B0]">
                      <Loader2 className="w-7 h-7 animate-spin mx-auto mb-2 text-[#153C32] dark:text-[#24B58A]" />
                      <span className="text-xs font-bold">{t('loading')}</span>
                    </td>
                  </tr>
                ) : filteredDonations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-[#738079] dark:text-[#A7B4B0]">
                      {language === 'ar' ? 'لم يتم العثور على أي مساهمات مطابقة.' : 'No matching donations found.'}
                    </td>
                  </tr>
                ) : (
                  filteredDonations.map((d, index) => {
                    const maskedName = getMaskedName(d.donor?.name);

                    return (
                      <tr key={d.id} className="hover:bg-white dark:hover:bg-[#111C2D] transition-colors">
                        <td className="py-4 px-6 text-[#738079] dark:text-[#80918C] font-mono text-xs">
                          {index + 1}
                        </td>
                        <td className="py-4 px-6 font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                          {maskedName}
                        </td>
                        <td className="py-4 px-6 font-black text-[#153C32] dark:text-[#24B58A]">
                          {Number(d.amount).toLocaleString('en-US')} {t('egp')}
                        </td>
                        <td className="py-4 px-6 text-[#738079] dark:text-[#A7B4B0]">
                          <span className="inline-flex items-center gap-1.5">
                            <Wallet className="w-3.5 h-3.5 text-[#B79B68]" />
                            <span>{d.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'InstaPay'}</span>
                          </span>
                        </td>
                        <td className="py-4 px-6 text-[#738079] dark:text-[#A7B4B0] text-xs" suppressHydrationWarning>
                          {new Date(d.created_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="py-4 px-6 text-end">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F0F9F6] dark:bg-[#24B58A]/10 text-[#217A61] dark:text-[#24B58A] text-xs font-bold border border-[#217A61]/20 dark:border-[#24B58A]/20">
                            <Check className="w-3 h-3" />
                            <span>{t('verified_badge')}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="sm:hidden space-y-3">
            {isLoading ? (
              <div className="py-12 text-center text-[#738079]">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#153C32] dark:text-[#24B58A]" />
                <span className="text-xs font-bold">{t('loading')}</span>
              </div>
            ) : filteredDonations.length === 0 ? (
              <div className="p-8 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] text-center text-xs text-[#738079]">
                {language === 'ar' ? 'لم يتم العثور على أي مساهمات مطابقة.' : 'No matching donations found.'}
              </div>
            ) : (
              filteredDonations.map((d, index) => {
                const maskedName = getMaskedName(d.donor?.name);

                return (
                  <div
                    key={d.id}
                    className="p-4 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle flex items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-[10px] font-mono text-[#738079] flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className="font-bold text-sm text-[#191F1C] dark:text-[#F3F5F4]">
                          {maskedName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#738079] dark:text-[#A7B4B0]">
                        <span>{d.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'InstaPay'}</span>
                        <span>•</span>
                        <span suppressHydrationWarning>
                          {new Date(d.created_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="text-end space-y-1">
                      <span className="font-black text-sm text-[#153C32] dark:text-[#24B58A] block">
                        {Number(d.amount).toLocaleString('en-US')} {t('egp')}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#217A61] dark:text-[#24B58A]">
                        <Check className="w-3 h-3" />
                        <span>{t('verified_badge')}</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Chunk-by-Chunk Load More Control */}
          <div className="pt-4 text-center space-y-3">
            <div className="text-xs text-[#738079] dark:text-[#A7B4B0] font-medium">
              {language === 'ar'
                ? `يتم عرض ${filteredDonations.length} من إجمالي ${totalCount} مساهمة موثقة`
                : `Showing ${filteredDonations.length} of ${totalCount} verified gifts`}
            </div>

            {hasMore && !searchQuery.trim() && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-xs sm:text-sm font-bold shadow-subtle hover:bg-[#1C4E41] dark:hover:bg-[#1fa07a] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{language === 'ar' ? 'جارٍ جلب الدفعة التالية...' : 'Loading next chunk...'}</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>{language === 'ar' ? `تحميل المزيد (+${PAGE_SIZE} مساهمة)` : `Load More (+${PAGE_SIZE})`}</span>
                  </>
                )}
              </button>
            )}

            {!hasMore && filteredDonations.length > 0 && (
              <div className="inline-block py-2 px-4 rounded-full bg-[#FAF9F5] dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] text-xs font-semibold text-[#738079] dark:text-[#A7B4B0]">
                {language === 'ar' ? '✓ تم عرض جميع المساهمات بالكامل' : '✓ All contributions loaded'}
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Footer Minimal */}
      <footer className="border-t border-[#EAE8DE] dark:border-[#283849] bg-white dark:bg-[#0B1220] py-8 text-center text-xs text-[#738079] dark:text-[#A7B4B0] space-y-2">
        <div className="flex items-center justify-center gap-2">
          <HeartHandshake className="w-4 h-4 text-[#153C32] dark:text-[#24B58A]" />
          <span className="font-bold text-[#153C32] dark:text-[#F3F5F4]">{t('brand_title')}</span>
        </div>
        <p>صدقة جارية إهداءً لروح الزميلين د. حسين علي الأمير ود. ندى هاني حامد رحمهما الله.</p>
      </footer>

    </div>
  );
}
