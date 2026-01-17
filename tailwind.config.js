/*
 * Laptop Grading System (LGS)
 * Developed by: Hiran Tiago Lins Borba
 * Year: 2026
 * History:
 * - 0.1 (2026-01-17) Beta release
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.ejs",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('daisyui'),
  ],
}
