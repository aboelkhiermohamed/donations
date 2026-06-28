'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ar';
type Direction = 'ltr' | 'rtl';

interface LanguageContextType {
  language: Language;
  dir: Direction;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // General
    campaign_organizer: "Campaign Organizer",
    target: "Target",
    collected: "Collected",
    remaining: "Remaining",
    progress: "Progress",
    donors: "Donors",
    donations: "Donations",
    confirm: "Confirm",
    cancel: "Cancel",
    copy: "Copy",
    copied: "Copied!",
    egp: "EGP",
    
    // Homepage
    hero_title: "Safe & Transparent Donation Platform",
    hero_desc: "Support community campaigns in Egypt with automatic payments verification. Submit your donation and our engine matches it in seconds using instant SMS alerts.",
    transparency_title: "Donor Transparency Dashboard",
    transparency_desc: "Real-time verification stats connected directly to our database logs. We protect donor privacy while ensuring 100% financial auditability.",
    stat_total_received: "Total Funds Raised",
    stat_approved: "Approved Donations",
    stat_pending: "Pending SMS Match",
    stat_total_donors: "Verified Donors",
    stat_largest_donation: "Largest Single Donation",
    stat_latest_donation: "Latest Donation Received",
    
    // Donation Form
    form_title: "Submit a Donation",
    form_subtitle: "Choose Vodafone Cash or InstaPay, complete your transfer, then submit this form to verify.",
    field_name: "Donor Name",
    field_phone: "Donor Phone Number",
    field_amount: "Donation Amount",
    field_method: "Payment Method",
    field_ref: "Transaction ID / Ref# (Recommended)",
    field_digits: "Last 4 Digits of Sender Account/Card (Optional)",
    field_notes: "Notes for the campaign (Optional)",
    field_screenshot: "Upload Transfer Screenshot (Optional)",
    btn_submit: "Confirm Donation",
    submitting: "Confirming Donation...",
    success_title: "Donation Request Saved!",
    success_desc: "Thank you! Your donation is now pending verification. The moment our gateway receives the SMS alert on our Android device, it will automatically approve your contribution.",
    
    // Donation Tracking
    track_title: "Track Your Donation",
    track_desc: "Check the live status of your transfers. Enter your phone number to find all recent donations submitted from your device.",
    track_phone_label: "Phone Number",
    track_phone_placeholder: "e.g. 01012345678",
    track_btn: "Track Status",
    track_no_results: "No donation requests found for this phone number.",
    track_last_updated: "Last updated",
    track_status_pending: "Pending matching...",
    track_status_verified: "Approved & Verified 🎉",
    track_status_rejected: "Rejected",
    track_status_refunded: "Refunded",
    track_my_donations: "My Recent Donations",
    
    // Instructions
    inst_title: "Transfer Instructions",
    inst_sub: "Please transfer the exact amount using either method before submitting:",
    vfc_number: "Vodafone Cash Wallet",
    instapay_acc: "InstaPay Address",
    qr_title: "Quick Scan InstaPay QR",
    qr_desc: "Scan using your InstaPay app to populate the account instantly.",
    vfc_label: "Vodafone Cash",
    instapay_label: "InstaPay",
    
    // Recent Donors
    recent_donors_title: "Recent Verified Donors",
    recent_donors_desc: "Showing only approved and verified donations. Names and phones are masked to respect privacy.",
    anonymous: "Anonymous Donor",
    
    // Dashboard / Admin
    admin_title: "Admin Dashboard",
    logout: "Log Out",
    login_title: "Admin Authentication",
    login_btn: "Login",
    db_overview: "Overview",
    db_donations: "Donation Records",
    db_sms: "SMS Gateway Logs",
    db_reports: "Export Reports",
    db_analytics: "Detailed Analytics",
    db_total: "Total Donations",
    db_auto_verified: "Auto Verified",
    db_manual_verified: "Manual Verified",
    db_rejected: "Rejected",
    db_monthly_revenue: "Monthly Inflow",
    db_weekly_growth: "Donation Growth",
    db_verification_rate: "Verification Rate",
    db_recent_sms: "Real-time Incoming SMS Streams",
  },
  ar: {
    // General
    campaign_organizer: "منظم الحملة",
    target: "المستهدف",
    collected: "المبلغ المجمع",
    remaining: "المتبقي",
    progress: "نسبة الإنجاز",
    donors: "المتبرعون",
    donations: "التبرعات",
    confirm: "تأكيد",
    cancel: "إلغاء",
    copy: "نسخ",
    copied: "تم النسخ!",
    egp: "ج.م",
    
    // Homepage
    hero_title: "منصة التبرع الآمنة والشفافة",
    hero_desc: "ادعم الحملات الخيرية في مصر مع التحقق التلقائي الفوري من المدفوعات. قم بتقديم التبرع وسيقوم محركنا بمطابقته خلال ثوانٍ بمجرد وصول الرسالة القصيرة.",
    transparency_title: "لوحة شفافية الجهات المتبرعة",
    transparency_desc: "إحصائيات فورية متصلة بسجلات التحقق في الوقت الفعلي. نلتزم بحماية خصوصية المتبرعين مع توفير شفافية مالية بنسبة 100%.",
    stat_total_received: "إجمالي المبالغ المجموعة",
    stat_approved: "تبرعات معتمدة",
    stat_pending: "تبرعات قيد التحقق من SMS",
    stat_total_donors: "المتبرعون المعتمدون",
    stat_largest_donation: "أكبر تبرع فردي",
    stat_latest_donation: "آخر تبرع مستلم",
    
    // Donation Form
    form_title: "تسجيل تبرع جديد",
    form_subtitle: "اختر فودافون كاش أو إنستاباي، قم بالتحويل ثم أرسل هذا النموذج لمطابقته وفحصه.",
    field_name: "اسم المتبرع",
    field_phone: "رقم هاتف المتبرع",
    field_amount: "قيمة التبرع",
    field_method: "طريقة التحويل",
    field_ref: "رقم العملية / مرجع المعاملة (موصى به)",
    field_digits: "آخر 4 أرقام من حساب المرسل (اختياري)",
    field_notes: "ملاحظات إضافية للحملة (اختياري)",
    field_screenshot: "إرفاق لقطة شاشة لإيصال التحويل (اختياري)",
    btn_submit: "تأكيد وإتمام التبرع",
    submitting: "جاري الإرسال والتسجيل...",
    success_title: "تم تسجيل التبرع بنجاح!",
    success_desc: "شكرًا لفضلكم وجودكم! تبرعكم قيد التحقق الآن. في اللحظة التي يستلم فيها هاتف البوابة رسالة الدفع، سيتم تفعيل التبرع تلقائيًا.",
    
    // Donation Tracking
    track_title: "تتبع حالة تبرعك",
    track_desc: "تابع حالة تحويلك مباشرة. أدخل رقم هاتفك للبحث عن جميع طلبات التبرع التي أرسلتها من جهازك.",
    track_phone_label: "رقم الهاتف",
    track_phone_placeholder: "مثال: 01012345678",
    track_btn: "تتبع الحالة",
    track_no_results: "لم يتم العثور على طلبات تبرع مسجلة لهذا الرقم.",
    track_last_updated: "آخر تحديث",
    track_status_pending: "قيد المطابقة مع رسائل البوابة...",
    track_status_verified: "تم التحقق والاعتماد بنجاح 🎉",
    track_status_rejected: "مرفوض",
    track_status_refunded: "تم الاسترجاع",
    track_my_donations: "تبرعاتي الأخيرة",
    
    // Instructions
    inst_title: "تعليمات التحويل الفوري",
    inst_sub: "يرجى إرسال مبلغ التبرع المحدد عبر إحدى الطرق التالية قبل إتمام النموذج:",
    vfc_number: "رقم محفظة فودافون كاش",
    instapay_acc: "عنوان الدفع إنستاباي (InstaPay)",
    qr_title: "مسح سريع لرمز إنستاباي QR",
    qr_desc: "افتح تطبيق InstaPay الخاص بك وامسح الرمز لتجهيز الدفع مباشرة.",
    vfc_label: "فودافون كاش",
    instapay_label: "إنستاباي",
    
    // Recent Donors
    recent_donors_title: "المتبرعون الذين تم توثيقهم مؤخراً",
    recent_donors_desc: "يتم عرض التبرعات المعتمدة والنشطة فقط. تُخفى الأرقام والأسماء احتراماً لخصوصية المتبرعين.",
    anonymous: "فاعل خير",
    
    // Dashboard / Admin
    admin_title: "لوحة التحكم الإدارية",
    logout: "تسجيل الخروج",
    login_title: "بوابة دخول الإدارة",
    login_btn: "تسجيل الدخول",
    db_overview: "نظرة عامة",
    db_donations: "سجلات التبرعات",
    db_sms: "بوابة رسائل SMS",
    db_reports: "تصدير التقارير",
    db_analytics: "التحليلات التفصيلية",
    db_total: "إجمالي عمليات التبرع",
    db_auto_verified: "موثق تلقائياً",
    db_manual_verified: "موثق يدوياً",
    db_rejected: "مرفوض",
    db_monthly_revenue: "التدفق المالي الشهري",
    db_weekly_growth: "معدل نمو التبرعات",
    db_verification_rate: "معدل التحقق التلقائي الناجح",
    db_recent_sms: "بث الرسائل القصيرة المستلمة مباشرة",
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('ar'); // Default to Arabic RTL for localized appeal

  useEffect(() => {
    // Sync language attributes to <html> tag for SEO and styling
    const dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language]);

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === 'en' ? 'ar' : 'en'));
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider value={{ language, dir, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
