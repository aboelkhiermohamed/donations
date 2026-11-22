'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTheme, Theme } from '@/context/ThemeContext';
import { Sun, Moon, Laptop, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function ThemeToggle({ showLabel = false, compact = false }: { showLabel?: boolean; compact?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const themeOptions: { value: Theme; labelAr: string; labelEn: string; icon: React.ReactNode }[] = [
    {
      value: 'light',
      labelAr: 'نهاري',
      labelEn: 'Light',
      icon: <Sun className="w-3.5 h-3.5 text-amber-500" />,
    },
    {
      value: 'dark',
      labelAr: 'ليلي',
      labelEn: 'Dark',
      icon: <Moon className="w-3.5 h-3.5 text-indigo-400" />,
    },
    {
      value: 'system',
      labelAr: 'تلقائي',
      labelEn: 'System',
      icon: <Laptop className="w-3.5 h-3.5 text-slate-400" />,
    },
  ];

  const currentOption = themeOptions.find(o => o.value === theme) || themeOptions[0];
  const isDark = mounted ? resolvedTheme === 'dark' : false;
  const currentTitle = mounted
    ? (language === 'ar' ? `المظهر: ${currentOption.labelAr}` : `Theme: ${currentOption.labelEn}`)
    : 'المظهر / Theme';

  return (
    <div className="relative inline-block text-start" ref={dropdownRef}>
      <button
        type="button"
        suppressHydrationWarning
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all ${
          isDark
            ? 'bg-[#172436] border-[#283849] text-[#F3F5F4] hover:bg-[#1f3047]'
            : 'bg-white border-[#DDD9CC] text-[#3D4742] hover:bg-[#F4F3ED]'
        } text-xs font-semibold shadow-subtle`}
        aria-label="تغيير المظهر / Change Theme"
        title={currentTitle}
      >
        {isDark ? (
          <Moon className="w-3.5 h-3.5 text-[#24B58A]" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-[#B79B68]" />
        )}

        {showLabel && mounted && (
          <span className="hidden sm:inline">
            {language === 'ar' ? currentOption.labelAr : currentOption.labelEn}
          </span>
        )}

        {!compact && <ChevronDown className="w-3 h-3 text-slate-400 opacity-60" />}
      </button>

      {isOpen && (
        <div
          className={`absolute end-0 mt-1.5 w-32 rounded-xl border shadow-card z-50 p-1 space-y-0.5 animate-fadeIn ${
            resolvedTheme === 'dark'
              ? 'bg-[#172436] border-[#283849] text-[#F3F5F4]'
              : 'bg-white border-[#EAE8DE] text-[#191F1C]'
          }`}
        >
          {themeOptions.map(opt => {
            const isSelected = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setTheme(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  isSelected
                    ? resolvedTheme === 'dark'
                      ? 'bg-[#24B58A]/15 text-[#24B58A]'
                      : 'bg-[#153C32]/10 text-[#153C32]'
                    : resolvedTheme === 'dark'
                    ? 'hover:bg-[#111C2D] text-[#A7B4B0]'
                    : 'hover:bg-[#FAF9F5] text-[#55625B]'
                }`}
              >
                <div className="flex items-center gap-2">
                  {opt.icon}
                  <span>{language === 'ar' ? opt.labelAr : opt.labelEn}</span>
                </div>
                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
