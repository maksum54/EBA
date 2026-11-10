import { Component, type ReactNode } from 'react'

/**
 * Pengaman error: kalau satu halaman rusak, yang tampil pesan ini saja
 * (menu tetap bisa dipakai), bukan layar putih kosong.
 * Juga menangani "gagal memuat halaman" setelah website diperbarui.
 */
export default class Pengaman extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error) { console.error(err) }
  render() {
    const { err } = this.state
    if (!err) return this.props.children
    const versiBaru = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(err.message)
    return (
      <div className="card mx-auto mt-10 max-w-md space-y-3 text-center">
        <div className="text-lg font-semibold">{versiBaru ? 'Website baru saja diperbarui' : 'Terjadi kesalahan di halaman ini'}</div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {versiBaru ? 'Muat ulang untuk memakai versi terbaru.' : 'Data Anda aman. Coba muat ulang; kalau masih muncul, kirim pesan di bawah ini ke pengembang.'}
        </p>
        {!versiBaru && <pre className="overflow-x-auto rounded bg-gray-100 p-2 text-left text-xs text-red-700 dark:bg-gray-800 dark:text-red-300">{err.message}</pre>}
        <button className="btn-primary mx-auto" onClick={() => window.location.reload()}>Muat ulang</button>
      </div>
    )
  }
}
