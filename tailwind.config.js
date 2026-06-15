/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
        },
      },
      fontFamily: {
        sans: ["Inter", "Be Vietnam Pro", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 4px 16px -2px rgba(124, 58, 237, 0.10), 0 2px 6px -2px rgba(0,0,0,0.04)",
        card: "0 2px 10px -2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16,24,40,0.04)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
