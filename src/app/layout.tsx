import type { Metadata } from 'next';
import { Cairo, Outfit } from 'next/font/google';
import './globals.css';
import { LanguageProvider } from '@/context/LanguageContext';
import QueryProvider from '@/providers/QueryProvider';

const cairo = Cairo({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-cairo',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'donations 9th Batch | منصة التبرع للدفعة التاسعة',
  description: 'A trusted, premium donation campaign system in Egypt with real-time transparency and automatic SMS payment matching (Vodafone Cash & InstaPay).',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${outfit.variable}`}>
      <body className="antialiased bg-slate-950 text-slate-50 min-h-screen select-none selection:bg-emerald-500/30">
        <QueryProvider>
          <LanguageProvider>
            {children}
          </LanguageProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
