import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FAF9F5',
          100: '#F4F3ED',
          200: '#EAE8DE',
          300: '#DDD9CC',
          400: '#CCC6B4',
        },
        forest: {
          950: '#0A1E18',
          900: '#0E2A22',
          800: '#153C32',
          700: '#1C4E41',
          600: '#217A61',
          500: '#2A9779',
          400: '#3CB895',
          100: '#E2F3EE',
          50: '#F0F9F6',
        },
        dark: {
          bg: '#0B1220',
          bgSecondary: '#111C2D',
          surface: '#172436',
          border: '#283849',
          borderStrong: '#33465B',
          textPrimary: '#F3F5F4',
          textSecondary: '#A7B4B0',
          brand: '#24B58A',
        },
        ink: {
          950: '#111513',
          900: '#191F1C',
          800: '#27312C',
          700: '#3D4742',
          600: '#55625B',
          500: '#738079',
          400: '#94A099',
          300: '#BDC5BF',
          200: '#DFE3E0',
          100: '#EFEFEA',
        },
        gold: {
          900: '#52411F',
          800: '#7A6230',
          700: '#9E8047',
          600: '#B79B68',
          500: '#C7AE7E',
          400: '#D8C398',
          200: '#EFE5CF',
          100: '#F7F3E7',
          50: '#FAF8F2',
        },
      },
      fontFamily: {
        arabic: ['var(--font-alexandria)', 'var(--font-cairo)', 'sans-serif'],
        latin: ['var(--font-jakarta)', 'var(--font-outfit)', 'sans-serif'],
        sans: ['var(--font-alexandria)', 'var(--font-jakarta)', 'sans-serif'],
      },
      boxShadow: {
        'subtle': '0 1px 3px 0 rgba(21, 60, 50, 0.04), 0 1px 2px -1px rgba(21, 60, 50, 0.04)',
        'elevated': '0 4px 20px -2px rgba(21, 60, 50, 0.06), 0 2px 6px -1px rgba(21, 60, 50, 0.04)',
        'card': '0 2px 12px 0 rgba(25, 31, 28, 0.04)',
        'editorial': '0 20px 40px -15px rgba(21, 60, 50, 0.08)',
        'dark-subtle': '0 1px 3px 0 rgba(0, 0, 0, 0.25)',
        'dark-card': '0 4px 20px 0 rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
