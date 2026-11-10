import { semua } from './semua'
import { supabase } from './supabase'

/**
 * Cache sederhana untuk data dropdown (proyek, karyawan, supplier, klien, kasbon).
 * Data ini jarang berubah, jadi cukup diambil sekali lalu dipakai ulang
 * di semua halaman selama 2 menit → pindah halaman jauh lebih cepat di HP.
 */
type Row = Record<string, unknown> & { id: number }
const TTL = 2 * 60 * 1000
const store = new Map<string, { at: number; p: Promise<Row[]> }>()

export function ambilRef(table: string, filter?: Record<string, unknown>): Promise<Row[]> {
  const key = table + JSON.stringify(filter || {})
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.p
  const buat = () => {
    let q = supabase.from(table).select('*').order('id', { ascending: false })
    for (const [k, v] of Object.entries(filter || {})) q = q.eq(k, v as never)
    return q
  }
  const p = semua<Row>(buat).then(({ data }) => data)
  store.set(key, { at: Date.now(), p })
  return p
}

/** Hapus cache sebuah tabel setelah datanya ditambah/diubah/dihapus. */
export function segarkan(table: string) {
  for (const k of store.keys()) if (k.startsWith(table + '{')) store.delete(k)
}
