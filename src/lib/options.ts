// Pilihan dropdown status (nilai disimpan di DB, label ditampilkan).
export type Opt = { v: string; id: string; en: string }

export const STATUS_PROYEK: Opt[] = [
  { v: 'tender', id: 'Tender', en: 'Tender' },
  { v: 'berjalan', id: 'Berjalan', en: 'Running' },
  { v: 'selesai', id: 'Selesai', en: 'Completed' },
  { v: 'batal', id: 'Batal / Kalah', en: 'Cancelled / Lost' },
]
export const STATUS_TERMIN: Opt[] = [
  { v: 'rencana', id: 'Rencana', en: 'Planned' },
  { v: 'ditagih', id: 'Sudah Ditagih', en: 'Billed' },
  { v: 'diterima', id: 'Diterima', en: 'Received' },
]
export const STATUS_BAYAR: Opt[] = [
  { v: 'lunas', id: 'Lunas', en: 'Paid' },
  { v: 'utang', id: 'Utang', en: 'Payable' },
]
export const STATUS_KASBON: Opt[] = [
  { v: 'terbuka', id: 'Terbuka', en: 'Open' },
  { v: 'selesai', id: 'Selesai', en: 'Settled' },
]
export const TIPE_GAJI: Opt[] = [
  { v: 'mingguan', id: 'Mingguan', en: 'Weekly' },
  { v: 'bulanan', id: 'Bulanan', en: 'Monthly' },
]
