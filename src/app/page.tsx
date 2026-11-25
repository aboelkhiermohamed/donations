'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { Campaign, PaymentMethod, PaymentMethodConfig, WalletConfig } from '@/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getActivePaymentMethods, DEFAULT_PAYMENT_METHODS } from '@/lib/paymentService';
import { uploadScreenshotDirectly } from '@/lib/imageUpload';
import ThemeToggle from '@/components/ThemeToggle';
import LottieAnimation from '@/components/LottieAnimation';
import {
  Heart,
  HeartHandshake,
  Check,
  Copy,
  Globe,
  Share2,
  Download,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  Upload,
  X,
  ArrowRight,
  ShieldCheck,
  Menu,
  ExternalLink,
  Loader2,
  FileText,
  UserCheck,
  Layers,
  ChevronDown,
  Smartphone,
  CreditCard,
  Infinity,
  Sparkles
} from 'lucide-react';
import canvasConfetti from 'canvas-confetti';
import Link from 'next/link';
// @ts-ignore
import { jsPDF } from 'jspdf';
import ShareCampaignDialog from '@/components/ShareCampaignDialog';

const fireConfetti = (options?: canvasConfetti.Options) => {
  try {
    const fn = typeof canvasConfetti === 'function'
      ? canvasConfetti
      : (canvasConfetti as any)?.default;
    if (typeof fn === 'function') {
      fn(options);
    }
  } catch (err) {
    console.warn('Confetti trigger failed:', err);
  }
};

// Fallback campaign data if offline or schema cache warming up
const CANONICAL_CAMPAIGN: Campaign = {
  id: 'c580436d-9654-4720-bc2f-a9cb6bf0f7a0',
  name: 'Sadaqah Jariyah — In Loving Memory of Dr. Hussein Ali El-Amir & Dr. Nada Hani Hamed',
  name_ar: 'صدقة جارية — إهداء لروح د. حسين علي الأمير ود. ندى هاني حامد',
  description: 'An enduring charity with lasting impact. Uniting to provide an advanced ICU ventilator for Kafr El-Sheikh University Hospitals, dedicated in memory of Dr. Hussein Ali El-Amir & Dr. Nada Hani Hamed.',
  description_ar: 'بأثرٍ يبقى، وخيرٍ يمتد. نشارك معًا في توفير جهاز تنفس صناعي لدعم وحدة العناية المركزة بمستشفيات جامعة كفر الشيخ، صدقةً جارية عن روح فقيدينا الدكتور حسين علي الأمير والدكتورة ندى هاني حامد.',
  target_amount: 350000,
  collected_amount: 0,
  organizer: '9th Batch Physicians — Kafr El-Sheikh Medicine',
  organizer_ar: 'أطباء الدفعة التاسعة — طب كفر الشيخ',
  cover_image: '/ventilator_campaign_cover.png',
  created_at: '2026-06-24T13:47:41.527Z',
  updated_at: '2026-11-22T20:00:00.000Z',
};

const PRESET_AMOUNTS = [100, 250, 500, 1000, 2500, 5000];

// Fisher-Yates array shuffle for randomizing wallet order per visitor / refresh
function shuffleWallets<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function PublicDonationPage({ initialCampaignId }: { initialCampaignId?: string } = {}) {
  const { language, dir, toggleLanguage, t } = useLanguage();
  const queryClient = useQueryClient();

  // Mounting state
  const [isMounted, setIsMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Form State
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('vodafone_cash');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(500);
  const [amount, setAmount] = useState<string>('500');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [refNum, setRefNum] = useState('');
  const [digits, setDigits] = useState('');
  const [notes, setNotes] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submittedDonation, setSubmittedDonation] = useState<{ 
    id: string; 
    amount: number; 
    name: string; 
    ref: string;
    status: 'pending' | 'auto_verified' | 'manual_verified' | 'rejected';
  } | null>(null);
  const [justLiveConfirmed, setJustLiveConfirmed] = useState(false);

  // Real-time listener & light poll for submitted pending donation
  useEffect(() => {
    if (!submittedDonation || submittedDonation.status !== 'pending') return;

    const donationId = submittedDonation.id;
    let isSubscribed = true;

    const handleDonationConfirmed = () => {
      if (!isSubscribed) return;
      setSubmittedDonation(prev => {
        if (!prev || prev.id !== donationId || prev.status === 'auto_verified') return prev;
        return {
          ...prev,
          status: 'auto_verified',
        };
      });

      setJustLiveConfirmed(true);

      // Fire celebratory confetti!
      fireConfetti({
        particleCount: 110,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#153C32', '#217A61', '#24B58A', '#B79B68', '#F59E0B'],
      });

      // Invalidate public stats
      queryClient.invalidateQueries({ queryKey: ['publicConfirmedDonationsLedger'] });
      queryClient.invalidateQueries({ queryKey: ['campaignSummaryPublic'] });
    };

    // 1. Supabase Realtime channel
    const channel = supabase
      .channel(`realtime-donation-${donationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'donations',
          filter: `id=eq.${donationId}`,
        },
        (payload: any) => {
          const newStatus = payload.new?.status;
          if (newStatus === 'auto_verified' || newStatus === 'manual_verified') {
            handleDonationConfirmed();
          }
        }
      )
      .subscribe();

    // 2. Periodic poll check (every 4 seconds)
    const checkStatus = async () => {
      if (!isSubscribed) return;
      try {
        const res = await fetch(`/api/donations/status?ids=${donationId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const st = data[0].status;
          if (st === 'auto_verified' || st === 'manual_verified') {
            handleDonationConfirmed();
          }
        }
      } catch {}
    };

    const interval = setInterval(checkStatus, 4000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [submittedDonation?.id, submittedDonation?.status]);

  // Shuffled Vodafone Cash wallets: randomized on every page refresh/load to distribute incoming transfers evenly
  const [shuffledWallets, setShuffledWallets] = useState<WalletConfig[]>([]);

  // Copy feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Tracking state
  const [trackingQuery, setTrackingQuery] = useState('');
  const [trackedDonations, setTrackedDonations] = useState<any[]>([]);
  const [isTrackingLoading, setIsTrackingLoading] = useState(false);
  const [trackingSearched, setTrackingSearched] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const stored = localStorage.getItem('my_donation_ids');
      if (stored) {
        const ids = stored.split(',').filter(Boolean);
        if (ids.length > 0) {
          fetchStatusByIds(ids);
        }
      }
    } catch {}
  }, []);

  // 1. Fetch Campaign Details
  const { data: campaign } = useQuery<Campaign>({
    queryKey: ['campaignPublic', initialCampaignId],
    queryFn: async () => {
      try {
        let q = supabase.from('campaigns').select('*');
        if (initialCampaignId) {
          q = q.eq('id', initialCampaignId);
        }
        const { data, error } = await q.limit(1).maybeSingle();

        if (error) {
          return CANONICAL_CAMPAIGN;
        }
        return data || CANONICAL_CAMPAIGN;
      } catch (err) {
        return CANONICAL_CAMPAIGN;
      }
    },
    staleTime: 60000,
  });

  const activeCampaign = campaign || CANONICAL_CAMPAIGN;

  // 2. Fetch Active Payment Methods (Dynamic & Extensible)
  const { data: activeMethods = [] } = useQuery<PaymentMethodConfig[]>({
    queryKey: ['activePaymentMethodsPublic'],
    queryFn: async () => {
      try {
        const methods = await getActivePaymentMethods(supabase);
        return methods;
      } catch {
        return DEFAULT_PAYMENT_METHODS;
      }
    },
    staleTime: 30000,
  });

  // Auto-select first active payment method if current is not available
  useEffect(() => {
    if (activeMethods.length > 0) {
      const isCurrentActive = activeMethods.some(m => m.method_key === paymentMethod);
      if (!isCurrentActive) {
        setPaymentMethod(activeMethods[0].method_key as PaymentMethod);
      }
    }
  }, [activeMethods, paymentMethod]);

  const activeVfcMethod = useMemo(() => {
    return activeMethods.find(m => m.method_key === 'vodafone_cash');
  }, [activeMethods]);

  // Randomize Vodafone Cash wallet order on every page refresh/load to distribute incoming transfers evenly
  useEffect(() => {
    if (activeVfcMethod?.wallets && activeVfcMethod.wallets.length > 0) {
      setShuffledWallets(prev => {
        // Keep order stable during background React Query refetches within the same page session
        const currentIds = prev.map(w => w.id).sort().join(',');
        const newIds = activeVfcMethod.wallets!.map(w => w.id).sort().join(',');
        if (currentIds === newIds && prev.length > 0) {
          return prev;
        }
        return shuffleWallets(activeVfcMethod.wallets!);
      });
    }
  }, [activeVfcMethod]);

  const activeIpnMethod = useMemo(() => {
    return activeMethods.find(m => m.method_key === 'instapay');
  }, [activeMethods]);

  // 1. Fetch Campaign Aggregates & Statistics (High-Performance Cached Edge/Server API)
  // Eliminates downloading the full donations database on every visitor page load
  const { data: summaryData } = useQuery({
    queryKey: ['campaignSummaryPublic'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/campaign/summary');
        if (res.ok) {
          return await res.json();
        }
      } catch {}
      return null;
    },
    staleTime: 60000, // 1 minute fresh
    refetchOnWindowFocus: false,
  });

  const aggregates = useMemo(() => {
    const isUnlimited = Boolean(summaryData?.isUnlimited);
    const target = isUnlimited ? 0 : (Number(summaryData?.target || activeCampaign.target_amount) || 100000);
    if (summaryData) {
      return {
        totalCollected: Number(summaryData.totalCollected) || 0,
        target,
        isUnlimited,
        remaining: isUnlimited ? 0 : (Number(summaryData.remaining) ?? Math.max(0, target - (Number(summaryData.totalCollected) || 0))),
        progressPercent: isUnlimited ? 100 : (Number(summaryData.progressPercent) || 0),
        verifiedDonorsCount: Number(summaryData.verifiedDonorsCount) || 0,
        totalDonationsCount: Number(summaryData.totalDonationsCount) || 0,
        maxDonation: Number(summaryData.maxDonation) || 0,
        latest: summaryData.latestConfirmedAt ? { created_at: summaryData.latestConfirmedAt } : null,
      };
    }

    return {
      totalCollected: 0,
      target,
      isUnlimited: false,
      remaining: target,
      progressPercent: 0,
      verifiedDonorsCount: 0,
      totalDonationsCount: 0,
      maxDonation: 0,
      latest: null,
    };
  }, [summaryData, activeCampaign]);

  // 2. Fetch Latest Confirmed Donations for Public Transparency Ledger
  // Paginated/limited to 15 latest rows, requesting strictly necessary columns (zero donor phone PII transferred)
  const { data: donationsList = [], isLoading: isDonationsLoading } = useQuery({
    queryKey: ['publicConfirmedDonationsLedger'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('donations')
          .select(`
            id,
            amount,
            payment_method,
            created_at,
            donor:donors (
              name
            )
          `)
          .in('status', ['auto_verified', 'manual_verified'])
          .order('created_at', { ascending: false })
          .limit(15);

        if (error) return [];
        return data || [];
      } catch {
        return [];
      }
    },
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: false,
  });

  // Copy handler with tactile feedback
  const handleCopy = (text?: string | null, key: string = '') => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {}
  };

  // Preset amount click handler
  const handleSelectPreset = (val: number) => {
    setSelectedPreset(val);
    setAmount(String(val));
    if (formErrors.amount) {
      setFormErrors(prev => ({ ...prev, amount: '' }));
    }
  };

  // Custom amount change handler
  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    setAmount(val);
    const num = Number(val);
    if (PRESET_AMOUNTS.includes(num)) {
      setSelectedPreset(num);
    } else {
      setSelectedPreset(null);
    }
    if (formErrors.amount) {
      setFormErrors(prev => ({ ...prev, amount: '' }));
    }
  };

  // Screenshot handler
  const handleScreenshotChange = (file: File | null) => {
    setScreenshot(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setScreenshotPreview(url);
    } else {
      setScreenshotPreview(null);
    }
  };

  // Form Validation
  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = language === 'ar' ? 'الاسم مطلوب (يمكن كتابة فاعل خير)' : 'Name is required (or Anonymous)';
    }

    const cleanPhone = phone.trim().replace(/\s+/g, '');
    const egPhoneRegex = /^01[0125]\d{8}$/;
    if (!cleanPhone) {
      errors.phone = language === 'ar' ? 'رقم الهاتف مطلوب' : 'Phone number is required';
    } else if (!egPhoneRegex.test(cleanPhone)) {
      errors.phone = language === 'ar' ? 'يرجى إدخال رقم هاتف مصري صحيح (مثال: 01012345678)' : 'Please enter a valid Egyptian phone number (e.g. 01012345678)';
    }

    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      errors.amount = language === 'ar' ? 'يرجى تحديد مبلغ التبرع' : 'Please specify a valid donation amount';
    }

    if (!refNum.trim()) {
      errors.refNum = language === 'ar' ? 'الرقم المرجعي مطلوب للتحقق من العملية' : 'Transaction reference number is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Donation Handler
  const handleSubmitDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    let screenshotUrl: string | null = null;
    setUploadProgress(null);

    try {
      if (screenshot) {
        try {
          // Direct-to-Cloudflare R2 Upload: Browser uploads directly via presigned PUT URL
          // Client-side image compression downscales and compresses to WebP, saving ~85% bandwidth
          setUploadProgress(15);
          const { objectKey } = await uploadScreenshotDirectly(screenshot, (percent) => {
            setUploadProgress(percent);
          });
          screenshotUrl = objectKey;
        } catch (uploadException) {
          console.warn('Screenshot upload notice, continuing without screenshot:', uploadException);
        }
      }

      const res = await fetch('/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim().replace(/\s+/g, ''),
          campaignId: activeCampaign.id,
          amount: Number(amount),
          paymentMethod,
          transactionRef: refNum.trim() || null,
          last4Digits: digits.trim() || null,
          notes: notes.trim() || null,
          screenshotUrl,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to submit donation');
      }

      if (result.donationId) {
        try {
          const existing = localStorage.getItem('my_donation_ids');
          const ids = existing ? existing.split(',').filter(Boolean) : [];
          if (!ids.includes(result.donationId)) {
            ids.unshift(result.donationId);
            localStorage.setItem('my_donation_ids', ids.slice(0, 15).join(','));
          }
        } catch {}
      }

      fireConfetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.65 },
        colors: ['#153C32', '#217A61', '#24B58A', '#B79B68'],
      });

      const isAutoMatched = Boolean(result.match?.matched);
      setJustLiveConfirmed(false);
      setSubmittedDonation({
        id: result.donationId,
        amount: Number(amount),
        name: name.trim(),
        ref: refNum.trim(),
        status: isAutoMatched ? 'auto_verified' : 'pending',
      });

      setName('');
      setPhone('');
      setRefNum('');
      setDigits('');
      setNotes('');
      setScreenshot(null);
      setScreenshotPreview(null);
      setUploadProgress(null);
      setSelectedPreset(500);
      setAmount('500');

      queryClient.invalidateQueries({ queryKey: ['publicConfirmedDonationsLedger'] });
      queryClient.invalidateQueries({ queryKey: ['campaignSummaryPublic'] });
    } catch (err: any) {
      console.error('Submission error:', err);
      alert(language === 'ar' ? `تعذر تسجيل التبرع: ${err.message}` : `Submission error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  // Lookup Tracking Status
  const handleTrackSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = trackingQuery.trim();
    if (!query) return;

    setIsTrackingLoading(true);
    setTrackingSearched(true);
    setTrackingError(null);

    try {
      const isRef = query.length < 9 || /[a-zA-Z]/.test(query);
      const url = isRef
        ? `/api/donations/status?ref=${encodeURIComponent(query)}`
        : `/api/donations/status?phone=${encodeURIComponent(query)}`;

      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 429) {
          const errData = await res.json().catch(() => null);
          const msg = errData?.error || (language === 'ar' ? 'تم تجاوز الحد الأقصى لمحاولات الاستعلام. يرجى الانتظار 5 دقائق.' : 'Too many inquiries. Please wait 5 minutes.');
          setTrackingError(msg);
          setTrackedDonations([]);
          return;
        }
        throw new Error('Query failed');
      }
      const data = await res.json();
      setTrackedDonations(data || []);
    } catch (err) {
      console.error('Tracking fetch error:', err);
      setTrackedDonations([]);
    } finally {
      setIsTrackingLoading(false);
    }
  };

  const fetchStatusByIds = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    try {
      const res = await fetch(`/api/donations/status?ids=${ids.join(',')}`);
      if (res.ok) {
        const data = await res.json();
        setTrackedDonations(data || []);
        setTrackingSearched(true);
      }
    } catch {}
  };

  // Generate Digital Receipt PDF
  const handleGenerateReceiptPdf = async (donation: any) => {
    if (!donation) return;
    setIsGeneratingPdf(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1600;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');

      ctx.fillStyle = '#FAF9F5';
      ctx.fillRect(0, 0, 1200, 1600);

      ctx.strokeStyle = '#DDD9CC';
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 40, 1120, 1520);

      ctx.strokeStyle = '#B79B68';
      ctx.lineWidth = 1;
      ctx.strokeRect(48, 48, 1104, 1504);

      ctx.fillStyle = '#153C32';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('صدقة جارية', 600, 140);

      ctx.fillStyle = '#B79B68';
      ctx.font = '600 20px sans-serif';
      ctx.fillText('الدفعة التاسعة — كلية الطب البشري، جامعة كفر الشيخ', 600, 180);

      ctx.fillStyle = '#F4F3ED';
      ctx.fillRect(120, 220, 960, 120);
      ctx.strokeStyle = '#EAE8DE';
      ctx.strokeRect(120, 220, 960, 120);

      ctx.fillStyle = '#7A6230';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('إهداء إلى روح الزميلين العزيزين', 600, 260);

      ctx.fillStyle = '#191F1C';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('د. حسين علي الأمير   •   د. ندى هاني حامد', 600, 305);

      ctx.fillStyle = '#153C32';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('إيصال توثيق مساهمة صدقة جارية', 600, 410);

      ctx.fillStyle = '#738079';
      ctx.font = '16px sans-serif';
      ctx.fillText('مشروع توفير جهاز تنفس صناعي لدعم وحدة العناية المركزة بمستشفيات جامعة كفر الشيخ', 600, 445);

      ctx.strokeStyle = '#EAE8DE';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(120, 480);
      ctx.lineTo(1080, 480);
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(120, 520, 960, 480);
      ctx.strokeStyle = '#DDD9CC';
      ctx.strokeRect(120, 520, 960, 480);

      const rows = [
        { label: 'اسم المساهم:', value: donation.donor?.name || 'فاعل خير' },
        { label: 'قيمة المساهمة:', value: `${Number(donation.amount).toLocaleString('en-US')} جنيه مصري` },
        { label: 'وسيلة التحويل:', value: donation.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'إنستاباي (InstaPay)' },
        { label: 'رقم العملية / المرجع:', value: donation.transaction_ref || '—' },
        { label: 'تاريخ التوثيق:', value: new Date(donation.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
        { label: 'حالة المساهمة:', value: 'معتمد وموثق رسميًا في السجل العام للحملة' },
      ];

      ctx.textAlign = 'right';
      rows.forEach((r, idx) => {
        const y = 580 + (idx * 65);
        ctx.fillStyle = '#738079';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(r.label, 1020, y);

        ctx.fillStyle = idx === 1 ? '#153C32' : '#191F1C';
        ctx.font = idx === 1 ? 'bold 24px sans-serif' : '600 19px sans-serif';
        ctx.fillText(r.value, 650, y);

        if (idx < rows.length - 1) {
          ctx.strokeStyle = '#F4F3ED';
          ctx.beginPath();
          ctx.moveTo(150, y + 25);
          ctx.lineTo(1020, y + 25);
          ctx.stroke();
        }
      });

      const sealY = 1100;
      ctx.fillStyle = '#F0F9F6';
      ctx.strokeStyle = '#217A61';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(600, sealY, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#153C32';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('معتمد رسميًا', 600, sealY - 10);
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('الدفعة التاسعة', 600, sealY + 15);
      ctx.fillStyle = '#B79B68';
      ctx.font = '13px sans-serif';
      ctx.fillText('طب كفر الشيخ', 600, sealY + 35);

      ctx.fillStyle = '#55625B';
      ctx.font = 'italic 18px sans-serif';
      ctx.fillText('«مَا نَقَصَتْ صَدَقَةٌ مِنْ مَالٍ» — نسأل الله أن يتقبلها صدقةً جارية لا تنقطع.', 600, 1260);

      ctx.fillStyle = '#94A099';
      ctx.font = '14px sans-serif';
      ctx.fillText('تم إصدار هذا الإيصال رقميًا من منصة الصدقة الجارية الرسمية لأطباء الدفعة التاسعة.', 600, 1480);
      ctx.fillText(`معرف الوثيقة: ${donation.id || 'N/A'}`, 600, 1505);

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      pdf.save(`Sadaqah_Receipt_${(donation.id || 'donation').substring(0, 8)}.pdf`);
    } catch (err: any) {
      console.error('PDF export failed:', err);
      alert(language === 'ar' ? 'تعذر توليد الإيصال' : 'Failed to generate receipt PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-arabic bg-[#FAF9F5] dark:bg-[#0B1220] text-[#191F1C] dark:text-[#F3F5F4] relative transition-colors duration-200" dir={dir} suppressHydrationWarning>

      {/* ======================================================== */}
      {/* 1. TOP EDITORIAL NAVIGATION                              */}
      {/* ======================================================== */}
      <header className="sticky top-0 z-40 bg-[#FAF9F5]/90 dark:bg-[#0B1220]/90 backdrop-blur-md border-b border-[#EAE8DE] dark:border-[#283849] transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Brand Mark */}
          <Link href="/" className="flex items-center gap-2 sm:gap-3.5 group min-w-0 flex-shrink">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] flex items-center justify-center shadow-subtle group-hover:bg-[#1C4E41] dark:group-hover:bg-[#1fa37b] transition-colors flex-shrink-0">
              <HeartHandshake className="w-5 h-5 sm:w-6 sm:h-6 text-[#E2F3EE] dark:text-[#0B1220]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-sm sm:text-lg text-[#153C32] dark:text-[#24B58A] tracking-tight leading-tight whitespace-nowrap">
                {t('brand_title')}
              </span>
              <span className="text-[10px] sm:text-xs text-[#738079] dark:text-[#A7B4B0] font-medium truncate max-w-[125px] xs:max-w-[170px] sm:max-w-none">
                {t('brand_batch')}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-[#55625B] dark:text-[#A7B4B0]">
            <a href="#about" className="hover:text-[#153C32] dark:hover:text-[#24B58A] transition-colors">
              {t('nav_about')}
            </a>
            <a href="#progress" className="hover:text-[#153C32] dark:hover:text-[#24B58A] transition-colors">
              {t('nav_progress')}
            </a>
            <a href="#donate" className="hover:text-[#153C32] dark:hover:text-[#24B58A] transition-colors">
              {t('nav_donate')}
            </a>
            <a href="#tracking" className="hover:text-[#153C32] dark:hover:text-[#24B58A] transition-colors">
              {t('nav_tracking')}
            </a>
            <a href="#transparency" className="hover:text-[#153C32] dark:hover:text-[#24B58A] transition-colors">
              {t('nav_transparency')}
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            
            {/* Dark / Light Theme Toggle */}
            <ThemeToggle compact />

            {/* Language Switcher */}
            <button
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl border border-[#DDD9CC] dark:border-[#283849] bg-white dark:bg-[#172436] text-xs font-semibold text-[#3D4742] dark:text-[#F3F5F4] hover:bg-[#F4F3ED] dark:hover:bg-[#1f3047] shadow-subtle transition-colors flex-shrink-0"
              title="تغيير اللغة / Switch Language"
            >
              <Globe className="w-3.5 h-3.5 text-[#153C32] dark:text-[#24B58A]" />
              <span className="hidden sm:inline">{language === 'ar' ? 'English' : 'العربية'}</span>
              <span className="inline sm:hidden font-mono">{language === 'ar' ? 'EN' : 'ع'}</span>
            </button>

            {/* Admin Login Button */}
            <Link
              href="/admin/login"
              className="inline-flex items-center justify-center p-2 sm:px-3 sm:py-2 rounded-xl border border-[#DDD9CC] dark:border-[#283849] bg-white dark:bg-[#172436] text-xs font-semibold text-[#3D4742] dark:text-[#F3F5F4] hover:bg-[#F4F3ED] dark:hover:bg-[#1f3047] shadow-subtle transition-colors flex-shrink-0"
              title={language === 'ar' ? 'بوابة دخول الإدارة' : 'Admin Portal'}
            >
              <ShieldCheck className="w-4 h-4 text-[#153C32] dark:text-[#24B58A]" />
              <span className="hidden sm:inline sm:ms-1.5">{language === 'ar' ? 'دخول الإدارة' : 'Admin'}</span>
            </Link>

            {/* Quick Donation Link */}
            <a
              href="#donate"
              className="hidden lg:inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-xs md:text-sm font-bold shadow-subtle hover:bg-[#1C4E41] dark:hover:bg-[#1fa37b] transition-all transform active:scale-[0.98]"
            >
              <Heart className="w-4 h-4 fill-white/20 text-white dark:text-[#0B1220] dark:fill-[#0B1220]/20" />
              <span>{t('hero_cta_donate')}</span>
            </a>

            {/* Mobile Menu Trigger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl border border-[#DDD9CC] dark:border-[#283849] bg-white dark:bg-[#172436] text-[#3D4742] dark:text-[#F3F5F4] hover:bg-[#F4F3ED] dark:hover:bg-[#1f3047] transition-colors flex-shrink-0"
              aria-label="القائمة"
            >
              <Menu className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#EAE8DE] dark:border-[#283849] bg-[#FAF9F5] dark:bg-[#111C2D] px-4 py-4 space-y-3 shadow-card animate-fadeIn">
            <a
              href="#about"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-semibold text-[#191F1C] dark:text-[#F3F5F4] hover:bg-white dark:hover:bg-[#172436]"
            >
              {t('nav_about')}
            </a>
            <a
              href="#progress"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-semibold text-[#191F1C] dark:text-[#F3F5F4] hover:bg-white dark:hover:bg-[#172436]"
            >
              {t('nav_progress')}
            </a>
            <a
              href="#donate"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-semibold text-[#153C32] dark:text-[#24B58A] font-bold hover:bg-white dark:hover:bg-[#172436]"
            >
              {t('nav_donate')}
            </a>
            <a
              href="#tracking"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-semibold text-[#191F1C] dark:text-[#F3F5F4] hover:bg-white dark:hover:bg-[#172436]"
            >
              {t('nav_tracking')}
            </a>
            <a
              href="#transparency"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-semibold text-[#191F1C] dark:text-[#F3F5F4] hover:bg-white dark:hover:bg-[#172436]"
            >
              {t('nav_transparency')}
            </a>
            <div className="pt-2 border-t border-[#EAE8DE] dark:border-[#283849] space-y-1">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShareDialogOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-[#B79B68] dark:text-[#C5A876] hover:bg-white dark:hover:bg-[#172436]"
              >
                <Share2 className="w-4 h-4" />
                <span>{language === 'ar' ? 'شارك الحملة' : 'Share Campaign'}</span>
              </button>

              <Link
                href="/admin/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-[#153C32] dark:text-[#24B58A] hover:bg-white dark:hover:bg-[#172436]"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{language === 'ar' ? 'بوابة دخول الإدارة' : 'Admin Portal'}</span>
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">

        {/* ======================================================== */}
        {/* 2. HERO SECTION — EDITORIAL, RESPECTFUL, MEMORIAL        */}
        {/* ======================================================== */}
        <section className="relative pt-12 pb-16 md:pt-20 md:pb-24 border-b border-[#EAE8DE] dark:border-[#283849] overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-96 bg-gradient-to-b from-[#F4F3ED] dark:from-[#111C2D] to-transparent pointer-events-none -z-10" />

          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 md:space-y-8">
            
            {/* Eyebrow Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-[#172436] border border-[#DDD9CC] dark:border-[#283849] text-xs font-bold text-[#153C32] dark:text-[#24B58A] shadow-subtle mx-auto">
              <span className="w-2 h-2 rounded-full bg-[#B79B68] dark:bg-[#C5A876]" />
              <span>{t('hero_eyebrow')}</span>
            </div>

            {/* Primary Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-[#153C32] dark:text-[#F3F5F4] tracking-tight leading-[1.2] sm:leading-[1.15]">
              {t('hero_title')}
            </h1>

            {/* Memorial Tribute Container */}
            <div className="p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-editorial space-y-2 border-r-4 rtl:border-r-4 rtl:border-l-0 ltr:border-l-4 ltr:border-r-0 border-[#B79B68] dark:border-[#C5A876] max-w-2xl mx-auto">
              <p className="text-xs font-bold uppercase tracking-wider text-[#9E8047] dark:text-[#C5A876]">
                {t('hero_dedication_to')}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-1.5 text-xl sm:text-2xl md:text-3xl font-extrabold text-[#191F1C] dark:text-[#F3F5F4]">
                <span className="text-[#153C32] dark:text-[#24B58A]">{t('hero_doctor_1')}</span>
                <span className="text-[#B79B68] font-light hidden sm:inline">•</span>
                <span className="text-[#153C32] dark:text-[#24B58A]">{t('hero_doctor_2')}</span>
              </div>
              <p className="text-xs sm:text-sm text-[#738079] dark:text-[#A7B4B0] pt-1">
                رحمة الله عليهما وجعل هذا العمل في ميزان حسناتهما ونورًا لقبورهما.
              </p>
            </div>

            {/* Mission Subtitle */}
            <p className="text-sm sm:text-lg text-[#3D4742] dark:text-[#A7B4B0] leading-relaxed font-normal max-w-3xl mx-auto px-1 sm:px-0">
              {t('hero_subtitle')}
            </p>

            {/* Hadith Quote */}
            <blockquote className="text-xs sm:text-sm text-[#7A6230] dark:text-[#C5A876] italic font-medium max-w-2xl mx-auto py-2.5 px-4 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849]">
              {t('hero_verse')}
            </blockquote>

            {/* CTAs */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <a
                href="#donate"
                className="inline-flex items-center justify-center gap-2.5 px-7 sm:px-8 py-3.5 sm:py-4 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-sm sm:text-base font-bold shadow-elevated hover:bg-[#1C4E41] dark:hover:bg-[#1fa37b] transition-all transform active:scale-[0.98]"
              >
                <Heart className="w-4 sm:w-5 h-4 sm:h-5 fill-white/20 dark:fill-[#0B1220]/20" />
                <span>{t('hero_cta_donate')}</span>
              </a>

              <button
                type="button"
                onClick={() => setShareDialogOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 sm:py-4 rounded-xl bg-white dark:bg-[#172436] border border-[#B79B68]/60 dark:border-[#C5A876]/60 text-[#153C32] dark:text-[#F3F5F4] text-sm sm:text-base font-bold hover:bg-[#FAF9F5] dark:hover:bg-[#1f3047] shadow-subtle transition-all transform active:scale-[0.98] group"
              >
                <Share2 className="w-4 sm:w-5 h-4 sm:h-5 text-[#B79B68] dark:text-[#C5A876] group-hover:scale-110 transition-transform" />
                <span>{language === 'ar' ? 'شارك الحملة' : 'Share Campaign'}</span>
              </button>

              <a
                href="#about"
                className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-3.5 sm:py-4 rounded-xl bg-white dark:bg-[#172436] border border-[#DDD9CC] dark:border-[#283849] text-[#3D4742] dark:text-[#F3F5F4] text-sm sm:text-base font-semibold hover:bg-[#F4F3ED] dark:hover:bg-[#1f3047] transition-colors"
              >
                <span>{t('hero_cta_about')}</span>
                <ArrowRight className="w-4 h-4 rtl-flip" />
              </a>
            </div>

          </div>
        </section>

        {/* ======================================================== */}
        {/* 3. CAMPAIGN PROGRESS SECTION — LIVE & TRANSPARENT        */}
        {/* ======================================================== */}
        <section id="progress" className="py-16 md:py-20 border-b border-[#EAE8DE] dark:border-[#283849] bg-white dark:bg-[#111C2D] transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            
            <div className="max-w-2xl mx-auto text-center space-y-3">
              <span className="inline-block text-xs font-bold uppercase tracking-wider text-[#B79B68] dark:text-[#C5A876]">
                {language === 'ar' ? 'الشفافية المالية' : 'Financial Transparency'}
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#153C32] dark:text-[#F3F5F4]">
                {t('progress_title')}
              </h2>
              <p className="text-sm text-[#55625B] dark:text-[#A7B4B0] leading-relaxed">
                {t('progress_subtitle')}
              </p>
            </div>

            <div className="max-w-4xl mx-auto p-6 sm:p-8 rounded-3xl bg-[#FAF9F5] dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-6">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold text-[#738079] dark:text-[#A7B4B0] block mb-1">
                    {t('collected')}
                  </span>
                  <div className="text-3xl sm:text-4xl font-black text-[#153C32] dark:text-[#24B58A]">
                    {aggregates.totalCollected.toLocaleString('en-US')}{' '}
                    <span className="text-lg font-bold text-[#55625B] dark:text-[#A7B4B0]">{t('egp')}</span>
                  </div>
                </div>

                <div className="text-start sm:text-end">
                  <span className="text-xs font-semibold text-[#738079] dark:text-[#A7B4B0] block mb-1">
                    {t('target')}
                  </span>
                  {aggregates.isUnlimited ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-sm sm:text-base font-bold text-purple-800 dark:text-purple-300">
                      <Infinity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span>{language === 'ar' ? 'هدف مفتوح (غير محدود)' : 'Open-Ended'}</span>
                    </div>
                  ) : (
                    <div className="text-2xl sm:text-3xl font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                      {aggregates.target.toLocaleString('en-US')}{' '}
                      <span className="text-sm font-semibold text-[#738079] dark:text-[#A7B4B0]">{t('egp')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Track */}
              <div className="space-y-2">
                <div className="h-4 w-full bg-[#EAE8DE] dark:bg-[#0B1220] rounded-full overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${
                      aggregates.isUnlimited
                        ? 'w-full bg-gradient-to-r from-[#153C32] via-[#24B58A] to-[#153C32] animate-pulse'
                        : 'bg-gradient-to-r from-[#153C32] to-[#217A61] dark:from-[#24B58A] dark:to-[#3CB895]'
                    }`}
                    style={aggregates.isUnlimited ? undefined : { width: `${Math.max(2, aggregates.progressPercent)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-[#738079] dark:text-[#A7B4B0]">
                  {aggregates.isUnlimited ? (
                    <>
                      <span className="text-purple-700 dark:text-purple-300 font-bold flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'مبادرة جارية ومستمرة' : 'Ongoing Initiative'}</span>
                      </span>
                      <span>{language === 'ar' ? 'باب الصدقة مفتوح دائمًا' : 'Donations Always Open'}</span>
                    </>
                  ) : (
                    <>
                      <span>{aggregates.progressPercent}% {language === 'ar' ? 'مكتمل' : 'completed'}</span>
                      <span>{t('remaining')}: {aggregates.remaining.toLocaleString('en-US')} {t('egp')}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-[#EAE8DE] dark:border-[#283849]">
                <div className="text-center p-3 rounded-xl bg-white dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849]">
                  <span className="block text-xs text-[#738079] dark:text-[#A7B4B0] mb-1">{t('verified_donors_count')}</span>
                  <span className="text-lg font-bold text-[#153C32] dark:text-[#24B58A]">{aggregates.verifiedDonorsCount}</span>
                </div>

                <div className="text-center p-3 rounded-xl bg-white dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849]">
                  <span className="block text-xs text-[#738079] dark:text-[#A7B4B0] mb-1">{language === 'ar' ? 'إجمالي العمليات' : 'Total Gifts'}</span>
                  <span className="text-lg font-bold text-[#153C32] dark:text-[#24B58A]">{aggregates.totalDonationsCount}</span>
                </div>

                <div className="text-center p-3 rounded-xl bg-white dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849]">
                  <span className="block text-xs text-[#738079] dark:text-[#A7B4B0] mb-1">{t('largest_donation')}</span>
                  <span className="text-lg font-bold text-[#153C32] dark:text-[#24B58A]">
                    {aggregates.maxDonation > 0 ? `${aggregates.maxDonation.toLocaleString('en-US')} ${t('egp')}` : '—'}
                  </span>
                </div>

                <div className="text-center p-3 rounded-xl bg-white dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849]">
                  <span className="block text-xs text-[#738079] dark:text-[#A7B4B0] mb-1">{language === 'ar' ? 'الهدف المالي' : 'Goal Status'}</span>
                  <span className="text-lg font-bold text-[#217A61] dark:text-[#24B58A]">
                    {aggregates.progressPercent >= 100 ? (language === 'ar' ? 'اكتمل بنجاح' : 'Achieved') : (language === 'ar' ? 'حملة جارية' : 'In Progress')}
                  </span>
                </div>
              </div>

              {/* Share Campaign CTA in Progress Section */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849]">
                <div className="flex items-center gap-3 text-start">
                  <div className="w-10 h-10 rounded-xl bg-[#FAF9F5] dark:bg-[#0B1220] border border-[#DDD9CC] dark:border-[#283849] flex items-center justify-center flex-shrink-0 text-[#B79B68]">
                    <Sparkles className="w-5 h-5 text-[#B79B68]" />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-[#153C32] dark:text-[#F3F5F4] block">
                      {language === 'ar' ? '«الدال على الخير كفاعله»' : 'Multiply the impact of this cause'}
                    </span>
                    <span className="text-[11px] text-[#738079] dark:text-[#A7B4B0]">
                      {language === 'ar' ? 'مشاركتك للحملة تساعد في وصولها لعدد أكبر من المساهمين' : 'Sharing this campaign helps reach more caring donors'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShareDialogOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#153C32] hover:bg-[#1C4E41] text-white dark:bg-[#217A61] dark:hover:bg-[#24B58A] text-xs font-bold transition-all shadow-subtle transform active:scale-95"
                >
                  <Share2 className="w-4 h-4 text-[#34d399]" />
                  <span>{language === 'ar' ? 'شارك الحملة الآن' : 'Share Campaign'}</span>
                </button>
              </div>

            </div>

          </div>
        </section>

        {/* ======================================================== */}
        {/* 4. ABOUT THE CAMPAIGN — PURPOSE & MEDICAL IMPACT        */}
        {/* ======================================================== */}
        <section id="about" className="py-16 md:py-24 border-b border-[#EAE8DE] dark:border-[#283849] bg-[#FAF9F5] dark:bg-[#0B1220] transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            
            <div className="max-w-3xl mx-auto text-center space-y-3">
              <span className="inline-block text-xs font-bold uppercase tracking-wider text-[#B79B68] dark:text-[#C5A876]">
                {t('story_badge')}
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#153C32] dark:text-[#F3F5F4]">
                {t('story_title')}
              </h2>
            </div>

            <div className="max-w-4xl mx-auto bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] rounded-3xl p-8 sm:p-12 shadow-subtle space-y-6 text-[#3D4742] dark:text-[#A7B4B0] text-base sm:text-lg leading-relaxed font-normal">
              <p>{t('story_p1')}</p>
              <p>{t('story_p2')}</p>
              <p className="font-semibold text-[#153C32] dark:text-[#24B58A]">{t('story_p3')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              
              <div className="p-6 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-3">
                <div className="w-12 h-12 rounded-xl bg-[#F0F9F6] dark:bg-[#111C2D] border border-[#153C32]/10 dark:border-[#24B58A]/20 flex items-center justify-center text-[#153C32] dark:text-[#24B58A]">
                  <Layers className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg text-[#153C32] dark:text-[#F3F5F4]">
                  {t('story_feature_1_title')}
                </h3>
                <p className="text-sm text-[#55625B] dark:text-[#A7B4B0] leading-relaxed">
                  {t('story_feature_1_desc')}
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-3">
                <div className="w-12 h-12 rounded-xl bg-[#FAF8F2] dark:bg-[#111C2D] border border-[#B79B68]/30 dark:border-[#C5A876]/30 flex items-center justify-center text-[#9E8047] dark:text-[#C5A876]">
                  <Heart className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg text-[#153C32] dark:text-[#F3F5F4]">
                  {t('story_feature_2_title')}
                </h3>
                <p className="text-sm text-[#55625B] dark:text-[#A7B4B0] leading-relaxed">
                  {t('story_feature_2_desc')}
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-3">
                <div className="w-12 h-12 rounded-xl bg-[#F0F9F6] dark:bg-[#111C2D] border border-[#217A61]/20 dark:border-[#24B58A]/20 flex items-center justify-center text-[#217A61] dark:text-[#24B58A]">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg text-[#153C32] dark:text-[#F3F5F4]">
                  {t('story_feature_3_title')}
                </h3>
                <p className="text-sm text-[#55625B] dark:text-[#A7B4B0] leading-relaxed">
                  {t('story_feature_3_desc')}
                </p>
              </div>

            </div>

          </div>
        </section>

        {/* ======================================================== */}
        {/* 5. DONATION SECTION — DYNAMIC PAYMENT CHANNELS           */}
        {/* ======================================================== */}
        <section id="donate" className="py-16 md:py-24 border-b border-[#EAE8DE] dark:border-[#283849] bg-white dark:bg-[#111C2D] transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            
            <div className="max-w-3xl mx-auto text-center space-y-3">
              <span className="inline-block text-xs font-bold uppercase tracking-wider text-[#B79B68] dark:text-[#C5A876]">
                {language === 'ar' ? 'المساهمة المباشرة' : 'Direct Contribution'}
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#153C32] dark:text-[#F3F5F4]">
                {t('form_title')}
              </h2>
              <p className="text-sm text-[#55625B] dark:text-[#A7B4B0] leading-relaxed">
                {t('form_subtitle')}
              </p>
            </div>

            {/* Check if any payment method is active */}
            {activeMethods.length === 0 ? (
              <div className="max-w-lg mx-auto p-8 rounded-3xl bg-[#FAF9F5] dark:bg-[#172436] border border-[#DDD9CC] dark:border-[#283849] text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-[#B79B68] mx-auto" />
                <h3 className="font-bold text-base text-[#191F1C] dark:text-[#F3F5F4]">
                  {language === 'ar' ? 'وسائل التبرع معطلة مؤقتًا' : 'Donations Temporarily Unavailable'}
                </h3>
                <p className="text-xs text-[#738079] dark:text-[#A7B4B0] leading-relaxed">
                  {language === 'ar' ? 'يقوم مسؤولو الدفعة حاليًا بتحديث حسابات التحويل. يرجى مراجعة الصفحة لاحقًا.' : 'The coordinators are currently updating payment accounts. Please check back shortly.'}
                </p>
              </div>
            ) : (
              <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Dynamic Payment Channels (col-span-5) */}
                <div className="lg:col-span-5 space-y-6">
                  
                  <div className="p-6 rounded-3xl bg-[#FAF9F5] dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle space-y-6">
                    <div>
                      <h3 className="font-extrabold text-lg text-[#153C32] dark:text-[#F3F5F4]">
                        {t('payment_inst_title')}
                      </h3>
                      <p className="text-xs text-[#738079] dark:text-[#A7B4B0] mt-1">
                        {t('payment_inst_sub')}
                      </p>
                    </div>

                    {/* Method Selector Tabs (Only show if multiple active methods) */}
                    {activeMethods.length > 1 && (
                      <div className="grid grid-cols-2 gap-2 p-1 bg-[#EAE8DE] dark:bg-[#111C2D] rounded-xl text-xs font-bold">
                        {activeMethods.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setPaymentMethod(m.method_key as PaymentMethod)}
                            className={`py-2.5 px-3 rounded-lg transition-all ${
                              paymentMethod === m.method_key
                                ? 'bg-white dark:bg-[#172436] text-[#153C32] dark:text-[#24B58A] shadow-subtle'
                                : 'text-[#738079] dark:text-[#A7B4B0] hover:text-[#191F1C]'
                            }`}
                          >
                            {language === 'ar' ? m.display_name_ar : m.display_name}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* VODAFONE CASH WALLETS (Dynamic Unlimited List with Shuffle on Refresh) */}
                    {paymentMethod === 'vodafone_cash' && activeVfcMethod && (
                      <div className="space-y-3 animate-fadeIn">
                        
                        {(shuffledWallets.length > 0 ? shuffledWallets : (activeVfcMethod.wallets || [])).map((w, idx) => (
                          <div key={w.id} className="p-4 rounded-2xl bg-white dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] space-y-2">
                            <span className="text-xs font-semibold text-[#738079] dark:text-[#A7B4B0] block">
                              {w.label}
                            </span>
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-mono text-lg font-bold text-[#153C32] dark:text-[#24B58A] tracking-wider" dir="ltr">
                                {w.phone_number}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(w.phone_number, w.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF9F5] dark:bg-[#172436] border border-[#DDD9CC] dark:border-[#283849] text-xs font-bold text-[#153C32] dark:text-[#24B58A] hover:bg-[#F4F3ED]"
                              >
                                {copiedKey === w.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-green-600" />
                                    <span>{t('copied')}</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>{t('copy')}</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ))}

                        <div className="text-xs text-[#738079] dark:text-[#A7B4B0] leading-relaxed pt-2">
                          {language === 'ar'
                            ? '• يرجى التحويل كـ (تحويل أموال فودافون كاش) لأي من الأرقام أعلاه، ثم نسخ رقم العملية من الرسالة لتأكيد التوثيق.'
                            : '• Please transfer as Vodafone Cash funds to any of the numbers above, then copy the reference from your SMS.'}
                        </div>

                      </div>
                    )}

                    {/* INSTAPAY DETAILS */}
                    {paymentMethod === 'instapay' && activeIpnMethod && (
                      <div className="space-y-4 animate-fadeIn">
                        
                        {/* IPA Address */}
                        {activeIpnMethod.configuration?.instapay_address && (
                          <div className="p-4 rounded-2xl bg-white dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] space-y-2">
                            <span className="text-xs font-semibold text-[#738079] dark:text-[#A7B4B0] block">
                              {t('instapay_acc')}
                            </span>
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-mono text-sm sm:text-base font-bold text-[#153C32] dark:text-[#24B58A] break-all" dir="ltr">
                                {activeIpnMethod.configuration.instapay_address}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(activeIpnMethod.configuration?.instapay_address, 'ipa')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF9F5] dark:bg-[#172436] border border-[#DDD9CC] dark:border-[#283849] text-xs font-bold text-[#153C32] dark:text-[#24B58A]"
                              >
                                {copiedKey === 'ipa' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* QR preview */}
                        {activeIpnMethod.configuration?.instapay_qr_url && (
                          <div className="p-4 rounded-2xl bg-white dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-center space-y-2">
                            <span className="text-xs font-semibold text-[#738079] dark:text-[#A7B4B0] block">
                              {t('scan_qr')}
                            </span>
                            <img
                              src={activeIpnMethod.configuration.instapay_qr_url}
                              alt="InstaPay QR"
                              className="w-36 h-36 mx-auto object-contain rounded-xl border border-[#EAE8DE] p-1 bg-white"
                            />
                          </div>
                        )}

                        {/* Direct Payment Link */}
                        {activeIpnMethod.configuration?.instapay_payment_link && (
                          <a
                            href={activeIpnMethod.configuration.instapay_payment_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-xs font-bold text-[#153C32] dark:text-[#24B58A] hover:bg-[#F4F3ED]"
                          >
                            <ExternalLink className="w-4 h-4 text-[#217A61]" />
                            <span>{t('open_instapay_app')}</span>
                          </a>
                        )}

                      </div>
                    )}

                  </div>

                </div>

                {/* Donation Form Container (col-span-7) */}
                <div className="lg:col-span-7">
                  
                  {submittedDonation ? (
                    <div className="p-5 sm:p-8 md:p-10 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#172436] border border-[#217A61]/30 dark:border-[#24B58A]/30 shadow-editorial text-center space-y-6 animate-fadeIn">
                      
                      {/* Lottie Animation depending on real verification status */}
                      <div className="flex justify-center -my-3">
                        {submittedDonation.status === 'auto_verified' ? (
                          <LottieAnimation 
                            animationPath="/animations/payment-success.json" 
                            className="w-36 h-36 sm:w-44 sm:h-44 mx-auto" 
                            loop={false}
                          />
                        ) : (
                          <LottieAnimation 
                            animationPath="/animations/payment-waiting.json" 
                            className="w-36 h-36 sm:w-44 sm:h-44 mx-auto" 
                            loop={true}
                          />
                        )}
                      </div>

                      {/* Live Confirmation Alert Banner */}
                      {justLiveConfirmed && (
                        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-400 dark:border-emerald-600 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-bold flex items-center justify-center gap-2.5 animate-bounce shadow-subtle max-w-md mx-auto">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                          <span>{language === 'ar' ? '🎉 تم استلام وتأكيد التحويل الآن بنجاح! تم اعتماد تبرعكم وتحديث لوحة الشفافية.' : '🎉 Payment verified & confirmed right now!'}</span>
                        </div>
                      )}

                      {/* Explicit Status Badge */}
                      <div className="flex justify-center">
                        {submittedDonation.status === 'auto_verified' ? (
                          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span>{language === 'ar' ? 'حالة الطلب: موثق ومعتمد فورياً' : 'Status: Auto-Verified & Approved'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-bold text-amber-800 dark:text-amber-300">
                            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <span>{language === 'ar' ? 'حالة الطلب: قيد المراجعة والربط الآلي' : 'Status: Pending Verification'}</span>
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-2xl font-black text-[#153C32] dark:text-[#24B58A]">
                          {submittedDonation.status === 'auto_verified'
                            ? (language === 'ar' ? 'تم توثيق التبرع بنجاح!' : 'Donation Verified Successfully!')
                            : (language === 'ar' ? 'تم استلام طلب التبرع بنجاح' : 'Donation Request Received')}
                        </h3>
                        <p className="text-sm text-[#55625B] dark:text-[#A7B4B0] leading-relaxed max-w-md mx-auto">
                          {submittedDonation.status === 'auto_verified'
                            ? (language === 'ar' ? 'جزاكم الله خيرًا. تم التحقق من عملية التحويل ومطابقتها آلياً وتحديث لوحة الشفافية وإجمالي الحملة فوراً.' : 'Thank you! Your transaction was automatically matched and recorded.')
                            : (language === 'ar' ? 'جزاكم الله خيرًا. تم استلام بيانات طلبكم وهو الآن قيد الربط الآلي أو المراجعة من مسؤولي الدفعة.' : 'Thank you! Your donation was recorded and is awaiting automated match or review.')}
                        </p>
                      </div>

                      {/* Donor Summary Box with explicit status row */}
                      <div className="p-4 rounded-2xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#EAE8DE] dark:border-[#283849] text-sm space-y-2 max-w-sm mx-auto text-start">
                        <div className="flex justify-between">
                          <span className="text-[#738079] dark:text-[#A7B4B0]">{t('field_name')}:</span>
                          <span className="font-bold text-[#191F1C] dark:text-[#F3F5F4]">{submittedDonation.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#738079] dark:text-[#A7B4B0]">{t('field_amount')}:</span>
                          <span className="font-bold text-[#153C32] dark:text-[#24B58A]">{submittedDonation.amount.toLocaleString('en-US')} {t('egp')}</span>
                        </div>
                        {submittedDonation.ref && (
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-[#738079] dark:text-[#A7B4B0] text-xs sm:text-sm">
                              {language === 'ar' ? 'الرقم المرجعي للتحويل:' : 'Reference / Tx ID:'}
                            </span>
                            <span className="font-mono text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4] tracking-wider" dir="ltr">
                              {submittedDonation.ref}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1.5 border-t border-[#EAE8DE] dark:border-[#283849]">
                          <span className="text-[#738079] dark:text-[#A7B4B0]">{language === 'ar' ? 'حالة التوثيق:' : 'Verification Status:'}</span>
                          <span className={`text-xs font-bold ${
                            submittedDonation.status === 'auto_verified' 
                              ? 'text-emerald-700 dark:text-emerald-300' 
                              : 'text-amber-700 dark:text-amber-400'
                          }`}>
                            {submittedDonation.status === 'auto_verified' 
                              ? (language === 'ar' ? 'معتمد وموثق' : 'Approved') 
                              : (language === 'ar' ? 'معلق (بانتظار التأكيد)' : 'Pending')}
                          </span>
                        </div>
                      </div>

                      {/* Instructions for Pending Submissions: wait up to 24h & track */}
                      {submittedDonation.status !== 'auto_verified' && (
                        <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-start space-y-2 max-w-sm mx-auto">
                          <div className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                            <span>{language === 'ar' ? 'ماذا تفعل الآن؟' : 'Next Steps'}</span>
                          </div>
                          <p className="text-[12px] text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                            {language === 'ar' 
                              ? 'يرجى الانتظار حتى 24 ساعة؛ حيث يقوم النظام بمطابقة التحويلات بنكياً أو مراجعتها يدوياً من مسؤولي الدفعة. يمكنك في أي وقت متابعة حالة طلبك ومعرفة ما إذا تم اعتماده عبر قسم "متابعة تبرعي" بالأسفل باستخدام رقم هاتفك أو الرقم المرجعي.'
                              : 'Please allow up to 24 hours for bank reconciliation or admin review. You can track your donation status anytime in the "Track Contribution" section below using your phone or reference number.'}
                          </p>
                          <div className="pt-1">
                            <a 
                              href="#tracking" 
                              onClick={() => {
                                if (submittedDonation.ref) setTrackingQuery(submittedDonation.ref);
                              }}
                              className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 dark:text-amber-300 hover:underline"
                            >
                              <span>{language === 'ar' ? 'الانتقال إلى قسم متابعة تبرعي' : 'Go to Track Contribution'}</span>
                              <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                            </a>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                        {submittedDonation.status === 'auto_verified' && (
                          <button
                            type="button"
                            onClick={() => handleGenerateReceiptPdf(submittedDonation)}
                            disabled={isGeneratingPdf}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-xs font-bold hover:bg-[#1C4E41]"
                          >
                            {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                            <span>{t('receipt_btn')}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setShareDialogOpen(true)}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#FAF9F5] dark:bg-[#0B1220] border border-[#B79B68]/50 dark:border-[#C5A876]/50 text-[#153C32] dark:text-[#F3F5F4] text-xs font-bold hover:bg-[#F4F3ED] dark:hover:bg-[#1f3047] shadow-subtle transition-all"
                        >
                          <Share2 className="w-4 h-4 text-[#B79B68]" />
                          <span>{language === 'ar' ? 'شارك الحملة' : 'Share Campaign'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSubmittedDonation(null);
                            setJustLiveConfirmed(false);
                          }}
                          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-xs font-semibold text-[#3D4742] dark:text-[#F3F5F4] hover:bg-[#F4F3ED] dark:hover:bg-[#1f3047]"
                        >
                          {t('new_submission_btn')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitDonation} className="p-6 sm:p-10 rounded-3xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-editorial space-y-6">
                      
                      {/* Amount Preset Chips */}
                      <div className="space-y-2.5">
                        <label className="block text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                          {t('select_amount')}
                        </label>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {PRESET_AMOUNTS.map(preset => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => handleSelectPreset(preset)}
                              className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all ${
                                selectedPreset === preset
                                  ? 'bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] border-[#153C32] dark:border-[#24B58A] shadow-subtle'
                                  : 'bg-[#FAF9F5] dark:bg-[#111C2D] text-[#3D4742] dark:text-[#F3F5F4] border-[#DDD9CC] dark:border-[#283849] hover:bg-[#F4F3ED]'
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>

                        <div className="pt-1">
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={amount}
                              onChange={handleCustomAmountChange}
                              placeholder="500"
                              className={`w-full py-3 px-4 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border text-sm font-bold text-[#153C32] dark:text-[#24B58A] focus:outline-none ${
                                formErrors.amount ? 'border-red-400' : 'border-[#DDD9CC] dark:border-[#283849]'
                              }`}
                            />
                            <span className="absolute inset-y-0 end-4 flex items-center text-xs font-bold text-[#738079] dark:text-[#A7B4B0]">
                              {t('egp')}
                            </span>
                          </div>
                          {formErrors.amount && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.amount}</p>
                          )}
                        </div>
                      </div>

                      {/* Donor Name & Phone */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                            {t('field_name')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={name}
                            onChange={e => {
                              setName(e.target.value);
                              if (formErrors.name) setFormErrors(prev => ({ ...prev, name: '' }));
                            }}
                            placeholder={t('field_name_placeholder')}
                            className={`w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border text-sm text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none ${
                              formErrors.name ? 'border-red-400' : 'border-[#DDD9CC] dark:border-[#283849]'
                            }`}
                          />
                          {formErrors.name && (
                            <p className="text-xs text-red-600 dark:text-red-400">{formErrors.name}</p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                            {t('field_phone')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="tel"
                            inputMode="tel"
                            value={phone}
                            onChange={e => {
                              setPhone(e.target.value);
                              if (formErrors.phone) setFormErrors(prev => ({ ...prev, phone: '' }));
                            }}
                            placeholder={t('field_phone_placeholder')}
                            dir="ltr"
                            className={`w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border text-sm text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none ${
                              formErrors.phone ? 'border-red-400' : 'border-[#DDD9CC] dark:border-[#283849]'
                            }`}
                          />
                          {formErrors.phone && (
                            <p className="text-xs text-red-600 dark:text-red-400">{formErrors.phone}</p>
                          )}
                        </div>
                      </div>

                      {/* Transaction Reference (ID / Ref Number) */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                          {t('field_ref')} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={refNum}
                          onChange={e => {
                            setRefNum(e.target.value);
                            if (formErrors.refNum) setFormErrors(prev => ({ ...prev, refNum: '' }));
                          }}
                          placeholder={t('field_ref_placeholder')}
                          dir="ltr"
                          className={`w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border text-sm font-mono text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none ${
                            formErrors.refNum ? 'border-red-400' : 'border-[#DDD9CC] dark:border-[#283849]'
                          }`}
                        />
                        {formErrors.refNum && (
                          <p className="text-xs text-red-600 dark:text-red-400">{formErrors.refNum}</p>
                        )}
                      </div>

                      {/* Screenshot Upload (Optional) */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                          {t('field_screenshot')} <span className="text-xs font-normal text-[#738079] dark:text-[#A7B4B0]">({t('optional')})</span>
                        </label>

                        {screenshotPreview ? (
                          <div className="relative inline-block border border-[#DDD9CC] dark:border-[#283849] rounded-xl overflow-hidden bg-[#FAF9F5] dark:bg-[#111C2D] p-2">
                            <img
                              src={screenshotPreview}
                              alt="Screenshot Preview"
                              className="max-h-36 max-w-full rounded-lg object-contain"
                            />
                            <button
                              type="button"
                              onClick={() => handleScreenshotChange(null)}
                              className="absolute top-3 end-3 p-1 rounded-full bg-red-600 text-white shadow-subtle hover:bg-red-700"
                              title="إلغاء الصورة"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#DDD9CC] dark:border-[#283849] rounded-2xl bg-[#FAF9F5] dark:bg-[#111C2D] hover:bg-[#F4F3ED] dark:hover:bg-[#1f3047] cursor-pointer transition-colors text-center">
                            <Upload className="w-7 h-7 text-[#738079] dark:text-[#A7B4B0] mb-2" />
                            <span className="text-xs font-semibold text-[#153C32] dark:text-[#24B58A]">
                              {t('drag_drop_screenshot')}
                            </span>
                            <span className="text-[11px] text-[#738079] dark:text-[#A7B4B0] mt-0.5">
                              PNG, JPG, WEBP (حتى 5 ميجابايت)
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={e => {
                                if (e.target.files && e.target.files[0]) {
                                  handleScreenshotChange(e.target.files[0]);
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>

                      {/* Prayer / Message Note */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                          {t('field_notes')} <span className="text-xs font-normal text-[#738079] dark:text-[#A7B4B0]">({t('optional')})</span>
                        </label>
                        <textarea
                          rows={2}
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          placeholder={t('field_notes_placeholder')}
                          className="w-full py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-sm text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-4 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-base font-bold shadow-elevated hover:bg-[#1C4E41] dark:hover:bg-[#1fa37b] disabled:opacity-70 transition-all flex items-center justify-center gap-2 transform active:scale-[0.99]"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>{t('submitting')}</span>
                          </>
                        ) : (
                          <>
                            <HeartHandshake className="w-5 h-5" />
                            <span>{t('btn_submit')}</span>
                          </>
                        )}
                      </button>

                    </form>
                  )}

                </div>

              </div>
            )}

          </div>
        </section>

        {/* ======================================================== */}
        {/* 6. DONATION TRACKING SECTION                            */}
        {/* ======================================================== */}
        <section id="tracking" className="py-16 md:py-24 border-b border-[#EAE8DE] dark:border-[#283849] bg-[#FAF9F5] dark:bg-[#0B1220] transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            
            <div className="max-w-2xl mx-auto text-center space-y-3">
              <span className="inline-block text-xs font-bold uppercase tracking-wider text-[#B79B68] dark:text-[#C5A876]">
                {language === 'ar' ? 'التحقق والمتابعة' : 'Verification Status'}
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#153C32] dark:text-[#F3F5F4]">
                {t('track_title')}
              </h2>
              <p className="text-sm text-[#55625B] dark:text-[#A7B4B0] leading-relaxed">
                {t('track_subtitle')}
              </p>
            </div>

            <form onSubmit={handleTrackSubmit} className="max-w-xl mx-auto">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={trackingQuery}
                  onChange={e => setTrackingQuery(e.target.value)}
                  placeholder={t('track_input_placeholder')}
                  className="w-full py-3.5 ps-4 pe-28 rounded-2xl bg-white dark:bg-[#172436] border border-[#DDD9CC] dark:border-[#283849] text-sm text-[#191F1C] dark:text-[#F3F5F4] shadow-subtle focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isTrackingLoading || !trackingQuery.trim()}
                  className="absolute end-1.5 py-2 px-4 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-xs font-bold hover:bg-[#1C4E41] disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {isTrackingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>{t('track_btn')}</span>
                </button>
              </div>
            </form>

            {trackingSearched && (
              <div className="max-w-2xl mx-auto space-y-4">
                {trackingError ? (
                  <div className="p-6 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 text-center text-xs sm:text-sm text-amber-800 dark:text-amber-300 flex items-center justify-center gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="font-medium">{trackingError}</span>
                  </div>
                ) : trackedDonations.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] text-center text-sm text-[#738079] dark:text-[#A7B4B0]">
                    <AlertCircle className="w-8 h-8 text-[#B79B68] mx-auto mb-2" />
                    <span>{t('track_no_results')}</span>
                  </div>
                ) : (
                  trackedDonations.map((d: any) => {
                    const isVerified = d.status === 'auto_verified' || d.status === 'manual_verified';
                    const isRejected = d.status === 'rejected';

                    return (
                      <div
                        key={d.id}
                        className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-lg text-[#153C32] dark:text-[#24B58A]">
                              {Number(d.amount).toLocaleString('en-US')} {t('egp')}
                            </span>
                            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-[#738079] dark:text-[#A7B4B0]">
                              {d.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'InstaPay'}
                            </span>
                          </div>

                          <div className="text-xs text-[#738079] dark:text-[#A7B4B0] space-x-2 rtl:space-x-reverse">
                            <span suppressHydrationWarning>{new Date(d.created_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            {d.transaction_ref && (
                              <span className="font-mono text-[#55625B] dark:text-[#A7B4B0]">Ref: {d.transaction_ref}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          {isVerified ? (
                            <div className="flex items-center gap-2">
                              <LottieAnimation animationPath="/animations/payment-success.json" className="w-12 h-12 flex-shrink-0" loop={false} />
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F0F9F6] dark:bg-[#24B58A]/10 border border-[#217A61]/30 dark:border-[#24B58A]/30 text-xs font-bold text-[#217A61] dark:text-[#24B58A]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{t('track_status_verified')}</span>
                              </span>
                            </div>
                          ) : isRejected ? (
                            <div className="flex items-center gap-2">
                              <LottieAnimation animationPath="/animations/payment-failed.json" className="w-12 h-12 flex-shrink-0" loop={false} />
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-xs font-bold text-red-700 dark:text-red-300">
                                  <X className="w-3.5 h-3.5" />
                                  <span>{t('track_status_rejected')}</span>
                                </span>
                                <span className="text-[10px] text-red-600 dark:text-red-400">
                                  {language === 'ar' ? 'تعذرت المطابقة — يرجى التواصل مع الإدارة' : 'Matching failed — please contact admin'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <LottieAnimation animationPath="/animations/payment-waiting.json" className="w-12 h-12 flex-shrink-0" loop={true} />
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 text-xs font-bold text-amber-800 dark:text-amber-300">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>{t('track_status_pending')}</span>
                                </span>
                                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                                  {language === 'ar' ? 'يرجى الانتظار حتى 24 ساعة ومتابعة الطلب' : 'Please allow up to 24h for verification'}
                                </span>
                              </div>
                            </div>
                          )}

                          {isVerified && (
                            <button
                              type="button"
                              onClick={() => handleGenerateReceiptPdf(d)}
                              className="p-2 rounded-lg bg-[#FAF9F5] dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] text-[#153C32] dark:text-[#24B58A] hover:bg-[#F4F3ED]"
                              title={t('receipt_btn')}
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

          </div>
        </section>

        {/* ======================================================== */}
        {/* 7. DONOR TRANSPARENCY LEDGER                             */}
        {/* ======================================================== */}
        <section id="transparency" className="py-16 md:py-24 border-b border-[#EAE8DE] dark:border-[#283849] bg-white dark:bg-[#111C2D] transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            
            <div className="max-w-2xl mx-auto text-center space-y-3">
              <span className="inline-block text-xs font-bold uppercase tracking-wider text-[#B79B68] dark:text-[#C5A876]">
                {language === 'ar' ? 'سجل الشرف' : 'Public Ledger'}
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#153C32] dark:text-[#F3F5F4]">
                {t('transparency_title')}
              </h2>
              <p className="text-sm text-[#55625B] dark:text-[#A7B4B0] leading-relaxed">
                {t('transparency_subtitle')}
              </p>
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block max-w-4xl mx-auto bg-[#FAF9F5] dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] rounded-3xl overflow-hidden shadow-subtle">
              <table className="w-full text-start text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-[#EAE8DE] dark:border-[#283849] bg-white dark:bg-[#111C2D] text-[#738079] dark:text-[#A7B4B0] font-bold">
                    <th className="py-4 px-6 text-start">{t('col_donor')}</th>
                    <th className="py-4 px-6 text-start">{t('col_amount')}</th>
                    <th className="py-4 px-6 text-start">{t('col_method')}</th>
                    <th className="py-4 px-6 text-start">{t('col_date')}</th>
                    <th className="py-4 px-6 text-end">{t('col_status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE8DE] dark:divide-[#283849]">
                  {isDonationsLoading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-[#738079] dark:text-[#A7B4B0]">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#153C32] dark:text-[#24B58A]" />
                        <span>{t('loading')}</span>
                      </td>
                    </tr>
                  ) : donationsList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-[#738079] dark:text-[#A7B4B0]">
                        {language === 'ar' ? 'لا توجد مساهمات موثقة حتى الآن. كن أول المساهمين!' : 'No verified gifts recorded yet.'}
                      </td>
                    </tr>
                  ) : (
                    donationsList.slice(0, 15).map((d: any) => {
                      const rawName = d.donor?.name || 'فاعل خير';
                      let maskedName = 'فاعل خير';
                      if (rawName && rawName !== 'فاعل خير') {
                        const parts = rawName.trim().split(' ');
                        if (parts.length === 1) {
                          maskedName = parts[0].substring(0, 3) + '...';
                        } else {
                          maskedName = `${parts[0]} ${parts[1].charAt(0)}.`;
                        }
                      }

                      return (
                        <tr key={d.id} className="hover:bg-white dark:hover:bg-[#111C2D] transition-colors">
                          <td className="py-4 px-6 font-bold text-[#191F1C] dark:text-[#F3F5F4]">
                            {maskedName}
                          </td>
                          <td className="py-4 px-6 font-extrabold text-[#153C32] dark:text-[#24B58A]">
                            {Number(d.amount).toLocaleString('en-US')} {t('egp')}
                          </td>
                          <td className="py-4 px-6 text-[#738079] dark:text-[#A7B4B0]">
                            {d.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'InstaPay'}
                          </td>
                          <td className="py-4 px-6 text-[#738079] dark:text-[#A7B4B0] text-xs" suppressHydrationWarning>
                            {new Date(d.created_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' })}
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

            {/* Mobile Compact Cards View */}
            <div className="sm:hidden space-y-3">
              {isDonationsLoading ? (
                <div className="py-10 text-center text-[#738079]">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[#153C32] dark:text-[#24B58A]" />
                  <span>{t('loading')}</span>
                </div>
              ) : donationsList.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] text-center text-xs text-[#738079] dark:text-[#A7B4B0]">
                  {language === 'ar' ? 'لا توجد مساهمات موثقة حتى الآن. كن أول المساهمين!' : 'No verified gifts recorded yet.'}
                </div>
              ) : (
                donationsList.slice(0, 15).map((d: any) => {
                  const rawName = d.donor?.name || 'فاعل خير';
                  let maskedName = 'فاعل خير';
                  if (rawName && rawName !== 'فاعل خير') {
                    const parts = rawName.trim().split(' ');
                    if (parts.length === 1) {
                      maskedName = parts[0].substring(0, 3) + '...';
                    } else {
                      maskedName = `${parts[0]} ${parts[1].charAt(0)}.`;
                    }
                  }

                  return (
                    <div
                      key={d.id}
                      className="p-4 rounded-2xl bg-white dark:bg-[#172436] border border-[#EAE8DE] dark:border-[#283849] shadow-subtle flex items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <span className="font-bold text-sm text-[#191F1C] dark:text-[#F3F5F4] block">
                          {maskedName}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-[#738079] dark:text-[#A7B4B0]">
                          <span>{d.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'InstaPay'}</span>
                          <span>•</span>
                          <span suppressHydrationWarning>{new Date(d.created_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                      </div>

                      <div className="text-end space-y-1">
                        <span className="font-extrabold text-sm text-[#153C32] dark:text-[#24B58A] block">
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

            {/* View Full Transparency Ledger Page Button */}
            <div className="pt-4 text-center">
              <Link
                href="/transparency"
                className="inline-flex items-center gap-2 px-6 sm:px-8 py-3.5 rounded-2xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-xs sm:text-sm font-bold shadow-subtle hover:bg-[#1C4E41] dark:hover:bg-[#1fa07a] transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>{language === 'ar' ? 'عرض سجل الشفافية بالكامل (جميع المساهمات)' : 'View Full Transparency Ledger'}</span>
                <ArrowRight className="w-4 h-4 rtl-flip" />
              </Link>
            </div>

          </div>
        </section>

      </main>

      {/* ======================================================== */}
      {/* 8. FOOTER — RESPECTFUL, INSTITUTIONAL, MINIMAL           */}
      {/* ======================================================== */}
      <footer className="bg-[#153C32] dark:bg-[#080E18] text-white py-12 md:py-16 border-t border-[#0E2A22] dark:border-[#283849] transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            
            <div className="md:col-span-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-[#E2F3EE] dark:text-[#24B58A]">
                  <HeartHandshake className="w-5 h-5" />
                </div>
                <span className="font-bold text-lg text-white">
                  {t('brand_title')}
                </span>
              </div>
              <p className="text-xs text-[#E2F3EE]/80 dark:text-[#A7B4B0] leading-relaxed max-w-md">
                {t('footer_text')}
              </p>
              <div className="text-xs text-[#B79B68] dark:text-[#C5A876] font-semibold pt-1">
                صدقة جارية عن روح د. حسين علي الأمير ود. ندى هاني حامد
              </div>
            </div>

            <div className="md:col-span-3 space-y-2">
              <span className="text-xs font-bold text-[#B79B68] dark:text-[#C5A876] block uppercase tracking-wider">
                {language === 'ar' ? 'روابط هامة' : 'Quick Links'}
              </span>
              <ul className="text-xs space-y-2 text-[#E2F3EE]/80 dark:text-[#A7B4B0]">
                <li><a href="#about" className="hover:text-white transition-colors">{t('nav_about')}</a></li>
                <li><a href="#progress" className="hover:text-white transition-colors">{t('nav_progress')}</a></li>
                <li><a href="#donate" className="hover:text-white transition-colors">{t('nav_donate')}</a></li>
                <li><a href="#tracking" className="hover:text-white transition-colors">{t('nav_tracking')}</a></li>
                <li><a href="#transparency" className="hover:text-white transition-colors">{t('nav_transparency')}</a></li>
              </ul>
            </div>

            <div className="md:col-span-3 space-y-2">
              <span className="text-xs font-bold text-[#B79B68] dark:text-[#C5A876] block uppercase tracking-wider">
                {language === 'ar' ? 'الإدارة والخصوصية' : 'Admin & Governance'}
              </span>
              <ul className="text-xs space-y-2 text-[#E2F3EE]/80 dark:text-[#A7B4B0]">
                <li><Link href="/privacy-policy" className="hover:text-white transition-colors">{t('footer_privacy')}</Link></li>
                <li><Link href="/about" className="hover:text-white transition-colors">{t('hero_cta_about')}</Link></li>
                <li><Link href="/admin/login" className="hover:text-white transition-colors">{t('footer_admin_link')}</Link></li>
              </ul>
            </div>

          </div>

          <div className="pt-8 border-t border-white/10 dark:border-[#283849] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#E2F3EE]/60 dark:text-[#80918C]">
            <span>{t('footer_rights')}</span>
            <span>كلية الطب البشري — جامعة كفر الشيخ</span>
          </div>

        </div>
      </footer>

      {/* Campaign Share Dialog Modal */}
      <ShareCampaignDialog
        isOpen={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        campaign={activeCampaign}
        language={language}
      />

    </div>
  );
}
