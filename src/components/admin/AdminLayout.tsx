'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/LanguageContext';
import {
  LayoutDashboard,
  Coins,
  MessageSquare,
  FileSpreadsheet,
  LogOut,
  HeartHandshake,
  Globe,
  Menu,
  X,
  Bell,
  Loader2,
  Settings,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

// In-memory cache across client-side route transitions
let memoryAdminCache: { id: string; name: string; timestamp: number } | null = null;

function getInitialAdminState() {
  if (typeof window === 'undefined') {
    return { isAdmin: false, isLoading: true, name: '' };
  }
  
  // 1. Check memory cache (fastest, active during client-side navigation)
  if (memoryAdminCache && (Date.now() - memoryAdminCache.timestamp < 1000 * 60 * 30)) {
    return { isAdmin: true, isLoading: false, name: memoryAdminCache.name };
  }

  // 2. Check sessionStorage (persists across page reloads in the same browser session)
  try {
    const raw = sessionStorage.getItem('admin_session_cache');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id && (Date.now() - parsed.timestamp < 1000 * 60 * 60 * 2)) {
        memoryAdminCache = parsed;
        return { isAdmin: true, isLoading: false, name: parsed.name || 'مسؤول الحملة' };
      }
    }
  } catch {}

  return { isAdmin: false, isLoading: true, name: '' };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { language, dir, toggleLanguage, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();

  // State initialized with cached session if available
  const [initialState] = useState(getInitialAdminState);
  const [isAdmin, setIsAdmin] = useState(initialState.isAdmin);
  const [isLoading, setIsLoading] = useState(initialState.isLoading);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [adminName, setAdminName] = useState(initialState.name);

  // 1. Session verification & background revalidation
  useEffect(() => {
    let isMounted = true;

    async function verifyAdmin() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          memoryAdminCache = null;
          try { sessionStorage.removeItem('admin_session_cache'); } catch {}
          if (isMounted) router.replace('/admin/login');
          return;
        }

        // If memory cache is valid for this user, keep state active without full reload
        if (memoryAdminCache && memoryAdminCache.id === session.user.id && (Date.now() - memoryAdminCache.timestamp < 1000 * 60 * 15)) {
          if (isMounted) {
            setIsAdmin(true);
            setIsLoading(false);
          }
          return;
        }

        const { data: admin, error } = await supabase
          .from('admins')
          .select('name')
          .eq('id', session.user.id)
          .maybeSingle();

        if (error || !admin) {
          memoryAdminCache = null;
          try { sessionStorage.removeItem('admin_session_cache'); } catch {}
          await supabase.auth.signOut();
          if (isMounted) router.replace('/admin/login');
          return;
        }

        const newCache = {
          id: session.user.id,
          name: admin.name || 'مسؤول الحملة',
          timestamp: Date.now()
        };
        memoryAdminCache = newCache;
        try {
          sessionStorage.setItem('admin_session_cache', JSON.stringify(newCache));
        } catch {}

        if (isMounted) {
          setAdminName(newCache.name);
          setIsAdmin(true);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Admin session error:', err);
        if (isMounted && !memoryAdminCache) {
          router.replace('/admin/login');
        }
      }
    }

    verifyAdmin();

    return () => {
      isMounted = false;
    };
  }, [router]);

  // 2. Fetch notification count and listen to new ones
  useEffect(() => {
    if (!isAdmin) return;

    const fetchNotifications = async () => {
      try {
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('is_read', false);

        setUnreadNotificationsCount(count || 0);
      } catch { }
    };

    fetchNotifications();

    const channel = supabase
      .channel('admin_notifications_layout')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        setUnreadNotificationsCount(prev => prev + 1);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  const handleLogout = async () => {
    memoryAdminCache = null;
    try { sessionStorage.removeItem('admin_session_cache'); } catch {}
    await supabase.auth.signOut();
    router.replace('/admin/login');
  };

  const navItems = [
    {
      href: '/admin/dashboard',
      label: language === 'ar' ? 'نظرة عامة' : 'Dashboard',
      icon: LayoutDashboard,
      active: pathname === '/admin/dashboard',
    },
    {
      href: '/admin/donations',
      label: language === 'ar' ? 'سجل التبرعات' : 'Donations',
      icon: Coins,
      active: pathname === '/admin/donations',
    },
    {
      href: '/admin/sms',
      label: language === 'ar' ? 'بوابة الرسائل (SMS)' : 'SMS Gateway',
      icon: MessageSquare,
      active: pathname === '/admin/sms',
    },
    {
      href: '/admin/reports',
      label: language === 'ar' ? 'التقارير المحاسبية' : 'Reports',
      icon: FileSpreadsheet,
      active: pathname === '/admin/reports',
    },
    {
      href: '/admin/settings',
      label: language === 'ar' ? 'إعدادات الحملة والدفع' : 'Payment Settings',
      icon: Settings,
      active: pathname === '/admin/settings',
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1220] flex flex-col items-center justify-center font-arabic">
        <Loader2 className="w-8 h-8 animate-spin text-[#153C32] dark:text-[#24B58A] mb-3" />
        <span className="text-sm font-semibold text-[#55625B] dark:text-[#A7B4B0]">
          جارٍ التحقق من صلاحيات الإدارة...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#FAF9F5] dark:bg-[#0B1220] text-[#191F1C] dark:text-[#F3F5F4] font-arabic transition-colors duration-200" dir={dir}>

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex w-72 flex-col bg-[#153C32] dark:bg-[#111C2D] text-white border-e border-[#0E2A22] dark:border-[#283849] fixed inset-y-0 start-0 z-30 shadow-elevated">

        {/* Brand Header */}
        <div className="h-20 px-6 flex items-center justify-between border-b border-white/10 dark:border-[#283849]">
          <Link href="/admin/dashboard" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-white/10 dark:bg-[#24B58A]/15 flex items-center justify-center text-[#E2F3EE] dark:text-[#24B58A] group-hover:bg-white/15 transition-colors">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-base text-white tracking-tight block">
                {language === 'ar' ? 'لوحة إدارة الصدقة' : 'Charity Admin'}
              </span>
              <span className="text-xs text-[#B79B68] dark:text-[#C5A876] font-medium block">
                {t('brand_batch')}
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold transition-all ${item.active
                  ? 'bg-white/15 dark:bg-[#24B58A]/20 text-white shadow-subtle'
                  : 'text-[#E2F3EE]/75 dark:text-[#A7B4B0] hover:bg-white/10 dark:hover:bg-[#172436] hover:text-white'
                  }`}
              >
                <Icon className={`w-5 h-5 ${item.active ? 'text-[#B79B68] dark:text-[#24B58A]' : 'text-[#E2F3EE]/60 dark:text-[#80918C]'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Admin Footer Information */}
        <div className="p-4 border-t border-white/10 dark:border-[#283849] space-y-3">
          <div className="p-3 rounded-xl bg-white/5 dark:bg-[#172436] border border-white/10 dark:border-[#283849] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#B79B68] dark:bg-[#24B58A] text-[#153C32] dark:text-[#0B1220] font-black flex items-center justify-center text-xs">
                {adminName.charAt(0) || 'م'}
              </div>
              <div className="text-start">
                <span className="text-xs font-bold text-white block leading-tight truncate max-w-[120px]">
                  {adminName}
                </span>
                <span className="text-[10px] text-[#B79B68] dark:text-[#C5A876] font-semibold block">
                  {language === 'ar' ? 'مسؤول معتمد' : 'Authorized Admin'}
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-white/60 hover:text-red-300 hover:bg-red-950/30 transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4 rtl-flip" />
            </button>
          </div>

          <Link
            href="/"
            target="_blank"
            className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-white/5 dark:bg-[#172436] text-xs font-semibold text-[#E2F3EE]/80 dark:text-[#A7B4B0] hover:bg-white/10 dark:hover:bg-[#1f3047] hover:text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'زيارة الموقع العام' : 'View Public Site'}</span>
          </Link>
        </div>

      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col lg:ps-72 min-w-0">

        {/* Top Navbar */}
        <header className="h-16 px-4 sm:px-8 bg-white dark:bg-[#172436] border-b border-[#EAE8DE] dark:border-[#283849] flex items-center justify-between sticky top-0 z-20 shadow-subtle transition-colors">

          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-[#DDD9CC] dark:border-[#283849] bg-[#FAF9F5] dark:bg-[#111C2D] text-[#3D4742] dark:text-[#F3F5F4]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-xs sm:text-sm font-semibold text-[#738079] dark:text-[#A7B4B0] hidden sm:inline">
              صدقة جارية • إهداء لروح د. حسين علي الأمير ود. ندى هاني حامد
            </span>
          </div>

          {/* Top Right Controls */}
          <div className="flex items-center gap-2.5">

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Notifications Indicator */}
            <div className="relative">
              <Link
                href="/admin/donations?status=pending"
                className="p-2 rounded-xl border border-[#DDD9CC] dark:border-[#283849] bg-[#FAF9F5] dark:bg-[#111C2D] text-[#3D4742] dark:text-[#F3F5F4] hover:bg-[#F4F3ED] dark:hover:bg-[#172436] block relative"
                title="التبرعات المعلقة"
              >
                <Bell className="w-4 h-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center shadow-subtle">
                    {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                  </span>
                )}
              </Link>
            </div>

            {/* Language Switch */}
            <button
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#DDD9CC] dark:border-[#283849] bg-[#FAF9F5] dark:bg-[#111C2D] text-xs font-semibold text-[#3D4742] dark:text-[#F3F5F4] hover:bg-[#F4F3ED] dark:hover:bg-[#172436]"
            >
              <Globe className="w-3.5 h-3.5 text-[#153C32] dark:text-[#24B58A]" />
              <span>{language === 'ar' ? 'English' : 'العربية'}</span>
            </button>

            {/* Public Link */}
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#153C32] dark:bg-[#24B58A] text-white dark:text-[#0B1220] text-xs font-bold hover:bg-[#1C4E41] dark:hover:bg-[#1fa37b]"
            >
              <span>{language === 'ar' ? 'الموقع العام' : 'Public Site'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>

          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 sm:p-8">
          {children}
        </main>

      </div>

      {/* MOBILE DRAWER SIDEBAR */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[80%] bg-[#153C32] dark:bg-[#111C2D] text-white flex flex-col p-6 z-10 space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <span className="font-bold text-base">{language === 'ar' ? 'لوحة الإدارة' : 'Admin Portal'}</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded-lg text-white/70 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-2">
              {navItems.map(item => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold ${item.active ? 'bg-white/15 dark:bg-[#24B58A]/20 text-white' : 'text-[#E2F3EE]/75 dark:text-[#A7B4B0] hover:bg-white/10'
                      }`}
                  >
                    <Icon className="w-5 h-5 text-[#B79B68] dark:text-[#24B58A]" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="pt-4 border-t border-white/10 space-y-2">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-950/30 text-red-300 text-xs font-bold"
              >
                <LogOut className="w-4 h-4 rtl-flip" />
                <span>{language === 'ar' ? 'تسجيل الخروج' : 'Log Out'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
