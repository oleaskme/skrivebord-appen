/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#185FA5',
          50:  '#EBF3FB',
          100: '#C8DDF4',
          200: '#91BBEA',
          300: '#5A99DF',
          400: '#2E7AC9',
          500: '#185FA5',
          600: '#134E88',
          700: '#0E3D6B',
          800: '#092C4E',
          900: '#041B31',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
