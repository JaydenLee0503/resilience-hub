/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        ddin: ['"D-DIN Bold"', '"D-DIN"', '"DIN Alternate"', '"Arial Narrow"', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
