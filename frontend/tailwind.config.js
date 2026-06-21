/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans TC"', 'system-ui', 'sans-serif'],
      },
      colors: {
        app: '#F4F6F9',
        surface: '#FFFFFF',
        subtle: '#F0F2F6',
        border: '#E3E7ED',
        text: {
          primary: '#15202B',
          secondary: '#5C6B7A',
          muted: '#77848F',
        },
        primary: {
          DEFAULT: '#2563EB',
          soft: '#E8EFFE',
        },
        'on-primary': '#FFFFFF',
        profit: {
          DEFAULT: '#15A35A',
          soft: '#E4F6EC',
        },
        loss: {
          DEFAULT: '#DC2F3C',
          soft: '#FCE8E9',
        },
        stale: {
          DEFAULT: '#C2790B',
          soft: '#FBF1DD',
        },
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(21, 32, 43, 0.04), 0 4px 16px rgba(21, 32, 43, 0.04)',
      },
      keyframes: {
        // Quote tick flash — soft green/red wash that fades back to transparent.
        'flash-profit': {
          '0%': { backgroundColor: 'rgba(21, 163, 90, 0.18)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'flash-loss': {
          '0%': { backgroundColor: 'rgba(220, 47, 60, 0.16)' },
          '100%': { backgroundColor: 'transparent' },
        },
        // Skeleton shimmer sweep (used by the .skeleton ::after bar).
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'flash-profit': 'flash-profit 1.2s ease-out',
        'flash-loss': 'flash-loss 1.2s ease-out',
        shimmer: 'shimmer 1.5s infinite',
      },
    },
  },
  plugins: [],
};
