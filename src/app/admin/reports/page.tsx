'use client';

import React, { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Donation } from '@/types';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  FileText, 
  Calendar, 
  Download, 
  Printer, 
  Loader2,
  CheckCircle2, 
  AlertTriangle
} from 'lucide-react';

export default function AdminReportsPage() {
  const { language, dir, t } = useLanguage();

  // Filters
  const [reportRange, setReportRange] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('weekly');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [isExporting, setIsExporting] = useState(false);

  // Fetch donations matching selected date range
  const { data: donations = [], isLoading } = useQuery<Donation[]>({
    queryKey: ['reportDonations', reportRange, startDate, endDate],
    queryFn: async () => {
      const now = new Date();
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);

      let startStr = startDate;
      let endStr = endOfToday.toISOString();

      if (reportRange === 'daily') {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        startStr = start.toISOString();
      } else if (reportRange === 'weekly') {
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        startStr = start.toISOString();
      } else if (reportRange === 'monthly') {
        const start = new Date(now);
        start.setDate(now.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        startStr = start.toISOString();
      } else {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        startStr = start.toISOString();
        
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        endStr = end.toISOString();
      }

      const { data, error } = await supabase
        .from('donations')
        .select(`
          *,
          donor:donors (
            name,
            phone
          )
        `)
        .gte('created_at', startStr)
        .lte('created_at', endStr)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const approvedItems = donations.filter(d => d.status === 'auto_verified' || d.status === 'manual_verified');
  const totalApprovedSum = approvedItems.reduce((sum, d) => sum + Number(d.amount), 0);
  const avgDonation = approvedItems.length > 0 ? Math.round(totalApprovedSum / approvedItems.length) : 0;

  // Export to Excel
  const handleExportExcel = () => {
    if (donations.length === 0) return;
    setIsExporting(true);

    try {
      const exportRows = donations.map((d: any, idx) => ({
        '#': idx + 1,
        'اسم المتبرع': d.donor?.name || 'فاعل خير',
        'رقم الهاتف': d.donor?.phone || '—',
        'المبلغ (ج.م)': Number(d.amount),
        'وسيلة التحويل': d.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'InstaPay',
        'الرقم المرجعي': d.transaction_ref || '—',
        'حالة التوثيق': d.status === 'auto_verified' ? 'موثق آليًا' :
                        d.status === 'manual_verified' ? 'معتمد يدويًا' :
                        d.status === 'pending' ? 'قيد المراجعة' : 'مرفوض',
        'تاريخ التسجيل': new Date(d.created_at).toLocaleString('ar-EG'),
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'تقرير التبرعات');
      XLSX.writeFile(workbook, `Sadaqah_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (donations.length === 0) return;
    try {
      const headers = ['ID', 'Donor Name', 'Phone', 'Amount', 'Method', 'Ref', 'Status', 'Date'];
      const rows = donations.map((d: any) => [
        d.id,
        `"${d.donor?.name || 'Anonymous'}"`,
        `"${d.donor?.phone || ''}"`,
        d.amount,
        d.payment_method,
        `"${d.transaction_ref || ''}"`,
        d.status,
        `"${d.created_at}"`,
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `donations_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(`CSV export failed: ${err.message}`);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#EAE8DE] dark:border-[#283849]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#153C32] dark:text-[#F3F5F4] tracking-tight">
              {language === 'ar' ? 'التقارير المحاسبية والتصدير' : 'Financial Reports & Exports'}
            </h1>
            <p className="text-xs sm:text-sm text-[#738079] dark:text-[#A7B4B0] mt-1">
              {language === 'ar'
                ? 'استخراج كشوف الحسابات المالية، تصدير ملفات Excel و CSV، وطباعة السجلات.'
                : 'Generate financial audit statements, export Excel & CSV spreadsheets, and print ledgers.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={isExporting || donations.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#153C32] dark:bg-[#217A61] text-white text-xs font-bold hover:bg-[#1C4E41] dark:hover:bg-[#24B58A] disabled:opacity-50 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#B79B68] dark:text-[#F3F5F4]" />
              <span>{language === 'ar' ? 'تصدير Excel (XLSX)' : 'Export Excel'}</span>
            </button>

            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white dark:bg-[#172436] border border-[#DDD9CC] dark:border-[#283849] text-[#3D4742] dark:text-[#F3F5F4] text-xs font-semibold hover:bg-[#F4F3ED] dark:hover:bg-[#1f3047] transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>{language === 'ar' ? 'طباعة' : 'Print'}</span>
            </button>
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setReportRange('daily')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                reportRange === 'daily'
                  ? 'bg-[#153C32] dark:bg-[#217A61] text-white shadow-subtle'
                  : 'bg-[#FAF9F5] dark:bg-[#111C2D] text-[#3D4742] dark:text-[#A7B4B0] hover:bg-[#F4F3ED] dark:hover:bg-[#1a293f]'
              }`}
            >
              {language === 'ar' ? 'اليوم' : 'Today'}
            </button>

            <button
              onClick={() => setReportRange('weekly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                reportRange === 'weekly'
                  ? 'bg-[#153C32] dark:bg-[#217A61] text-white shadow-subtle'
                  : 'bg-[#FAF9F5] dark:bg-[#111C2D] text-[#3D4742] dark:text-[#A7B4B0] hover:bg-[#F4F3ED] dark:hover:bg-[#1a293f]'
              }`}
            >
              {language === 'ar' ? 'آخر 7 أيام' : 'Last 7 Days'}
            </button>

            <button
              onClick={() => setReportRange('monthly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                reportRange === 'monthly'
                  ? 'bg-[#153C32] dark:bg-[#217A61] text-white shadow-subtle'
                  : 'bg-[#FAF9F5] dark:bg-[#111C2D] text-[#3D4742] dark:text-[#A7B4B0] hover:bg-[#F4F3ED] dark:hover:bg-[#1a293f]'
              }`}
            >
              {language === 'ar' ? 'آخر 30 يومًا' : 'Last 30 Days'}
            </button>

            <button
              onClick={() => setReportRange('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                reportRange === 'custom'
                  ? 'bg-[#153C32] dark:bg-[#217A61] text-white shadow-subtle'
                  : 'bg-[#FAF9F5] dark:bg-[#111C2D] text-[#3D4742] dark:text-[#A7B4B0] hover:bg-[#F4F3ED] dark:hover:bg-[#1a293f]'
              }`}
            >
              {language === 'ar' ? 'فترة مخصصة' : 'Custom Period'}
            </button>
          </div>

          {reportRange === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#EAE8DE] dark:border-[#283849]">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#738079] dark:text-[#A7B4B0]">من تاريخ:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full py-2 px-3 text-xs rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-[#191F1C] dark:text-[#F3F5F4]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#738079] dark:text-[#A7B4B0]">إلى تاريخ:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full py-2 px-3 text-xs rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-[#191F1C] dark:text-[#F3F5F4]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Range Summary KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-1">
            <span className="text-xs text-[#738079] dark:text-[#A7B4B0] font-medium block">
              {language === 'ar' ? 'إجمالي المحصل المعتمد في الفترة' : 'Total Verified in Period'}
            </span>
            <div className="text-2xl font-black text-[#153C32] dark:text-[#24B58A]">
              {totalApprovedSum.toLocaleString('en-US')} <span className="text-xs text-[#738079] dark:text-[#A7B4B0] font-bold">{t('egp')}</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-1">
            <span className="text-xs text-[#738079] dark:text-[#A7B4B0] font-medium block">
              {language === 'ar' ? 'عدد التبرعات المعتمدة' : 'Verified Donations Count'}
            </span>
            <div className="text-2xl font-black text-[#191F1C] dark:text-[#F3F5F4]">
              {approvedItems.length}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-1">
            <span className="text-xs text-[#738079] dark:text-[#A7B4B0] font-medium block">
              {language === 'ar' ? 'متوسط قيمة التبرع' : 'Average Gift Value'}
            </span>
            <div className="text-2xl font-black text-[#217A61] dark:text-[#24B58A]">
              {avgDonation.toLocaleString('en-US')} <span className="text-xs text-[#738079] dark:text-[#A7B4B0] font-bold">{t('egp')}</span>
            </div>
          </div>
        </div>

        {/* Report Preview Table */}
        <div className="bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] rounded-3xl overflow-hidden shadow-subtle">
          <div className="p-4 bg-[#FAF9F5] dark:bg-[#111C2D] border-b border-[#EAE8DE] dark:border-[#283849] flex items-center justify-between">
            <span className="text-xs font-bold text-[#153C32] dark:text-[#F3F5F4]">
              {language === 'ar' ? 'معاينة كشف الحساب' : 'Report Statement Preview'} ({donations.length} {language === 'ar' ? 'سجل' : 'records'})
            </span>
            <button
              onClick={handleExportCSV}
              className="text-xs font-bold text-[#153C32] dark:text-[#24B58A] hover:underline"
            >
              تصدير CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[#EAE8DE] dark:border-[#283849] bg-[#FAF9F5] dark:bg-[#111C2D] text-[#738079] dark:text-[#A7B4B0] font-bold">
                  <th className="py-3 px-4 text-start">المتبرع</th>
                  <th className="py-3 px-4 text-start">المبلغ</th>
                  <th className="py-3 px-4 text-start">وسيلة الدفع</th>
                  <th className="py-3 px-4 text-start">المرجع</th>
                  <th className="py-3 px-4 text-start">الحالة</th>
                  <th className="py-3 px-4 text-start">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8DE] dark:divide-[#283849]">
                {donations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#738079] dark:text-[#A7B4B0]">
                      لا توجد تبرعات مسجلة في هذا النطاق الزمني
                    </td>
                  </tr>
                ) : (
                  donations.map(d => (
                    <tr key={d.id} className="hover:bg-[#FAF9F5] dark:hover:bg-[#111C2D]/50 transition-colors">
                      <td className="py-3 px-4 font-bold text-[#191F1C] dark:text-[#F3F5F4]">{d.donor?.name || 'فاعل خير'}</td>
                      <td className="py-3 px-4 font-black text-[#153C32] dark:text-[#24B58A]">{Number(d.amount).toLocaleString('en-US')} {t('egp')}</td>
                      <td className="py-3 px-4 text-[#55625B] dark:text-[#CBD5E1]">{d.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'InstaPay'}</td>
                      <td className="py-3 px-4 font-mono text-xs text-[#738079] dark:text-[#A7B4B0]">{d.transaction_ref || '—'}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          d.status === 'auto_verified' || d.status === 'manual_verified' ? 'bg-[#F0F9F6] text-[#217A61] dark:bg-[#217A61]/20 dark:text-[#24B58A]' :
                          d.status === 'pending' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        }`}>
                          {d.status === 'auto_verified' ? 'موثق آليًا' :
                           d.status === 'manual_verified' ? 'معتمد يدويًا' :
                           d.status === 'pending' ? 'قيد المراجعة' : 'مرفوض'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#738079] dark:text-[#A7B4B0]">
                        {new Date(d.created_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
