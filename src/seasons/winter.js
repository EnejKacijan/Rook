// Winter: glacier ink on cold snow paper, polar-night Dark with a pale ice
// accent. A season for the whole cold stretch, not a holiday: no red, no gold,
// no festive motif. The Nov 26 – Mar 19 window wraps the year and can
// overlap shorter holiday themes.
export default {
  id: 'winter',
  name: 'Winter',
  releaseYear: 2026,
  description: 'Glacier · calm',
  window: { start: '11-26', end: '03-19' },
  base: 'cool',
  // A frost wash from the top: cold blue on snow in Light, ice in Dark.
  atmosphere: { shape: 'top', light: '#7fb6d6', dark: '#8fd8f0', strength: { light: .16, dark: .12 } },
  // [page, card, muted]: blue-white snow in Light, polar night in Dark.
  surfaces: {
    light: ['#f2f6f9', '#fcfeff', '#e3ecf2'],
    dark: ['#0b1217', '#131d24', '#1b2830'],
  },
  shades: [
    { id: 'winter', name: 'Glacier', light: '#0b5068', dark: '#b4e4f4' },
    { id: 'winter-ice', name: 'Ice', light: '#1d6f8a', dark: '#8fd6ee' },
    { id: 'winter-aurora', name: 'Aurora', light: '#2c6e5f', dark: '#8fe0c6' },
    { id: 'winter-twilight', name: 'Twilight', light: '#5a4f9a', dark: '#c0b5f2' },
    { id: 'winter-frost', name: 'Frost', light: '#4b6280', dark: '#c6d4e6' },
  ],
};
