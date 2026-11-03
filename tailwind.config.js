/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Merah logo EBA
        eba: { 50: '#fdf2f2', 100: '#fbe3e3', 500: '#d23b36', 600: '#c0302b', 700: '#9f2622', 900: '#5c1513' },
      },
    },
  },
  plugins: [],
}
