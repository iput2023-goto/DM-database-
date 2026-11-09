/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        civil: {
          light: '#f59e0b',
          water: '#0ea5e9',
          darkness: '#6b21a8',
          fire: '#ef4444',
          nature: '#22c55e',
          zero: '#64748b',
          multi: '#d97706',
        }
      }
    },
  },
  plugins: [],
};

