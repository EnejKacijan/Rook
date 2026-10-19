// New Year: midnight navy, frosted silver, an indigo accent and gold confetti.
// Gold stays in the ornament: as an accent it would read like a warning.
// Proposed window: Dec 28 – Jan 7 (wraps the year).
export default {
  id: 'new-year',
  name: 'New Year',
  description: 'Midnight · sparkle',
  window: { start: '12-28', end: '01-07' },
  base: 'cool',
  surfaces: {
    light: ['#f4f5f9', '#ffffff', '#e8eaf3'],
    dark: ['#0a0c17', '#131628', '#1c2037'],
  },
  shades: [
    { id: 'new-year', name: 'Midnight Indigo', light: '#4a4fc0', dark: '#a6aaff' },
    { id: 'new-year-ice', name: 'Ice', light: '#2a7385', dark: '#8fd3e3' },
    { id: 'new-year-silver', name: 'Silver', light: '#5a6478', dark: '#c6cdda' },
    { id: 'new-year-violet', name: 'Electric Violet', light: '#6a3fb2', dark: '#c8a8ff' },
    { id: 'new-year-blue', name: 'Night Blue', light: '#1a62b0', dark: '#82bfff' },
  ],
};
