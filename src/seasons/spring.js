// Spring: blossom pink on blush ivory, fresh leaf detail.
// Proposed window: Mar 20 – May 31.
export default {
  id: 'spring',
  name: 'Spring',
  description: 'Blossom · fresh',
  window: { start: '03-20', end: '05-31' },
  base: 'warm',
  surfaces: {
    light: ['#fbf7f7', '#fffefe', '#f3eaec'],
    dark: ['#141113', '#1f1a1d', '#2a2227'],
  },
  shades: [
    { id: 'spring', name: 'Blossom', light: '#af467e', dark: '#e79ad6' },
    { id: 'spring-peony', name: 'Peony', light: '#8f3f8e', dark: '#dfa6e6' },
    { id: 'spring-lilac', name: 'Lilac', light: '#6e58aa', dark: '#bcaaf2' },
    { id: 'spring-leaf', name: 'Leaf', light: '#3f7a2e', dark: '#a3d483' },
    { id: 'spring-sky', name: 'Sky', light: '#2c6c98', dark: '#93c8ee' },
  ],
};
