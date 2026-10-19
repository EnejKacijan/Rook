// Christmas: evergreen and warm cream, deep pine nights, burgundy and gold in
// the ornament only. Neither is an interactive accent: burgundy sits next to
// the error red and gold next to the warning amber, and a control must never
// look like an alert. Proposed window: Dec 1 – Dec 27.
export default {
  id: 'christmas',
  name: 'Christmas',
  description: 'Evergreen · warm',
  window: { start: '12-01', end: '12-27' },
  base: 'warm',
  surfaces: {
    light: ['#f9f6ef', '#fffdf8', '#f0eadd'],
    dark: ['#0d1512', '#15201c', '#1d2b25'],
  },
  shades: [
    { id: 'christmas', name: 'Evergreen', light: '#17604b', dark: '#6cc9a8' },
    { id: 'christmas-pine', name: 'Pine', light: '#2a5a3a', dark: '#9fcf94' },
    { id: 'christmas-spruce', name: 'Spruce', light: '#1d5e6b', dark: '#7cc4cf' },
    { id: 'christmas-mistletoe', name: 'Mistletoe', light: '#56704a', dark: '#b3cc9f' },
    { id: 'christmas-frost', name: 'Frost', light: '#4a6b85', dark: '#b6d0e6' },
  ],
};
