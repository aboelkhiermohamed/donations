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
  ExternalLink,
  Share2
} from 'lucide-react';
import canvasConfetti from 'canvas-confetti';
import Link from 'next/link';
// @ts-ignore
import { jsPDF } from 'jspdf';

// --- MOCK FALLBACKS ---
const MOCK_CAMPAIGN: Campaign = {
  id: 'c580436d-9654-4720-bc2f-a9cb6bf0f7a0',
  name: 'Medical Ventilator & ABG Device for Kafr El-Sheikh University Hospital (9th Batch)',
  name_ar: 'جهاز تنفس صناعي وجهاز غازات الدم (ABG) لمستشفى كفر الشيخ الجامعي (الدفعة التاسعة)',
  description: 'Donations campaign by the 9th Batch of Kafr El-Sheikh Medicine to purchase and provide a state-of-the-art ventilator and an ABG (Arterial Blood Gas) device to Kafr El-Sheikh University Hospital ICU.',
  description_ar: 'حملة تبرعات الدفعة التاسعة طب كفر الشيخ لتوفير جهاز تنفس صناعي حديث وجهاز تحليل غازات الدم (ABG) لدعم وحدة العناية المركزة بمستشفيات جامعة كفر الشيخ وتأمين رعاية فائقة للمرضى.',
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
  const [activeMobileTab, setActiveMobileTab] = useState<'campaign' | 'donate' | 'ledger'>('campaign');

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Share Card State
  const [shareImage, setShareImage] = useState<string | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Receipt State
  const [selectedReceiptDonation, setSelectedReceiptDonation] = useState<any | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);

  // Tracking State
  const [trackedDonations, setTrackedDonations] = useState<any[]>([]);
  const [trackingPhone, setTrackingPhone] = useState('');
  const [isTrackingLoading, setIsTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [showDedicationToast, setShowDedicationToast] = useState(false);
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
  const { data: dbSettings, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['publicSettings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'payment_accounts')
        .maybeSingle();

      if (error) {
        if (error.message && (error.message.includes('JWT expired') || error.message.includes('expired'))) {
          console.warn("JWT expired in settings query, signing out...");
          await supabase.auth.signOut();
          if (typeof window !== 'undefined') window.location.reload();
        }
        throw error;
      }
      return data?.value || {
        vodafone_cash: '01015339426',
        vodafone_cash_2: '',
        instapay_address: '01015339426@instapay',
        instapay_phone: '01015339426',
        instapay_payment_link: '',
        instapay_qr_url: ''
      };
    }
  });

  const VFC_NUMBER = dbSettings?.vodafone_cash || '01015339426';
  const VFC_NUMBER_2 = dbSettings?.vodafone_cash_2 || '';
  const INSTAPAY_ADDRESS = dbSettings?.instapay_address || '01015339426';
  const INSTAPAY_PHONE = dbSettings?.instapay_phone || '01015339426';
  const INSTAPAY_LINK = dbSettings?.instapay_payment_link || '';
  const INSTAPAY_QR_URL = dbSettings?.instapay_qr_url || '';
  const VFC_ENABLED = dbSettings?.vodafone_cash_enabled !== false;
  const VFC_2_ENABLED = dbSettings?.vodafone_cash_2_enabled !== false;
  const INSTAPAY_ENABLED = dbSettings?.instapay_enabled !== false;
  const displayInstapayAddress = INSTAPAY_ADDRESS.includes('@')
    ? INSTAPAY_ADDRESS
    : `${INSTAPAY_ADDRESS}@instapay`;

  // 1. Fetch Campaign Details
  const { data: campaign, isLoading: isCampaignLoading, error: campaignError } = useQuery<Campaign>({
    queryKey: ['campaign'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        if (error.message && (error.message.includes('JWT expired') || error.message.includes('expired'))) {
          console.warn("JWT expired in campaign query, signing out...");
          await supabase.auth.signOut();
          if (typeof window !== 'undefined') window.location.reload();
        }
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

      if (error) {
        if (error.message && (error.message.includes('JWT expired') || error.message.includes('expired'))) {
          console.warn("JWT expired in stats query, signing out...");
          await supabase.auth.signOut();
          if (typeof window !== 'undefined') window.location.reload();
        }
        throw error;
      }

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
        if (error.message && (error.message.includes('JWT expired') || error.message.includes('expired'))) {
          console.warn("JWT expired in public donations query, signing out...");
          await supabase.auth.signOut();
          if (typeof window !== 'undefined') window.location.reload();
        }
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
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          if (error.message && (error.message.includes('JWT expired') || error.message.includes('expired'))) {
            console.warn("JWT expired in getSession, signing out...");
            await supabase.auth.signOut();
            if (typeof window !== 'undefined') window.location.reload();
          }
        }
        setIsLoggedIn(!!session);
      } catch (err) {
        console.error("checkSession error:", err);
      }
    };
    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    // Load initial IDs from URL parameters (QR code scans) or localStorage (history)
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('id');
    const phoneParam = urlParams.get('phone');

    if (idParam) {
      fetchTrackedStatus([idParam], true);
      setActiveMobileTab('ledger');
      setTimeout(() => {
        const trackingElement = document.getElementById('tracking-card');
        if (trackingElement) {
          trackingElement.scrollIntoView({ behavior: 'smooth' });
        }
      }, 500);
    } else if (phoneParam) {
      setTrackingPhone(phoneParam);
      setActiveMobileTab('ledger');
      setTimeout(async () => {
        setIsTrackingLoading(true);
        try {
          const res = await fetch(`/api/donations/status?phone=${phoneParam}`);
          if (res.ok) {
            const data = await res.json();
            setTrackedDonations(data);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setIsTrackingLoading(false);
        }
      }, 100);
    } else {
      const storedIds = localStorage.getItem('my_donation_ids');
      if (storedIds) {
        const ids = storedIds.split(',').filter(Boolean);
        fetchTrackedStatus(ids, true);
      }
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Dedication Toast timer
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    const displayDuration = isMobile ? 4000 : 10000;

    const showTimer = setTimeout(() => {
      setShowDedicationToast(true);
    }, 1500);

    const hideTimer = setTimeout(() => {
      setShowDedicationToast(false);
    }, 1500 + displayDuration);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
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

  // Generate a share card on a canvas
  const generateShareCard = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background Gradient
    const bgGrad = ctx.createRadialGradient(540, 540, 100, 540, 540, 800);
    bgGrad.addColorStop(0, '#0f172a'); // slate-900
    bgGrad.addColorStop(1, '#020617'); // slate-950
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1080);

    // Glow Orbs
    const trGrad = ctx.createRadialGradient(1080, 0, 50, 1080, 0, 500);
    trGrad.addColorStop(0, 'rgba(16, 185, 129, 0.15)'); // emerald
    trGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = trGrad;
    ctx.beginPath();
    ctx.arc(1080, 0, 500, 0, Math.PI * 2);
    ctx.fill();

    const blGrad = ctx.createRadialGradient(0, 1080, 50, 0, 1080, 500);
    blGrad.addColorStop(0, 'rgba(45, 212, 191, 0.15)'); // teal
    blGrad.addColorStop(1, 'rgba(45, 212, 191, 0)');
    ctx.fillStyle = blGrad;
    ctx.beginPath();
    ctx.arc(0, 1080, 500, 0, Math.PI * 2);
    ctx.fill();

    // Draw Rounded Logo box
    const logoGrad = ctx.createLinearGradient(80, 80, 160, 160);
    logoGrad.addColorStop(0, '#10b981');
    logoGrad.addColorStop(1, '#2dd4bf');
    ctx.fillStyle = logoGrad;
    ctx.beginPath();
    const r = 20;
    const rx = 80, ry = 80, rw = 80, rh = 80;
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + rw - r, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
    ctx.lineTo(rx + rw, ry + rh - r);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
    ctx.lineTo(rx + r, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
    ctx.lineTo(rx, ry + r);
    ctx.quadraticCurveTo(rx, ry, rx + r, ry);
    ctx.closePath();
    ctx.fill();

    // Heart Emoji
    ctx.font = '40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❤️', 120, 120);

    // Platform title next to or aligned with logo
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textBaseline = 'middle';
    if (language === 'ar') {
      ctx.textAlign = 'right';
      ctx.fillText('منصة تبرع الدفعة التاسعة', 1000, 120);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText('donations 9th Batch', 185, 120);
    }

    // Campaign Title wrap & draw
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const wrapText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
      const words = text.split(' ');
      let line = '';
      let currentY = y;
      
      for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        let testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
          ctx.fillText(line, x, currentY);
          line = words[n] + ' ';
          currentY += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, currentY);
      return currentY + lineHeight;
    };

    const displayTitle = language === 'ar' ? displayCampaignName : displayCampaignName;
    const nextY = wrapText(displayTitle, 540, 230, 920, 65);

    // Middle Glass card
    const cardY = nextY + 30;
    const cardH = 430;
    
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    const cr = 30;
    const cx = 80, cy = cardY, cw = 920, ch = cardH;
    ctx.moveTo(cx + cr, cy);
    ctx.lineTo(cx + cw - cr, cy);
    ctx.quadraticCurveTo(cx + cw, cy, cx + cw, cy + cr);
    ctx.lineTo(cx + cw, cy + ch - cr);
    ctx.quadraticCurveTo(cx + cw, cy + ch, cx + cw - cr, cy + ch);
    ctx.lineTo(cx + cr, cy + ch);
    ctx.quadraticCurveTo(cx, cy + ch, cx, cy + ch - cr);
    ctx.lineTo(cx, cy + cr);
    ctx.quadraticCurveTo(cx, cy, cx + cr, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Large Percentage Progress text
    ctx.fillStyle = '#10b981';
    ctx.font = '900 110px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${percentVal}%`, 540, cardY + 50);

    // Progress Subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(language === 'ar' ? 'نسبة إنجاز الحملة' : 'Campaign Progress Completed', 540, cardY + 175);

    // Progress bar track
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    const br = 10;
    const bx = 140, by = cardY + 235, bw = 800, bh = 20;
    ctx.moveTo(bx + br, by);
    ctx.lineTo(bx + bw - br, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
    ctx.lineTo(bx + bw, by + bh - br);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
    ctx.lineTo(bx + br, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
    ctx.lineTo(bx, by + br);
    ctx.quadraticCurveTo(bx, by, bx + br, by);
    ctx.closePath();
    ctx.fill();

    // Progress bar fill
    const fillW = Math.min(800, Math.max(0, (percentVal / 100) * 800));
    if (fillW > 0) {
      const barGrad = ctx.createLinearGradient(140, 0, 940, 0);
      barGrad.addColorStop(0, '#10b981');
      barGrad.addColorStop(1, '#2dd4bf');
      ctx.fillStyle = barGrad;
      
      ctx.beginPath();
      ctx.moveTo(bx + br, by);
      ctx.lineTo(bx + fillW - br, by);
      ctx.quadraticCurveTo(bx + fillW, by, bx + fillW, by + br);
      ctx.lineTo(bx + fillW, by + bh - br);
      ctx.quadraticCurveTo(bx + fillW, by + bh, bx + fillW - br, by + bh);
      ctx.lineTo(bx + br, by + bh);
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
      ctx.lineTo(bx, by + br);
      ctx.quadraticCurveTo(bx, by, bx + br, by);
      ctx.closePath();
      ctx.fill();
    }

    // Stats Grid inside card
    const statsY = cardY + 295;
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px sans-serif';
    
    if (language === 'ar') {
      ctx.textAlign = 'right';
      ctx.fillText('المبلغ المجمع', 940, statsY);
      ctx.textAlign = 'left';
      ctx.fillText('المبلغ المستهدف', 140, statsY);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 36px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${collectedVal.toLocaleString()} ج.م`, 940, statsY + 45);
      ctx.textAlign = 'left';
      ctx.fillText(`${targetVal.toLocaleString()} ج.م`, 140, statsY + 45);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText('Collected Amount', 140, statsY);
      ctx.textAlign = 'right';
      ctx.fillText('Target Goal', 940, statsY);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 36px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${collectedVal.toLocaleString()} EGP`, 140, statsY + 45);
      ctx.textAlign = 'right';
      ctx.fillText(`${targetVal.toLocaleString()} EGP`, 940, statsY + 45);
    }

    // Footer section (QR code & scan instructions)
    const footerY = cardY + cardH + 40;

    try {
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      
      const loadQR = new Promise((res, rej) => {
        qrImg.onload = res;
        qrImg.onerror = rej;
      });

      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=020617&bgcolor=f8fafc&data=${encodeURIComponent(window.location.href)}`;
      await loadQR;

      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      const qrr = 15;
      const qx = 80, qy = footerY, qw = 170, qh = 170;
      ctx.moveTo(qx + qrr, qy);
      ctx.lineTo(qx + qw - qrr, qy);
      ctx.quadraticCurveTo(qx + qw, qy, qx + qw, qy + qrr);
      ctx.lineTo(qx + qw, qy + qh - qrr);
      ctx.quadraticCurveTo(qx + qw, qy + qh, qx + qw - qrr, qy + qh);
      ctx.lineTo(qx + qrr, qy + qh);
      ctx.quadraticCurveTo(qx, qy + qh, qx, qy + qh - qrr);
      ctx.lineTo(qx, qy + qrr);
      ctx.quadraticCurveTo(qx, qy, qx + qrr, qy);
      ctx.closePath();
      ctx.fill();

      ctx.drawImage(qrImg, 90, footerY + 10, 150, 150);
    } catch (e) {
      console.error("Canvas QR drawing failed", e);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      const qrr = 15;
      const qx = 80, qy = footerY, qw = 170, qh = 170;
      ctx.moveTo(qx + qrr, qy);
      ctx.lineTo(qx + qw - qrr, qy);
      ctx.quadraticCurveTo(qx + qw, qy, qx + qw, qy + qrr);
      ctx.lineTo(qx + qw, qy + qh - qrr);
      ctx.quadraticCurveTo(qx + qw, qy + qh, qx + qw - qrr, qy + qh);
      ctx.lineTo(qx + qrr, qy + qh);
      ctx.quadraticCurveTo(qx, qy + qh, qx, qy + qh - qrr);
      ctx.lineTo(qx, qy + qrr);
      ctx.quadraticCurveTo(qx, qy, qx + qrr, qy);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textBaseline = 'middle';
    
    if (language === 'ar') {
      ctx.textAlign = 'right';
      ctx.fillText('مسح الرمز للتبرع والمشاركة في الثواب', 1000, footerY + 60);
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(window.location.host, 1000, footerY + 110);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText('Scan QR to support the campaign & share', 280, footerY + 60);
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(window.location.host, 280, footerY + 110);
    }

    return canvas.toDataURL('image/png');
  };

  const handleShareClick = async () => {
    setIsGeneratingShare(true);
    try {
      const dataUrl = await generateShareCard();
      if (dataUrl) {
        setShareImage(dataUrl);
        setShowShareModal(true);
      }
    } catch (e) {
      console.error(e);
      alert(language === 'ar' ? 'حدث خطأ أثناء توليد الصورة' : 'Error generating share card');
    } finally {
      setIsGeneratingShare(false);
    }
  };

  const handleDownloadShareImage = () => {
    if (!shareImage) return;
    const a = document.createElement('a');
    a.href = shareImage;
    a.download = `donations-progress-${new Date().toISOString().split('T')[0]}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleNativeShare = async () => {
    if (!shareImage) return;
    try {
      const response = await fetch(shareImage);
      const blob = await response.blob();
      const file = new File([blob], 'campaign-progress.png', { type: 'image/png' });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: language === 'ar' ? 'حملة الدفعة التاسعة طب كفر الشيخ' : '9th Batch Donations Campaign',
          text: language === 'ar' 
            ? `ادعم معنا حملة توفير جهاز التنفس وجهاز ABG:\n${window.location.origin}` 
            : `Support our ventilator & ABG campaign:\n${window.location.origin}`,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert(language === 'ar' ? 'تم نسخ رابط الحمله لمشاركتها!' : 'Campaign link copied to clipboard!');
      }
    } catch (e) {
      console.error("Native share failed", e);
      await navigator.clipboard.writeText(window.location.href);
      alert(language === 'ar' ? 'تم نسخ رابط الحمله لمشاركتها!' : 'Campaign link copied to clipboard!');
    }
  };

  // Generate a receipt certificate on canvas
  const generateReceiptCard = async (donation: any) => {
    if (!donation) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background Gradient
    const bgGrad = ctx.createRadialGradient(540, 540, 100, 540, 540, 800);
    bgGrad.addColorStop(0, '#0f172a'); // slate-900
    bgGrad.addColorStop(1, '#020617'); // slate-950
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1080);

    // Glowing border frame
    const frameGrad = ctx.createLinearGradient(0, 0, 1080, 1080);
    frameGrad.addColorStop(0, 'rgba(16, 185, 129, 0.4)'); // emerald
    frameGrad.addColorStop(0.5, 'rgba(45, 212, 191, 0.1)'); // teal
    frameGrad.addColorStop(1, 'rgba(16, 185, 129, 0.4)');
    ctx.strokeStyle = frameGrad;
    ctx.lineWidth = 16;
    ctx.strokeRect(20, 20, 1040, 1040);

    // Glowing corners
    ctx.fillStyle = '#10b981';
    ctx.fillRect(16, 16, 40, 8);
    ctx.fillRect(16, 16, 8, 40);
    
    ctx.fillRect(1024, 16, 40, 8);
    ctx.fillRect(1056, 16, 8, 40);
    
    ctx.fillRect(16, 1056, 40, 8);
    ctx.fillRect(16, 1024, 8, 40);
    
    ctx.fillRect(1024, 1056, 40, 8);
    ctx.fillRect(1056, 1024, 8, 40);

    // Logo & Title
    const logoGrad = ctx.createLinearGradient(80, 80, 150, 150);
    logoGrad.addColorStop(0, '#10b981');
    logoGrad.addColorStop(1, '#2dd4bf');
    ctx.fillStyle = logoGrad;
    ctx.beginPath();
    const r = 16;
    const rx = 80, ry = 80, rw = 70, rh = 70;
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + rw - r, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
    ctx.lineTo(rx + rw, ry + rh - r);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
    ctx.lineTo(rx + r, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
    ctx.lineTo(rx, ry + r);
    ctx.quadraticCurveTo(rx, ry, rx + r, ry);
    ctx.closePath();
    ctx.fill();

    // Heart inside logo
    ctx.font = '36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❤️', 115, 115);

    // Brand Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textBaseline = 'middle';
    if (language === 'ar') {
      ctx.textAlign = 'right';
      ctx.fillText('منصة تبرع الدفعة التاسعة', 1000, 115);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText('donations 9th Batch', 170, 115);
    }

    // Main Certificate Header
    const headGrad = ctx.createLinearGradient(540, 200, 540, 300);
    headGrad.addColorStop(0, '#fbbf24'); // amber-400
    headGrad.addColorStop(1, '#d97706'); // amber-600
    ctx.fillStyle = headGrad;
    ctx.font = '900 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(language === 'ar' ? 'شهادة مساهمة وتبرع' : 'Donation Certificate', 540, 240);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '24px sans-serif';
    ctx.fillText(
      language === 'ar' 
        ? 'تتقدم إدارة منصة التبرعات بخالص الشكر والتقدير للمتبرع الكريم' 
        : 'The Campaign Administration extends its sincere gratitude to the donor',
      540, 310
    );

    // Donor Name Display
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(donation.masked_name || donation.name || (language === 'ar' ? 'متبرع فاعل خير' : 'Anonymous Donor'), 540, 380);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '24px sans-serif';
    ctx.fillText(
      language === 'ar'
        ? 'لمساهمته الطيبة والموثقة في دعم الحملة الطبية لمستشفى كفر الشيخ الجامعي'
        : 'for their kind verified contribution supporting Kafr El-Sheikh University Hospital campaign',
      540, 440
    );

    // Stats Card (Details Box)
    const cardY = 490;
    const cardH = 340;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    const cr = 24;
    const cx = 100, cy = cardY, cw = 880, ch = cardH;
    ctx.moveTo(cx + cr, cy);
    ctx.lineTo(cx + cw - cr, cy);
    ctx.quadraticCurveTo(cx + cw, cy, cx + cw, cy + cr);
    ctx.lineTo(cx + cw, cy + ch - cr);
    ctx.quadraticCurveTo(cx + cw, cy + ch, cx + cw - cr, cy + ch);
    ctx.lineTo(cx + cr, cy + ch);
    ctx.quadraticCurveTo(cx, cy + ch, cx, cy + ch - r);
    ctx.lineTo(cx, cy + r);
    ctx.quadraticCurveTo(cx, cy, cx + cr, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Large Amount Render
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 80px sans-serif';
    ctx.fillText(`${Number(donation.amount).toLocaleString()} ${language === 'ar' ? 'ج.م' : 'EGP'}`, 540, cardY + 90);

    // Receipt details rows
    ctx.font = 'bold 22px sans-serif';
    
    const drawRow = (label: string, value: string, yPos: number) => {
      ctx.fillStyle = '#64748b';
      if (language === 'ar') {
        ctx.textAlign = 'right';
        ctx.fillText(label, 900, yPos);
        ctx.fillStyle = '#cbd5e1';
        ctx.textAlign = 'left';
        ctx.fillText(value, 180, yPos);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(label, 180, yPos);
        ctx.fillStyle = '#cbd5e1';
        ctx.textAlign = 'right';
        ctx.fillText(value, 900, yPos);
      }
    };

    const formattedDate = new Date(donation.created_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US', {
      dateStyle: 'long',
      timeStyle: 'short'
    });

    drawRow(language === 'ar' ? 'تاريخ التبرع المعتمد' : 'Verified Date', formattedDate, cardY + 180);
    drawRow(
      language === 'ar' ? 'طريقة الدفع والتحويل' : 'Payment Method', 
      donation.payment_method === 'vodafone_cash' 
        ? (language === 'ar' ? 'فودافون كاش' : 'Vodafone Cash') 
        : (language === 'ar' ? 'إنستاباي' : 'InstaPay'),
      cardY + 230
    );
    drawRow(language === 'ar' ? 'رقم المعاملة الفريد' : 'Receipt ID', donation.id.substring(0, 18).toUpperCase(), cardY + 280);

    // Footer Verified Seal & QR code
    const footerY = cardY + cardH + 40;
    
    // Draw Verified Seal Stamp
    ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(220, footerY + 70, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(language === 'ar' ? 'موثق ومعتمد' : 'VERIFIED', 220, footerY + 55);
    ctx.fillText('✓', 220, footerY + 85);

    // Draw QR Code
    try {
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      
      const loadQR = new Promise((res, rej) => {
        qrImg.onload = res;
        qrImg.onerror = rej;
      });

      const verUrl = `${window.location.origin}/?phone=${donation.phone || ''}&id=${donation.id}`;
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&color=020617&bgcolor=f8fafc&data=${encodeURIComponent(verUrl)}`;
      await loadQR;

      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      const qrr = 8;
      const qx = 840, qy = footerY, qw = 140, qh = 140;
      ctx.moveTo(qx + qrr, qy);
      ctx.lineTo(qx + qw - qrr, qy);
      ctx.quadraticCurveTo(qx + qw, qy, qx + qw, qy + qrr);
      ctx.lineTo(qx + qw, qy + qh - qrr);
      ctx.quadraticCurveTo(qx + qw, qy + qh, qx + qw - qrr, qy + qh);
      ctx.lineTo(qx + qrr, qy + qh);
      ctx.quadraticCurveTo(qx, qy + qh, qx, qy + qh - qrr);
      ctx.lineTo(qx, qy + qrr);
      ctx.quadraticCurveTo(qx, qy, qx + qrr, qy);
      ctx.closePath();
      ctx.fill();

      ctx.drawImage(qrImg, 850, footerY + 10, 120, 120);
    } catch (e) {
      console.error("Canvas receipt QR failed", e);
    }

    ctx.fillStyle = '#64748b';
    ctx.font = 'italic 18px sans-serif';
    ctx.textBaseline = 'middle';
    if (language === 'ar') {
      ctx.textAlign = 'right';
      ctx.fillText('امسح رمز الـ QR للتحقق من صحة الفاتورة من السجل المباشر للمنصة', 810, footerY + 70);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText('Scan QR to verify receipt on the live ledger', 320, footerY + 70);
    }

    return canvas.toDataURL('image/png');
  };

  const handleReceiptClick = async (donation: any) => {
    setSelectedReceiptDonation(donation);
    setIsGeneratingReceipt(true);
    setShowReceiptModal(true);
    setReceiptImage(null); // Clear previous
    try {
      const dataUrl = await generateReceiptCard(donation);
      if (dataUrl) {
        setReceiptImage(dataUrl);
      }
    } catch (e) {
      console.error(e);
      alert(language === 'ar' ? 'حدث خطأ أثناء توليد الفاتورة' : 'Error generating receipt card');
    } finally {
      setIsGeneratingReceipt(false);
    }
  };

  const handleDownloadReceiptImage = () => {
    if (!receiptImage || !selectedReceiptDonation) return;
    const a = document.createElement('a');
    a.href = receiptImage;
    a.download = `receipt-${selectedReceiptDonation.id.substring(0, 8)}-${new Date().toISOString().split('T')[0]}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleReceiptNativeShare = async () => {
    if (!receiptImage || !selectedReceiptDonation) return;
    try {
      const response = await fetch(receiptImage);
      const blob = await response.blob();
      const file = new File([blob], `receipt-${selectedReceiptDonation.id.substring(0, 8)}.png`, { type: 'image/png' });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: language === 'ar' ? 'فاتورة تبرع معتمدة' : 'Verified Donation Receipt',
          text: language === 'ar' 
            ? `الحمد لله، تم توثيق تبرعي بقيمة ${selectedReceiptDonation.amount} ج.م لمستشفى كفر الشيخ الجامعي. الرابط للتبرع:\n${window.location.origin}`
            : `My donation of ${selectedReceiptDonation.amount} EGP has been verified. Support the campaign here:\n${window.location.origin}`,
        });
      } else {
        await navigator.clipboard.writeText(`${window.location.origin}/?phone=${selectedReceiptDonation.phone || ''}`);
        alert(language === 'ar' ? 'تم نسخ رابط التحقق من التبرع!' : 'Donation tracking link copied!');
      }
    } catch (e) {
      console.error("Receipt share failed", e);
      await navigator.clipboard.writeText(`${window.location.origin}/?phone=${selectedReceiptDonation.phone || ''}`);
      alert(language === 'ar' ? 'تم نسخ رابط التحقق من التبرع!' : 'Donation tracking link copied!');
    }
  };

  const handleDownloadReceiptPDF = async () => {
    if (!selectedReceiptDonation) return;
    setIsGeneratingReceipt(true);
    try {
      const donation = selectedReceiptDonation;

      // Draw A4 canvas (1200 x 1696 px @ 72dpi → 210mm x 297mm)
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1696;
      const ctx = canvas.getContext('2d')!;

      // 1. Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1200, 1696);

      // 2. Outer Borders (double frame)
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 10;
      ctx.strokeRect(20, 20, 1160, 1656);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.strokeRect(40, 40, 1120, 1616);

      // 3. Header Section
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(120, 120, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('❤️', 120, 120);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 32px sans-serif';
      ctx.textBaseline = 'middle';
      if (language === 'ar') {
        ctx.textAlign = 'right';
        ctx.fillText('منصة تبرع الدفعة التاسعة', 1100, 110);
        ctx.font = 'normal 18px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('لوحة التحكم المالي وإيصالات التبرع الرسمية للحملة', 1100, 145);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText('Donations 9th Batch Platform', 180, 110);
        ctx.font = 'normal 18px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('Official Campaign Financial & Receipts Portal', 180, 145);
      }

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(60, 200);
      ctx.lineTo(1140, 200);
      ctx.stroke();

      // 4. Document Title & Serial
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(language === 'ar' ? 'فاتورة تبرع رسمية معتمدة' : 'Official Certified Donation Invoice', 600, 280);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(language === 'ar' ? `رقم الفاتورة: ${donation.id.substring(0, 8).toUpperCase()}-${donation.id.substring(9, 13).toUpperCase()}` : `Invoice ID: ${donation.id.substring(0, 8).toUpperCase()}-${donation.id.substring(9, 13).toUpperCase()}`, 600, 325);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'normal 14px sans-serif';
      ctx.fillText(language === 'ar' ? `تاريخ الإصدار: ${new Date().toLocaleDateString('ar-EG', { dateStyle: 'long' })}` : `Issued: ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`, 600, 358);

      // 5. Grid Table (6 rows)
      const tableY = 390;
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(100, tableY, 1000, 480);

      ctx.beginPath();
      ctx.moveTo(380, tableY);
      ctx.lineTo(380, tableY + 480);
      ctx.stroke();

      for (let i = 1; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(100, tableY + i * 80);
        ctx.lineTo(1100, tableY + i * 80);
        ctx.stroke();
      }

      const drawTableCell = (rowIdx: number, col1Label: string, col2Value: string) => {
        const yCenter = tableY + rowIdx * 80 + 40;
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = '#475569';
        if (language === 'ar') {
          ctx.textAlign = 'right';
          ctx.fillText(col1Label, 1060, yCenter);
          ctx.fillStyle = '#0f172a';
          ctx.font = 'normal 20px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(col2Value, 350, yCenter);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(col1Label, 120, yCenter);
          ctx.fillStyle = '#0f172a';
          ctx.font = 'normal 20px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(col2Value, 410, yCenter);
        }
      };

      const dateString = new Date(donation.created_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US', {
        dateStyle: 'long', timeStyle: 'short'
      });

      let targetAccount = '';
      if (donation.payment_method === 'vodafone_cash') {
        targetAccount = VFC_NUMBER_2 ? `${VFC_NUMBER} / ${VFC_NUMBER_2}` : VFC_NUMBER;
      } else {
        targetAccount = displayInstapayAddress;
      }

      let verifierLabel = '';
      if (donation.status === 'auto_verified') {
        verifierLabel = language === 'ar' ? 'نظام المطابقة التلقائي (بوابة SMS)' : 'Automated matching system (SMS Gateway)';
      } else if (donation.status === 'manual_verified') {
        verifierLabel = language === 'ar'
          ? `توثيق مشرف الحملة (${donation.verified_by?.name || 'مشرف معتمد'})`
          : `Manual admin review (Verified by: ${donation.verified_by?.name || 'System Admin'})`;
      } else {
        verifierLabel = language === 'ar' ? 'قيد التحقق والمطابقة' : 'Pending verification';
      }

      drawTableCell(0, language === 'ar' ? 'اسم المتبرع الكريم' : 'Donor Name', donation.masked_name || donation.name || (language === 'ar' ? 'فاعل خير (مجهول)' : 'Anonymous Benefactor'));
      drawTableCell(1, language === 'ar' ? 'رقم الهاتف المسجل' : 'Donor Phone Number', donation.phone || donation.masked_phone || '—');
      drawTableCell(2, language === 'ar' ? 'الحملة المستهدفة للدعم' : 'Targeted Campaign', language === 'ar' ? 'مستشفى كفر الشيخ الجامعي - الدفعة التاسعة' : 'Kafr El-Sheikh University Hospital ICU Support (9th Batch)');
      drawTableCell(3, language === 'ar' ? 'تاريخ وتوقيت المعاملة' : 'Donation Date & Time', dateString);
      drawTableCell(4, language === 'ar' ? 'المسؤول الموثق للاعتماد' : 'Verified By / Auditor', verifierLabel);
      drawTableCell(5, language === 'ar' ? 'رقم محفظة/حساب الاستلام' : 'Campaign Destination Account', targetAccount);

      // 6. Financial Highlight
      const finY = 900;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(100, finY, 1000, 180);
      ctx.strokeRect(100, finY, 1000, 180);

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 22px sans-serif';
      if (language === 'ar') {
        ctx.textAlign = 'right';
        ctx.fillText('القيمة الإجمالية للمساهمة', 1060, finY + 45);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText(`${Number(donation.amount).toLocaleString()} ج.م`, 1060, finY + 115);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText('Total Contribution Amount', 140, finY + 45);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText(`${Number(donation.amount).toLocaleString()} EGP`, 140, finY + 115);
      }

      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#475569';
      if (language === 'ar') {
        ctx.textAlign = 'left';
        ctx.fillText(`قناة التحويل: ${donation.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'إنستاباي'}`, 300, finY + 50);
        ctx.fillText(`المرجع المالي: ${donation.transaction_ref || '—'}`, 300, finY + 95);
        ctx.fillText(`حالة التوثيق: معتمدة ومطابقة`, 300, finY + 140);
      } else {
        ctx.textAlign = 'right';
        ctx.fillText(`Method: ${donation.payment_method === 'vodafone_cash' ? 'Vodafone Cash' : 'InstaPay'}`, 1060, finY + 50);
        ctx.fillText(`Tx Ref: ${donation.transaction_ref || '—'}`, 1060, finY + 95);
        ctx.fillText(`Status: Verified & Approved`, 1060, finY + 140);
      }

      // 7. Official Legal Statement
      const noteY = 1120;
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = language === 'ar' ? 'right' : 'left';
      ctx.fillText(language === 'ar' ? 'إقرار الاستلام والاعتماد الرسمي المضمون:' : 'Official Ledger Confirmation & Guarantee Statement:', language === 'ar' ? 1100 : 100, noteY);

      ctx.fillStyle = '#334155';
      ctx.font = 'normal 18px sans-serif';
      ctx.textAlign = language === 'ar' ? 'right' : 'left';
      ctx.fillText(language === 'ar' ? 'تشهد إدارة حملة التبرعات بأن المبلغ المذكور أعلاه قد تم استلامه وتوثيقه ومطابقته نظامياً وإدراجه في السجل' : 'This document certifies that the donation amount listed above has been officially received, audited,', language === 'ar' ? 1100 : 100, noteY + 45);
      ctx.fillText(language === 'ar' ? 'المالي الرسمي المخصص لدعم الأجهزة الطبية لمستشفى كفر الشيخ الجامعي. هذا الإيصال يضمن الحقوق الكاملة للمتبرع.' : 'and ledgered into the Kafr El-Sheikh University Hospital ICU support campaign accounts. All donor rights guaranteed.', language === 'ar' ? 1100 : 100, noteY + 80);
      ctx.fillText(language === 'ar' ? 'للتحقق الفوري من صحة البيانات، يرجى مسح رمز الـ QR أدناه، وفي حال وجود أي استفسار يرجى التواصل برقم الفاتورة.' : 'For instant verification, scan the QR code below. For support inquiries, reference the unique invoice ID above.', language === 'ar' ? 1100 : 100, noteY + 115);

      // 8. QR Code
      const sealY = 1290;
      try {
        const qrImg = new Image();
        qrImg.crossOrigin = 'anonymous';
        await new Promise((res, rej) => { qrImg.onload = res; qrImg.onerror = rej; qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=020617&bgcolor=ffffff&data=${encodeURIComponent(`${window.location.origin}/?phone=${donation.phone || ''}&id=${donation.id}`)}`; });
        ctx.drawImage(qrImg, 100, sealY, 150, 150);
      } catch {}

      ctx.fillStyle = '#64748b';
      ctx.font = 'italic 16px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(language === 'ar' ? 'امسح الرمز ضوئياً للتحقق من صحة الإيصال مباشرة في السجل المالي العام للحملة' : 'Scan the QR code to verify this official invoice on the live public ledger', 270, sealY + 80);

      // Official Seal
      ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(950, sealY + 70, 75, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(950, sealY + 70, 67, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(language === 'ar' ? 'الاعتماد المالي' : 'FINANCE DEPT', 950, sealY + 45);
      ctx.font = 'bold 36px sans-serif'; ctx.fillText('✓', 950, sealY + 85);
      ctx.font = 'bold 14px sans-serif'; ctx.fillText(language === 'ar' ? 'موثق ومطابق' : 'VERIFIED', 950, sealY + 115);

      // 9. Signatures
      const sigY = 1470;
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(100, sigY + 60); ctx.lineTo(350, sigY + 60); ctx.stroke();
      ctx.fillStyle = '#475569'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(language === 'ar' ? 'توقيع المنسق المالي للحملة' : 'Financial Coordinator', 225, sigY + 95);
      ctx.beginPath(); ctx.moveTo(850, sigY + 60); ctx.lineTo(1100, sigY + 60); ctx.stroke();
      ctx.fillText(language === 'ar' ? 'توقيع واعتماد إدارة الحملة' : 'Authorized Campaign Stamp', 975, sigY + 95);

      ctx.fillStyle = '#94a3b8'; ctx.font = '14px sans-serif';
      ctx.fillText(language === 'ar' ? 'تم توليد هذه الوثيقة آلياً وهي معتمدة ومحمية بموجب معايير التحقق الرقمي لحملة التبرعات.' : 'This document was digitally generated and verified under the campaign cryptographic integrity standards.', 600, 1630);

      // 10. Export to PDF
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      pdf.save(`Donation_Receipt_${donation.id.substring(0, 8)}.pdf`);
    } catch (pdfErr: any) {
      console.error('PDF download failed', pdfErr);
      alert(language === 'ar' ? 'حدث خطأ أثناء تحميل الفاتورة' : 'Error downloading invoice PDF');
    } finally {
      setIsGeneratingReceipt(false);
    }
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

  if (!isMounted || isCampaignLoading || isSettingsLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col font-sans" dir={dir}>
        {/* Navbar skeleton */}
        <header className="w-full max-w-7xl mx-auto px-4 md:px-8 py-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center animate-pulse" />
            <div className="h-6 w-32 bg-slate-900 rounded animate-pulse" />
          </div>
          <div className="h-10 w-24 bg-slate-900 rounded-lg animate-pulse" />
        </header>

        {/* Main Grid skeleton */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 space-y-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

            {/* Left column skeleton */}
            <div className="lg:col-span-8 space-y-6">
              <div className="space-y-3">
                <div className="h-4 w-40 bg-slate-900 rounded-full animate-pulse" />
                <div className="h-10 w-3/4 bg-slate-900 rounded animate-pulse" />
                <div className="h-4 w-48 bg-slate-900 rounded animate-pulse" />
              </div>
              <div className="w-full h-64 md:h-[400px] bg-slate-900 rounded-2xl animate-pulse" />
              <div className="h-32 bg-slate-900/50 rounded-2xl animate-pulse" />
            </div>

            {/* Right column skeleton */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-6 space-y-6">
                <div className="space-y-3">
                  <div className="h-4 w-20 bg-slate-900 rounded animate-pulse" />
                  <div className="h-8 w-36 bg-slate-900 rounded animate-pulse" />
                  <div className="h-2.5 w-full bg-slate-900 rounded-full animate-pulse" />
                </div>
                <div className="space-y-3 pt-4 border-t border-slate-900">
                  <div className="h-4 w-full bg-slate-900 rounded animate-pulse" />
                  <div className="h-4 w-full bg-slate-900 rounded animate-pulse" />
                </div>
                <div className="h-12 w-full bg-slate-900 rounded-xl animate-pulse" />
              </div>
            </div>

          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative pb-16 flex flex-col font-sans overflow-x-hidden" dir={dir}>
      {/* Background Orbs */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-teal-500/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* HEADER NAVBAR */}
      <header className="w-full max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-6 flex flex-row items-center justify-between z-10 gap-2">
        <div className="flex items-center gap-1.5 md:gap-3">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0">
            <Heart className="w-4 h-4 md:w-5 md:h-5 text-slate-950 fill-slate-950" />
          </div>
          <span className="text-base md:text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 whitespace-nowrap">
            donations 9th Batch
          </span>
        </div>

        <div className="flex items-center gap-1.5 md:gap-3 flex-shrink-0">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-2 md:px-4 py-1.5 md:py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs md:text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-450" />
            <span>{language === 'ar' ? 'English' : 'العربية'}</span>
          </button>

          {isMounted && (
            isLoggedIn ? (
              <Link
                href="/admin/dashboard"
                className="flex items-center gap-1.5 px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 text-xs md:text-sm font-extrabold shadow-md hover:brightness-105 transition-all"
              >
                <span>{language === 'ar' ? 'لوحة التحكم' : 'Dashboard'}</span>
              </Link>
            ) : (
              <Link
                href="/admin/login"
                className="flex items-center gap-1.5 px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs md:text-sm font-semibold hover:bg-slate-800 transition-colors text-slate-300"
              >
                <span>{language === 'ar' ? 'دخول المشرف' : 'Admin Login'}</span>
              </Link>
            )
          )}
        </div>
      </header>

      {/* HERO / CAMPAIGN COVER SECTION */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 space-y-8 md:space-y-12">
        {/* Mobile Tab Segmented Navigation (Only visible on mobile/tablet) */}
        {isMounted && (
          <div className="lg:hidden w-full bg-slate-900/80 backdrop-blur-md p-1 rounded-xl border border-slate-800/60 sticky top-2 z-30 flex gap-1 shadow-lg">
            <button
              type="button"
              onClick={() => setActiveMobileTab('campaign')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all text-center ${activeMobileTab === 'campaign'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              {t('tab_campaign')}
            </button>
            <button
              type="button"
              onClick={() => setActiveMobileTab('donate')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all text-center ${activeMobileTab === 'donate'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              {t('tab_donate')}
            </button>
            <button
              type="button"
              onClick={() => setActiveMobileTab('ledger')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all text-center ${activeMobileTab === 'ledger'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              {t('tab_ledger')}
            </button>
          </div>
        )}

        {campaignError && (
          <div className="p-4 bg-red-950/20 border border-red-900/20 text-red-300 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>Failed to load campaign settings: {campaignError.message || JSON.stringify(campaignError)}</span>
          </div>
        )}
        {/* Campaign Main Grid */}
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-8 items-start ${activeMobileTab === 'campaign' ? 'block' : 'hidden lg:grid'}`}>

          {/* LEFT COLUMN: Campaign Content (col-span-8) */}
          <div className="lg:col-span-8 space-y-6">

            {/* Title & Organizer Info */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{language === 'ar' ? 'حملة تبرع معتمدة وموثقة' : 'Verified Donation Campaign'}</span>
              </div>

              <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
                {displayCampaignName}
              </h1>

              <div className="text-xs text-slate-400 font-medium">
                {language === 'ar' ? 'بإشراف وتنظيم:' : 'Organized by:'} <span className="text-white font-bold">{displayOrganizer}</span>
              </div>
            </div>

            {/* Cover Image */}
            <div className="w-full h-64 md:h-[400px] rounded-2xl overflow-hidden border border-slate-900 shadow-md">
              <img
                src={activeCampaign.cover_image || "/campaign_cover.png"}
                alt={displayCampaignName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    const div = document.createElement('div');
                    div.className = "w-full h-full bg-gradient-to-tr from-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 text-center";
                    div.innerHTML = `<span class="text-slate-400 text-sm font-semibold">${displayCampaignName}</span>`;
                    parent.appendChild(div);
                  }
                }}
              />
            </div>

            {/* Description Card */}
            <div className="bg-slate-900/10 border border-slate-900/60 p-6 rounded-2xl space-y-5">
              <div className="space-y-3">
                <h3 className="text-white font-bold text-base border-b border-slate-800 pb-2 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-emerald-450 fill-emerald-450/20" />
                  <span>{language === 'ar' ? 'عن الحملة وغايتها' : 'About the Campaign'}</span>
                </h3>
                <p className="text-slate-300 text-[14.5px] leading-relaxed whitespace-pre-wrap font-normal">
                  {displayCampaignDesc}
                </p>
              </div>

              {/* Target Equipment (Compact Inline Badge Row) */}
              <div className="flex flex-wrap items-center gap-2.5 pt-3.5 border-t border-slate-800/60">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {language === 'ar' ? 'الأجهزة الطبية المستهدفة:' : 'Target Equipment:'}
                </span>

                {/* Device 1 */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/20 border border-emerald-900/25 text-xs text-white">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-450 animate-pulse" />
                  <span className="font-bold text-[11px]">{language === 'ar' ? 'جهاز تنفس صناعي حديث' : 'Ventilator'}</span>
                  <span className="text-[9px] font-bold bg-rose-950/40 text-rose-450 px-1 py-0.2 rounded border border-rose-900/10">
                    {language === 'ar' ? 'عاجل' : 'Urgent'}
                  </span>
                </div>

                {/* Device 2 */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-950/20 border border-teal-900/25 text-xs text-white">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-450" />
                  <span className="font-bold text-[11px]">{language === 'ar' ? 'جهاز تحليل غازات الدم (ABG)' : 'ABG Analyzer'}</span>
                  <span className="text-[9px] font-bold bg-teal-950/30 text-teal-450 px-1 py-0.2 rounded border border-teal-900/10">
                    {language === 'ar' ? 'مستهدف' : 'Targeted'}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Sticky Progress Widget (col-span-4) */}
          <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-6">

            <div className="bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 space-y-6 shadow-xl">

              {/* Collected and Progress */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <span className="text-slate-500 text-[11px] font-bold block uppercase tracking-wider">{t('collected')}</span>
                  <span className="text-3xl font-black text-emerald-400 flex items-baseline gap-1.5">
                    {collectedVal.toLocaleString()}
                    <span className="text-sm font-bold text-slate-400">{t('egp')}</span>
                  </span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-900 relative">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${percentVal}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] font-semibold text-slate-400 pt-1">
                    <span>{percentVal}% {t('progress')}</span>
                    <span>{language === 'ar' ? 'مستمر حتى تحقيق الهدف' : 'Ongoing'}</span>
                  </div>
                </div>
              </div>

              {/* Stats key-value list */}
              <div className="space-y-3 pt-4 border-t border-slate-800/60 text-xs text-slate-300">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold">{t('target')}</span>
                  <span className="font-bold text-white">{targetVal.toLocaleString()} {t('egp')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold">{language === 'ar' ? 'المتبقي لتحقيق الهدف' : 'Remaining to goal'}</span>
                  <span className="font-bold text-slate-200">{remainingVal.toLocaleString()} {t('egp')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold">{language === 'ar' ? 'عدد التبرعات المعتمدة' : 'Total donations'}</span>
                  <span className="font-bold text-white">{stats?.approvedCount ?? 0}</span>
                </div>
              </div>

              {/* Call-to-action Button */}
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => {
                    setActiveMobileTab('donate');
                    setTimeout(() => {
                      const formElement = document.querySelector('form');
                      if (formElement) {
                        formElement.scrollIntoView({ behavior: 'smooth' });
                      }
                    }, 100);
                  }}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-105 active:scale-[0.98] transition-all text-slate-950 font-black text-center text-sm shadow-lg shadow-emerald-500/10 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Heart className="w-4 h-4 fill-slate-950" />
                  <span>{language === 'ar' ? 'تبرع الآن للحملة' : 'Donate to Campaign'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareClick}
                  disabled={isGeneratingShare}
                  className="w-full py-3 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 active:scale-[0.98] transition-all text-slate-300 font-bold text-center text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isGeneratingShare ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{language === 'ar' ? 'جاري توليد الصورة...' : 'Generating Image...'}</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5 text-emerald-450" />
                      <span>{language === 'ar' ? 'مشاركة تقدم الحملة (صورة)' : 'Share Campaign Progress (Image)'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Safety/Trust Badge */}
              <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 font-medium">
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                </svg>
                <span>{language === 'ar' ? 'جميع التحويلات آمنة وتتم مراجعتها تلقائياً' : 'All transfers are secure and auto-matched'}</span>
              </div>

            </div>

          </div>

        </div>

        {/* RECENT DONORS MARQUEE */}
        <div className={`w-full bg-slate-900/30 border border-slate-900 rounded-2xl overflow-hidden py-3 flex items-center relative ${activeMobileTab !== 'donate' ? 'flex' : 'hidden lg:flex'}`}>
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
                      <bdi>{item.masked_name || t('anonymous')}</bdi>
                    </span>
                    <span className="text-[10px] font-mono text-slate-500" dir="ltr">
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
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-8 ${activeMobileTab !== 'campaign' ? 'block' : 'hidden lg:grid'}`}>

          {/* LEFT: DONATION INSTRUCTIONS & FORM */}
          <div className={`lg:col-span-7 space-y-6 ${activeMobileTab === 'donate' ? 'block' : 'hidden lg:block'}`}>

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
              <div className={`grid ${INSTAPAY_ENABLED ? 'grid-cols-2' : 'grid-cols-1'} gap-2 bg-slate-950/80 p-1 rounded-xl border border-slate-900`}>
                <button
                  onClick={() => setPaymentMethod('vodafone_cash')}
                  className={`py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2.5 ${paymentMethod === 'vodafone_cash'
                      ? 'bg-slate-900 border border-slate-800 text-red-550 shadow-md'
                      : 'text-slate-400 hover:text-white'
                    }`}
                >
                  <img src="/vf_Logo.png" alt="Vodafone Cash" className="w-5 h-5 object-contain rounded-full bg-white p-0.5" />
                  {t('vfc_label')}
                </button>
                {INSTAPAY_ENABLED && (
                  <button
                    onClick={() => setPaymentMethod('instapay')}
                    className={`py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2.5 ${paymentMethod === 'instapay'
                        ? 'bg-slate-900 border border-slate-800 text-violet-400 shadow-md'
                        : 'text-slate-400 hover:text-white'
                      }`}
                  >
                    <img src="/InstaPay_Logo.png" alt="InstaPay" className="w-5 h-5 object-contain rounded bg-white p-0.5" />
                    {t('instapay_label')}
                  </button>
                )}
              </div>

              {/* Vodafone Cash Details */}
              {paymentMethod === 'vodafone_cash' && (
                <div className="space-y-3 w-full">
                  {VFC_ENABLED && (
                    <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-900 flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="space-y-1 text-center md:text-start">
                        <span className="text-slate-500 text-xs uppercase tracking-wider">
                          {language === 'ar' ? 'رقم محفظة فودافون كاش الأول' : 'Vodafone Cash Wallet 1'}
                        </span>
                        <p className="text-2xl font-black tracking-widest text-white font-mono">{VFC_NUMBER}</p>
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

                  {VFC_NUMBER_2 && VFC_2_ENABLED && (
                    <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-900 flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in">
                      <div className="space-y-1 text-center md:text-start">
                        <span className="text-slate-500 text-xs uppercase tracking-wider">
                          {language === 'ar' ? 'رقم محفظة فودافون كاش الثاني' : 'Vodafone Cash Wallet 2'}
                        </span>
                        <p className="text-2xl font-black tracking-widest text-white font-mono">{VFC_NUMBER_2}</p>
                      </div>
                      <button
                        onClick={() => handleCopy(VFC_NUMBER_2, 'vfc2')}
                        className="w-full md:w-auto flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-sm font-semibold py-3 px-6 rounded-xl transition-all active:scale-95"
                      >
                        {copiedType === 'vfc2' ? (
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
                </div>
              )}

              {/* InstaPay Details */}
              {paymentMethod === 'instapay' && INSTAPAY_ENABLED && (
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
                  <div className="w-full max-w-sm bg-slate-950/60 p-4 rounded-xl border border-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-center sm:text-start">
                    <div className="space-y-1">
                      <span className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold block">
                        {language === 'ar' ? 'رقم الهاتف (إنستاباي)' : 'InstaPay Phone Number'}
                      </span>
                      <p className="text-xl font-black tracking-widest text-white font-mono select-all" dir="ltr">
                        {INSTAPAY_PHONE}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(INSTAPAY_PHONE, 'instapay_phone')}
                      className="flex items-center justify-center gap-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-sm font-semibold py-3 px-5 rounded-xl transition-all active:scale-95 text-slate-350 flex-shrink-0 w-full sm:w-auto"
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

                  {/* Address Display with Copy */}
                  <div className="w-full max-w-sm bg-slate-950/60 p-4 rounded-xl border border-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-center sm:text-start">
                    <div className="space-y-1 w-full min-w-0">
                      <span className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold block">
                        {language === 'ar' ? 'عنوان الدفع (إنستاباي)' : 'InstaPay VPA Address'}
                      </span>
                      <p className="text-sm sm:text-base font-black text-white font-mono select-all truncate max-w-full sm:max-w-none" dir="ltr">
                        {displayInstapayAddress}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(displayInstapayAddress, 'instapay_address')}
                      className="flex items-center justify-center gap-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-sm font-semibold py-3 px-5 rounded-xl transition-all active:scale-95 text-slate-350 flex-shrink-0 w-full sm:w-auto"
                    >
                      {copiedType === 'instapay_address' ? (
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

                  {/* Open App Button on Mobile */}
                  <a
                    href="instapay://"
                    className="lg:hidden w-full max-w-sm flex items-center justify-center gap-2 bg-slate-900 border border-slate-850 hover:bg-slate-800 text-white font-bold py-3.5 px-6 rounded-xl transition-all text-center text-sm cursor-pointer active:scale-[0.98]"
                  >
                    <span>{t('open_instapay_app')}</span>
                    <span className="text-xs">⚡</span>
                  </a>

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

                  {/* Real-time Tracking Status for the donation just submitted */}
                  {trackedDonations.length > 0 && (
                    <div className="mt-6 border-t border-slate-800/80 pt-6 text-start space-y-3 max-w-md mx-auto">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse glow-green" />
                          <span>{language === 'ar' ? 'تتبع حالة تبرعك الحالي:' : 'Live Donation Tracking:'}</span>
                        </h4>
                        {lastTrackedUpdate && (
                          <span className="text-[10px] text-slate-500 font-medium">
                            {t('track_last_updated')}: {lastTrackedUpdate.toLocaleTimeString()}
                          </span>
                        )}
                      </div>

                      <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                        {trackedDonations.map((d) => (
                          <div key={d.id} className="p-3 bg-slate-950/60 border border-slate-900 rounded-xl text-xs space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-white text-sm">{d.amount} {t('egp')}</span>
                              <span className="text-slate-500 text-[10px]">
                                {new Date(d.created_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="text-slate-400 font-semibold">
                                {d.payment_method === 'vodafone_cash' ? (
                                  <span className="inline-flex items-center gap-1 text-red-500 font-bold">
                                    <img src="/vf_Logo.png" alt="Vodafone Cash" className="w-3.5 h-3.5 object-contain bg-white rounded-full p-0.5" />
                                    <span>{t('vfc_label')}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-violet-400 font-bold">
                                    <img src="/InstaPay_Logo.png" alt="InstaPay" className="w-3.5 h-3.5 object-contain bg-white rounded p-0.5" />
                                    <span>{t('instapay_label')}</span>
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
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 border border-emerald-900/40 text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-transparent" />
                                    <span>{t('track_status_verified')}</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleReceiptClick(d)}
                                    className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-[10px] font-bold text-emerald-400 flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                    </svg>
                                    <span>{language === 'ar' ? 'عرض الفاتورة' : 'View Receipt'}</span>
                                  </button>
                                </div>
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
                    </div>
                  )}

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
          <div className={`lg:col-span-5 space-y-6 ${activeMobileTab === 'ledger' ? 'block' : 'hidden lg:block'}`}>
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
            <div id="tracking-card" className="glass-panel rounded-2xl p-6 space-y-6 relative overflow-hidden">
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
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 border border-emerald-900/40 text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-transparent" />
                                <span>{t('track_status_verified')}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleReceiptClick(d)}
                                className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-[10px] font-bold text-emerald-400 flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                </svg>
                                <span>{language === 'ar' ? 'عرض الفاتورة' : 'View Receipt'}</span>
                              </button>
                            </div>
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



          </div>

        </div>

        {/* VERIFIED DONOR REGISTRY LEDGER */}
        <div className={`glass-panel rounded-3xl p-6 md:p-8 space-y-6 ${activeMobileTab === 'ledger' ? 'block' : 'hidden lg:block'}`}>
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

          <div className="overflow-x-auto rounded-xl border border-slate-900 bg-slate-950/40 max-h-[350px] overflow-y-auto">
            {/* Desktop Table View */}
            <table className="w-full text-start border-collapse hidden md:table">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-900/80 text-slate-400 text-xs font-bold sticky top-0 z-10">
                  <th className="px-6 py-3.5 text-start sticky top-0 bg-slate-950/90 backdrop-blur-sm z-10">{language === 'ar' ? 'المتبرع' : 'Donor Name'}</th>
                  <th className="px-6 py-3.5 text-start sticky top-0 bg-slate-950/90 backdrop-blur-sm z-10">{language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}</th>
                  <th className="px-6 py-3.5 text-start sticky top-0 bg-slate-950/90 backdrop-blur-sm z-10">{language === 'ar' ? 'المبلغ' : 'Amount'}</th>
                  <th className="px-6 py-3.5 text-start sticky top-0 bg-slate-950/90 backdrop-blur-sm z-10">{language === 'ar' ? 'طريقة الدفع' : 'Payment Method'}</th>
                  <th className="px-6 py-3.5 text-start sticky top-0 bg-slate-950/90 backdrop-blur-sm z-10">{language === 'ar' ? 'تاريخ التوثيق' : 'Verification Date'}</th>
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
                        <bdi>{item.masked_name || t('anonymous')}</bdi>
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-400">
                        <span dir="ltr">{item.masked_phone || '—'}</span>
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

            {/* Mobile Card List View */}
            <div className="block md:hidden divide-y divide-slate-900/60 bg-slate-950/20">
              {recentDonationsError ? (
                <div className="text-center py-6 text-red-400 font-mono text-xs">
                  Error: {(recentDonationsError as any).message || JSON.stringify(recentDonationsError)}
                </div>
              ) : recentDonations && recentDonations.length > 0 ? (
                recentDonations.map((item) => (
                  <div key={item.id} className="p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white text-sm">
                        <bdi>{item.masked_name || t('anonymous')}</bdi>
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono" dir="ltr">
                        {item.masked_phone || '—'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm font-black text-emerald-400">
                        {item.amount} {t('egp')}
                      </span>
                      <div>
                        {item.payment_method === 'vodafone_cash' ? (
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
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1.5 border-t border-slate-900/20">
                      <span>{language === 'ar' ? 'تاريخ التوثيق:' : 'Verified at:'}</span>
                      <span>
                        {isMounted ? new Date(item.created_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'short', timeStyle: 'short' }) : '...'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-slate-500">
                  {language === 'ar' ? 'لا توجد تبرعات موثقة بعد.' : 'No verified donations found.'}
                </div>
              )}
            </div>
          </div>
        </div>

      </main>

      {/* FOOTER SECTION */}
      <footer className="w-full border-t border-slate-900 bg-slate-950/80 backdrop-blur-md mt-16 py-10 relative z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-8 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">

          {/* Logo & Brief */}
          <div className="col-span-1 md:col-span-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center flex-shrink-0">
                <Heart className="w-4 h-4 text-slate-950 fill-slate-950" />
              </div>
              <span className="text-md font-extrabold text-white">donations 9th Batch</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              {language === 'ar'
                ? 'نظام تبرعات آمن وتلقائي لدعم حملة الدفعة التاسعة طب كفر الشيخ لتوفير الأجهزة الطبية الحيوية لمستشفى كفر الشيخ الجامعي.'
                : 'A secure, automated donation system supporting the 9th Batch Kafr El-Sheikh Medicine campaign to provide critical medical equipment to the University Hospital.'}
            </p>
            {language === 'ar' ? (
              <div className="pt-3 border-t border-slate-900/60 mt-3 space-y-1">
                <p className="text-xs text-emerald-405 font-bold flex items-center gap-1.5">
                  <span>🤍</span>
                  <span>هذا النظام صدقة جارية عن والد د. محمد أبو الخير.</span>
                </p>
                <p className="text-[10.5px] text-slate-500 font-normal pr-5">
                  نسألكم الفاتحة والدعاء له بالرحمة والمغفرة.
                </p>
              </div>
            ) : (
              <div className="pt-3 border-t border-slate-900/60 mt-3 space-y-1">
                <p className="text-xs text-emerald-450 font-bold flex items-center gap-1.5">
                  <span>🤍</span>
                  <span>This system is an ongoing charity (Sadqa Jariyah) for the father of Dr. Mohamed Abouelkhier.</span>
                </p>
                <p className="text-[10px] text-slate-500 font-normal pl-5">
                  Please pray for his mercy and forgiveness.
                </p>
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="col-span-1 md:col-span-3 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {language === 'ar' ? 'صفحات تهمك' : 'Pages'}
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/about" className="text-slate-400 hover:text-emerald-400 transition-colors">
                  {language === 'ar' ? 'عن الحملة والمنصة' : 'About Campaign & Platform'}
                </Link>
              </li>
              <li>
                <Link href="/privacy-policy" className="text-slate-400 hover:text-emerald-400 transition-colors">
                  {language === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'}
                </Link>
              </li>
            </ul>
          </div>

          {/* Developer Contact Card */}
          <div className="col-span-1 md:col-span-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {language === 'ar' ? 'التواصل مع المطور' : 'Contact Developer'}
            </h4>
            <div className="glass-panel p-4 rounded-xl border border-slate-900 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-450 font-bold text-sm">
                  M
                </div>
                <div>
                  <p className="text-xs font-bold text-white">
                    {language === 'ar' ? 'د. محمد أبو الخير' : 'Dr. Mohamed Abouelkhier'}
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium">
                    {language === 'ar' ? 'مطور المنصة' : 'Platform Developer'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <a
                  href="https://wa.me/201015339426"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-950/30 hover:bg-emerald-950/50 border border-emerald-900/35 text-[10px] font-bold text-emerald-400 rounded-lg transition-all active:scale-95"
                >
                  <span>WhatsApp</span>
                </a>
                <a
                  href="https://t.me/M7MED1573"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-sky-950/30 hover:bg-sky-950/50 border border-sky-900/35 text-[10px] font-bold text-sky-400 rounded-lg transition-all active:scale-95"
                >
                  <span>Telegram</span>
                </a>
              </div>
            </div>
          </div>

        </div>

        {/* Sub-footer Copyright */}
        <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8 pt-6 border-t border-slate-900/40 text-center">
          <p className="text-[10px] text-slate-500 leading-normal">
            &copy; {new Date().getFullYear()} donations 9th Batch. Built with Next.js, Tailwind CSS & Supabase.
          </p>
        </div>
      </footer>

      {/* Mobile Floating Action Button (FAB) */}
      {isMounted && activeMobileTab === 'campaign' && (
        <div className="lg:hidden fixed bottom-6 left-0 right-0 z-45 px-4 flex justify-center pointer-events-none animate-bounce-gentle">
          <button
            type="button"
            onClick={() => {
              setActiveMobileTab('donate');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="pointer-events-auto px-8 py-3.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/30 active:scale-95 transition-all flex items-center gap-2 border border-emerald-300/30 glow-green"
          >
            <Heart className="w-4 h-4 fill-slate-950" />
            <span>{language === 'ar' ? 'تبرع الآن للحملة' : 'Donate to Campaign'}</span>
          </button>
        </div>
      )}

      {/* SHARE PROGRESS MODAL */}
      {showShareModal && shareImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl border border-slate-900 bg-slate-950 space-y-6 shadow-2xl animate-scale-up">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {language === 'ar' ? 'مشاركة تقدم الحملة' : 'Share Campaign Progress'}
              </h3>
              <button 
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-white text-xs font-semibold px-2 py-1 hover:bg-slate-900 rounded-lg transition-colors"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>

            {/* Image Preview Container */}
            <div className="w-full bg-slate-900/40 rounded-xl overflow-hidden border border-slate-900 p-2 flex items-center justify-center relative">
              <img 
                src={shareImage} 
                alt="Campaign Progress Share Card" 
                className="w-full h-auto rounded-lg shadow-md border border-slate-950"
              />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleDownloadShareImage}
                className="py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black text-xs text-center shadow-md active:scale-95 transition-all hover:brightness-105"
              >
                {language === 'ar' ? 'تحميل الصورة' : 'Download Image'}
              </button>
              <button
                onClick={handleNativeShare}
                className="py-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-350 font-bold text-xs text-center active:scale-95 transition-all"
              >
                {language === 'ar' ? 'نشر ومشاركة' : 'Share / Copy'}
              </button>
            </div>

            <p className="text-[10px] text-slate-500 text-center leading-normal">
              {language === 'ar' 
                ? 'يمكنك تحميل بطاقة التقدم ونشرها على وسائل التواصل الاجتماعي لدعم الحملة.' 
                : 'Download the progress card to share on social media stories.'}
            </p>

          </div>
        </div>
      )}

      {/* DONATION RECEIPT MODAL */}
      {showReceiptModal && selectedReceiptDonation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl border border-slate-900 bg-slate-950 space-y-6 shadow-2xl animate-scale-up">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {language === 'ar' ? 'فاتورة تبرع معتمدة' : 'Verified Donation Receipt'}
              </h3>
              <button 
                onClick={() => {
                  setShowReceiptModal(false);
                  setSelectedReceiptDonation(null);
                  setReceiptImage(null);
                }}
                className="text-slate-400 hover:text-white text-xs font-semibold px-2 py-1 hover:bg-slate-900 rounded-lg transition-colors"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>

            {/* Receipt Preview */}
            <div className="w-full bg-slate-900/40 rounded-xl overflow-hidden border border-slate-900 p-2 flex flex-col items-center justify-center min-h-[300px] relative">
              {isGeneratingReceipt || !receiptImage ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                  <p className="text-xs text-slate-400">
                    {language === 'ar' ? 'جاري توليد الفاتورة المعتمدة...' : 'Generating certified receipt...'}
                  </p>
                </div>
              ) : (
                <img 
                  src={receiptImage} 
                  alt="Donation Receipt" 
                  className="w-full h-auto rounded-lg shadow-md border border-slate-950"
                />
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleDownloadReceiptImage}
                  disabled={isGeneratingReceipt || !receiptImage}
                  className="py-3 px-4 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-100 font-bold text-xs text-center active:scale-95 transition-all disabled:opacity-50"
                >
                  {language === 'ar' ? 'تحميل كبطاقة' : 'Download Image'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadReceiptPDF}
                  disabled={isGeneratingReceipt || !receiptImage}
                  className="py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black text-xs text-center shadow-md active:scale-95 transition-all hover:brightness-105 disabled:opacity-50"
                >
                  {language === 'ar' ? 'تحميل فاتورة PDF' : 'Download PDF Invoice'}
                </button>
              </div>
              <button
                type="button"
                onClick={handleReceiptNativeShare}
                disabled={isGeneratingReceipt || !receiptImage}
                className="py-3 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-350 font-bold text-xs text-center active:scale-95 transition-all disabled:opacity-50"
              >
                {language === 'ar' ? 'مشاركة وتوثيق التبرع' : 'Share / Copy Verification'}
              </button>
            </div>

            <p className="text-[10px] text-slate-500 text-center leading-normal">
              {language === 'ar' 
                ? 'تحتوي الفاتورة على رقم معاملة فريد ورمز QR مشفر للتحقق الفوري من صحة التبرع.' 
                : 'The receipt includes a unique transaction ID and a verification QR code linked to the ledger.'}
            </p>

          </div>
        </div>
      )}

      {/* Dedication Toast Notification (Messenger Style) */}
      <div 
        className={`fixed z-50 
          top-4 left-1/2 -translate-x-1/2
          md:top-auto md:bottom-6 md:left-6 md:translate-x-0 rtl:md:right-6 rtl:md:left-auto
          max-w-sm w-[calc(100vw-2rem)] md:w-[360px] 
          bg-slate-950/95 backdrop-blur-md border border-emerald-500/20 p-4 rounded-2xl 
          shadow-[0_15px_35px_rgba(0,0,0,0.6)] flex items-start gap-3.5 transition-all duration-500 transform ${
          showDedicationToast 
            ? 'translate-y-0 opacity-100 scale-100' 
            : '-translate-y-4 md:translate-y-12 opacity-0 scale-95 pointer-events-none'
        }`}
        dir={language === 'ar' ? 'rtl' : 'ltr'}
      >
        {/* Profile/Heart Icon */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-lg shadow-md shadow-emerald-500/20 flex-shrink-0 animate-pulse">
          🤍
        </div>

        {/* Text Details */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-extrabold text-white leading-normal">
            {language === 'ar' 
              ? 'هذا النظام صدقة جارية عن والد د. محمد أبو الخير.' 
              : 'This system is a continuous charity for the father of Dr. Mohamed Abouelkhier.'}
          </p>
          <p className="text-[10px] text-slate-400 mt-1 leading-normal">
            {language === 'ar' 
              ? 'نسألكم الفاتحة والدعاء له بالرحمة والمغفرة.' 
              : 'Please pray for his mercy and forgiveness.'}
          </p>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={() => setShowDedicationToast(false)}
          className="text-slate-500 hover:text-white transition-colors p-1 -mt-1 -me-1 rounded-lg hover:bg-slate-900/60"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
