// Halloween: charcoal-violet nights, measured pumpkin orange, quiet detail.
// Proposed window: Oct 1 – Nov 2. See docs/seasons/halloween.md.
export default {
  id: 'halloween',
  name: 'Halloween',
  releaseYear: 2026,
  description: 'Ember · night',
  window: { start: '10-01', end: '11-02' },
  base: 'neutral',
  // [page, card, muted]: smoky lilac paper in Light, charcoal violet in Dark.
  surfaces: {
    light: ['#f6f3f7', '#fffdff', '#ebe6ef'],
    dark: ['#121016', '#1c1822', '#26212e'],
  },
  shades: [
    { id: 'halloween', name: 'Pumpkin', light: '#a74a04', dark: '#ee8420' },
    { id: 'halloween-moon', name: 'Moonlight', light: '#4f6a8f', dark: '#a9c2e6' },
    { id: 'halloween-violet', name: 'Witch Violet', light: '#6d4aa8', dark: '#b79cf0' },
    { id: 'halloween-potion', name: 'Potion', light: '#4d7a1f', dark: '#a9d66a' },
    { id: 'halloween-ash', name: 'Ash', light: '#5f6470', dark: '#cfd2da' },
  ],
};
