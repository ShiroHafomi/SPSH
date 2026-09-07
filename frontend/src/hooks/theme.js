export function resolveInitialTheme(savedTheme, systemPrefersDark = false) {
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return systemPrefersDark ? 'dark' : 'light';
}
