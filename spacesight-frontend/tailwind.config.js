/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'space-bg': '#0a0a0f',
        'space-surface': '#0d0d1a',
        'space-purple': '#7c3aed',
        'space-violet': '#a855f7',
        'space-text': '#e2e8f0',
        'space-teal': '#06b6d4',
      },
      fontFamily: {
        orbitron: ['var(--font-orbitron)', 'sans-serif'],
        inter: ['var(--font-inter)', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
