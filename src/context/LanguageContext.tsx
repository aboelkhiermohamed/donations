'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ar';
type Direction = 'ltr' | 'rtl';

interface LanguageContextType {
  language: Language;
  dir: Direction;
  toggleLanguage: () => void;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  ar: {
    // Memorial & Identity
    brand_title: "صدقة جارية",
    brand_batch: "الدفعة التاسعة — طب كفر الشيخ",
    hero_eyebrow: "حملة خيرية — الدفعة التاسعة",
    hero_title: "صدقة جارية",
    hero_dedication_to: "إهداء إلى روح الزميلين العزيزين",
    hero_doctor_1: "د. حسين علي الأمير",
    hero_doctor_2: "د. ندى هاني حامد",
    hero_subtitle: "بأثرٍ يبقى، وخيرٍ يمتد. نشارك معًا في توفير جهاز تنفس صناعي لدعم وحدة العناية المركزة بمستشفيات جامعة كفر الشيخ، ليكون صدقةً جارية تسهم في إنقاذ الأرواح وتخفيف آلام المرضى.",
    hero_cta_donate: "ساهم في الصدقة",
    hero_cta_about: "تعرف على المبادرة",
    hero_badge_institutional: "مبادرة خيرية طبية موثقة",
    hero_verse: "«إِذَا مَاتَ الإنْسَانُ انْقَطَعَ عنْه عَمَلُهُ إِلَّا مِن ثَلَاثَةٍ: إِلَّا مِن صَدَقَةٍ جَارِيَةٍ...»",

    // Navigation
    nav_home: "الرئيسية",
    nav_about: "عن الحملة",
    nav_progress: "مراحل الإنجاز",
    nav_donate: "التبرع",
    nav_tracking: "متابعة تبرعي",
    nav_transparency: "لوحة الشفافية",
    nav_admin: "لوحة الإدارة",

    // Campaign Progress
    progress_title: "مسار الحملة والإنجاز",
    progress_subtitle: "بيانات حية مباشرة متصلة بسجلات التحويلات المعتمدة، نضمن من خلالها الشفافية الكاملة لأعضاء الدفعة والمشاركين.",
    target: "المبلغ المستهدف",
    collected: "إجمالي ما جُمع",
    remaining: "المبلغ المتبقي",
    completion_rate: "نسبة التحقيق",
    verified_donors_count: "عدد المتبرعين الموثقين",
    average_donation: "متوسط المساهمة",
    egp: "ج.م",
    ventilator_target_label: "جهاز تنفس صناعي للعناية المركزة",

    // Storytelling / About Section
    story_badge: "الهدف والغاية",
    story_title: "خيرٌ يمتد أثره",
    story_p1: "انطلاقًا من واجب الوفاء لروح زملائنا الراحلين الدكتور حسين علي الأمير والدكتورة ندى هاني حامد، تنظم الدفعة التاسعة بكلية الطب البشري بجامعة كفر الشيخ هذه المبادرة الخيرية لشراء جهاز تنفس صناعي متطور.",
    story_p2: "تمثل أجهزة التنفس الصناعي عصب الحياة في وحدات الرعاية المركزة (ICU)، حيث يتوقف عليها إنقاذ الحالات الحرجة ومصابي الحوادث ومرضى الفشل التنفسي الحاد على مدار الساعة بمستشفيات الجامعة.",
    story_p3: "إن مساهمتك، مهما بلغت، ليست مجرد رقم؛ بل هي شريان حياة لمريض ومصدر أجر مستمر لا ينقطع بإذن الله في ميزان حسنات الفقيدين ولكل من شارك وسعى.",
    story_feature_1_title: "حاجة طبية حيوية",
    story_feature_1_desc: "دعم مستشفيات جامعة كفر الشيخ بجهاز تنفس صناعي فائق الكفاءة لخدمة المرضى مجانًا.",
    story_feature_2_title: "أثر مستمر ودائم",
    story_feature_2_desc: "صدقة جارية ينتفع بها آلاف المرضى لسنوات طويلة قادمة.",
    story_feature_3_title: "شفافية ومصداقية كاملة",
    story_feature_3_desc: "نظام آلي متكامل لتوثيق وتتبع كل جنيه يتم التبرع به بدقة معلنة للجميع.",

    // Donation Form
    form_title: "المساهمة في الصدقة الجارية",
    form_subtitle: "اختر وسيلة التحويل المناسبة (فودافون كاش أو إنستاباي)، قم بالتحويل، ثم سجّل بيانات العملية هنا ليتم توثيقها فورًا.",
    select_amount: "اختر قيمة المساهمة (أو اكتب مبلغًا مخصصًا):",
    custom_amount: "مبلغ آخر",
    field_name: "اسم المساهم / المتبرع",
    field_name_placeholder: "الاسم أو اكتب (فاعل خير)",
    field_phone: "رقم هاتف المتبرع",
    field_phone_placeholder: "مثال: 01012345678",
    field_amount: "مبلغ التبرع بالجنيه المصري",
    field_method: "وسيلة الدفع المستخدمة",
    field_ref: "الرقم المرجعي للتحويل (Reference / Tx ID)",
    field_ref_placeholder: "رقم العملية من رسالة التأكيد أو تطبيق البنك",
    field_digits: "آخر 4 أرقام من الحساب أو البطاقة المحوّل منها",
    field_digits_placeholder: "اختياري — يساعد في التوثيق الآلي الفوري",
    field_notes: "رسالة أو إهداء أو دعاء",
    field_notes_placeholder: "اكتب دعاءً للفقيدين أو رسالة للمبادرة (اختياري)",
    field_screenshot: "إرفاق إيصال أو صورة التحويل (اختياري)",
    drag_drop_screenshot: "انقر أو اسحب صورة الإيصال هنا",
    btn_submit: "تأكيد وتسجيل التبرع",
    submitting: "جارٍ تسجيل العملية والتحقق...",
    success_title: "تم تسجيل التبرع بنجاح!",
    success_desc: "جزاكم الله خيرًا. تم استلام طلبك وهو الآن قيد الربط الآلي أو المراجعة. بمجرد وصول إشعار التحويل سيتم اعتماده وتحديث لوحة الشفافية.",
    new_submission_btn: "تسجيل مساهمة جديدة",
    track_this_donation: "متابعة حالة هذا التبرع",

    // Payment Instructions
    payment_inst_title: "بيانات التحويل المعتمدة",
    payment_inst_sub: "يرجى التحويل المباشر للحسابات الرسمية للدفعة قبل ملء الاستمارة:",
    vfc_wallet_1: "محفظة فودافون كاش (1)",
    vfc_wallet_2: "محفظة فودافون كاش (2)",
    instapay_acc: "عنوان إنستاباي (IPA)",
    instapay_phone: "رقم هاتف إنستاباي",
    scan_qr: "مسح رمز الاستجابة السريعة (QR)",
    open_instapay_app: "فتح الدفع في تطبيق InstaPay",
    copy: "نسخ",
    copied: "تم النسخ بنجاح!",

    // Live Tracking
    track_title: "متابعة حالة التبرع",
    track_subtitle: "يمكنك التحقق من توثيق مساهمتك في أي وقت بإدخال رقم الهاتف المسجل أو الرقم المرجعي للمعاملة.",
    track_input_label: "رقم الهاتف أو الرقم المرجعي",
    track_input_placeholder: "أدخل رقم الهاتف (مثل: 010...) أو Ref#",
    track_btn: "استعلام عن الحالة",
    track_status_pending: "قيد المراجعة والربط الآلي",
    track_status_verified: "تم التوثيق والاعتماد بنجاح",
    track_status_rejected: "مرفوض — يرجى التواصل مع الإدارة",
    track_status_review: "يحتاج لمراجعة إضافية",
    track_no_results: "لم يتم العثور على تبرعات مسجلة بهذه البيانات.",
    receipt_btn: "عرض إيصال الصدقة",

    // Transparency Ledger
    transparency_title: "سجل الشفافية وقائمة الشرف",
    transparency_subtitle: "عرض حصري للمساهمات التي تم تأكيدها واعتمادها رسميًا. نحافظ على الخصوصية الكاملة بحجب أجزاء من الأسماء والأرقام.",
    col_donor: "المساهم",
    col_amount: "المبلغ",
    col_method: "وسيلة الدفع",
    col_status: "حالة التوثيق",
    col_date: "التاريخ",
    anonymous_donor: "فاعل خير",
    verified_badge: "معتمد وموثق",
    largest_donation: "أكبر مساهمة فردية",
    latest_donation: "آخر مساهمة معتمدة",
    view_all_donations: "عرض كافة المساهمات",

    // Footer
    footer_text: "مبادرة صدقة جارية مقدمة من أطباء الدفعة التاسعة — كلية الطب البشري، جامعة كفر الشيخ. نسأل الله أن يتقبلها ويجعلها نورًا ورحمة لروحي الفقيدين.",
    footer_rights: "جميع الحقوق محفوظة © الدفعة التاسعة طب كفر الشيخ",
    footer_privacy: "سياسة الخصوصية وحماية البيانات",
    footer_contact: "تواصل مع منسقي الحملة",
    footer_admin_link: "دخول مسؤولي الدفعة",

    // General & States
    loading: "جارٍ التحميل...",
    error_occurred: "حدث خطأ غير متوقع",
    retry: "إعادة المحاولة",
    optional: "اختياري",
    required: "مطلوب",
    cancel: "إلغاء",
    confirm: "تأكيد",
  },
  en: {
    // Memorial & Identity
    brand_title: "Sadaqah Jariyah",
    brand_batch: "9th Batch — Kafr El-Sheikh Medicine",
    hero_eyebrow: "Charity Initiative — 9th Batch",
    hero_title: "Sadaqah Jariyah",
    hero_dedication_to: "Dedicated to the Beloved Memory of",
    hero_doctor_1: "Dr. Hussein Ali El-Amir",
    hero_doctor_2: "Dr. Nada Hani Hamed",
    hero_subtitle: "An enduring impact, an everlasting benevolence. Joining hands to provide a modern ICU ventilator for Kafr El-Sheikh University Hospitals as continuous charity in loving memory of our late colleagues.",
    hero_cta_donate: "Contribute to the Charity",
    hero_cta_about: "About the Campaign",
    hero_badge_institutional: "Verified Institutional Medical Campaign",
    hero_verse: "\"When a person dies, all their deeds end except three: a continuous charity...\"",

    // Navigation
    nav_home: "Home",
    nav_about: "About",
    nav_progress: "Progress",
    nav_donate: "Donate",
    nav_tracking: "Track Donation",
    nav_transparency: "Transparency",
    nav_admin: "Admin",

    // Campaign Progress
    progress_title: "Campaign Progress & Milestones",
    progress_subtitle: "Live, verified data connected directly to our ledger, ensuring complete transparency for donors and organizers.",
    target: "Target Goal",
    collected: "Total Raised",
    remaining: "Remaining",
    completion_rate: "Progress",
    verified_donors_count: "Verified Donors",
    average_donation: "Average Gift",
    egp: "EGP",
    ventilator_target_label: "Advanced ICU Medical Ventilator",

    // Storytelling / About Section
    story_badge: "Mission & Purpose",
    story_title: "A Lasting Impact of Continuous Good",
    story_p1: "In honor of the cherished memory of our colleagues Dr. Hussein Ali El-Amir and Dr. Nada Hani Hamed, the 9th Batch of Kafr El-Sheikh Medicine is organizing this charitable campaign to provide a state-of-the-art ICU ventilator.",
    story_p2: "Ventilators serve as the lifeline of Intensive Care Units, enabling continuous life support for critical emergencies, trauma patients, and severe respiratory cases at Kafr El-Sheikh University Hospitals.",
    story_p3: "Every contribution directly serves a patient in need and stands as a perpetual source of reward in memory of the two doctors.",
    story_feature_1_title: "Critical Medical Need",
    story_feature_1_desc: "Equipping university hospital ICUs with a vital ventilator to save lives around the clock.",
    story_feature_2_title: "Enduring Sadaqah",
    story_feature_2_desc: "A continuous charitable deed providing medical aid to thousands of patients over years.",
    story_feature_3_title: "Complete Transparency",
    story_feature_3_desc: "An automated SMS verification engine auditing every contribution with public integrity.",

    // Donation Form
    form_title: "Make a Contribution",
    form_subtitle: "Select your preferred payment method (Vodafone Cash or InstaPay), execute your transfer, and submit your reference details for immediate verification.",
    select_amount: "Select an amount (or specify a custom gift):",
    custom_amount: "Other Amount",
    field_name: "Donor Name",
    field_name_placeholder: "Full name or (Anonymous Donor)",
    field_phone: "Donor Phone Number",
    field_phone_placeholder: "e.g. 01012345678",
    field_amount: "Donation Amount (EGP)",
    field_method: "Payment Method Used",
    field_ref: "Transaction Reference (Ref / Tx ID)",
    field_ref_placeholder: "Reference number from SMS or banking receipt",
    field_digits: "Last 4 Digits of Sender Account / Card",
    field_digits_placeholder: "Optional — enables instant auto-matching",
    field_notes: "Dedication, Prayer or Message",
    field_notes_placeholder: "Share a prayer for the late doctors or message (optional)",
    field_screenshot: "Attach Transfer Receipt / Screenshot (Optional)",
    drag_drop_screenshot: "Click or drag transfer screenshot here",
    btn_submit: "Confirm & Record Contribution",
    submitting: "Recording contribution & verifying...",
    success_title: "Contribution Successfully Recorded!",
    success_desc: "May Allah reward you abundantly. Your contribution has been submitted for automated matching and administrative verification.",
    new_submission_btn: "Submit Another Contribution",
    track_this_donation: "Track This Contribution",

    // Payment Instructions
    payment_inst_title: "Official Transfer Channels",
    payment_inst_sub: "Please transfer directly to one of the official batch accounts before submitting:",
    vfc_wallet_1: "Vodafone Cash Wallet (1)",
    vfc_wallet_2: "Vodafone Cash Wallet (2)",
    instapay_acc: "InstaPay Address (IPA)",
    instapay_phone: "InstaPay Phone Number",
    scan_qr: "Scan QR with InstaPay",
    open_instapay_app: "Open in InstaPay App",
    copy: "Copy",
    copied: "Copied!",

    // Live Tracking
    track_title: "Track Your Donation",
    track_subtitle: "Verify the verification and approval status of your gift anytime using your registered phone number or transaction reference.",
    track_input_label: "Phone Number or Reference ID",
    track_input_placeholder: "Enter phone (e.g. 010...) or Ref#",
    track_btn: "Look Up Status",
    track_status_pending: "Pending Automated Match",
    track_status_verified: "Approved & Verified",
    track_status_rejected: "Rejected — Please contact admins",
    track_status_review: "Under Administrative Review",
    track_no_results: "No contributions found for these details.",
    receipt_btn: "View Official Receipt",

    // Transparency Ledger
    transparency_title: "Donor Transparency Ledger",
    transparency_subtitle: "Real-time record of all verified contributions. Donor identities and contact numbers are responsibly masked to safeguard personal privacy.",
    col_donor: "Donor",
    col_amount: "Amount",
    col_method: "Method",
    col_status: "Status",
    col_date: "Date",
    anonymous_donor: "Anonymous Donor",
    verified_badge: "Verified",
    largest_donation: "Largest Gift",
    latest_donation: "Latest Verified Gift",
    view_all_donations: "View All Contributions",

    // Footer
    footer_text: "A perpetual charitable initiative by the 9th Batch physicians of the Faculty of Human Medicine, Kafr El-Sheikh University, in loving memory of our late colleagues.",
    footer_rights: "All Rights Reserved © 9th Batch — Kafr El-Sheikh Medicine",
    footer_privacy: "Privacy Policy & Data Security",
    footer_contact: "Contact Organizers",
    footer_admin_link: "Admin Portal",

    // General & States
    loading: "Loading...",
    error_occurred: "An unexpected error occurred",
    retry: "Retry",
    optional: "Optional",
    required: "Required",
    cancel: "Cancel",
    confirm: "Confirm",
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('ar');
  const [dir, setDir] = useState<Direction>('rtl');

  useEffect(() => {
    const saved = localStorage.getItem('site_lang') as Language;
    if (saved && (saved === 'ar' || saved === 'en')) {
      setLanguage(saved);
      setDir(saved === 'ar' ? 'rtl' : 'ltr');
      document.documentElement.setAttribute('lang', saved);
      document.documentElement.setAttribute('dir', saved === 'ar' ? 'rtl' : 'ltr');
    } else {
      document.documentElement.setAttribute('lang', 'ar');
      document.documentElement.setAttribute('dir', 'rtl');
    }
  }, []);

  const toggleLanguage = () => {
    const next = language === 'ar' ? 'en' : 'ar';
    setLanguage(next);
    const nextDir = next === 'ar' ? 'rtl' : 'ltr';
    setDir(nextDir);
    localStorage.setItem('site_lang', next);
    document.documentElement.setAttribute('lang', next);
    document.documentElement.setAttribute('dir', nextDir);
  };

  const setLang = (lang: Language) => {
    setLanguage(lang);
    const nextDir = lang === 'ar' ? 'rtl' : 'ltr';
    setDir(nextDir);
    localStorage.setItem('site_lang', lang);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', nextDir);
  };

  const t = (key: string): string => {
    return translations[language]?.[key] || translations['ar']?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, dir, toggleLanguage, setLang, t }}>
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
