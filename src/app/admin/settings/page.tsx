'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  getAllPaymentMethods, 
  savePaymentMethods, 
  DEFAULT_PAYMENT_METHODS 
} from '@/lib/paymentService';
import { PaymentMethodConfig, WalletConfig } from '@/types';
import { 
  Save, 
  Loader2, 
  Target, 
  Infinity,
  CheckCircle2, 
  Smartphone, 
  CreditCard,
  Plus, 
  Trash2, 
  Edit3, 
  Copy, 
  Check, 
  ArrowUp, 
  ArrowDown, 
  Eye, 
  Wrench, 
  AlertCircle, 
  X,
  ExternalLink,
  Users,
  UserPlus,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Key,
  Mail,
  User
} from 'lucide-react';

export default function AdminSettingsPage() {
  const { language, dir, t } = useLanguage();
  const queryClient = useQueryClient();

  // Campaign Settings
  const [targetAmount, setTargetAmount] = useState('100000');
  const [isUnlimitedTarget, setIsUnlimitedTarget] = useState(false);
  const [isSavingTarget, setIsSavingTarget] = useState(false);
  const [targetSaveSuccess, setTargetSaveSuccess] = useState(false);
  const [campaignTitleAr, setCampaignTitleAr] = useState('');
  const [campaignDescAr, setCampaignDescAr] = useState('');

  // Payment Methods State
  const [methods, setMethods] = useState<PaymentMethodConfig[]>(DEFAULT_PAYMENT_METHODS);

  // Wallet Modal State
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [walletLabel, setWalletLabel] = useState('');
  const [walletPhone, setWalletPhone] = useState('');
  const [walletEnabled, setWalletEnabled] = useState(true);
  const [walletError, setWalletError] = useState('');

  // InstaPay QR file upload
  const [instapayQrFile, setInstapayQrFile] = useState<File | null>(null);
  const [instapayQrPreview, setInstapayQrPreview] = useState<string | null>(null);

  // Maintenance Mode States
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessageAr, setMaintenanceMessageAr] = useState('');
  const [maintenanceMessageEn, setMaintenanceMessageEn] = useState('');
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);
  const [maintenanceSaveSuccess, setMaintenanceSaveSuccess] = useState(false);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Admins state
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'admin' | 'superadmin'>('admin');
  const [adminFormError, setAdminFormError] = useState('');
  const [isSubmittingAdmin, setIsSubmittingAdmin] = useState(false);
  const [isDeletingAdminId, setIsDeletingAdminId] = useState<string | null>(null);

  // Reset Data Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmationInput, setResetConfirmationInput] = useState('');
  const [isResettingData, setIsResettingData] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');
  const [resetErrorMessage, setResetErrorMessage] = useState('');

  // Public Preview Tab
  const [previewMethod, setPreviewMethod] = useState<string>('vodafone_cash');

  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  // Fetch Admins List
  const { data: adminsData, isLoading: isLoadingAdmins, refetch: refetchAdmins } = useQuery({
    queryKey: ['adminUsersList'],
    queryFn: async () => {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch admins');
      }
      return res.json();
    },
  });

  // 1. Fetch Campaign and Payment Config Data
  const { data: config, isLoading } = useQuery({
    queryKey: ['adminFullSettings'],
    queryFn: async () => {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('*')
        .limit(1)
        .maybeSingle();

      const paymentMethodsList = await getAllPaymentMethods(supabase);

      const { data: maintenance } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'maintenance_mode')
        .maybeSingle();

      const { data: targetSetting } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'campaign_target')
        .maybeSingle();

      return {
        campaign,
        paymentMethods: paymentMethodsList,
        maintenance: maintenance?.value || { enabled: false, message_ar: '', message_en: '' },
        targetSetting: targetSetting?.value || null,
      };
    },
  });

  // Populate state on load
  useEffect(() => {
    if (config) {
      if (config.targetSetting) {
        setIsUnlimitedTarget(config.targetSetting.is_unlimited ?? false);
        if (config.targetSetting.target_amount) {
          setTargetAmount(String(config.targetSetting.target_amount));
        }
      } else if (config.campaign) {
        setTargetAmount(String(config.campaign.target_amount || '100000'));
      }
      if (config.campaign) {
        setCampaignTitleAr(config.campaign.name_ar || '');
        setCampaignDescAr(config.campaign.description_ar || '');
      }
      if (config.paymentMethods && config.paymentMethods.length > 0) {
        setMethods(config.paymentMethods);
      }
      if (config.maintenance) {
        setMaintenanceEnabled(config.maintenance.enabled || false);
        setMaintenanceMessageAr(config.maintenance.message_ar || '');
        setMaintenanceMessageEn(config.maintenance.message_en || '');
      }
    }
  }, [config]);

  // VFC Wallets helper
  const vfcMethod = useMemo(() => {
    return methods.find(m => m.method_key === 'vodafone_cash') || methods[0];
  }, [methods]);

  const ipnMethod = useMemo(() => {
    return methods.find(m => m.method_key === 'instapay') || methods[1];
  }, [methods]);

  // Copy handler
  const handleCopy = (text: string, key: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  };

  // Toggle Master Method Enabled
  const handleToggleMethod = (methodKey: string) => {
    setMethods(prev =>
      prev.map(m => (m.method_key === methodKey ? { ...m, enabled: !m.enabled } : m))
    );
  };

  // Toggle Wallet Enabled
  const handleToggleWallet = (walletId: string) => {
    setMethods(prev =>
      prev.map(m => {
        if (m.method_key === 'vodafone_cash' && m.wallets) {
          return {
            ...m,
            wallets: m.wallets.map(w =>
              w.id === walletId ? { ...w, enabled: !w.enabled } : w
            ),
          };
        }
        return m;
      })
    );
  };

  // Move Wallet Up / Down
  const handleMoveWallet = (walletId: string, direction: 'up' | 'down') => {
    setMethods(prev =>
      prev.map(m => {
        if (m.method_key === 'vodafone_cash' && m.wallets) {
          const list = [...m.wallets];
          const idx = list.findIndex(w => w.id === walletId);
          if (idx < 0) return m;

          const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (targetIdx < 0 || targetIdx >= list.length) return m;

          const temp = list[idx];
          list[idx] = list[targetIdx];
          list[targetIdx] = temp;

          // Re-index display_order
          const reordered = list.map((w, i) => ({ ...w, display_order: i + 1 }));
          return { ...m, wallets: reordered };
        }
        return m;
      })
    );
  };

  // Delete Wallet
  const handleDeleteWallet = (walletId: string) => {
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد من حذف رقم هذه المحفظة؟' : 'Are you sure you want to delete this wallet?')) {
      return;
    }

    setMethods(prev =>
      prev.map(m => {
        if (m.method_key === 'vodafone_cash' && m.wallets) {
          const filtered = m.wallets.filter(w => w.id !== walletId);
          const reordered = filtered.map((w, i) => ({ ...w, display_order: i + 1 }));
          return { ...m, wallets: reordered };
        }
        return m;
      })
    );
  };

  // Open Wallet Modal for Add or Edit
  const handleOpenWalletModal = (wallet?: WalletConfig) => {
    setWalletError('');
    if (wallet) {
      setEditingWalletId(wallet.id);
      setWalletLabel(wallet.label || '');
      setWalletPhone(wallet.phone_number || '');
      setWalletEnabled(wallet.enabled !== false);
    } else {
      setEditingWalletId(null);
      const nextNum = (vfcMethod?.wallets?.length || 0) + 1;
      setWalletLabel(`محفظة فودافون كاش (${nextNum})`);
      setWalletPhone('');
      setWalletEnabled(true);
    }
    setIsWalletModalOpen(true);
  };

  // Save Wallet in Modal
  const handleSaveWalletModal = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = walletPhone.trim().replace(/\s+/g, '');
    const egPhoneRegex = /^01[0125]\d{8}$/;

    if (!cleanPhone) {
      setWalletError(language === 'ar' ? 'رقم الهاتف مطلوب' : 'Phone number is required');
      return;
    }
    if (!egPhoneRegex.test(cleanPhone)) {
      setWalletError(language === 'ar' ? 'يرجى إدخال رقم محفظة فودافون كاش مصري صحيح (11 رقم يبدأ بـ 010/011/012/015)' : 'Please enter a valid 11-digit Egyptian mobile number');
      return;
    }

    // Check duplicate phone numbers in other active wallets
    const currentWallets = vfcMethod?.wallets || [];
    const isDuplicate = currentWallets.some(
      w => w.id !== editingWalletId && w.phone_number === cleanPhone
    );
    if (isDuplicate) {
      setWalletError(language === 'ar' ? 'هذا الرقم مضاف بالفعل في قائمة المحافظ' : 'This wallet number already exists in the list');
      return;
    }

    setMethods(prev =>
      prev.map(m => {
        if (m.method_key === 'vodafone_cash') {
          const list = m.wallets ? [...m.wallets] : [];
          if (editingWalletId) {
            // Edit existing
            const updated = list.map(w =>
              w.id === editingWalletId
                ? {
                    ...w,
                    label: walletLabel.trim() || `محفظة ${cleanPhone}`,
                    phone_number: cleanPhone,
                    enabled: walletEnabled,
                  }
                : w
            );
            return { ...m, wallets: updated };
          } else {
            // Add new
            const newWallet: WalletConfig = {
              id: `wallet_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              label: walletLabel.trim() || `محفظة ${cleanPhone}`,
              phone_number: cleanPhone,
              enabled: walletEnabled,
              display_order: list.length + 1,
            };
            return { ...m, wallets: [...list, newWallet] };
          }
        }
        return m;
      })
    );

    setIsWalletModalOpen(false);
  };

  // Update InstaPay Config field
  const handleUpdateInstapayConfig = (field: string, value: string) => {
    setMethods(prev =>
      prev.map(m => {
        if (m.method_key === 'instapay') {
          return {
            ...m,
            configuration: {
              ...m.configuration,
              [field]: value,
            },
          };
        }
        return m;
      })
    );
  };

  // QR Upload Handler
  const handleQrFileChange = (file: File | null) => {
    setInstapayQrFile(file);
    if (file) {
      setInstapayQrPreview(URL.createObjectURL(file));
    } else {
      setInstapayQrPreview(null);
    }
  };

  // Master Save (Campaign + Payment Methods)
  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      let finalMethods = [...methods];

      // If user uploaded a new QR file for InstaPay
      if (instapayQrFile) {
        const fileExt = instapayQrFile.name.split('.').pop() || 'png';
        const fileName = `instapay_qr_${Date.now()}.${fileExt}`;
        const filePath = `settings/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, instapayQrFile);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('receipts')
            .getPublicUrl(filePath);

          finalMethods = finalMethods.map(m => {
            if (m.method_key === 'instapay') {
              return {
                ...m,
                configuration: {
                  ...m.configuration,
                  instapay_qr_url: urlData.publicUrl,
                },
              };
            }
            return m;
          });
        }
      }

      const parsedAmount = parseFloat(targetAmount.replace(/\D/g, '')) || 100000;

      // 1. Save Target Setting to settings table
      await supabase.from('settings').upsert({
        key: 'campaign_target',
        value: {
          is_unlimited: isUnlimitedTarget,
          target_amount: parsedAmount,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

      // 2. Update Campaign Details
      if (config?.campaign?.id) {
        await supabase
          .from('campaigns')
          .update({
            target_amount: parsedAmount,
            name_ar: campaignTitleAr || undefined,
            description_ar: campaignDescAr || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.campaign.id);
      }

      // 3. Save Payment Methods via Centralized Service
      await savePaymentMethods(supabase, finalMethods);

      queryClient.invalidateQueries({ queryKey: ['adminFullSettings'] });
      queryClient.invalidateQueries({ queryKey: ['adminCampaignData'] });
      queryClient.invalidateQueries({ queryKey: ['campaignSummaryPublic'] });
      queryClient.invalidateQueries({ queryKey: ['paymentSettingsPublic'] });
      queryClient.invalidateQueries({ queryKey: ['campaignPublic'] });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(`Error saving: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Save Campaign Target Directly
  const handleSaveTarget = async () => {
    setIsSavingTarget(true);
    setTargetSaveSuccess(false);
    try {
      const parsedAmount = parseFloat(targetAmount.replace(/\D/g, '')) || 100000;
      
      // 1. Save to settings table
      await supabase.from('settings').upsert({
        key: 'campaign_target',
        value: {
          is_unlimited: isUnlimitedTarget,
          target_amount: parsedAmount,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

      // 2. Update campaigns table
      if (config?.campaign?.id) {
        await supabase.from('campaigns').update({
          target_amount: parsedAmount,
          updated_at: new Date().toISOString(),
        }).eq('id', config.campaign.id);
      }

      queryClient.invalidateQueries({ queryKey: ['adminFullSettings'] });
      queryClient.invalidateQueries({ queryKey: ['adminCampaignData'] });
      queryClient.invalidateQueries({ queryKey: ['campaignSummaryPublic'] });
      queryClient.invalidateQueries({ queryKey: ['campaignPublic'] });

      setTargetSaveSuccess(true);
      setTimeout(() => setTargetSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(`خطأ أثناء الحفظ: ${err.message}`);
    } finally {
      setIsSavingTarget(false);
    }
  };

  // Save Maintenance Mode
  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingMaintenance(true);
    setMaintenanceSaveSuccess(false);

    try {
      await supabase
        .from('settings')
        .upsert({
          key: 'maintenance_mode',
          value: {
            enabled: maintenanceEnabled,
            message_ar: maintenanceMessageAr.trim(),
            message_en: maintenanceMessageEn.trim(),
          },
          updated_at: new Date().toISOString(),
        });

      queryClient.invalidateQueries({ queryKey: ['maintenanceMode'] });
      setMaintenanceSaveSuccess(true);
      setTimeout(() => setMaintenanceSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(`Error saving maintenance: ${err.message}`);
    } finally {
      setIsSavingMaintenance(false);
    }
  };

  // Add new administrator
  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminFormError('');
    setIsSubmittingAdmin(true);

    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newAdminName,
          email: newAdminEmail,
          password: newAdminPassword,
          role: newAdminRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create admin');
      }

      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      setNewAdminRole('admin');
      setIsAdminModalOpen(false);
      refetchAdmins();
      alert(language === 'ar' ? 'تم إضافة المشرف بنجاح!' : 'Admin added successfully!');
    } catch (err: any) {
      setAdminFormError(err.message);
    } finally {
      setIsSubmittingAdmin(false);
    }
  };

  // Delete administrator
  const handleDeleteAdmin = async (adminId: string, adminName: string) => {
    if (!confirm(language === 'ar' ? `هل أنت متأكد من حذف المشرف (${adminName})؟` : `Are you sure you want to delete ${adminName}?`)) {
      return;
    }

    setIsDeletingAdminId(adminId);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/admin/users?id=${adminId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete admin');
      }

      refetchAdmins();
      alert(language === 'ar' ? 'تم حذف المشرف بنجاح.' : 'Admin deleted successfully.');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsDeletingAdminId(null);
    }
  };

  // Reset database test data
  const handleResetData = async () => {
    setResetErrorMessage('');
    setIsResettingData(true);

    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/reset-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmation: resetConfirmationInput }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset data');
      }

      setResetSuccessMessage(data.message || 'تم تصفير البيانات بنجاح.');
      setResetConfirmationInput('');
      setIsResetModalOpen(false);
      
      // Invalidate all queries across entire app
      queryClient.invalidateQueries();
      alert(data.message || 'تم تصفير كافة البيانات التجريبية بنجاح.');
    } catch (err: any) {
      setResetErrorMessage(err.message);
    } finally {
      setIsResettingData(false);
    }
  };

  // Preview data computed
  const activeWalletsPreview = useMemo(() => {
    return (vfcMethod?.wallets || []).filter(w => w.enabled);
  }, [vfcMethod]);

  return (
    <AdminLayout>
      <div className="space-y-10 max-w-5xl">
        
        {/* Header */}
        <div className="pb-3 border-b border-[#EAE8DE] dark:border-[#283849] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#153C32] dark:text-[#24B58A] tracking-tight">
              {language === 'ar' ? 'إدارة وسائل الدفع والمحافظ' : 'Dynamic Payment Management'}
            </h1>
            <p className="text-xs sm:text-sm text-[#738079] dark:text-[#A7B4B0] mt-1">
              {language === 'ar'
                ? 'إضافة عدد لا محدود من محافظ فودافون كاش، التحكم في تفعيل القنوات، وتحديث حسابات التحويل فوريًا.'
                : 'Manage unlimited Vodafone Cash wallets, toggle payment channels, and configure instant transfer endpoints.'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-xs font-bold hover:bg-[#1C4E41] dark:hover:bg-[#1fa37b] shadow-subtle disabled:opacity-50 transition-all"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{language === 'ar' ? 'حفظ كافة التغييرات' : 'Save All Changes'}</span>
          </button>
        </div>

        {/* 1. PAYMENT METHODS MASTER SWITCHES */}
        <section className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#EAE8DE] dark:border-[#283849]">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#153C32] dark:text-[#24B58A]" />
              <h3 className="font-extrabold text-base text-[#153C32] dark:text-[#F3F5F4]">
                {language === 'ar' ? '1. القنوات والوسائل المتاحة (Payment Channels)' : '1. Payment Channels'}
              </h3>
            </div>
            <span className="text-xs text-[#738079] dark:text-[#A7B4B0]">
              {language === 'ar' ? 'التحكم في ظهور الوسيلة على الموقع العام' : 'Public Channel Visibility'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Vodafone Cash Channel Toggle */}
            <div className={`p-4 rounded-2xl border transition-all ${
              vfcMethod?.enabled
                ? 'bg-[#FAF9F5] dark:bg-[#111C2D] border-[#153C32]/30 dark:border-[#24B58A]/30'
                : 'bg-gray-50 dark:bg-[#0B1220] border-gray-200 dark:border-[#283849] opacity-75'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold text-xs">
                    VFC
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#191F1C] dark:text-[#F3F5F4]">فودافون كاش</h4>
                    <span className="text-xs text-[#738079] dark:text-[#A7B4B0]">
                      {activeWalletsPreview.length} {language === 'ar' ? 'محافظ نشطة' : 'Active Wallets'}
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vfcMethod?.enabled}
                    onChange={() => handleToggleMethod('vodafone_cash')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#153C32] dark:peer-checked:bg-[#24B58A]"></div>
                </label>
              </div>
            </div>

            {/* InstaPay Channel Toggle */}
            <div className={`p-4 rounded-2xl border transition-all ${
              ipnMethod?.enabled
                ? 'bg-[#FAF9F5] dark:bg-[#111C2D] border-[#B79B68]/30 dark:border-[#C5A876]/30'
                : 'bg-gray-50 dark:bg-[#0B1220] border-gray-200 dark:border-[#283849] opacity-75'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#B79B68] text-white flex items-center justify-center font-bold text-xs">
                    IPN
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#191F1C] dark:text-[#F3F5F4]">إنستاباي (InstaPay)</h4>
                    <span className="text-xs text-[#738079] dark:text-[#A7B4B0]">
                      {ipnMethod?.configuration?.instapay_address || '—'}
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ipnMethod?.enabled}
                    onChange={() => handleToggleMethod('instapay')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#B79B68] dark:peer-checked:bg-[#C5A876]"></div>
                </label>
              </div>
            </div>

          </div>
        </section>

        {/* 2. DYNAMIC VODAFONE CASH WALLETS MANAGEMENT */}
        <section className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EAE8DE] dark:border-[#283849]">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-[#153C32] dark:text-[#24B58A]" />
              <div>
                <h3 className="font-extrabold text-base text-[#153C32] dark:text-[#F3F5F4]">
                  {language === 'ar' ? '2. إدارة محافظ فودافون كاش الديناميكية' : '2. Dynamic Vodafone Cash Wallets'}
                </h3>
                <span className="text-xs text-[#738079] dark:text-[#A7B4B0]">
                  {language === 'ar' ? 'يمكنك إضافة عدد غير محدود من المحافظ، تفعيلها، وإعادة ترتيب أولويتها.' : 'Add unlimited wallets, toggle them, or reorder priority.'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleOpenWalletModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-xs font-bold hover:bg-[#1C4E41] shadow-subtle transition-all self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'ar' ? '+ إضافة رقم محفظة جديد' : '+ Add New Wallet'}</span>
            </button>
          </div>

          {/* Wallets List */}
          {(vfcMethod?.wallets || []).length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-dashed border-[#DDD9CC] dark:border-[#283849]">
              <AlertCircle className="w-8 h-8 text-[#B79B68] mx-auto mb-2" />
              <p className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                {language === 'ar' ? 'لا توجد أي محافظ مضافة حاليًا.' : 'No wallets configured.'}
              </p>
              <p className="text-xs text-[#738079] dark:text-[#A7B4B0] mt-1">
                {language === 'ar' ? 'انقر على زر "إضافة رقم محفظة جديد" للبدء في استقبال التحويلات.' : 'Click "Add New Wallet" to start receiving transfers.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(vfcMethod?.wallets || []).map((wallet, idx) => (
                <div
                  key={wallet.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    wallet.enabled
                      ? 'bg-[#FAF9F5] dark:bg-[#111C2D] border-[#DDD9CC] dark:border-[#283849]'
                      : 'bg-gray-50 dark:bg-[#0B1220] border-gray-200 dark:border-[#283849] opacity-60'
                  }`}
                >
                  {/* Left: Info */}
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#153C32]/10 dark:bg-[#24B58A]/10 text-[#153C32] dark:text-[#24B58A] font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#191F1C] dark:text-[#F3F5F4]">
                          {wallet.label}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          wallet.enabled
                            ? 'bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300'
                            : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
                        }`}>
                          {wallet.enabled ? 'نشط ويظهر للمتبرعين' : 'معطل مؤقتًا'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-base font-bold text-[#153C32] dark:text-[#24B58A]" dir="ltr">
                          {wallet.phone_number}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(wallet.phone_number, wallet.id)}
                          className="text-[#738079] hover:text-[#153C32] dark:hover:text-[#24B58A]"
                          title="نسخ الرقم"
                        >
                          {copiedKey === wallet.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    {/* Reorder Buttons */}
                    <div className="flex items-center border border-[#DDD9CC] dark:border-[#283849] rounded-lg overflow-hidden bg-white dark:bg-[#172436] me-2">
                      <button
                        type="button"
                        onClick={() => handleMoveWallet(wallet.id, 'up')}
                        disabled={idx === 0}
                        className="p-1.5 hover:bg-[#FAF9F5] dark:hover:bg-[#111C2D] disabled:opacity-30 text-[#738079]"
                        title="تحريك لأعلى"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveWallet(wallet.id, 'down')}
                        disabled={idx === (vfcMethod?.wallets?.length || 0) - 1}
                        className="p-1.5 hover:bg-[#FAF9F5] dark:hover:bg-[#111C2D] disabled:opacity-30 text-[#738079] border-s border-[#DDD9CC] dark:border-[#283849]"
                        title="تحريك لأسفل"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Active toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleWallet(wallet.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        wallet.enabled
                          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-950/40 dark:text-green-300'
                      }`}
                    >
                      {wallet.enabled ? 'تعطيل' : 'تفعيل'}
                    </button>

                    {/* Edit button */}
                    <button
                      type="button"
                      onClick={() => handleOpenWalletModal(wallet)}
                      className="p-2 rounded-lg border border-[#DDD9CC] dark:border-[#283849] bg-white dark:bg-[#172436] text-[#738079] hover:text-[#153C32] dark:hover:text-[#24B58A]"
                      title="تعديل المحفظة"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteWallet(wallet.id)}
                      className="p-2 rounded-lg border border-red-200 dark:border-red-900/40 bg-white dark:bg-[#172436] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      title="حذف المحفظة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. INSTAPAY CONFIGURATION */}
        <section className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-[#EAE8DE] dark:border-[#283849]">
            <CreditCard className="w-5 h-5 text-[#B79B68]" />
            <h3 className="font-extrabold text-base text-[#153C32] dark:text-[#F3F5F4]">
              {language === 'ar' ? '3. بيانات حساب إنستاباي (InstaPay Configuration)' : '3. InstaPay Configuration'}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">{t('instapay_acc')}</label>
              <input
                type="text"
                value={ipnMethod?.configuration?.instapay_address || ''}
                onChange={e => handleUpdateInstapayConfig('instapay_address', e.target.value)}
                placeholder="name@instapay"
                dir="ltr"
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] font-mono text-sm font-bold text-[#153C32] dark:text-[#24B58A] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">{t('instapay_phone')}</label>
              <input
                type="text"
                value={ipnMethod?.configuration?.instapay_phone || ''}
                onChange={e => handleUpdateInstapayConfig('instapay_phone', e.target.value)}
                placeholder="01012345678"
                dir="ltr"
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] font-mono text-sm font-bold text-[#153C32] dark:text-[#24B58A] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
              {language === 'ar' ? 'رابط الدفع المباشر لتطبيق إنستاباي (اختياري)' : 'Direct Payment Link (Optional)'}
            </label>
            <input
              type="url"
              value={ipnMethod?.configuration?.instapay_payment_link || ''}
              onChange={e => handleUpdateInstapayConfig('instapay_payment_link', e.target.value)}
              placeholder="https://..."
              dir="ltr"
              className="w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-xs font-mono text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none"
            />
          </div>

          {/* QR Code Upload / Preview */}
          <div className="space-y-2 pt-2">
            <label className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
              {language === 'ar' ? 'رمز الاستجابة السريعة (QR Code):' : 'InstaPay QR Code:'}
            </label>
            <div className="flex items-center gap-4">
              {(instapayQrPreview || ipnMethod?.configuration?.instapay_qr_url) && (
                <img
                  src={instapayQrPreview || ipnMethod?.configuration?.instapay_qr_url}
                  alt="InstaPay QR"
                  className="w-20 h-20 rounded-xl object-contain border border-[#DDD9CC] dark:border-[#283849] p-1 bg-white"
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    handleQrFileChange(e.target.files[0]);
                  }
                }}
                className="text-xs text-[#738079] dark:text-[#A7B4B0]"
              />
            </div>
          </div>
        </section>

        {/* 4. LIVE PUBLIC PREVIEW */}
        <section className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#EAE8DE] dark:border-[#283849]">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-[#217A61] dark:text-[#24B58A]" />
              <h3 className="font-extrabold text-base text-[#153C32] dark:text-[#F3F5F4]">
                {language === 'ar' ? '4. معاينة حية لما سيظهر للمتبرعين على الموقع' : '4. Public Donor View Preview'}
              </h3>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FAF8F2] dark:bg-[#111C2D] text-[#B79B68] dark:text-[#C5A876] border border-[#B79B68]/30">
              معاينة فورية
            </span>
          </div>

          <div className="max-w-md mx-auto p-5 rounded-2xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] space-y-4">
            
            {/* If both disabled */}
            {!vfcMethod?.enabled && !ipnMethod?.enabled ? (
              <div className="p-6 text-center text-xs text-amber-700 dark:text-amber-400 font-bold space-y-1">
                <AlertCircle className="w-6 h-6 mx-auto mb-1 text-amber-600" />
                <span>وسائل التبرع معطلة مؤقتًا من قِبل إدارة الحملة.</span>
              </div>
            ) : (
              <>
                {/* Method selector tabs in preview */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-[#EAE8DE] dark:bg-[#172436] rounded-xl text-xs font-bold">
                  {vfcMethod?.enabled && activeWalletsPreview.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPreviewMethod('vodafone_cash')}
                      className={`py-2 px-3 rounded-lg ${
                        previewMethod === 'vodafone_cash'
                          ? 'bg-white dark:bg-[#111C2D] text-[#153C32] dark:text-[#24B58A] shadow-subtle'
                          : 'text-[#738079] dark:text-[#A7B4B0]'
                      }`}
                    >
                      فودافون كاش
                    </button>
                  )}
                  {ipnMethod?.enabled && (
                    <button
                      type="button"
                      onClick={() => setPreviewMethod('instapay')}
                      className={`py-2 px-3 rounded-lg ${
                        previewMethod === 'instapay'
                          ? 'bg-white dark:bg-[#111C2D] text-[#153C32] dark:text-[#24B58A] shadow-subtle'
                          : 'text-[#738079] dark:text-[#A7B4B0]'
                      }`}
                    >
                      InstaPay
                    </button>
                  )}
                </div>

                {/* Preview Content */}
                {previewMethod === 'vodafone_cash' && vfcMethod?.enabled ? (
                  activeWalletsPreview.length === 0 ? (
                    <div className="p-4 text-center text-xs text-amber-600 font-semibold">
                      تنبيه: محفظة فودافون كاش مفعلة ولكن لا توجد أرقام محافظ نشطة حاليًا!
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeWalletsPreview.map(w => (
                        <div key={w.id} className="p-3 rounded-xl bg-white dark:bg-[#172436] border border-[#DDD9CC] dark:border-[#283849] flex items-center justify-between">
                          <div>
                            <span className="text-xs text-[#738079] dark:text-[#A7B4B0] block">{w.label}</span>
                            <span className="font-mono font-bold text-sm text-[#153C32] dark:text-[#24B58A]">{w.phone_number}</span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-1 rounded bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849]">
                            نسخ
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                ) : ipnMethod?.enabled ? (
                  <div className="p-3 rounded-xl bg-white dark:bg-[#172436] border border-[#DDD9CC] dark:border-[#283849] space-y-1">
                    <span className="text-xs text-[#738079] dark:text-[#A7B4B0] block">عنوان إنستاباي</span>
                    <span className="font-mono font-bold text-sm text-[#153C32] dark:text-[#24B58A] block break-all">
                      {ipnMethod?.configuration?.instapay_address || '—'}
                    </span>
                  </div>
                ) : null}
              </>
            )}

          </div>
        </section>

        {/* 5. CAMPAIGN TARGET & MAINTENANCE */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Target Amount Box */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8DE] dark:border-[#283849]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-[#153C32] dark:text-[#24B58A] flex items-center justify-center">
                  <Target className="w-4 h-4 text-[#153C32] dark:text-[#24B58A]" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#153C32] dark:text-[#F3F5F4]">
                    {language === 'ar' ? 'المبلغ المستهدف للحملة' : 'Campaign Target Goal'}
                  </h3>
                  <span className="text-[11px] text-[#738079] dark:text-[#A7B4B0]">
                    {language === 'ar' ? 'حدد سقفاً مالياً أو اجعل الحملة مستمرة ومفتوحة' : 'Set a financial goal or keep the campaign ongoing'}
                  </span>
                </div>
              </div>

              {/* Status Pill */}
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                isUnlimitedTarget 
                  ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
              }`}>
                {isUnlimitedTarget ? '♾️ هدف مفتوح' : '🎯 هدف محدد'}
              </span>
            </div>

            {/* Mode Selector Tabs (Fixed Target vs Unlimited Target) */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849] rounded-2xl">
              <button
                type="button"
                onClick={() => setIsUnlimitedTarget(false)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  !isUnlimitedTarget
                    ? 'bg-white dark:bg-[#172436] text-[#153C32] dark:text-[#24B58A] shadow-subtle border border-[#DDD9CC] dark:border-[#283849]'
                    : 'text-[#738079] dark:text-[#A7B4B0] hover:text-[#191F1C]'
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'مبلغ محدد' : 'Fixed Target'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsUnlimitedTarget(true)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  isUnlimitedTarget
                    ? 'bg-white dark:bg-[#172436] text-[#153C32] dark:text-[#24B58A] shadow-subtle border border-[#DDD9CC] dark:border-[#283849]'
                    : 'text-[#738079] dark:text-[#A7B4B0] hover:text-[#191F1C]'
                }`}
              >
                <Infinity className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'غير محدود (مفتوح)' : 'Unlimited (Open)'}</span>
              </button>
            </div>

            {/* Conditional Display */}
            {isUnlimitedTarget ? (
              <div className="p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40 text-xs space-y-1.5 animate-fadeIn">
                <div className="flex items-center gap-2 font-bold text-purple-900 dark:text-purple-200">
                  <Infinity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>{language === 'ar' ? 'حملة مستمرة بدون سقف مالي' : 'Continuous Open Campaign'}</span>
                </div>
                <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80 leading-relaxed">
                  {language === 'ar'
                    ? 'سيظهر للزوار في لوحة المتابعة أن الحملة مستمرة والباب مفتوح دائمًا للمساهمة بدون سقف محدد أو نسبة مئوية مغلقة.'
                    : 'Visitors will see that the campaign is ongoing with no maximum cap or locked percentage.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 animate-fadeIn">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4] flex items-center justify-between">
                    <span>{language === 'ar' ? 'المبلغ بالجنيه المصري:' : 'Target Amount (EGP):'}</span>
                    {Number(targetAmount.replace(/\D/g, '')) > 0 && (
                      <span className="text-[11px] font-mono text-[#738079] dark:text-[#A7B4B0]">
                        {Number(targetAmount.replace(/\D/g, '')).toLocaleString('en-US')} ج.م
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={targetAmount}
                      onChange={e => {
                        const raw = e.target.value.replace(/\D/g, '');
                        setTargetAmount(raw);
                      }}
                      placeholder="100000"
                      className="w-full py-2.5 px-3.5 pe-14 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] font-bold text-[#153C32] dark:text-[#24B58A] focus:outline-none focus:ring-2 focus:ring-[#153C32]/20 dark:focus:ring-[#24B58A]/20 transition-all font-mono text-base"
                    />
                    <span className="absolute inset-y-0 end-3.5 flex items-center text-xs font-bold text-[#738079] dark:text-[#A7B4B0] pointer-events-none">
                      ج.م
                    </span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="space-y-1">
                  <span className="text-[10px] text-[#738079] dark:text-[#A7B4B0] font-medium block">
                    {language === 'ar' ? 'مبالغ سريعة شائعة:' : 'Quick Presets:'}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {['50000', '100000', '250000', '350000', '500000', '1000000'].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTargetAmount(val)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all ${
                          targetAmount === val
                            ? 'bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] border-transparent shadow-subtle'
                            : 'bg-[#FAF9F5] dark:bg-[#111C2D] border-[#DDD9CC] dark:border-[#283849] text-[#55625B] dark:text-[#A7B4B0] hover:bg-[#F4F3ED]'
                        }`}
                      >
                        {Number(val).toLocaleString('en-US')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Direct Save Button */}
            <div className="pt-2 border-t border-[#EAE8DE] dark:border-[#283849]">
              <button
                type="button"
                onClick={handleSaveTarget}
                disabled={isSavingTarget}
                className="w-full py-2.5 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-xs font-bold hover:bg-[#1C4E41] dark:hover:bg-[#1fa37b] transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-subtle active:scale-[0.99]"
              >
                {isSavingTarget ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{language === 'ar' ? 'جارٍ حفظ الهدف...' : 'Saving...'}</span>
                  </>
                ) : targetSaveSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white dark:text-[#0B1220]" />
                    <span>{language === 'ar' ? 'تم حفظ الهدف بنجاح!' : 'Saved Successfully!'}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'حفظ إعدادات الهدف' : 'Save Target Settings'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Maintenance Mode Box */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#EAE8DE] dark:border-[#283849]">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-sm text-[#153C32] dark:text-[#F3F5F4]">وضع الصيانة</h3>
              </div>
              <input
                type="checkbox"
                checked={maintenanceEnabled}
                onChange={e => setMaintenanceEnabled(e.target.checked)}
                className="rounded text-amber-600"
              />
            </div>

            <button
              type="button"
              onClick={handleSaveMaintenance}
              disabled={isSavingMaintenance}
              className="w-full py-2 rounded-xl bg-amber-700 text-white text-xs font-bold hover:bg-amber-800 disabled:opacity-50"
            >
              {isSavingMaintenance ? 'جارٍ التحديث...' : 'تطبيق وضع الصيانة'}
            </button>
          </div>

        </section>

        {/* 6. ADMINS & TEAM MANAGEMENT */}
        <section className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#EAE8DE] dark:border-[#283849] gap-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#153C32] dark:text-[#24B58A]" />
              <div>
                <h3 className="font-extrabold text-base text-[#153C32] dark:text-[#F3F5F4]">
                  {language === 'ar' ? '6. إدارة المشرفين وفريق العمل' : '6. Admin & Team Management'}
                </h3>
                <span className="text-xs text-[#738079] dark:text-[#A7B4B0]">
                  {language === 'ar' ? 'إضافة وإدارة حسابات المشرفين المصرح لهم بالدخول للوحة التحكم واعتماد التبرعات.' : 'Manage accounts authorized to access admin panel and verify contributions.'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setAdminFormError('');
                setIsAdminModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-xs font-bold hover:bg-[#1C4E41] dark:hover:bg-[#1fa37b] transition-all shadow-subtle self-start sm:self-auto"
            >
              <UserPlus className="w-4 h-4" />
              <span>{language === 'ar' ? 'إضافة مشرف جديد' : 'Add New Admin'}</span>
            </button>
          </div>

          {isLoadingAdmins ? (
            <div className="py-8 flex justify-center text-[#738079]">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(adminsData?.admins || []).map((admin: any) => {
                const isCurrent = admin.id === adminsData?.currentUserId;
                const isSuper = admin.role === 'superadmin';

                return (
                  <div
                    key={admin.id}
                    className="p-4 rounded-2xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849] flex items-center justify-between gap-3 shadow-subtle"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#153C32]/10 dark:bg-[#24B58A]/10 text-[#153C32] dark:text-[#24B58A] flex items-center justify-center font-bold text-sm flex-shrink-0">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-[#191F1C] dark:text-[#F3F5F4] truncate">
                            {admin.name}
                          </h4>
                          {isCurrent && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              {language === 'ar' ? 'أنت' : 'You'}
                            </span>
                          )}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isSuper
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}>
                            {isSuper ? (language === 'ar' ? 'مدير عام' : 'Superadmin') : (language === 'ar' ? 'مشرف' : 'Admin')}
                          </span>
                        </div>
                        <span className="text-xs text-[#738079] dark:text-[#A7B4B0] block truncate font-mono">
                          {admin.email}
                        </span>
                      </div>
                    </div>

                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAdmin(admin.id, admin.name)}
                        disabled={isDeletingAdminId === admin.id}
                        className="p-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50 flex-shrink-0"
                        title={language === 'ar' ? 'حذف المشرف' : 'Delete Admin'}
                      >
                        {isDeletingAdminId === admin.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 7. DANGER ZONE — SYSTEM RESET */}
        <section className="p-6 sm:p-8 rounded-3xl bg-red-50/40 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 shadow-subtle space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-red-200 dark:border-red-900/50 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-red-900 dark:text-red-200">
                  {language === 'ar' ? '7. منطقة العمليات الحساسة: تصفير بيانات الموقع قبل البدء' : '7. Danger Zone: System Data Reset'}
                </h3>
                <p className="text-xs text-red-700/80 dark:text-red-300/80 mt-0.5">
                  {language === 'ar'
                    ? 'مسح جميع التبرعات والمعاملات التجريبية وتصفير العدادات تمهيداً لبدء الحملة واستقبال التبرعات الحقيقية.'
                    : 'Purge all test donations, transactions, and logs before officially launching the campaign.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setResetConfirmationInput('');
                setResetErrorMessage('');
                setIsResetModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-subtle transition-all self-start sm:self-auto"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{language === 'ar' ? 'تصفير كافة البيانات التجريبية' : 'Zero-Out Test Data'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#172436] border border-red-200 dark:border-red-900/40 space-y-1">
              <span className="font-bold text-red-800 dark:text-red-300 block">
                {language === 'ar' ? 'ما الذي سيتم مسحه وتصفيره؟' : 'What will be wiped?'}
              </span>
              <ul className="list-disc list-inside space-y-0.5 text-[#55625B] dark:text-[#A7B4B0] text-[11px]">
                <li>{language === 'ar' ? 'كافة التبرعات المسجلة (المعلقة والمعتمدة).' : 'All donations (pending & approved).'}</li>
                <li>{language === 'ar' ? 'جميع المعاملات البنكية الواردة ورسائل الـ SMS.' : 'All incoming bank & SMS transactions.'}</li>
                <li>{language === 'ar' ? 'بيانات المتبرعين التجريبية وسجلات التصدير.' : 'All test donors and report exports.'}</li>
                <li>{language === 'ar' ? 'تصفير إجمالي المبالغ المجمعة ولوحة الشفافية فوراً.' : 'Reset campaign total and transparency ledger.'}</li>
              </ul>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#172436] border border-emerald-200 dark:border-emerald-900/40 space-y-1">
              <span className="font-bold text-emerald-800 dark:text-emerald-300 block">
                {language === 'ar' ? 'ما الذي سيتم الحفاظ عليه بأمان؟' : 'What is safely preserved?'}
              </span>
              <ul className="list-disc list-inside space-y-0.5 text-[#55625B] dark:text-[#A7B4B0] text-[11px]">
                <li>{language === 'ar' ? 'حسابات جميع المشرفين والمديرين (لن يتم حذف أي أدمن).' : 'All administrator and superadmin accounts.'}</li>
                <li>{language === 'ar' ? 'بيانات الحملة والمبلغ المستهدف واسم المبادرة.' : 'Campaign target, name, and memorial info.'}</li>
                <li>{language === 'ar' ? 'إعدادات وسائل الدفع وأرقام محافظ فودافون كاش وإنستاباي.' : 'All configured wallets and payment methods.'}</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Master Save Bar */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle flex items-center justify-between">
          <div>
            {saveSuccess && (
              <span className="text-xs font-bold text-[#217A61] dark:text-[#24B58A] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>تم حفظ إعدادات المحافظ ووسائل الدفع بنجاح!</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-8 py-3 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-sm font-bold hover:bg-[#1C4E41] dark:hover:bg-[#1fa37b] shadow-subtle disabled:opacity-50 flex items-center gap-2 transition-all"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{language === 'ar' ? 'حفظ كافة الإعدادات' : 'Save Settings'}</span>
          </button>
        </div>

        {/* MODAL: ADD / EDIT WALLET */}
        {isWalletModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] rounded-3xl p-6 sm:p-8 shadow-editorial space-y-6">
              
              <div className="flex items-center justify-between pb-3 border-b border-[#EAE8DE] dark:border-[#283849]">
                <h3 className="font-extrabold text-base text-[#153C32] dark:text-[#F3F5F4]">
                  {editingWalletId ? (language === 'ar' ? 'تعديل بيانات المحفظة' : 'Edit Wallet') : (language === 'ar' ? 'إضافة رقم محفظة فودافون كاش' : 'Add Vodafone Cash Wallet')}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsWalletModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {walletError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-xs">
                  {walletError}
                </div>
              )}

              <form onSubmit={handleSaveWalletModal} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                    {language === 'ar' ? 'اسم أو تسمية المحفظة (اختياري)' : 'Wallet Label'}
                  </label>
                  <input
                    type="text"
                    value={walletLabel}
                    onChange={e => setWalletLabel(e.target.value)}
                    placeholder="مثال: محفظة الدفعة الأساسية"
                    className="w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-xs sm:text-sm text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                    {language === 'ar' ? 'رقم هاتف المحفظة (11 رقم)' : 'Wallet Phone Number'}
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    required
                    value={walletPhone}
                    onChange={e => setWalletPhone(e.target.value)}
                    placeholder="01012345678"
                    dir="ltr"
                    className="w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] font-mono text-sm font-bold text-[#153C32] dark:text-[#24B58A] focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="walletEnabledCheckbox"
                    checked={walletEnabled}
                    onChange={e => setWalletEnabled(e.target.checked)}
                    className="rounded text-[#153C32]"
                  />
                  <label htmlFor="walletEnabledCheckbox" className="text-xs font-semibold text-[#191F1C] dark:text-[#F3F5F4] cursor-pointer">
                    {language === 'ar' ? 'تفعيل المحفظة وعرضها للمتبرعين فورًا' : 'Active and visible to donors'}
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#EAE8DE] dark:border-[#283849]">
                  <button
                    type="button"
                    onClick={() => setIsWalletModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-[#DDD9CC] dark:border-[#283849] text-xs font-semibold text-[#738079]"
                  >
                    إلغاء
                  </button>

                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-xs font-bold hover:bg-[#1C4E41]"
                  >
                    {editingWalletId ? 'تحديث المحفظة' : 'إضافة المحفظة'}
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}

        {/* MODAL: ADD ADMIN */}
        {isAdminModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] rounded-3xl p-6 sm:p-8 shadow-editorial space-y-6">
              
              <div className="flex items-center justify-between pb-3 border-b border-[#EAE8DE] dark:border-[#283849]">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[#153C32] dark:text-[#24B58A]" />
                  <h3 className="font-extrabold text-base text-[#153C32] dark:text-[#F3F5F4]">
                    {language === 'ar' ? 'إضافة مشرف جديد للنظام' : 'Add New Administrator'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAdminModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {adminFormError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-xs">
                  {adminFormError}
                </div>
              )}

              <form onSubmit={handleAddAdmin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                    {language === 'ar' ? 'الاسم بالكامل' : 'Full Name'}
                  </label>
                  <input
                    type="text"
                    required
                    value={newAdminName}
                    onChange={e => setNewAdminName(e.target.value)}
                    placeholder="مثال: د. أحمد محمود"
                    className="w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-xs sm:text-sm text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                    {language === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}
                  </label>
                  <input
                    type="email"
                    required
                    value={newAdminEmail}
                    onChange={e => setNewAdminEmail(e.target.value)}
                    placeholder="admin@example.com"
                    dir="ltr"
                    className="w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-xs sm:text-sm text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                    {language === 'ar' ? 'كلمة المرور (8 أحرف على الأقل)' : 'Password (min 8 chars)'}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newAdminPassword}
                    onChange={e => setNewAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    dir="ltr"
                    className="w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-xs sm:text-sm text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                    {language === 'ar' ? 'مستوى الصلاحية' : 'Role'}
                  </label>
                  <select
                    value={newAdminRole}
                    onChange={e => setNewAdminRole(e.target.value as any)}
                    className="w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-xs sm:text-sm text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none"
                  >
                    <option value="admin">{language === 'ar' ? 'مشرف معتمد (مراجعة واعتماد التبرعات)' : 'Admin'}</option>
                    <option value="superadmin">{language === 'ar' ? 'مدير عام للنظام (صلاحيات كاملة)' : 'Superadmin'}</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#EAE8DE] dark:border-[#283849]">
                  <button
                    type="button"
                    onClick={() => setIsAdminModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-[#DDD9CC] dark:border-[#283849] text-xs font-semibold text-[#738079]"
                  >
                    إلغاء
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmittingAdmin}
                    className="px-5 py-2 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-xs font-bold hover:bg-[#1C4E41] disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmittingAdmin && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{language === 'ar' ? 'حفظ المشرف' : 'Create Admin'}</span>
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}

        {/* MODAL: RESET DATA CONFIRMATION */}
        {isResetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-lg bg-white dark:bg-[#172436] border border-red-300 dark:border-red-900/60 rounded-3xl p-6 sm:p-8 shadow-editorial space-y-6">
              
              <div className="flex items-center justify-between pb-3 border-b border-red-200 dark:border-red-900/50">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-6 h-6" />
                  <h3 className="font-black text-lg text-red-900 dark:text-red-200">
                    {language === 'ar' ? 'تأكيد تصفير بيانات الموقع' : 'Confirm System Data Reset'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-xs text-red-800 dark:text-red-200 space-y-2 leading-relaxed">
                <p className="font-bold">
                  {language === 'ar' ? 'تحذير هام: هذا الإجراء لا يمكن التراجع عنه!' : 'Warning: This action cannot be undone!'}
                </p>
                <p>
                  {language === 'ar' 
                    ? 'سيتم حذف كافة التبرعات التجريبية، ورسائل الـ SMS، والمعاملات البنكية، وبيانات المتبرعين نهائياً لتصفير العداد إلى (0 ج.م) والبدء الحقيقي للحملة. حسابات المشرفين وإعدادات المحافظ ستبقى محفوظة بالكامل.'
                    : 'All test donations, SMS logs, incoming transactions, and donors will be permanently wiped to reset the total to 0 EGP.'}
                </p>
              </div>

              {resetErrorMessage && (
                <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/40 border border-red-300 text-red-800 dark:text-red-200 text-xs font-bold">
                  {resetErrorMessage}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4] block">
                  {language === 'ar' 
                    ? 'للتأكيد، يرجى كتابة كلمة "تصفير" أو "RESET" في الحقل أدناه:' 
                    : 'Type "RESET" to confirm:'}
                </label>
                <input
                  type="text"
                  value={resetConfirmationInput}
                  onChange={e => setResetConfirmationInput(e.target.value)}
                  placeholder={language === 'ar' ? 'اكتب: تصفير' : 'Type: RESET'}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-red-300 dark:border-red-800 font-bold text-sm text-red-700 dark:text-red-300 text-center focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#EAE8DE] dark:border-[#283849]">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  disabled={isResettingData}
                  className="px-4 py-2 rounded-xl border border-[#DDD9CC] dark:border-[#283849] text-xs font-semibold text-[#738079]"
                >
                  إلغاء التراجع
                </button>

                <button
                  type="button"
                  onClick={handleResetData}
                  disabled={isResettingData || (resetConfirmationInput.trim() !== 'تصفير' && resetConfirmationInput.trim() !== 'RESET')}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-subtle disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isResettingData && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{language === 'ar' ? 'تأكيد التصفير والمسح الشامل' : 'Confirm Complete Reset'}</span>
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
