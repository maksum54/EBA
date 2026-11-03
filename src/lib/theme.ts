// Tema terang/gelap, disimpan di localStorage. Default: terang (sesuai kop EBA).
export function getTheme(): 'light' | 'dark' {
  try { return (localStorage.getItem('eba-theme') as 'light' | 'dark') || 'light' } catch { return 'light' }
}
export function applyTheme(th: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', th === 'dark')
  try { localStorage.setItem('eba-theme', th) } catch { /* abaikan */ }
}
