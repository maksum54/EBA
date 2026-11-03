import { today } from './format'

/**
 * Cetak / simpan PDF dengan nama file otomatis.
 * Browser memakai document.title sebagai nama file PDF, jadi judul diganti
 * sementara saat dialog cetak terbuka, lalu dikembalikan.
 * Contoh: "EBA - Gaji Mingguan 2026-11-02 sd 2026-11-08.pdf"
 */
export function cetak(nama: string) {
  const asli = document.title
  // karakter yang tidak boleh ada di nama file Windows
  document.title = `EBA - ${nama}`.replace(/[\\/:*?"<>|]/g, '-')
  const pulih = () => { document.title = asli; window.removeEventListener('afterprint', pulih) }
  window.addEventListener('afterprint', pulih)
  window.print()
  setTimeout(pulih, 1000) // cadangan untuk browser yang tidak memicu afterprint
}

/** "2026-11-03" — tanggal cetak hari ini untuk nama file. */
export const tglFile = () => today()
