import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        matcha: {
          dark: "#3B5B3E",
          DEFAULT: "#6B8E68",
          light: "#D8E8D4",
          subtle: "#EBF3E8",
        },
        sand: {
          light: "#F8F9F5",
          DEFAULT: "#EFEBE4",
          dark: "#D8D1C5",
        },
        mocha: {
          DEFAULT: "#2C221E",
          muted: "#766E65",
        },
        line: {
          green: "#06C755",
          dark: "#05B24C",
          light: "#E8F8EE",
        },
      },
    },
  },
  plugins: [],
};
export default config;
