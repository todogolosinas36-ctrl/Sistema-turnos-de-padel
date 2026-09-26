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
    },
  },
  plugins: [tailwindcssAnimate],
};
