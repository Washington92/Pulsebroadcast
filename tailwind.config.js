/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: { colors: {
    border: 'hsl(var(--border))', background: 'hsl(var(--background))', foreground: 'hsl(var(--foreground))',
    card: 'hsl(var(--card))', panel: 'hsl(var(--panel))', primary: 'hsl(var(--primary))',
    'primary-foreground': 'hsl(var(--primary-foreground))', secondary: 'hsl(var(--secondary))',
    'secondary-foreground': 'hsl(var(--secondary-foreground))', accent: 'hsl(var(--accent))',
    muted: 'hsl(var(--muted))', 'muted-foreground': 'hsl(var(--muted-foreground))',
    'tally-pgm': 'hsl(var(--tally-pgm))', 'tally-pvw': 'hsl(var(--tally-pvw))', warn: 'hsl(var(--warn))',
    'destructive-foreground': 'hsl(var(--destructive-foreground))'
  } } },
  plugins: []
};
