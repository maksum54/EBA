/** Format angka ke Rupiah: 199467000 → "Rp 199.467.000" */
export const rp = (n: number | null | undefined) =>
  'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(n || 0))

/** Format tanggal ISO → "3 Nov 2026" */
export const tgl = (s: string | null | undefined) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'

export const today = () => new Date().toISOString().slice(0, 10)
