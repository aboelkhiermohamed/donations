'use client';

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Coins, Target, CheckCircle, Upload, Image } from 'lucide-react';

export default function AdminSettingsPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  // Form states
  const [targetAmount, setTargetAmount] = useState('');
  const [vodafoneCash, setVodafoneCash] = useState('');
  const [instapayAddress, setInstapayAddress] = useState('');
  const [instapayPhone, setInstapayPhone] = useState('');
  const [instapayLink, setInstapayLink] = useState('');
  const [instapayQrUrl, setInstapayQrUrl] = useState('');
  const [instapayQrFile, setInstapayQrFile] = useState<File | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // 1. Fetch Campaign and settings data
  const { data: config, isLoading } = useQuery({
    queryKey: ['adminConfigData'],
    queryFn: async () => {
      // Fetch active campaign
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('*')
        .limit(1)
        .maybeSingle();

      // Fetch payment settings
      const { data: settings } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'payment_accounts')
        .maybeSingle();

      return {
        campaign,
        settings: settings?.value || { 
          vodafone_cash: '01015339426', 
          instapay_address: '01015339426@instapay', 
          instapay_phone: '01015339426',
          instapay_payment_link: '',
          instapay_qr_url: ''
        }
      };
    }
  });

  // Populate form once data is loaded
  useEffect(() => {
    if (config) {
      setTargetAmount(String(config.campaign?.target_amount || '500000'));
      setVodafoneCash(config.settings.vodafone_cash || '01015339426');
      setInstapayAddress(config.settings.instapay_address || '01015339426@instapay');
      setInstapayPhone(config.settings.instapay_phone || '01015339426');
      setInstapayLink(config.settings.instapay_payment_link || '');
      setInstapayQrUrl(config.settings.instapay_qr_url || '');
    }
  }, [config]);

  // Save Handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // 1. Update Campaign Target Amount
      if (config?.campaign?.id) {
        const { error: campaignError } = await supabase
          .from('campaigns')
          .update({
            target_amount: Number(targetAmount),
            updated_at: new Date().toISOString()
          })
          .eq('id', config.campaign.id);
        
        if (campaignError) throw campaignError;
      }

      // Upload QR Code if a new file is chosen
      let finalQrUrl = instapayQrUrl;
      if (instapayQrFile) {
        const fileExt = instapayQrFile.name.split('.').pop();
        const fileName = `settings/instapay_qr_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, instapayQrFile);
          
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('receipts')
          .getPublicUrl(fileName);
          
        finalQrUrl = publicUrl;
        setInstapayQrUrl(finalQrUrl);
        setInstapayQrFile(null);
      }

      // 2. Update Payment settings in settings table
      const { error: settingsError } = await supabase
        .from('settings')
        .upsert({
          key: 'payment_accounts',
          value: {
            vodafone_cash: vodafoneCash.trim(),
            instapay_address: instapayAddress.trim(),
            instapay_phone: instapayPhone.trim(),
            instapay_payment_link: instapayLink.trim(),
            instapay_qr_url: finalQrUrl
          },
          updated_at: new Date().toISOString()
        });

      if (settingsError) throw settingsError;

      // 3. Log Audit Log
      await supabase.from('audit_logs').insert({
        admin_id: session?.user?.id || null,
        action: 'UPDATE_SYSTEM_SETTINGS',
        details: { targetAmount, vodafoneCash, instapayAddress, instapayPhone, instapayLink, instapayQrUrl: finalQrUrl }
      });

      // Refetch
      queryClient.invalidateQueries({ queryKey: ['adminConfigData'] });
      queryClient.invalidateQueries({ queryKey: ['campaign'] });
      queryClient.invalidateQueries({ queryKey: ['adminDashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['publicSettings'] });
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error(err);
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearDatabase = async () => {
    const promptMessage = language === 'ar' 
      ? "تنبيه هام جداً!\nهذا الإجراء سيقوم بحذف كافة التبرعات، المتبرعين، السجلات، والرسائل الواردة نهائياً ولا يمكن التراجع عنه.\n\nلتأكيد المسح، يرجى كتابة كلمة (مسح) في المربع أدناه:"
      : "CRITICAL WARNING!\nThis will permanently delete all donations, donors, transaction logs, and SMS messages. This action CANNOT be undone.\n\nTo confirm, type (DELETE) below:";
    
    const confirmationWord = language === 'ar' ? 'مسح' : 'DELETE';
    const userInput = prompt(promptMessage);
    
    if (userInput !== confirmationWord) {
      alert(language === 'ar' ? "تم إلغاء العملية. لم يتم إدخال كلمة التأكيد بشكل صحيح." : "Action cancelled. Confirmation word did not match.");
      return;
    }

    setIsClearing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Delete data from tables
      const { error: donationsErr } = await supabase
        .from('donations')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (donationsErr) throw donationsErr;

      const { error: donorsErr } = await supabase
        .from('donors')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (donorsErr) throw donorsErr;

      const { error: txErr } = await supabase
        .from('incoming_transactions')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (txErr) throw txErr;

      const { error: smsErr } = await supabase
        .from('sms_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (smsErr) throw smsErr;

      const { error: notifErr } = await supabase
        .from('notifications')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (notifErr) throw notifErr;

      const { error: reportsErr } = await supabase
        .from('report_exports')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (reportsErr) throw reportsErr;

      const { error: campaignErr } = await supabase
        .from('campaigns')
        .update({ collected_amount: 0 })
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (campaignErr) throw campaignErr;

      const { error: auditErr } = await supabase
        .from('audit_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (auditErr) throw auditErr;

      await supabase.from('audit_logs').insert({
        admin_id: session?.user?.id || null,
        action: 'CLEAR_DATABASE',
        details: { timestamp: new Date().toISOString() }
      });

      alert(language === 'ar' ? "تم مسح قاعدة البيانات وتهيئة النظام بنجاح!" : "Database cleared and platform reset successfully!");
      
      queryClient.invalidateQueries({ queryKey: ['adminConfigData'] });
      queryClient.invalidateQueries({ queryKey: ['campaign'] });
      queryClient.invalidateQueries({ queryKey: ['adminDashboardStats'] });
    } catch (err: any) {
      console.error("Error clearing database:", err);
      alert(`Clear failed: ${err.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div className="h-10 w-48 bg-slate-900 rounded-lg animate-pulse" />
          <div className="h-80 bg-slate-900 rounded-2xl animate-pulse" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        
        {/* Title */}
        <div>
          <h1 className="text-2xl font-black text-white">
            {language === 'ar' ? 'إعدادات المنصة والحسابات' : 'System & Accounts Settings'}
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            {language === 'ar' ? 'تعديل المبلغ المستهدف للحملة وأرقام حسابات الدفع التلقائي.' : 'Edit campaign target thresholds and update transaction payment account credentials.'}
          </p>
        </div>

        {/* Success Alert */}
        {saveSuccess && (
          <div className="p-4 bg-emerald-950/20 border border-emerald-900/30 text-emerald-350 text-xs rounded-xl flex items-center gap-2 animate-scale-up">
            <CheckCircle className="w-5 h-5 text-emerald-450" />
            <span>{language === 'ar' ? 'تم حفظ التغييرات بنجاح وتحديث كافة الأنظمة!' : 'Settings updated and synced successfully!'}</span>
          </div>
        )}

        {/* Form Card */}
        <form onSubmit={handleSave} className="glass-panel p-6 rounded-2xl border border-slate-900 space-y-6">
          
          {/* Target Amount */}
          <div className="space-y-2">
            <label className="text-slate-300 text-xs font-semibold flex items-center gap-1.5">
              <Target className="w-4 h-4 text-emerald-400" />
              <span>{language === 'ar' ? 'المبلغ المستهدف للحملة (EGP)' : 'Campaign Target Amount (EGP)'}</span>
            </label>
            <input 
              type="number"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              required
              min="1"
              className="w-full glass-input px-4 py-3 rounded-xl text-sm"
              placeholder="e.g. 500000"
            />
          </div>

          {/* Vodafone Cash */}
          <div className="space-y-2">
            <label className="text-slate-300 text-xs font-semibold flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-emerald-450" />
              <span>{language === 'ar' ? 'رقم محفظة فودافون كاش' : 'Vodafone Cash Number'}</span>
            </label>
            <input 
              type="text"
              value={vodafoneCash}
              onChange={(e) => setVodafoneCash(e.target.value)}
              required
              className="w-full glass-input px-4 py-3 rounded-xl text-sm font-mono"
              placeholder="e.g. 01015339426"
            />
          </div>

          {/* InstaPay */}
          <div className="space-y-2">
            <label className="text-slate-300 text-xs font-semibold flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-teal-400" />
              <span>{language === 'ar' ? 'عنوان حساب إنستاباي (InstaPay Address)' : 'InstaPay Address'}</span>
            </label>
            <input 
              type="text"
              value={instapayAddress}
              onChange={(e) => setInstapayAddress(e.target.value)}
              required
              className="w-full glass-input px-4 py-3 rounded-xl text-sm font-mono"
              placeholder="e.g. 01015339426@instapay"
            />
          </div>

          {/* InstaPay Phone */}
          <div className="space-y-2">
            <label className="text-slate-300 text-xs font-semibold flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-teal-400" />
              <span>{language === 'ar' ? 'رقم هاتف حساب إنستاباي (InstaPay Phone Number)' : 'InstaPay Phone Number'}</span>
            </label>
            <input 
              type="text"
              value={instapayPhone}
              onChange={(e) => setInstapayPhone(e.target.value)}
              required
              className="w-full glass-input px-4 py-3 rounded-xl text-sm font-mono"
              placeholder="e.g. 01015339426"
            />
          </div>

          {/* InstaPay Payment Link */}
          <div className="space-y-2">
            <label className="text-slate-300 text-xs font-semibold flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-teal-400" />
              <span>{language === 'ar' ? 'رابط الدفع المباشر إنستاباي (InstaPay Payment Link)' : 'Direct InstaPay Payment Link'}</span>
            </label>
            <input 
              type="text"
              value={instapayLink}
              onChange={(e) => setInstapayLink(e.target.value)}
              className="w-full glass-input px-4 py-3 rounded-xl text-sm font-mono"
              placeholder="e.g. https://ipn.eg/S/..."
              dir="ltr"
            />
          </div>

          {/* InstaPay QR Code Upload */}
          <div className="space-y-2">
            <label className="text-slate-300 text-xs font-semibold flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-teal-400" />
              <span>{language === 'ar' ? 'تحميل صورة رمز الاستجابة السريعة (InstaPay QR Code Image)' : 'Upload InstaPay QR Code Image'}</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="flex-1 w-full font-sans">
                <input 
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setInstapayQrFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-slate-300 hover:file:bg-slate-800"
                />
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                  {language === 'ar' ? 'الصيغ المدعومة: PNG, JPG. سيتم استخدام هذه الصورة كـ رمز QR ثابت للمتبرعين.' : 'Supported formats: PNG, JPG. Used as a static QR code.'}
                </p>
              </div>
              
              {/* Preview */}
              {(instapayQrFile || instapayQrUrl) && (
                <div className="w-20 h-20 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex items-center justify-center p-1.5 flex-shrink-0">
                  <img 
                    src={instapayQrFile ? URL.createObjectURL(instapayQrFile) : instapayQrUrl} 
                    alt="QR Preview" 
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Save Button */}
          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-extrabold text-sm py-4 rounded-xl shadow-lg shadow-emerald-500/20 hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{language === 'ar' ? 'جاري الحفظ...' : 'Saving Changes...'}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{language === 'ar' ? 'حفظ التعديلات' : 'Save Settings'}</span>
              </>
            )}
          </button>

        </form>

        {/* Danger Zone */}
        <div className="glass-panel p-6 rounded-2xl border border-red-900/30 bg-red-950/5 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-red-400">
              {language === 'ar' ? 'إجراءات خطيرة (Danger Zone)' : 'Danger Zone'}
            </h3>
            <p className="text-slate-400 text-xs mt-1">
              {language === 'ar' 
                ? 'إجراءات مدمرة لقاعدة البيانات لقفل الحسابات الحالية والبدء من جديد. يرجى الحذر قبل الاستخدام.' 
                : 'Destructive database operations. Please proceed with caution.'}
            </p>
          </div>

          <div className="border-t border-red-950/20 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-start">
              <p className="text-sm font-semibold text-white">
                {language === 'ar' ? 'تهيئة قاعدة البيانات (مسح كامل البيانات)' : 'Reset Database (Clear All Data)'}
              </p>
              <p className="text-slate-400 text-xs">
                {language === 'ar' 
                  ? 'حذف كافة التبرعات، المتبرعين، السجلات، والرسائل وبدء حملة جديدة من الصفر.' 
                  : 'Permanently deletes all donations, donors, messages, and logs.'}
              </p>
            </div>
            
            <button
              type="button"
              onClick={handleClearDatabase}
              disabled={isClearing}
              className="w-full sm:w-auto px-6 py-3 bg-red-950/40 hover:bg-red-900/40 border border-red-900 text-red-300 hover:text-white font-extrabold text-sm rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {isClearing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                  <span>{language === 'ar' ? 'جاري المسح...' : 'Clearing...'}</span>
                </>
              ) : (
                <span>{language === 'ar' ? 'مسح قاعدة البيانات' : 'Clear Database'}</span>
              )}
            </button>
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
