import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Outfit"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        punto: {
          900: '#0B1120',
          800: '#111827',
          brand: '#10B981',
          hover: '#059669',
          surface: '#F8FAFC',
        },
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        orbFloatA: {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(60px,40px,0) scale(1.1)' },
        },
        orbFloatB: {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(-60px,-50px,0) scale(1.15)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'orb-a': 'orbFloatA 14s ease-in-out infinite',
        'orb-b': 'orbFloatB 18s ease-in-out infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
