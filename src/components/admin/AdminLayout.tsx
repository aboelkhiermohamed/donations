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
  Heart, 
  Globe, 
  Menu, 
  X, 
  Bell, 
  Loader2,
  AlertTriangle,
  Settings
} from 'lucide-react';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { language, dir, toggleLanguage, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();

  // State
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [adminName, setAdminName] = useState('');

  // 1. Session verification & redirection
  useEffect(() => {
    async function verifyAdmin() {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.replace('/admin/login');
        return;
      }

      // Check admins table
      const { data: admin, error } = await supabase
        .from('admins')
        .select('name')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error || !admin) {
        // Sign out if not admin
        await supabase.auth.signOut();
        router.replace('/admin/login');
        return;
      }

      setAdminName(admin.name);
      setIsAdmin(true);
      setIsLoading(false);
    }
    
    verifyAdmin();
  }, [router]);

  // 2. Fetch notification count and listen to new ones
  useEffect(() => {
    if (!isAdmin) return;

    const fetchNotifications = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);
      
      setUnreadNotificationsCount(count || 0);
    };

    fetchNotifications();

    // Subscribe to notifications
    const channel = supabase
      .channel('admin_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        setUnreadNotificationsCount(prev => prev + 1);
        // Play notification alert chime (optional)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  // 3. Logout action
  const handleLogout = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    router.replace('/admin/login');
  };

  const navItems = [
    { label: t('db_overview'), path: '/admin/dashboard', icon: LayoutDashboard },
    { label: t('db_donations'), path: '/admin/donations', icon: Coins },
    { label: t('db_sms'), path: '/admin/sms', icon: MessageSquare, badge: true },
    { label: t('db_reports'), path: '/admin/reports', icon: FileSpreadsheet },
    { label: language === 'ar' ? 'الإعدادات' : 'Settings', path: '/admin/settings', icon: Settings },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
        <span className="text-sm font-semibold">{language === 'ar' ? 'تحميل لوحة الإدارة...' : 'Loading Admin Portal...'}</span>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col md:flex-row font-sans" dir={dir}>
      {/* MOBILE HEADER */}
      <header className="md:hidden w-full bg-slate-900/80 border-b border-slate-800 p-4 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center">
            <Heart className="w-4 h-4 text-slate-950 fill-slate-950" />
          </div>
          <span className="font-extrabold text-white text-md tracking-tight">YusrAdmin</span>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={toggleLanguage} className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
            <Globe className="w-4 h-4 text-emerald-400" />
          </button>
          
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-1.5 rounded-lg bg-slate-800 text-slate-350">
            {mobileMenuOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
          </button>
        </div>
      </header>

      {/* SIDEBAR NAVIGATION (Desktop) */}
      <aside className={`fixed inset-y-0 start-0 z-30 w-64 glass-panel border-r border-slate-800/80 p-6 flex flex-col justify-between transition-transform duration-300 md:translate-x-0 md:static ${
        mobileMenuOpen 
          ? 'translate-x-0' 
          : dir === 'rtl' 
            ? 'translate-x-full md:translate-x-0' 
            : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Heart className="w-5 h-5 text-slate-950 fill-slate-950" />
            </div>
            <div>
              <h2 className="font-black text-white text-sm tracking-tight">Yusr Dashboard</h2>
              <span className="text-[10px] text-slate-500 block uppercase tracking-widest">{t('admin_title')}</span>
            </div>
          </div>

          {/* Nav List */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-slate-900 border border-slate-800 text-emerald-400 shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && unreadNotificationsCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px] glow-green">
                      {unreadNotificationsCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="space-y-4 pt-6 border-t border-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-xs font-bold text-emerald-400">
              {adminName ? adminName.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="overflow-hidden">
              <h4 className="text-white font-bold text-xs truncate">{adminName || 'Administrator'}</h4>
              <span className="text-[9px] text-emerald-450 block font-semibold">{t('admin_title')}</span>
            </div>
          </div>

          {/* Toggle Language Button (Desktop) */}
          <button
            onClick={toggleLanguage}
            className="w-full hidden md:flex items-center gap-3 px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-900/50 text-xs font-semibold text-slate-300 transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>{language === 'ar' ? 'English Language' : 'اللغة العربية'}</span>
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-red-950/20 border border-red-900/20 hover:bg-red-950/30 text-xs font-semibold text-red-300 transition-all active:scale-[0.99]"
          >
            <LogOut className="w-3.5 h-3.5 text-red-400" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER CONTENT */}
      <div className="flex-1 min-w-0 p-6 md:p-8 overflow-y-auto space-y-6">
        {/* Banner Alert for Unverified Matches */}
        {unreadNotificationsCount > 0 && (
          <div className="w-full p-4 bg-emerald-950/20 border border-emerald-900/30 rounded-2xl flex items-center justify-between gap-4 animate-scale-up">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <h4 className="text-white font-bold text-sm">
                  {language === 'ar' ? 'تنبيه: رسائل غير مطابقة' : 'Alert: Unmatched Transactions'}
                </h4>
                <p className="text-slate-400 text-xs mt-0.5">
                  {language === 'ar' 
                    ? `لديك عدد ${unreadNotificationsCount} إشعارات معلقة قيد المراجعة. يرجى التحقق من لوحة مراقب الرسائل لمطابقتها يدوياً.` 
                    : `You have ${unreadNotificationsCount} unread system alerts. Review the SMS Monitor to perform manual verification.`
                  }
                </p>
              </div>
            </div>
            <Link 
              href="/admin/sms"
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-xs font-bold text-emerald-300 flex-shrink-0"
            >
              {language === 'ar' ? 'افتح المراقب' : 'Open Monitor'}
            </Link>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
