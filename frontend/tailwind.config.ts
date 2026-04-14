import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0B2545",
        "navy-deep": "#071a33",
        "navy-light": "#13315C",
        orange: "#F97316",
        "orange-bright": "#FB923C",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      keyframes: {
        pulseShot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(0.9)" },
        },
      },
      animation: {
        pulseShot: "pulseShot 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
