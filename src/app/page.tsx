'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { Campaign, PaymentMethod } from '@/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Heart, 
  Coins, 
  Users, 
  TrendingUp, 
  Clock, 
  Award, 
  Copy, 
  Check, 
  Globe, 
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Search,
  Trash2,
  Loader2,
  ExternalLink
} from 'lucide-react';
import canvasConfetti from 'canvas-confetti';
import Link from 'next/link';

// --- MOCK FALLBACKS ---
const MOCK_CAMPAIGN: Campaign = {
  id: 'c580436d-9654-4720-bc2f-a9cb6bf0f7a0',
  name: 'Medical Ventilator for Kafr El-Sheikh University Hospital (9th Batch)',
  name_ar: 'جهاز تنفس صناعي لمستشفى كفر الشيخ الجامعي (الدفعة التاسعة)',
  description: 'Donations campaign by the 9th Batch of Kafr El-Sheikh Medicine to purchase and provide a state-of-the-art ventilator to Kafr El-Sheikh University Hospital ICU.',
  description_ar: 'حملة تبرعات الدفعة التاسعة طب كفر الشيخ لتوفير جهاز تنفس صناعي حديث لدعم وحدة العناية المركزة بمستشفيات جامعة كفر الشيخ وتأمين رعاية فائقة للمرضى.',
  target_amount: 500000,
  collected_amount: 0,
  organizer: 'Kafr El-Sheikh Medicine - 9th Batch',
  organizer_ar: 'طب كفر الشيخ - الدفعة التاسعة',
  cover_image: '/ventilator_campaign_cover.png',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// const MOCK_DONATIONS = [
//   { name: 'Mohamed A.', amount: 5000, created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
//   { name: 'Ahmed M.', amount: 250, created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
//   { name: 'Samer B.', amount: 1000, created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
//   { name: 'Sara K.', amount: 460, created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
//   { name: 'Tarek Y.', amount: 1500, created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() },
// ];

export default function PublicDonationPage() {
  const { language, dir, toggleLanguage, t } = useLanguage();
  const queryClient = useQueryClient();
  
  // State
  const [isMounted, setIsMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('vodafone_cash');
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>('500');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [refNum, setRefNum] = useState('');
  const [digits, setDigits] = useState('');
  const [notes, setNotes] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Tracking State
  const [trackedDonations, setTrackedDonations] = useState<any[]>([]);
  const [trackingPhone, setTrackingPhone] = useState('');
  const [isTrackingLoading, setIsTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [lastTrackedUpdate, setLastTrackedUpdate] = useState<Date | null>(null);

  // Fetch status for stored/polled IDs
  const fetchTrackedStatus = async (ids: string[], isManual = false) => {
    if (ids.length === 0) {
      setTrackedDonations([]);
      return;
    }
    if (isManual) setIsTrackingLoading(true);
    try {
      const res = await fetch(`/api/donations/status?ids=${ids.join(',')}`);
      if (!res.ok) throw new Error('Failed to fetch status');
      const data = await res.json();
      
      // Check if any donation transitioned from pending to verified
      setTrackedDonations(prev => {
        if (prev.length > 0) {
          data.forEach((newDonation: any) => {
            const oldDonation = prev.find(p => p.id === newDonation.id);
            if (oldDonation && oldDonation.status === 'pending' && 
                (newDonation.status === 'auto_verified' || newDonation.status === 'manual_verified')) {
              // Trigger confetti!
              canvasConfetti({
                particleCount: 80,
                spread: 50,
                origin: { y: 0.7 }
              });
            }
          });
        }
        return data;
      });
      setLastTrackedUpdate(new Date());
      setTrackingError('');
    } catch (err: any) {
      console.error('Error fetching tracked status:', err);
      if (isManual) setTrackingError(language === 'ar' ? 'فشل تحديث الحالة' : 'Failed to update status');
    } finally {
      if (isManual) setIsTrackingLoading(false);
    }
  };

  // Track by Phone Number Handler
  const handleTrackByPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingPhone.trim()) return;
    setIsTrackingLoading(true);
    setTrackingError('');
    try {
      const res = await fetch(`/api/donations/status?phone=${encodeURIComponent(trackingPhone.trim())}`);
      if (!res.ok) throw new Error('Query failed');
      const data = await res.json();
      
      setTrackedDonations(data);
      setLastTrackedUpdate(new Date());
      
      if (data.length === 0) {
        setTrackingError(t('track_no_results'));
      } else {
        // Save these IDs to localStorage as well
        const newIds = data.map((d: any) => d.id);
        const storedIds = localStorage.getItem('my_donation_ids');
        const existingIds = storedIds ? storedIds.split(',').filter(Boolean) : [];
        const mergedIds = Array.from(new Set([...existingIds, ...newIds]));
        localStorage.setItem('my_donation_ids', mergedIds.join(','));
      }
    } catch (err: any) {
      console.error('Tracking by phone error:', err);
      setTrackingError(language === 'ar' ? 'حدث خطأ أثناء البحث.' : 'Error occurred while tracking.');
    } finally {
      setIsTrackingLoading(false);
    }
  };

  const handleClearTracking = () => {
    localStorage.removeItem('my_donation_ids');
    setTrackedDonations([]);
    setLastTrackedUpdate(null);
    setTrackingPhone('');
  };

  // Fetch payment accounts from DB settings
  const { data: dbSettings } = useQuery({
    queryKey: ['publicSettings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'payment_accounts')
        .maybeSingle();
      
      if (error) throw error;
      return data?.value || { 
        vodafone_cash: '01015339426', 
        instapay_address: '01015339426@instapay',
        instapay_phone: '01015339426',
        instapay_payment_link: '',
        instapay_qr_url: ''
      };
    }
  });

  const VFC_NUMBER = dbSettings?.vodafone_cash || '01015339426';
  const INSTAPAY_ADDRESS = dbSettings?.instapay_address || '01015339426';
  const INSTAPAY_PHONE = dbSettings?.instapay_phone || '01015339426';
  const INSTAPAY_LINK = dbSettings?.instapay_payment_link || '';
  const INSTAPAY_QR_URL = dbSettings?.instapay_qr_url || '';
  const displayInstapayAddress = INSTAPAY_ADDRESS.includes('@')
    ? INSTAPAY_ADDRESS
    : `${INSTAPAY_ADDRESS}@instapay`;

  // 1. Fetch Campaign Details
  const { data: campaign, error: campaignError } = useQuery<Campaign>({
    queryKey: ['campaign'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error("Supabase campaign query error:", error);
        throw error;
      }
      return data || MOCK_CAMPAIGN;
    }
  });

  const activeCampaign = campaign || MOCK_CAMPAIGN;

  // 2. Fetch Transparency / Aggregates
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const { data: donations, error } = await supabase
        .from('donations')
        .select('amount, status, created_at');

      if (error) throw error;

      const items = donations || [];
      const approved = items.filter(d => d.status === 'auto_verified' || d.status === 'manual_verified');
      const pending = items.filter(d => d.status === 'pending');

      const totalReceived = approved.reduce((sum, d) => sum + Number(d.amount), 0);
      const pendingSum = pending.reduce((sum, d) => sum + Number(d.amount), 0);
      
      const largest = approved.length > 0 ? Math.max(...approved.map(d => Number(d.amount))) : 0;
      const latestTimestamp = approved.length > 0 
        ? approved.reduce((max, d) => d.created_at > max ? d.created_at : max, approved[0].created_at) 
        : null;

      // Uniq donors
      const uniqueDonorsCount = approved.length; // Simplified proxy

      return {
        totalReceived,
        approvedCount: approved.length,
        pendingCount: pending.length,
        pendingSum,
        totalDonors: uniqueDonorsCount,
        largestDonation: largest,
        latestTimestamp,
      };
    },
    refetchInterval: 10000, // Background fallback polling
  });

  // 3. Fetch Recent Verified Donors (from public_donations database view)
  const { data: recentDonations, error: recentDonationsError } = useQuery<any[]>({
    queryKey: ['recentDonations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_donations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error("Error fetching public donations:", error);
        throw error;
      }
      return data || [];
    }
  });

  // Mount state setup
  useEffect(() => {
    setIsMounted(true);
    
    // Check initial session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);
    };
    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    // Load initial IDs from localStorage
    const storedIds = localStorage.getItem('my_donation_ids');
    if (storedIds) {
      const ids = storedIds.split(',').filter(Boolean);
      fetchTrackedStatus(ids, true);
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Polling effect for pending tracked donations
  useEffect(() => {
    if (!isMounted) return;
    
    // Check if we have any pending donations
    const hasPending = trackedDonations.some(d => d.status === 'pending');
    if (!hasPending) return;

    const interval = setInterval(() => {
      const storedIds = localStorage.getItem('my_donation_ids');
      if (storedIds) {
        const ids = storedIds.split(',').filter(Boolean);
        fetchTrackedStatus(ids);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [trackedDonations, isMounted]);

  // 4. Supabase Realtime Listener setup
  useEffect(() => {
    const channel = supabase
      .channel('realtime_donations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, () => {
        // Invalidate and refetch queries immediately on changes
        queryClient.invalidateQueries({ queryKey: ['campaign'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
        queryClient.invalidateQueries({ queryKey: ['recentDonations'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Copy Handler
  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  // Form Validation
  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = language === 'ar' ? 'الاسم مطلوب' : 'Name is required';
    
    const phoneRegex = /^01[0125]\d{8}$/;
    if (!phone.trim()) {
      errors.phone = language === 'ar' ? 'رقم الهاتف مطلوب' : 'Phone number is required';
    } else if (!phoneRegex.test(phone.trim())) {
      errors.phone = language === 'ar' ? 'رقم هاتف مصري غير صالح (مثال: 01012345678)' : 'Invalid Egyptian phone number (e.g. 01012345678)';
    }

    const numAmount = Number(amount);
    if (!amount) {
      errors.amount = language === 'ar' ? 'المبلغ مطلوب' : 'Amount is required';
    } else if (isNaN(numAmount) || numAmount <= 0) {
      errors.amount = language === 'ar' ? 'المبلغ يجب أن يكون أكبر من الصفر' : 'Amount must be greater than zero';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Form Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      // 1. Upload Screenshot if exists
      let screenshotUrl = null;
      if (screenshot) {
        const fileExt = screenshot.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `receipts/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, screenshot);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('receipts')
            .getPublicUrl(filePath);
          screenshotUrl = urlData.publicUrl;
        } else {
          console.warn('Screenshot upload failed, proceeding without upload:', uploadError.message);
        }
      }

      // 2. Call new Backend API to create donation and run matching
      const res = await fetch('/api/donations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          campaignId: activeCampaign.id,
          amount: Number(amount),
          paymentMethod: paymentMethod,
          transactionRef: refNum.trim() || null,
          last4Digits: digits.trim() || null,
          notes: notes.trim() || null,
          screenshotUrl,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to submit donation');
      }

      const responseData = await res.json();
      const donationId = responseData.donationId;

      // Save ID to localStorage
      if (donationId) {
        const storedIds = localStorage.getItem('my_donation_ids');
        const ids = storedIds ? storedIds.split(',').filter(Boolean) : [];
        ids.push(donationId);
        localStorage.setItem('my_donation_ids', ids.join(','));
        // Trigger status fetch
        fetchTrackedStatus(ids);
      }

      // Success sequence
      setIsSubmitting(false);
      setSubmitSuccess(true);
      
      // Trigger canvas confetti
      canvasConfetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });

      // Clear Form Fields
      setName('');
      setPhone('');
      setRefNum('');
      setDigits('');
      setNotes('');
      setScreenshot(null);

    } catch (err: any) {
      console.error('Error submitting donation:', err);
      setIsSubmitting(false);
      alert(language === 'ar' ? `خطأ أثناء إرسال البيانات: ${err.message}` : `Submission error: ${err.message}`);
    }
  };

  // Mask Phone and Names for Privacy
  // const maskName = (val: string) => {
  //   if (!val) return t('anonymous');
  //   const parts = val.trim().split(' ');
  //   if (parts.length === 1) {
  //     return parts[0].substring(0, 3) + '...';
  //   }
  //   return `${parts[0]} ${parts[1].charAt(0)}.`;
  // };

  // Calculations for Progress Bar
  const displayCampaignName = language === 'ar' ? activeCampaign.name_ar : activeCampaign.name;
  const displayCampaignDesc = language === 'ar' ? activeCampaign.description_ar : activeCampaign.description;
  const displayOrganizer = language === 'ar' ? activeCampaign.organizer_ar : activeCampaign.organizer;
  const targetVal = Number(activeCampaign.target_amount ?? MOCK_CAMPAIGN.target_amount);
  
  // Real-time values or fallback to MOCK
  const collectedVal = stats 
    ? stats.totalReceived 
    : Number(activeCampaign.collected_amount);
  
  const remainingVal = Math.max(0, targetVal - collectedVal);
  const percentVal = Math.min(100, Math.round((collectedVal / targetVal) * 100));

  // InstaPay QR Code Generation details
  const instapayQRUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=020617&bgcolor=f8fafc&data=instapay://payment?address=${encodeURIComponent(displayInstapayAddress)}%26amount=${amount}`;

  return (
    <div className="min-h-screen relative pb-16 flex flex-col font-sans" dir={dir}>
      {/* Background Orbs */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-teal-500/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* HEADER NAVBAR */}
      <header className="w-full max-w-7xl mx-auto px-4 md:px-8 py-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Heart className="w-5 h-5 text-slate-950 fill-slate-950" />
          </div>
          <span className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            donations 9th Batch
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={toggleLanguage}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            <Globe className="w-4 h-4 text-emerald-450" />
            <span>{language === 'ar' ? 'English' : 'العربية'}</span>
          </button>

          {isMounted && (
            isLoggedIn ? (
              <Link 
                href="/admin/dashboard"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 text-sm font-extrabold shadow-md hover:brightness-105 transition-all"
              >
                <span>{language === 'ar' ? 'لوحة التحكم' : 'Dashboard'}</span>
              </Link>
            ) : (
              <Link 
                href="/admin/login"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-sm font-semibold hover:bg-slate-800 transition-colors text-slate-300"
              >
                <span>{language === 'ar' ? 'دخول المشرف' : 'Admin Login'}</span>
              </Link>
            )
          )}
        </div>
      </header>

      {/* HERO / CAMPAIGN COVER SECTION */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 space-y-12">
        {campaignError && (
          <div className="p-4 bg-red-950/20 border border-red-900/20 text-red-300 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>Failed to load campaign settings: {campaignError.message || JSON.stringify(campaignError)}</span>
          </div>
        )}
        <div className="relative rounded-3xl overflow-hidden border border-slate-900 bg-slate-950/40 backdrop-blur-md shadow-2xl transition-all duration-300 hover:border-emerald-500/20 hover:shadow-emerald-500/5 group">
          {/* Subtle Ambient Background Gradient Orbs */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none -z-10 group-hover:bg-emerald-500/15 transition-all duration-500" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-teal-500/5 rounded-full blur-[100px] pointer-events-none -z-10" />
          
          <div className="p-6 md:p-8 flex flex-col lg:flex-row gap-8 lg:items-stretch">
            {/* Cover image container */}
            <div className="w-full lg:w-[460px] h-72 md:h-[340px] rounded-2xl overflow-hidden relative border border-slate-800 flex-shrink-0 group/img shadow-lg">
              <img 
                src={activeCampaign.cover_image || "/campaign_cover.png"} 
                alt={displayCampaignName}
                className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-700 ease-out"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    const div = document.createElement('div');
                    div.className = "w-full h-full bg-gradient-to-tr from-emerald-950 via-slate-900 to-teal-950 flex flex-col items-center justify-center p-6 text-center";
                    div.innerHTML = `<span class="text-emerald-400 text-lg font-bold">Gaza Relief & Medical Aid</span>`;
                    parent.appendChild(div);
                  }
                }}
              />
              {/* Overlay Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent opacity-90" />
              
              {/* Floating Verified Campaign Badge */}
              <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-full text-[10px] font-bold text-emerald-400 shadow-md">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                <span>{language === 'ar' ? 'حملة تبرع نشطة' : 'Active Campaign'}</span>
              </div>

              {/* Floating Organizer Badge */}
              <div className="absolute bottom-4 right-4 left-4">
                <div className="inline-flex items-center gap-2 bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-300">
                  <Heart className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
                  <span>{displayOrganizer}</span>
                </div>
              </div>
            </div>

            {/* Campaign details */}
            <div className="flex-1 flex flex-col justify-between space-y-6 lg:py-1">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/40 border border-emerald-900/30 px-2.5 py-1 rounded-md">
                    {language === 'ar' ? 'المستشفى الجامعي' : 'University Hospital'}
                  </span>
                </div>
                
                <h1 className="text-2xl md:text-4xl font-black text-white leading-tight tracking-tight hover:text-emerald-300 transition-colors">
                  {displayCampaignName}
                </h1>
                
                <p className="text-slate-400 leading-relaxed text-sm md:text-[14.5px] font-medium">
                  {displayCampaignDesc}
                </p>
              </div>

              {/* Campaign Progress Visual */}
              <div className="space-y-4 bg-slate-900/30 border border-slate-900 p-5 rounded-2xl relative overflow-hidden backdrop-blur-sm">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-2">
                  <div className="space-y-1">
                    <span className="text-slate-500 text-[10px] font-bold block uppercase tracking-wider">{t('collected')}</span>
                    <span className="text-xl md:text-2xl font-black text-emerald-400 flex items-baseline gap-1">
                      {collectedVal.toLocaleString()}
                      <span className="text-[11px] font-bold text-slate-400">{t('egp')}</span>
                    </span>
                  </div>
                  
                  <div className="space-y-1 border-s border-slate-800/80 ps-4">
                    <span className="text-slate-500 text-[10px] font-bold block uppercase tracking-wider">{t('target')}</span>
                    <span className="text-lg md:text-xl font-bold text-white flex items-baseline gap-1">
                      {targetVal.toLocaleString()}
                      <span className="text-[10px] font-semibold text-slate-400">{t('egp')}</span>
                    </span>
                  </div>

                  <div className="space-y-1 border-s border-slate-800/80 ps-4 col-span-1">
                    <span className="text-slate-500 text-[10px] font-bold block uppercase tracking-wider">{language === 'ar' ? 'المتبقي' : 'Remaining'}</span>
                    <span className="text-lg font-bold text-slate-300 flex items-baseline gap-1">
                      {remainingVal.toLocaleString()}
                      <span className="text-[10px] font-semibold text-slate-400">{t('egp')}</span>
                    </span>
                  </div>

                  <div className="space-y-1 border-s border-slate-800/80 ps-4 text-end">
                    <span className="text-slate-500 text-[10px] font-bold block uppercase tracking-wider">{language === 'ar' ? 'النسبة' : 'Progress'}</span>
                    <span className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-300">
                      {percentVal}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-900 relative">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 rounded-full shadow-[0_0_12px_#10b981] progress-animated transition-all duration-1000 ease-out"
                      style={{ width: `${percentVal}%` }}
                    />
                  </div>
                  
                  <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {percentVal}% {t('progress')}
                    </span>
                    <span>
                      {language === 'ar' ? 'مستمر حتى تحقيق الهدف' : 'Ongoing until goal met'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RECENT DONORS MARQUEE */}
        <div className="w-full bg-slate-900/30 border border-slate-900 rounded-2xl overflow-hidden py-3 flex items-center relative">
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-950 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-950 to-transparent z-10 pointer-events-none" />
          
          <div className="flex-shrink-0 px-4 font-bold text-xs uppercase tracking-wider text-emerald-400 border-e border-slate-800 flex items-center gap-1.5 z-20">
            <Coins className="w-4 h-4" />
            {t('recent_donors_title')}
          </div>

          <div className="flex overflow-hidden w-full select-none">
            <div className="flex gap-12 whitespace-nowrap animate-marquee">
              {recentDonations && recentDonations.length > 0 ? (
                recentDonations.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 glow-green" />
                    <span className="text-sm font-semibold text-slate-350">
                      {item.masked_name || t('anonymous')}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      ({item.masked_phone})
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-bold border border-emerald-900/40">
                      {item.amount} {t('egp')}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {isMounted ? new Date(item.created_at).toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '...'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm font-semibold text-slate-450 px-4">
                  {language === 'ar' ? 'بانتظار أول تبرع موثق لدعم الحملة...' : 'Awaiting the first verified donation to support the campaign...'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM SPLIT SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT: DONATION INSTRUCTIONS & FORM */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Payment Instructions Card */}
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-emerald-400" />
                  {t('inst_title')}
                </h3>
                <p className="text-slate-400 text-xs">{t('inst_sub')}</p>
              </div>

              {/* Tabs for Payment method selection */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950/80 p-1 rounded-xl border border-slate-900">
                <button
                  onClick={() => setPaymentMethod('vodafone_cash')}
                  className={`py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2.5 ${
                    paymentMethod === 'vodafone_cash'
                      ? 'bg-slate-900 border border-slate-800 text-red-550 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <img src="/vf_Logo.png" alt="Vodafone Cash" className="w-5 h-5 object-contain rounded-full bg-white p-0.5" />
                  {t('vfc_label')}
                </button>
                <button
                  onClick={() => setPaymentMethod('instapay')}
                  className={`py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2.5 ${
                    paymentMethod === 'instapay'
                      ? 'bg-slate-900 border border-slate-800 text-violet-400 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <img src="/InstaPay_Logo.png" alt="InstaPay" className="w-5 h-5 object-contain rounded bg-white p-0.5" />
                  {t('instapay_label')}
                </button>
              </div>

              {/* Vodafone Cash Details */}
              {paymentMethod === 'vodafone_cash' && (
                <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-900 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center md:text-start">
                    <span className="text-slate-500 text-xs uppercase tracking-wider">{t('vfc_number')}</span>
                    <p className="text-2xl font-black tracking-widest text-white">{VFC_NUMBER}</p>
                  </div>
                  <button
                    onClick={() => handleCopy(VFC_NUMBER, 'vfc')}
                    className="w-full md:w-auto flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-sm font-semibold py-3 px-6 rounded-xl transition-all active:scale-95"
                  >
                    {copiedType === 'vfc' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400 animate-scale-up" />
                        <span className="text-emerald-400">{t('copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-slate-400" />
                        <span>{t('copy')}</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* InstaPay Details */}
              {paymentMethod === 'instapay' && (
                <div className="space-y-6 bg-slate-950/20 p-5 rounded-2xl border border-slate-900 flex flex-col items-center">
                  
                  {/* Top: InstaPay Logo */}
                  <div className="flex flex-col items-center space-y-2">
                    <img 
                      src="/InstaPay_Logo.png" 
                      alt="InstaPay" 
                      className="h-10 object-contain rounded bg-white px-2.5 py-1" 
                    />
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                      {language === 'ar' ? 'الدفع عبر تطبيق إنستاباي' : 'Pay via InstaPay App'}
                    </span>
                  </div>

                  {/* Payment Button Link */}
                  {INSTAPAY_LINK && (
                    <a
                      href={INSTAPAY_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group w-full max-w-sm flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:brightness-110 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] active:scale-[0.98] text-white font-black py-4 px-6 rounded-xl shadow-[0_0_15px_rgba(139,92,246,0.2)] border border-violet-500/35 transition-all text-center text-sm cursor-pointer"
                    >
                      <span>{language === 'ar' ? 'انقر هنا للدفع السريع عبر إنستاباي' : 'Quick Pay via InstaPay'}</span>
                      <span className="text-xs font-bold transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">↗</span>
                    </a>
                  )}

                  {/* Phone Number Display with Copy */}
                  <div className="w-full max-w-sm bg-slate-950/60 p-4 rounded-xl border border-slate-900 flex items-center justify-between gap-4">
                    <div className="space-y-0.5 text-start">
                      <span className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold">
                        {language === 'ar' ? 'رقم الهاتف (إنستاباي)' : 'InstaPay Phone Number'}
                      </span>
                      <p className="text-xl font-black tracking-widest text-white font-mono select-all">
                        {INSTAPAY_PHONE}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(INSTAPAY_PHONE, 'instapay_phone')}
                      className="flex items-center justify-center gap-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-semibold py-2.5 px-4 rounded-lg transition-all active:scale-95 text-slate-350 flex-shrink-0"
                    >
                      {copiedType === 'instapay_phone' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">{t('copied')}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>{t('copy')}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* QR Code Container */}
                  <div className="w-full max-w-sm bg-slate-950/60 p-5 rounded-xl border border-slate-900 flex flex-col items-center text-center space-y-4">
                    <div className="w-44 h-44 bg-white p-2.5 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden">
                      <img 
                        src={INSTAPAY_QR_URL || instapayQRUrl} 
                        alt="InstaPay QR Code" 
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-white font-bold text-xs">{t('qr_title')}</h4>
                      <p className="text-slate-400 text-[10px] max-w-[250px] leading-relaxed mx-auto">
                        {language === 'ar' 
                          ? 'امسح الرمز ضوئياً عبر تطبيق إنستاباي لتجهيز معاملة التبرع مباشرة' 
                          : 'Scan the QR code in the InstaPay app to set up your transaction.'}
                      </p>
                      <div className="inline-block mt-2 px-3 py-0.5 bg-emerald-950/40 border border-emerald-900/30 rounded-lg text-emerald-400 text-[10px] font-bold">
                        {amount || '0'} EGP
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Donation Submit Form */}
            <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
              {submitSuccess ? (
                <div className="text-center py-10 space-y-4 animate-scale-up">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-white">{t('success_title')}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
                    {t('success_desc')}
                  </p>
                  <button
                    onClick={() => setSubmitSuccess(false)}
                    className="mt-6 px-6 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-sm font-semibold rounded-xl text-white transition-colors"
                  >
                    {language === 'ar' ? 'تقديم تبرع آخر' : 'Send Another Donation'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-white">{t('form_title')}</h3>
                    <p className="text-slate-400 text-xs">{t('form_subtitle')}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Name */}
                    <div className="space-y-1.5">
                      <label className="text-slate-300 text-xs font-semibold">{t('field_name')}</label>
                      <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={`w-full glass-input px-4 py-3 rounded-xl text-sm ${formErrors.name ? 'border-red-500' : ''}`}
                        placeholder={language === 'ar' ? 'مثال: محمد أحمد' : 'e.g. John Doe'}
                      />
                      {formErrors.name && <span className="text-red-400 text-xs block">{formErrors.name}</span>}
                    </div>

                    {/* Phone */}
                    <div className="space-y-1.5">
                      <label className="text-slate-300 text-xs font-semibold">{t('field_phone')}</label>
                      <input 
                        type="text" 
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={`w-full glass-input px-4 py-3 rounded-xl text-sm ${formErrors.phone ? 'border-red-500' : ''}`}
                        placeholder={language === 'ar' ? 'مثال: 01012345678' : 'e.g. 01012345678'}
                        dir="ltr"
                      />
                      {formErrors.phone && <span className="text-red-400 text-xs block">{formErrors.phone}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Amount */}
                    <div className="space-y-1.5">
                      <label className="text-slate-300 text-xs font-semibold">{t('field_amount')}</label>
                      <input 
                        type="number" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className={`w-full glass-input px-4 py-3 rounded-xl text-sm ${formErrors.amount ? 'border-red-500' : ''}`}
                        placeholder="500"
                        min="1"
                      />
                      {formErrors.amount && <span className="text-red-400 text-xs block">{formErrors.amount}</span>}
                    </div>

                    {/* Ref Number */}
                    <div className="space-y-1.5">
                      <label className="text-slate-300 text-xs font-semibold">{t('field_ref')}</label>
                      <input 
                        type="text" 
                        value={refNum}
                        onChange={(e) => setRefNum(e.target.value)}
                        className="w-full glass-input px-4 py-3 rounded-xl text-sm"
                        placeholder={paymentMethod === 'vodafone_cash' ? 'مثال: 020493825433' : 'e.g. 4a36aa42'}
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Last 4 digits */}
                    <div className="space-y-1.5">
                      <label className="text-slate-300 text-xs font-semibold">{t('field_digits')}</label>
                      <input 
                        type="text" 
                        value={digits}
                        onChange={(e) => setDigits(e.target.value)}
                        maxLength={4}
                        className="w-full glass-input px-4 py-3 rounded-xl text-sm"
                        placeholder="e.g. 7425"
                        dir="ltr"
                      />
                    </div>

                    {/* Screenshot File Upload */}
                    <div className="space-y-1.5">
                      <label className="text-slate-300 text-xs font-semibold">{t('field_screenshot')}</label>
                      <div className="relative w-full h-[46px] rounded-xl glass-input border border-dashed border-slate-700 hover:border-emerald-500 flex items-center justify-center transition-colors overflow-hidden">
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <div className="flex items-center gap-2 text-slate-400 text-xs">
                          <ImageIcon className="w-4 h-4 text-emerald-400" />
                          <span>{screenshot ? screenshot.name : (language === 'ar' ? 'اختر صورة من جهازك' : 'Choose screenshot file')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <label className="text-slate-300 text-xs font-semibold">{t('field_notes')}</label>
                    <textarea 
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="w-full glass-input px-4 py-3 rounded-xl text-sm resize-none"
                      placeholder={language === 'ar' ? 'دعاء أو كلمة شكر أو توجيه خاص بالحملة...' : 'Prayer, note, or dedication...'}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-extrabold text-sm py-4 rounded-xl shadow-lg shadow-emerald-500/20 hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <Heart className="w-4 h-4 fill-slate-950" />
                    <span>{isSubmitting ? t('submitting') : t('btn_submit')}</span>
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* RIGHT: TRANSPARENCY LIVE METRICS */}
          <div className="lg:col-span-5 space-y-6">
            <div className="glass-panel rounded-2xl p-6 space-y-6 relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-24 h-24 bg-teal-500/10 rounded-full blur-xl pointer-events-none" />
              
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    {t('transparency_title')}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 glow-green" />
                    <span>{language === 'ar' ? 'مباشر' : 'LIVE'}</span>
                  </div>
                </div>
                <p className="text-slate-400 text-xs">{t('transparency_desc')}</p>
              </div>

              {/* KPI stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Stat block: total received */}
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-900">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
                    <Coins className="w-4 h-4 text-emerald-400" />
                    <span>{t('stat_total_received')}</span>
                  </div>
                  <p className="text-lg font-black text-white mt-2">
                    {(stats?.totalReceived ?? collectedVal).toLocaleString()} <span className="text-xs font-bold text-emerald-400">{t('egp')}</span>
                  </p>
                </div>

                {/* Stat block: total approved donors */}
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-900">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span>{t('stat_total_donors')}</span>
                  </div>
                  <p className="text-lg font-black text-white mt-2">
                    {stats?.totalDonors ?? 0}
                  </p>
                </div>

                {/* Stat block: approved count */}
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-900">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{t('stat_approved')}</span>
                  </div>
                  <p className="text-lg font-black text-white mt-2">
                    {stats?.approvedCount ?? 0}
                  </p>
                </div>

                {/* Stat block: pending count */}
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-900">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span>{t('stat_pending')}</span>
                  </div>
                  <p className="text-lg font-black text-white mt-2">
                    {stats?.pendingCount ?? 0}
                  </p>
                </div>
              </div>

              {/* Largest and Latest indicators */}
              <div className="space-y-3 pt-3 border-t border-slate-900">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-semibold">{t('stat_largest_donation')}</span>
                  <span className="text-white font-extrabold">
                    {(stats?.largestDonation ?? 0).toLocaleString()} {t('egp')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-semibold">{t('stat_latest_donation')}</span>
                  <span className="text-white font-bold" dir="ltr">
                    {isMounted ? (
                      stats?.latestTimestamp 
                        ? new Date(stats.latestTimestamp).toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }) 
                        : '—'
                    ) : (
                      '...'
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* TRACK YOUR DONATION CARD */}
            <div className="glass-panel rounded-2xl p-6 space-y-6 relative overflow-hidden">
              <div className="absolute -top-12 -left-12 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
              
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Search className="w-5 h-5 text-emerald-400" />
                  {t('track_title')}
                </h3>
                <p className="text-slate-400 text-xs">{t('track_desc')}</p>
              </div>

              {/* Form to query by phone */}
              <form onSubmit={handleTrackByPhone} className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={trackingPhone}
                    onChange={(e) => setTrackingPhone(e.target.value)}
                    placeholder={t('track_phone_placeholder')}
                    className="w-full glass-input px-3 py-2.5 rounded-xl text-xs"
                    dir="ltr"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isTrackingLoading || !trackingPhone.trim()}
                  className="px-4 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-bold rounded-xl text-white transition-all disabled:opacity-50"
                >
                  {isTrackingLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-450" />
                  ) : (
                    t('track_btn')
                  )}
                </button>
              </form>

              {trackingError && (
                <div className="p-3 bg-red-950/20 border border-red-900/20 text-red-300 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span>{trackingError}</span>
                </div>
              )}

              {/* Live list of tracked donations */}
              {trackedDonations.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-900">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">{t('track_my_donations')}</span>
                    <button
                      onClick={handleClearTracking}
                      className="text-[10px] text-red-400 hover:underline flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{language === 'ar' ? 'مسح السجل' : 'Clear'}</span>
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {trackedDonations.map((d) => (
                      <div key={d.id} className="p-3 bg-slate-950/55 border border-slate-900/80 rounded-xl text-xs space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white">{d.amount} {t('egp')}</span>
                          <span className="text-slate-500 text-[10px]">
                            {new Date(d.created_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-400 font-semibold capitalize">
                            {d.payment_method === 'vodafone_cash' ? (
                              <span className="inline-flex items-center gap-1">
                                <img src="/vf_Logo.png" alt="Vodafone Cash" className="w-3.5 h-3.5 object-contain bg-white rounded-full p-0.5" />
                                {t('vfc_label')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <img src="/InstaPay_Logo.png" alt="InstaPay" className="w-3.5 h-3.5 object-contain bg-white rounded p-0.5" />
                                {t('instapay_label')}
                              </span>
                            )}
                          </span>
                          
                          {/* Badge Status */}
                          {d.status === 'pending' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 border border-slate-800 text-slate-400 flex items-center gap-1 animate-pulse">
                              <Loader2 className="w-3 h-3 animate-spin text-emerald-450" />
                              <span>{t('track_status_pending')}</span>
                            </span>
                          )}
                          {(d.status === 'auto_verified' || d.status === 'manual_verified') && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 border border-emerald-900/40 text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-transparent" />
                              <span>{t('track_status_verified')}</span>
                            </span>
                          )}
                          {d.status === 'rejected' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-950/30 border border-red-900/20 text-red-300 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-red-400" />
                              <span>{t('track_status_rejected')}</span>
                            </span>
                          )}
                          {d.status === 'refunded' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-950/30 border border-yellow-900/20 text-yellow-300 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-yellow-400" />
                              <span>{t('track_status_refunded')}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {lastTrackedUpdate && (
                    <p className="text-[10px] text-slate-500 text-end">
                      {t('track_last_updated')}: {lastTrackedUpdate.toLocaleTimeString()}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Platform Trust banner */}
            <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-2xl p-5 flex items-start gap-4">
              <AlertCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-white font-bold text-sm">
                  {language === 'ar' ? 'كيف يعمل التحقق التلقائي؟' : 'How does Auto-Verification work?'}
                </h4>
                <p className="text-slate-400 text-xs leading-relaxed">
                  {language === 'ar' 
                    ? 'عند إرسال تبرعك، يقوم هاتف أندرويد متصل بنظامنا بالتقاط رسالة تأكيد الدفع القصيرة (SMS) التي تصل من محفظة فودافون كاش أو إشعار إنستاباي. يقوم محرك المطابقة لدينا بالربط بين التبرع والرسالة تلقائياً خلال ثوانٍ، وتأكيد العملية فوراً دون تدخل بشري.' 
                    : 'Once you transfer and submit this form, a dedicated Android gateway device receives the official SMS from Vodafone Cash or InstaPay. Our parsing engine extracts transaction references and automatically approves the donation request in real time.'
                  }
                </p>
              </div>
            </div>

          </div>

        </div>

        {/* VERIFIED DONOR REGISTRY LEDGER */}
        <div className="glass-panel rounded-3xl p-6 md:p-8 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              {language === 'ar' ? 'سجل المتبرعين الموثقين (الشفافية الكاملة)' : 'Verified Donors Live Ledger (Full Transparency)'}
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              {language === 'ar' 
                ? 'سجل حي ومباشر للمدفوعات المعتمدة من واقع قاعدة البيانات لضمان الشفافية بنسبة 100%. يتم إخفاء أرقام الهواتف والأسماء لحماية الخصوصية.'
                : 'Live log of verified donation payments connected to our ledger. Personal numbers and names are masked to respect privacy.'}
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-900 bg-slate-950/40">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-900/30 text-slate-400 text-xs font-bold">
                  <th className="px-6 py-3.5 text-start">{language === 'ar' ? 'المتبرع' : 'Donor Name'}</th>
                  <th className="px-6 py-3.5 text-start">{language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}</th>
                  <th className="px-6 py-3.5 text-start">{language === 'ar' ? 'المبلغ' : 'Amount'}</th>
                  <th className="px-6 py-3.5 text-start">{language === 'ar' ? 'طريقة الدفع' : 'Payment Method'}</th>
                  <th className="px-6 py-3.5 text-start">{language === 'ar' ? 'تاريخ التوثيق' : 'Verification Date'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-xs text-slate-300">
                {recentDonationsError ? (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-red-400 font-mono">
                      Error: {(recentDonationsError as any).message || JSON.stringify(recentDonationsError)}
                    </td>
                  </tr>
                ) : recentDonations && recentDonations.length > 0 ? (
                  recentDonations.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-900/10 transition-colors">
                      <td className="px-6 py-4 font-bold text-white">
                        {item.masked_name || t('anonymous')}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-400">
                        {item.masked_phone || '—'}
                      </td>
                      <td className="px-6 py-4 font-black text-emerald-400 text-sm">
                        {item.amount} {t('egp')}
                      </td>
                      <td className="px-6 py-4 capitalize font-semibold">
                        {item.payment_method === 'vodafone_cash' ? (
                          <span className="inline-flex items-center gap-1.5 text-red-500 font-bold">
                            <img src="/vf_Logo.png" alt="Vodafone Cash" className="w-5 h-5 object-contain rounded-full bg-white p-0.5" />
                            <span>فودافون كاش</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-violet-400 font-bold">
                            <img src="/InstaPay_Logo.png" alt="InstaPay" className="w-5 h-5 object-contain rounded bg-white p-0.5" />
                            <span>إنستاباي</span>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {isMounted ? new Date(item.created_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US') : '...'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-slate-500">
                      {language === 'ar' ? 'لا توجد تبرعات موثقة بعد.' : 'No verified donations found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
