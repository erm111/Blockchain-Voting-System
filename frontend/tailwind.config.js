/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        babcock: {
          DEFAULT: "#13294b", // Babcock navy blue
          dark: "#0a1a33",
          light: "#2e5599",
        },
      },
    },
  },
  plugins: [],
};
