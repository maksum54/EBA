/**
 * Ekspor tabel HTML ke file Excel (.xls) tanpa library tambahan.
 * Angka "Rp 1.234.567" / "Rp -5.000" diubah jadi angka asli supaya bisa dijumlah di Excel.
 * Tombol, input dan ikon di dalam tabel diabaikan.
 */
export function eksporExcel(tabel: HTMLTableElement | null, nama: string) {
  if (!tabel) return
  const t = tabel.cloneNode(true) as HTMLTableElement
  t.querySelectorAll('button, input, select, svg').forEach((e) => e.remove())
  t.querySelectorAll('td, th').forEach((c) => {
    const s = (c.textContent || '').replace(/\s+/g, ' ').trim()
    const m = s.match(/^(-?)\s*Rp\s*(-?)([\d.]+)(,\d+)?$/)
    if (m) {
      c.textContent = String(Number((m[1] || m[2] ? '-' : '') + m[3].replace(/\./g, '') + (m[4] ? '.' + m[4].slice(1) : '')))
      c.setAttribute('style', 'mso-number-format:"#,##0"')
    } else c.textContent = s
  })
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${t.outerHTML}</body></html>`
  const url = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `EBA - ${nama}`.replace(/[\\/:*?"<>|]/g, '-') + '.xls'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
