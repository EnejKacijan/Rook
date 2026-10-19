// Summer: lagoon turquoise on sunlit sand, deep-sea nights, a sun ornament.
// Proposed window: Jun 21 – Aug 31.
export default {
  id: 'summer',
  name: 'Summer',
  description: 'Lagoon · sun',
  window: { start: '06-21', end: '08-31' },
  base: 'warm',
  surfaces: {
    light: ['#faf6ee', '#fffdf8', '#f2eada'],
    dark: ['#0a1416', '#122024', '#1a2b30'],
  },
  shades: [
    { id: 'summer', name: 'Lagoon', light: '#0b6f78', dark: '#52cfd6' },
    { id: 'summer-sea', name: 'Sea', light: '#16608f', dark: '#74bff0' },
    { id: 'summer-seafoam', name: 'Seafoam', light: '#2a6e60', dark: '#93dcc9' },
    { id: 'summer-palm', name: 'Palm', light: '#3d7a3a', dark: '#97d68f' },
    { id: 'summer-dusk', name: 'Dusk', light: '#6a54a6', dark: '#b9a9ef' },
  ],
};
