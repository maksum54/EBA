// Tema terang/gelap, disimpan di localStorage. Default: terang (sesuai kop EBA).
export function getTheme(): 'light' | 'dark' {
  try { return (localStorage.getItem('eba-theme') as 'light' | 'dark') || 'light' } catch { return 'light' }
}
export function applyTheme(th: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', th === 'dark')
  // Bar status & navigasi HP mengikuti tema: putih (terang) / hitam (gelap)
  const warna = th === 'dark' ? '#030712' : '#ffffff'
  let m = document.querySelector('meta[name="theme-color"]')
  if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'theme-color'); document.head.appendChild(m) }
  m.setAttribute('content', warna)
  document.documentElement.style.colorScheme = th
  try { localStorage.setItem('eba-theme', th) } catch { /* abaikan */ }
}
