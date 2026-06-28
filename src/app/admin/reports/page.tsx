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
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

export default function AdminReportsPage() {
  const { language, t } = useLanguage();

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
  const [exportMessage, setExportMessage] = useState('');

  // Fetch donations matching selected date range
  const { data: donations, isLoading } = useQuery<Donation[]>({
    queryKey: ['reportDonations', reportRange, startDate, endDate],
    queryFn: async () => {
      let startStr = startDate;
      let endStr = endDate;

      // Handle preset ranges
      const now = new Date();
      if (reportRange === 'daily') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        startStr = start.toISOString();
        endStr = now.toISOString();
      } else if (reportRange === 'weekly') {
        const start = new Date();
        start.setDate(now.getDate() - 7);
        startStr = start.toISOString();
        endStr = now.toISOString();
      } else if (reportRange === 'monthly') {
        const start = new Date();
        start.setDate(now.getDate() - 30);
        startStr = start.toISOString();
        endStr = now.toISOString();
      } else {
        // Custom dates
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

  // Calculate stats for current filter
  const items = donations || [];
  const approvedItems = items.filter(d => d.status === 'auto_verified' || d.status === 'manual_verified');
  const totalApprovedSum = approvedItems.reduce((sum, d) => sum + Number(d.amount), 0);

  // 1. Export as CSV
  const handleExportCSV = async () => {
    if (items.length === 0) return;
    setIsExporting(true);
    setExportMessage(language === 'ar' ? 'جاري تصدير ملف CSV...' : 'Exporting CSV file...');

    try {
      const headers = ['Donation ID', 'Donor Name', 'Donor Phone', 'Amount (EGP)', 'Payment Method', 'Ref Number', 'Status', 'Date', 'Verification'];
      const rows = items.map(d => [
        d.id,
        d.donor?.name || '',
        d.donor?.phone || '',
        d.amount,
        d.payment_method.toUpperCase(),
        d.transaction_ref || '',
        d.status,
        new Date(d.created_at).toLocaleDateString(),
        d.verification_method || 'none'
      ]);

      const csvContent = [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
      
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Donation_Report_${reportRange}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      await logExportAction('csv');
      setExportMessage(language === 'ar' ? 'تم تصدير ملف CSV بنجاح!' : 'CSV exported successfully!');
    } catch (err: any) {
      console.error(err);
      alert(`CSV export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportMessage(''), 3000);
    }
  };

  // 2. Export as Excel (XLSX)
  const handleExportXLSX = async () => {
    if (items.length === 0) return;
    setIsExporting(true);
    setExportMessage(language === 'ar' ? 'جاري تصدير ملف Excel...' : 'Exporting Excel file...');

    try {
      const formattedData = items.map(d => ({
        'Donation ID': d.id,
        'Donor Name': d.donor?.name || '',
        'Donor Phone': d.donor?.phone || '',
        'Amount (EGP)': Number(d.amount),
        'Payment Method': d.payment_method === 'vodafone_cash' ? 'Vodafone Cash' : 'InstaPay',
        'Transaction Ref': d.transaction_ref || '',
        'Status': d.status,
        'Date': new Date(d.created_at).toLocaleDateString(),
        'Verification Method': d.verification_method || 'none'
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Donations');
      
      // Generate buffer
      XLSX.writeFile(workbook, `Donation_Report_${reportRange}_${Date.now()}.xlsx`);

      await logExportAction('xlsx');
      setExportMessage(language === 'ar' ? 'تم تصدير ملف Excel بنجاح!' : 'Excel exported successfully!');
    } catch (err: any) {
      console.error(err);
      alert(`Excel export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportMessage(''), 3000);
    }
  };

  // 3. Native Print layout as PDF
  const handlePrintReport = async () => {
    window.print();
    await logExportAction('pdf');
  };

  // Helper: Log export in database
  const logExportAction = async (format: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Insert in report_exports
      const { data: reportRecord } = await supabase.from('report_exports').insert({
        admin_id: session?.user?.id || null,
        report_type: `${reportRange.toUpperCase()}_${format.toUpperCase()}`,
        status: 'completed',
        criteria: { startDate, endDate, format }
      }).select().single();

      // Log in audit_logs
      await supabase.from('audit_logs').insert({
        admin_id: session?.user?.id || null,
        action: `EXPORT_REPORT_${format.toUpperCase()}`,
        target_table: 'report_exports',
        target_id: reportRecord?.id || null,
        details: { range: reportRange, format, count: items.length }
      });
    } catch (e) {
      console.error('Audit logging failed:', e);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 print:p-0 print:space-y-4">
        
        {/* Title Block */}
        <div className="print:hidden">
          <h1 className="text-2xl font-black text-white">{t('db_reports')}</h1>
          <p className="text-slate-400 text-xs mt-1">
            {language === 'ar' ? 'توليد وتصدير التقارير المالية للحملة بصيغ متعددة مع تحديد نطاقات زمنية مرنة.' : 'Generate and export financial campaign reports in PDF, CSV, or Excel formats.'}
          </p>
        </div>

        {/* PRINT ONLY REPORT HEADER */}
        <div className="hidden print:flex flex-col gap-4 border-b border-slate-700 pb-4 text-slate-900" dir={language === 'ar' ? 'rtl' : 'ltr'}>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-950">{language === 'ar' ? 'تقرير التبرعات والمدفوعات الرسمي' : 'Official Donations & Payments Report'}</h2>
            <span className="text-xs text-slate-500 font-mono">Date Generated: {new Date().toLocaleDateString()}</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-500 font-bold block">{language === 'ar' ? 'الفترة المشمولة:' : 'Coverage Range:'}</span>
              <span className="text-slate-800 font-semibold">{reportRange.toUpperCase()} ({startDate} to {endDate})</span>
            </div>
            <div>
              <span className="text-slate-500 font-bold block">{language === 'ar' ? 'إجمالي التبرعات:' : 'Total Record Count:'}</span>
              <span className="text-slate-800 font-semibold">{items.length} ({approvedItems.length} Approved)</span>
            </div>
            <div>
              <span className="text-slate-500 font-bold block">{language === 'ar' ? 'إجمالي الأموال المحصلة:' : 'Total Funds Collected:'}</span>
              <span className="text-slate-800 font-black text-emerald-700">{totalApprovedSum.toLocaleString()} EGP</span>
            </div>
          </div>
        </div>

        {/* SETTINGS CARD */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-900 grid grid-cols-1 md:grid-cols-4 gap-4 items-end print:hidden">
          {/* Preset Range */}
          <div className="space-y-1.5">
            <label className="text-slate-350 text-xs font-semibold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>{language === 'ar' ? 'نطاق التقرير' : 'Report Interval'}</span>
            </label>
            <select
              value={reportRange}
              onChange={(e) => setReportRange(e.target.value as any)}
              className="w-full glass-input px-3 py-2.5 rounded-xl text-xs cursor-pointer"
            >
              <option value="daily">{language === 'ar' ? 'تقرير اليوم' : 'Daily'}</option>
              <option value="weekly">{language === 'ar' ? 'تقرير الأسبوع (7 أيام)' : 'Weekly'}</option>
              <option value="monthly">{language === 'ar' ? 'تقرير الشهر (30 يوم)' : 'Monthly'}</option>
              <option value="custom">{language === 'ar' ? 'تاريخ مخصص' : 'Custom Dates'}</option>
            </select>
          </div>

          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-slate-350 text-xs font-semibold">{language === 'ar' ? 'تاريخ البدء' : 'Start Date'}</label>
            <input 
              type="date"
              value={startDate}
              disabled={reportRange !== 'custom'}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full glass-input px-3 py-2.5 rounded-xl text-xs disabled:opacity-50"
            />
          </div>

          {/* End Date */}
          <div className="space-y-1.5">
            <label className="text-slate-350 text-xs font-semibold">{language === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}</label>
            <input 
              type="date"
              value={endDate}
              disabled={reportRange !== 'custom'}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full glass-input px-3 py-2.5 rounded-xl text-xs disabled:opacity-50"
            />
          </div>

          {/* Export Actions buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleExportXLSX}
              disabled={isLoading || items.length === 0 || isExporting}
              className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-extrabold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Excel</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={isLoading || items.length === 0 || isExporting}
              className="flex-1 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-50 text-slate-100 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4 text-emerald-450" />
              <span>CSV</span>
            </button>

            <button
              onClick={handlePrintReport}
              disabled={isLoading || items.length === 0}
              className="py-2.5 px-3 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-xl text-slate-100 transition-colors flex items-center justify-center"
            >
              <Printer className="w-4 h-4 text-teal-400" />
            </button>
          </div>
        </div>

        {/* FEEDBACK STATUS INDICATOR */}
        {exportMessage && (
          <div className="p-3 bg-emerald-950/20 border border-emerald-900/30 text-emerald-350 text-xs rounded-xl flex items-center gap-2 animate-scale-up print:hidden">
            <CheckCircle className="w-4 h-4" />
            <span>{exportMessage}</span>
          </div>
        )}

        {/* REPORT AGGREGATES CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
          <div className="glass-panel p-4 rounded-xl border border-slate-900">
            <span className="text-slate-500 text-[10px] uppercase font-bold block">{language === 'ar' ? 'إجمالي طلبات الفترة' : 'Period Total Submissions'}</span>
            <p className="text-xl font-bold text-white mt-1">{items.length}</p>
          </div>
          <div className="glass-panel p-4 rounded-xl border border-slate-900">
            <span className="text-slate-500 text-[10px] uppercase font-bold block">{language === 'ar' ? 'الطلبات المعتمدة' : 'Verified & Approved'}</span>
            <p className="text-xl font-bold text-white mt-1">{approvedItems.length}</p>
          </div>
          <div className="glass-panel p-4 rounded-xl border border-slate-900">
            <span className="text-slate-500 text-[10px] uppercase font-bold block">{language === 'ar' ? 'الأموال الموثقة للفترة' : 'Verified Period Total'}</span>
            <p className="text-xl font-bold text-emerald-450 mt-1">{totalApprovedSum.toLocaleString()} EGP</p>
          </div>
        </div>

        {/* PREVIEW RECORDS DATA TABLE */}
        <div className="glass-panel rounded-2xl border border-slate-900 overflow-hidden print:border-none print:shadow-none print:bg-white print:text-black">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-900 print:border-slate-300 bg-slate-900/20 print:bg-slate-100 text-slate-400 print:text-slate-800 text-xs font-bold">
                  <th className="px-5 py-3 text-start">{language === 'ar' ? 'المتبرع' : 'Donor'}</th>
                  <th className="px-5 py-3 text-start">{language === 'ar' ? 'الهاتف' : 'Phone'}</th>
                  <th className="px-5 py-3 text-start">{language === 'ar' ? 'القيمة' : 'Amount'}</th>
                  <th className="px-5 py-3 text-start">{language === 'ar' ? 'طريقة التحويل' : 'Method'}</th>
                  <th className="px-5 py-3 text-start">{language === 'ar' ? 'مرجع التحويل' : 'Ref Number'}</th>
                  <th className="px-5 py-3 text-start">{language === 'ar' ? 'التحقق' : 'Verification'}</th>
                  <th className="px-5 py-3 text-start">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-5 py-3 text-start">{language === 'ar' ? 'التاريخ' : 'Date'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 print:divide-slate-200 text-xs print:text-slate-900">
                {isLoading ? (
                  <tr className="print:hidden">
                    <td colSpan={8} className="text-center py-6 text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-400" />
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-6 text-slate-500 print:text-slate-600">
                      {language === 'ar' ? 'لا توجد سجلات تبرعات في هذا النطاق الزمني.' : 'No donation records in this timeframe.'}
                    </td>
                  </tr>
                ) : (
                  items.map((d) => (
                    <tr key={d.id} className="print:bg-white">
                      <td className="px-5 py-3 text-white print:text-slate-950 font-bold">{d.donor?.name}</td>
                      <td className="px-5 py-3 font-mono text-slate-400 print:text-slate-600">{d.donor?.phone}</td>
                      <td className="px-5 py-3 font-bold text-white print:text-slate-900">{d.amount} EGP</td>
                      <td className="px-5 py-3 uppercase text-slate-400 print:text-slate-600 font-semibold">{d.payment_method.replace('_', ' ')}</td>
                      <td className="px-5 py-3 font-mono text-slate-400 print:text-slate-600">{d.transaction_ref || '—'}</td>
                      <td className="px-5 py-3 capitalize text-slate-400 print:text-slate-600">{d.verification_method || 'none'}</td>
                      <td className="px-5 py-3 font-bold">
                        <span className={`capitalize ${
                          d.status.includes('verified') ? 'text-emerald-550 print:text-emerald-700' : 'text-slate-400 print:text-slate-600'
                        }`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-450 print:text-slate-500">
                        {new Date(d.created_at).toLocaleDateString()}
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
