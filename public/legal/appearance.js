// Visual hints only: no account, storage, analytics or app bundle.
(() => {
  const themes = ["forest","champagne","ocean","slate","plum","terracotta"];
  const parameters = new URLSearchParams(location.search);
  const explicit = parameters.get('appearance');
  const theme = themes.includes(parameters.get('theme')) ? parameters.get('theme') : 'forest';
  const colours = parameters.get('colours');
  const roles = ["bg","surface","text","secondary","border","accent-text","accent-soft","focus-ring"];
  const validColours = (explicit === 'light' || explicit === 'dark') && /^[a-f0-9]{6}(?:-[a-f0-9]{6}){7}$/i.test(colours || '');
  if (validColours) colours.split('-').forEach((colour,index) => document.documentElement.style.setProperty('--rook-' + roles[index], '#' + colour));
  const system = matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const appearance = explicit === 'light' || explicit === 'dark' ? explicit : system.matches ? 'dark' : 'light';
    document.documentElement.dataset.appearance = appearance;
    document.documentElement.dataset.legalTheme = theme;
    document.documentElement.style.colorScheme = appearance;
    document.querySelectorAll('[data-legal-document]').forEach(link => {
      const url = new URL(link.getAttribute('href'), location.href);
      url.searchParams.set('appearance', appearance);
      url.searchParams.set('theme', theme);
      if (validColours) url.searchParams.set('colours', colours);
      else url.searchParams.delete('colours');
      link.setAttribute('href', url.pathname + url.search);
    });
  };
  apply();
  document.addEventListener('DOMContentLoaded', apply, {once:true});
  if (explicit !== 'light' && explicit !== 'dark') system.addEventListener?.('change', apply);
})();
