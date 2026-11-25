'use client';

import React, { useState, useEffect } from 'react';
import { 
  Share2, 
  Copy, 
  Check, 
  Download, 
  X, 
  MessageCircle, 
  Send, 
  Sparkles, 
  Loader2, 
  ExternalLink 
} from 'lucide-react';

interface ShareCampaignDialogProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: {
    id: string;
    name_ar?: string;
    description_ar?: string;
    target_amount?: number;
    collected_amount?: number;
  };
  language?: 'ar' | 'en';
}

export default function ShareCampaignDialog({
  isOpen,
  onClose,
  campaign,
  language = 'ar',
}: ShareCampaignDialogProps) {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  const campaignId = campaign.id || 'c580436d-9654-4720-bc2f-a9cb6bf0f7a0';
  const campaignTitle = campaign.name_ar || 'صدقة جارية — إهداء لروح د. حسين علي الأمير ود. ندى هاني حامد';

  // Compute absolute share URL & dynamic OG image URL
  const [origin, setOrigin] = useState('https://donations-tau.vercel.app');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
      setCanNativeShare(typeof navigator !== 'undefined' && !!navigator.share);
    }
  }, []);

  const shareUrl = `${origin}/campaign/${campaignId}`;
  const ogImageUrl = `${origin}/api/og/campaign/${campaignId}`;

  const shareText = language === 'ar'
    ? `🌿 صدقة جارية: ${campaignTitle}\n\n«ساهم في إحداث فرق.. مشاركتك قد تكون سبباً في وصول الخير»\n\nرابط المساهمة المباشر والتفاصيل:\n`
    : `Support this noble cause: ${campaignTitle}\nDonate and share:\n`;

  // Prevent background scroll when dialog is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setCopied(false);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // 1. Copy Link Handler
  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const input = document.createElement('input');
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy share link:', err);
    }
  };

  // 2. Download Image Handler
  const handleDownloadImage = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch(ogImageUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `campaign-card-${campaignId.slice(0, 8)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Failed to download share card image:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  // 3. Social Media Share Handlers
  const shareToWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + shareUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const shareToFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const shareToTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // 4. Native Web Share API
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: campaignTitle,
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or aborted
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div 
        className="relative w-full max-w-xl bg-white dark:bg-[#111C2D] border border-[#DDD9CC] dark:border-[#283849] rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92vh]"
        dir={language === 'ar' ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#EAE8DE] dark:border-[#283849] flex items-center justify-between bg-[#FAF9F5] dark:bg-[#0B1220]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#153C32] dark:bg-[#217A61] text-white flex items-center justify-center shadow-subtle">
              <Share2 className="w-4 h-4 text-[#34d399]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#153C32] dark:text-[#F3F5F4]">
                {language === 'ar' ? 'مشاركة الحملة' : 'Share Campaign'}
              </h3>
              <p className="text-[11px] text-[#738079] dark:text-[#A7B4B0]">
                {language === 'ar' ? 'انشر الخير.. فالدال على الخير كفاعله 🌿' : 'Spread the good cause with others 🌿'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#738079] dark:text-[#A7B4B0] hover:bg-[#EAE8DE] dark:hover:bg-[#1f3047] transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Dynamic Share Card Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[#738079] dark:text-[#A7B4B0]">
              <span className="flex items-center gap-1.5 text-[#B79B68] dark:text-[#C5A876]">
                <Sparkles className="w-3.5 h-3.5" />
                {language === 'ar' ? 'بطاقة المشاركة المباشرة (1200 × 630)' : 'Dynamic Share Card Preview (1200x630)'}
              </span>
              <span className="text-[10px] bg-[#EAE8DE] dark:bg-[#1f3047] px-2 py-0.5 rounded-full font-mono">
                Live Data
              </span>
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-[#DDD9CC] dark:border-[#283849] bg-[#0a1a15] aspect-[1.905/1] shadow-md group">
              {!imageLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0a1a15] text-[#34d399]">
                  <Loader2 className="w-7 h-7 animate-spin text-[#34d399]" />
                  <span className="text-xs text-[#94a3b8] font-medium">
                    {language === 'ar' ? 'جارٍ توليد بطاقة الحملة الحية...' : 'Generating dynamic card...'}
                  </span>
                </div>
              )}

              <img
                src={ogImageUrl}
                alt="Dynamic Campaign Share Card"
                className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setImageLoaded(true)}
              />

              {/* Download overlay badge */}
              <button
                type="button"
                onClick={handleDownloadImage}
                disabled={isDownloading}
                className="absolute bottom-3 end-3 px-3 py-1.5 rounded-xl bg-black/75 hover:bg-black text-white text-xs font-semibold backdrop-blur-md border border-white/20 transition-all flex items-center gap-1.5 shadow-lg active:scale-95"
              >
                {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-[#34d399]" />}
                <span>{language === 'ar' ? 'تحميل الصورة' : 'Download PNG'}</span>
              </button>
            </div>
          </div>

          {/* Shareable Link Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#191F1C] dark:text-[#F3F5F4]">
              {language === 'ar' ? 'رابط الحملة المباشر' : 'Direct Campaign URL'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 py-2.5 px-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#0B1220] border border-[#DDD9CC] dark:border-[#283849] text-xs font-mono text-[#191F1C] dark:text-[#F3F5F4] focus:outline-none select-all"
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-subtle ${
                  copied 
                    ? 'bg-[#153C32] dark:bg-[#24B58A] text-white' 
                    : 'bg-[#153C32] hover:bg-[#1C4E41] text-white dark:bg-[#217A61] dark:hover:bg-[#24B58A]'
                }`}
              >
                {copied ? <Check className="w-4 h-4 text-[#34d399]" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? (language === 'ar' ? 'تم النسخ!' : 'Copied!') : (language === 'ar' ? 'نسخ الرابط' : 'Copy')}</span>
              </button>
            </div>
          </div>

          {/* Social Media Sharing Buttons Grid */}
          <div className="space-y-2">
            <span className="block text-xs font-bold text-[#738079] dark:text-[#A7B4B0]">
              {language === 'ar' ? 'مشاركة مباشرة عبر المنصات' : 'Direct Share'}
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {/* WhatsApp */}
              <button
                type="button"
                onClick={shareToWhatsApp}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#128C7E] dark:text-[#25D366] text-xs font-bold transition-colors shadow-subtle"
              >
                <MessageCircle className="w-4 h-4 text-[#25D366]" />
                <span>واتساب WhatsApp</span>
              </button>

              {/* Facebook */}
              <button
                type="button"
                onClick={shareToFacebook}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#1877F2]/10 hover:bg-[#1877F2]/20 border border-[#1877F2]/30 text-[#1877F2] text-xs font-bold transition-colors shadow-subtle"
              >
                <ExternalLink className="w-4 h-4" />
                <span>فيسبوك Facebook</span>
              </button>

              {/* Telegram */}
              <button
                type="button"
                onClick={shareToTelegram}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#229ED9]/10 hover:bg-[#229ED9]/20 border border-[#229ED9]/30 text-[#229ED9] text-xs font-bold transition-colors shadow-subtle col-span-2 sm:col-span-1"
              >
                <Send className="w-4 h-4" />
                <span>تليجرام Telegram</span>
              </button>
            </div>
          </div>

          {/* Native Web Share Button (if supported on device) */}
          {canNativeShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="w-full py-3 rounded-xl bg-[#FAF9F5] dark:bg-[#0B1220] hover:bg-[#EAE8DE] dark:hover:bg-[#1f3047] border border-[#DDD9CC] dark:border-[#283849] text-xs font-bold text-[#153C32] dark:text-[#F3F5F4] transition-colors flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4 text-[#B79B68]" />
              <span>{language === 'ar' ? 'مشاركة عبر تطبيقات الهاتف (المزيد...)' : 'Share via Device Apps...'}</span>
            </button>
          )}

        </div>

        {/* Footer info note */}
        <div className="px-6 py-3 bg-[#FAF9F5] dark:bg-[#0B1220] border-t border-[#EAE8DE] dark:border-[#283849] text-center text-[11px] text-[#738079] dark:text-[#A7B4B0]">
          <span>
            {language === 'ar' 
              ? 'عند مشاركة الرابط، ستظهر البطاقة الإحصائية وتفاصيل الحملة المباشرة تلقائياً على المنصات ✨' 
              : 'Link previews will automatically render the dynamic campaign card and live stats ✨'}
          </span>
        </div>
      </div>
    </div>
  );
}
