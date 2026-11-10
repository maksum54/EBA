/**
 * Supabase hanya mengirim maksimal 1.000 baris per permintaan.
 * semua() mengambil halaman demi halaman sampai habis, supaya saldo dan
 * laporan tidak diam-diam kurang saat data sudah lebih dari 1.000 baris.
 *
 * Pakai: const { data, error } = await semua<Baris>(() => supabase.from('x').select('*').order('id'))
 * Query HARUS punya urutan (order) yang tetap agar halaman tidak tumpang tindih.
 */
const HAL = 1000
type Hasil = { data: unknown[] | null; error: { message: string } | null }
type Q = { range: (a: number, b: number) => PromiseLike<Hasil> }

export async function semua<T>(buat: () => unknown): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let dari = 0; ; dari += HAL) {
    const { data, error } = await (buat() as Q).range(dari, dari + HAL - 1)
    if (error) return { data: out, error }
    out.push(...((data as T[]) || []))
    if (!data || data.length < HAL) return { data: out, error: null }
  }
}

/** Urutan tetap untuk view buku besar (tidak punya kolom id sendiri). */
export const urutBB = <B extends { order: (k: string) => B }>(q: B): B =>
  q.order('tanggal').order('jurnal_id').order('akun_kode').order('debit').order('kredit')
