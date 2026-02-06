/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // CollaNote-inspired palette
                primary: '#007AFF', // Classic iOS blue
                secondary: '#5AC8FA',
                background: '#F2F2F7',
                surface: '#FFFFFF',
            },
            backdropBlur: {
                xs: '2px',
            }
        },
    },
    plugins: [],
}
