import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                // Priority colors
                priority: {
                    1: "#D3D3D3",
                    2: "#93C5FD",
                    3: "#FCD34D",
                    4: "#FB923C",
                    5: "#F87171",
                },
                // Energy level colors
                energy: {
                    high: "#86EFAC",
                    medium: "#FDE047",
                    low: "#FCA5A5",
                },
                // Status colors
                status: {
                    scheduled: "#60A5FA",
                    "in-progress": "#A78BFA",
                    completed: "#34D399",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            keyframes: {
                "slide-in-from-bottom": {
                    "0%": { opacity: "0", transform: "translateY(20px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
                "pulse-glow": {
                    "0%, 100%": { boxShadow: "0 0 0 0 rgba(99, 102, 241, 0.4)" },
                    "50%": { boxShadow: "0 0 0 8px rgba(99, 102, 241, 0)" },
                },
                checkmark: {
                    "0%": { transform: "scale(0) rotate(0deg)" },
                    "50%": { transform: "scale(1.2) rotate(180deg)" },
                    "100%": { transform: "scale(1) rotate(360deg)" },
                },
                "slide-in-right": {
                    "0%": { transform: "translateX(100%)", opacity: "0" },
                    "100%": { transform: "translateX(0)", opacity: "1" },
                },
            },
            animation: {
                "slide-in": "slide-in-from-bottom 0.3s ease-out",
                "pulse-glow": "pulse-glow 0.6s ease-out",
                checkmark: "checkmark 0.5s ease-out",
                "slide-in-right": "slide-in-right 0.3s ease-out",
            },
        },
    },
    plugins: [],
};

export default config;
