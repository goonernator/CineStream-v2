import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        netflix: {
          bg: 'var(--netflix-bg)',
          dark: 'var(--netflix-dark)',
          red: 'var(--netflix-red)',
          light: 'var(--netflix-light)',
          gray: 'var(--netflix-gray)',
        },
      },
    },
  },
  plugins: [],
}
export default config

