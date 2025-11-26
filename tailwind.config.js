/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'], // body text
        serif: ['Montserrat', 'ui-serif', 'Georgia', 'serif'], // headings
      },
    },
  },
  plugins: [],
}
