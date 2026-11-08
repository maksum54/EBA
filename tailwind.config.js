/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      keyframes: {
        masuk: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        blob: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(40px,30px) scale(1.15)' } },
        progres: { '0%': { width: '0%', opacity: '1' }, '70%': { width: '85%', opacity: '1' }, '100%': { width: '100%', opacity: '0' } },
        goyang: { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-4px)' }, '75%': { transform: 'translateX(4px)' } },
      },
      animation: {
        masuk: 'masuk .5s cubic-bezier(.2,.8,.2,1) both',
        blob: 'blob 12s ease-in-out infinite',
        goyang: 'goyang .3s ease-in-out 2',
        progres: 'progres .6s ease-out forwards',
      },
      colors: {
        // Merah logo EBA
        eba: { 50: '#fdf2f2', 100: '#fbe3e3', 500: '#d23b36', 600: '#c0302b', 700: '#9f2622', 900: '#5c1513' },
      },
    },
  },
  plugins: [],
}
