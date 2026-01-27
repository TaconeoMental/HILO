/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx,mdx}",
    "./components/**/*.{js,jsx,ts,tsx,mdx}",
    "./hooks/**/*.{js,jsx,ts,tsx,mdx}",
    "./lib/**/*.{js,jsx,ts,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        "bg-primary": "#0a0e14",
        "bg-surface": "#0f1419",
        "bg-surface-light": "#1a1f26",
        accent: "#F60761",
        "accent-light": "#ff4081",
        "accent-dark": "#c2185b",
        "text-primary": "#f5f5f5",
        "text-secondary": "#9da5b4",
        "text-muted": "#5c6370",
        success: "#4caf50",
        error: "#F60761",
        warning: "#ffb74d"
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "12px"
      }
    }
  },
  plugins: []
};

export default config;
