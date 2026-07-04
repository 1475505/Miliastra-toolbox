/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Material Design 3 color roles
        primary: 'rgb(var(--md-primary) / <alpha-value>)',
        'on-primary': 'rgb(var(--md-on-primary) / <alpha-value>)',
        'primary-container': 'rgb(var(--md-primary-container) / <alpha-value>)',
        'on-primary-container': 'rgb(var(--md-on-primary-container) / <alpha-value>)',
        secondary: 'rgb(var(--md-secondary) / <alpha-value>)',
        'on-secondary': 'rgb(var(--md-on-secondary) / <alpha-value>)',
        'secondary-container': 'rgb(var(--md-secondary-container) / <alpha-value>)',
        'on-secondary-container': 'rgb(var(--md-on-secondary-container) / <alpha-value>)',
        tertiary: 'rgb(var(--md-tertiary) / <alpha-value>)',
        surface: 'rgb(var(--md-surface) / <alpha-value>)',
        'surface-variant': 'rgb(var(--md-surface-variant) / <alpha-value>)',
        'on-surface': 'rgb(var(--md-on-surface) / <alpha-value>)',
        'on-surface-variant': 'rgb(var(--md-on-surface-variant) / <alpha-value>)',
        outline: 'rgb(var(--md-outline) / <alpha-value>)',
        'outline-variant': 'rgb(var(--md-outline-variant) / <alpha-value>)',
        error: 'rgb(var(--md-error) / <alpha-value>)',
        'on-error': 'rgb(var(--md-on-error) / <alpha-value>)',
        'error-container': 'rgb(var(--md-error-container) / <alpha-value>)',
      },
      boxShadow: {
        surface: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        modal: '0 25px 50px -12px rgb(0 0 0 / 0.15)',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'Cantarell',
          '"Fira Sans"',
          '"Droid Sans"',
          '"Helvetica Neue"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
