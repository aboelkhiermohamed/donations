import type { Metadata, Viewport } from 'next';
import { Alexandria, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { LanguageProvider } from '@/context/LanguageContext';
import { ThemeProvider } from '@/context/ThemeContext';
import QueryProvider from '@/providers/QueryProvider';
import MaintenanceGuard from '@/components/MaintenanceGuard';

const alexandria = Alexandria({
  subsets: ['arabic', 'latin'],
  variable: '--font-alexandria',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'صدقة جارية — الدفعة التاسعة طب كفر الشيخ | د. حسين علي الأمير ود. ندى هاني حامد',
  description: 'مبادرة صدقة جارية مقدمة من أطباء الدفعة التاسعة طب كفر الشيخ لتوفير جهاز تنفس صناعي لوحدة العناية المركزة بمستشفيات جامعة كفر الشيخ، إهداءً لروح الفقيدين د. حسين علي الأمير ود. ندى هاني حامد رحمة الله عليهما.',
  keywords: ['صدقة جارية', 'طب كفر الشيخ', 'الدفعة التاسعة', 'جهاز تنفس صناعي', 'تبرعات', 'كفر الشيخ'],
  icons: {
    icon: '/icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#153C32',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${alexandria.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <head>
        {/* Anti-FOUC Theme Script: Prevents theme flash on initial load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var pref = localStorage.getItem('theme_preference');
                  var isDark = false;
                  if (pref === 'dark') {
                    isDark = true;
                  } else if (pref === 'system' || !pref) {
                    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  }
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased bg-[#FAF9F5] text-[#191F1C] dark:bg-[#0B1220] dark:text-[#F3F5F4] min-h-screen transition-colors duration-200" suppressHydrationWarning>
        <QueryProvider>
          <LanguageProvider>
            <ThemeProvider>
              <MaintenanceGuard>
                {children}
              </MaintenanceGuard>
            </ThemeProvider>
          </LanguageProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
