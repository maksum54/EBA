import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Search, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { rp } from '../lib/format'

/* =====================================================================
 * Komponen tampilan bersama: toast, dialog konfirmasi, angka berjalan,
 * badge status, skeleton, sparkline, garis progres, dan cari cepat (Ctrl+K).
 * ===================================================================== */

// ---------- Toast (notifikasi kecil pojok kanan bawah) ----------
type Toast = { id: number; teks: string; jenis: 'ok' | 'gagal' }
let pasangToast: ((t: Toast) => void) | null = null
export function toast(teks: string, jenis: 'ok' | 'gagal' = 'ok') {
  pasangToast?.({ id: Date.now() + Math.random(), teks, jenis })
}

// ---------- Dialog konfirmasi (pengganti confirm() bawaan browser) ----------
type Tanya = { teks: string; jawab: (ya: boolean) => void }
let pasangTanya: ((t: Tanya) => void) | null = null
export function konfirmasi(teks: string): Promise<boolean> {
  return new Promise((jawab) => (pasangTanya ? pasangTanya({ teks, jawab }) : jawab(window.confirm(teks))))
}

/** Pasang sekali di Layout: menampilkan toast dan dialog konfirmasi. */
export function UIHost() {
  const [daftar, setDaftar] = useState<Toast[]>([])
  const [tanya, setTanya] = useState<Tanya | null>(null)
  useEffect(() => {
    pasangToast = (t) => {
      setDaftar((d) => [...d, t])
      setTimeout(() => setDaftar((d) => d.filter((x) => x.id !== t.id)), 3500)
    }
    pasangTanya = setTanya
    return () => { pasangToast = null; pasangTanya = null }
  }, [])
  const tutup = (ya: boolean) => { tanya?.jawab(ya); setTanya(null) }
  useEffect(() => {
    if (!tanya) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') tutup(false); if (e.key === 'Enter') tutup(true) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  return (
    <div className="no-print">
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {daftar.map((t) => (
          <div key={t.id} className={`flex max-w-sm animate-masuk items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${t.jenis === 'ok'
            ? 'border-green-200 bg-white text-green-800 dark:border-green-900 dark:bg-gray-900 dark:text-green-300'
            : 'border-red-200 bg-white text-red-700 dark:border-red-900 dark:bg-gray-900 dark:text-red-300'}`}>
            {t.jenis === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{t.teks}</span>
          </div>
        ))}
      </div>
      {tanya && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => tutup(false)}>
          <div className="w-full max-w-sm animate-masuk rounded-xl bg-white p-5 shadow-2xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-eba-600 dark:bg-red-950"><AlertTriangle className="h-5 w-5" /></div>
              <div>
                <div className="font-semibold">Konfirmasi</div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{tanya.teks}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => tutup(false)}>Batal</button>
              <button className="btn-primary" autoFocus onClick={() => tutup(true)}>Ya, lanjutkan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Angka berjalan (count-up) ----------
export function Angka({ nilai, format = rp }: { nilai: number; format?: (v: number) => string }) {
  const [v, setV] = useState(0)
  const dari = useRef(0)
  useEffect(() => {
    const awal = dari.current, mulai = performance.now(), lama = 900
    let raf = 0
    const jalan = (now: number) => {
      const p = Math.min(1, (now - mulai) / lama), e = 1 - Math.pow(1 - p, 3)  // ease-out
      setV(awal + (nilai - awal) * e)
      if (p < 1) raf = requestAnimationFrame(jalan); else dari.current = nilai
    }
    raf = requestAnimationFrame(jalan)
    return () => cancelAnimationFrame(raf)
  }, [nilai])
  return <>{format(Math.round(v))}</>
}

// ---------- Badge status proyek ----------
const WARNA_STATUS: Record<string, string> = {
  tender: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  berjalan: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  selesai: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  batal: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}
export function Badge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${WARNA_STATUS[status] || WARNA_STATUS.batal}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{label}
    </span>
  )
}

// ---------- Skeleton loading (baris abu berkilau) ----------
export function SkeletonBaris({ kolom, baris = 6 }: { kolom: number; baris?: number }) {
  return (
    <>
      {Array.from({ length: baris }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: kolom }).map((_, j) => (
            <td key={j} className="td"><div className="skeleton h-4" style={{ width: `${50 + ((i * 7 + j * 13) % 45)}%` }} /></td>
          ))}
        </tr>
      ))}
    </>
  )
}
export function SkeletonKartu({ n = 4 }: { n?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => <div key={i} className="card"><div className="skeleton h-3 w-24" /><div className="skeleton mt-3 h-6 w-36" /></div>)}
    </div>
  )
}

// ---------- Sparkline (grafik garis mini) ----------
export function Sparkline({ data, warna = 'currentColor' }: { data: number[]; warna?: string }) {
  if (data.length < 2) return null
  const w = 100, h = 28, min = Math.min(...data), max = Math.max(...data), r = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / r) * (h - 4)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-7 w-full">
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={warna} opacity="0.08" stroke="none" />
      <polyline points={pts} fill="none" stroke={warna} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="sparkline" />
    </svg>
  )
}

// ---------- Garis progres tipis di atas saat pindah halaman ----------
export function ProgresRute() {
  const loc = useLocation()
  const [k, setK] = useState(0)
  useEffect(() => { setK((x) => x + 1) }, [loc.pathname])
  return <div key={k} className="no-print pointer-events-none fixed left-0 top-0 z-[80] h-0.5 animate-progres bg-eba-600" />
}

// ---------- Cari cepat (Ctrl+K) ----------
type Hasil = { jenis: string; label: string; sub?: string; ke: string }
export function CariCepat() {
  const [buka, setBuka] = useState(false)
  const [q, setQ] = useState('')
  const [data, setData] = useState<Hasil[]>([])
  const [aktif, setAktif] = useState(0)
  const nav = useNavigate()

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuka((b) => !b) }
      if (e.key === 'Escape') setBuka(false)
    }
    const b = () => setBuka(true)
    window.addEventListener('keydown', k); window.addEventListener('buka-cari', b)
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('buka-cari', b) }
  }, [])

  // Muat daftar sekali saat pertama dibuka
  useEffect(() => {
    if (!buka || data.length) return
    Promise.all([
      supabase.from('proyek').select('id,kode_eba,kode_lpse,nama'),
      supabase.from('karyawan').select('id,nama'),
      supabase.from('supplier').select('id,nama'),
      supabase.from('klien').select('id,nama'),
    ]).then(([p, k, s, kl]) => {
      type R = { id: number; nama: string; kode_eba?: string; kode_lpse?: string }
      const d = (x: { data: unknown }) => (x.data as R[]) || []
      setData([
        ...d(p).map((x) => ({ jenis: 'Proyek', label: x.nama, sub: x.kode_eba || x.kode_lpse || '', ke: `/proyek/${x.id}` })),
        ...d(k).map((x) => ({ jenis: 'Karyawan', label: x.nama, ke: '/karyawan' })),
        ...d(s).map((x) => ({ jenis: 'Supplier', label: x.nama, ke: '/supplier' })),
        ...d(kl).map((x) => ({ jenis: 'Klien', label: x.nama, ke: '/klien' })),
      ])
    })
  }, [buka, data.length])

  const kata = q.toLowerCase().split(/\s+/).filter(Boolean)
  const hasil = (kata.length ? data.filter((h) => kata.every((w) => (h.label + ' ' + (h.sub || '') + ' ' + h.jenis).toLowerCase().includes(w))) : data).slice(0, 12)
  const pilih = (h?: Hasil) => { if (!h) return; nav(h.ke); setBuka(false); setQ('') }

  if (!buka) return null
  return (
    <div className="no-print fixed inset-0 z-[75] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setBuka(false)}>
      <div className="w-full max-w-xl animate-masuk overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 dark:border-gray-700">
          <Search className="h-4 w-4 text-gray-400" />
          <input autoFocus className="w-full bg-transparent py-3 text-sm outline-none" placeholder="Cari proyek, karyawan, supplier, klien…"
            value={q} onChange={(e) => { setQ(e.target.value); setAktif(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setAktif((a) => Math.min(a + 1, hasil.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setAktif((a) => Math.max(a - 1, 0)) }
              if (e.key === 'Enter') pilih(hasil[aktif])
            }} />
          <kbd className="rounded border border-gray-300 px-1.5 text-[10px] text-gray-500 dark:border-gray-600">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {!data.length ? <div className="px-4 py-3 text-sm text-gray-500">Memuat…</div>
            : !hasil.length ? <div className="px-4 py-3 text-sm text-gray-500">Tidak ditemukan.</div>
            : hasil.map((h, i) => (
              <button key={h.jenis + h.ke + h.label} onMouseEnter={() => setAktif(i)} onClick={() => pilih(h)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === aktif ? 'bg-eba-50 dark:bg-eba-900/30' : ''}`}>
                <span className="w-16 shrink-0 text-[11px] font-medium uppercase text-gray-400">{h.jenis}</span>
                <span className="min-w-0 flex-1 truncate">{h.sub && <b className="mr-1 text-eba-600">{h.sub}</b>}{h.label}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}

// ---------- Urut kolom tabel (▲ naik / ▼ turun; klik lagi = urutan awal) ----------
export function useUrut<T>(nilai: Record<string, (r: T) => number | string>) {
  const [urut, setUrut] = useState<{ k: string; d: 1 | -1 } | null>(null)
  const urutkan = (xs: T[]): T[] => {
    if (!urut || !nilai[urut.k]) return xs
    const f = nilai[urut.k]
    return [...xs].sort((a, b) => {
      const x = f(a), y = f(b)
      if (x === '' && y !== '') return 1      // yang kosong selalu di bawah
      if (y === '' && x !== '') return -1
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'id', { numeric: true })) * urut.d
    })
  }
  const panah = (k: string) => {
    const aktif = urut?.k === k
    const klik = (d: 1 | -1) => setUrut(aktif && urut?.d === d ? null : { k, d })
    const c = (d: 1 | -1) => aktif && urut?.d === d ? 'text-eba-600' : 'text-gray-300 hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-300'
    return (
      <span className="no-print ml-1 inline-flex flex-col align-middle text-[9px] leading-[9px]">
        <button type="button" onClick={() => klik(1)} className={c(1)} title="Urut naik">▲</button>
        <button type="button" onClick={() => klik(-1)} className={c(-1)} title="Urut turun">▼</button>
      </span>
    )
  }
  return { urutkan, panah }
}
