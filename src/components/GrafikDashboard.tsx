import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp } from '../lib/format'

/**
 * Tiga grafik dashboard (hanya membaca data):
 *  1. Progres biaya vs Nilai Bersih (kontrak ÷ 1,11) per proyek berjalan
 *  2. Komposisi biaya per akun beban (donut), total atau per proyek
 *  3. Piutang LEMIGAS per umur (sisa yang belum diterima)
 */
type P = { id: number; kode_eba: string | null; nama: string; status: string; nilai_kontrak: number; pendapatan: number; biaya: number }
type Pr = { id: number; tgl_mulai: string | null; tgl_selesai: string | null }
type BB = { proyek_id: number | null; akun_kode: string; akun_nama: string; debit: number; kredit: number }

const WARNA = ['#c8102e', '#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#6b7280', '#ec4899']
const juta = (v: number) => (Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : Math.round(v).toLocaleString('id-ID'))
const uang = (v: unknown) => rp(Math.round(Number(v)))

export default function GrafikDashboard() {
  const { lang } = useT()
  const id = lang === 'id'
  const nav = useNavigate()
  const [pro, setPro] = useState<P[]>([])
  const [tglP, setTglP] = useState<Record<number, Pr>>({})
  const [beban, setBeban] = useState<BB[]>([])
  const [pilih, setPilih] = useState<number | ''>('')

  useEffect(() => {
    Promise.all([
      supabase.from('v_proyek_laba').select('id,kode_eba,nama,status,nilai_kontrak,pendapatan,biaya'),
      supabase.from('proyek').select('id,tgl_mulai,tgl_selesai'),
      supabase.from('v_buku_besar').select('proyek_id,akun_kode,akun_nama,debit,kredit').eq('tipe', 'beban'),
    ]).then(([a, b, c]) => {
      setPro((a.data as P[]) || [])
      setTglP(Object.fromEntries(((b.data as Pr[]) || []).map((x) => [x.id, x])))
      setBeban((c.data as BB[]) || [])
    })
  }, [])

  // 1. Biaya vs Nilai Bersih (proyek berjalan), paling kritis di atas
  const progres = pro.filter((p) => p.status === 'berjalan').map((p) => {
    const nb = Number(p.nilai_kontrak) / 1.11, b = Number(p.biaya)
    return { id: p.id, nama: p.kode_eba || String(p.id), judul: p.nama, nb, b, pct: nb > 0 ? (b / nb) * 100 : 0 }
  }).sort((x, y) => y.pct - x.pct)

  // 2. Komposisi biaya (tanpa beban PPh 5900)
  const kom: Record<string, number> = {}
  for (const r of beban) {
    if (pilih && r.proyek_id !== pilih) continue
    if (r.akun_kode === '5900') continue
    const k = `${r.akun_kode} ${r.akun_nama.replace(/^Beban /, '')}`
    kom[k] = (kom[k] || 0) + Number(r.debit) - Number(r.kredit)
  }
  const donut = Object.entries(kom).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const totDonut = donut.reduce((a, x) => a + x.value, 0)

  // 3. Piutang LEMIGAS per umur: sisa = kontrak ÷ 1,11 − sudah diterima; umur dari tgl selesai (atau mulai)
  const now = Date.now()
  const umur = [
    { k: id ? '< 30 hari' : '< 30 days', v: 0, n: 0, w: '#10b981' },
    { k: id ? '30–60 hari' : '30–60 days', v: 0, n: 0, w: '#f59e0b' },
    { k: id ? '> 60 hari' : '> 60 days', v: 0, n: 0, w: '#c8102e' },
  ]
  for (const p of pro.filter((x) => x.status === 'berjalan' || x.status === 'selesai')) {
    const sisa = Number(p.nilai_kontrak) / 1.11 - Number(p.pendapatan)
    if (sisa < 1) continue
    const t = tglP[p.id]; const d = t?.tgl_selesai || t?.tgl_mulai
    const hari = d ? Math.floor((now - new Date(d).getTime()) / 864e5) : 0
    const u = hari > 60 ? umur[2] : hari >= 30 ? umur[1] : umur[0]
    u.v += sisa; u.n++
  }
  const totPiutang = umur.reduce((a, x) => a + x.v, 0)

  return (
    <div className="no-print grid gap-4 lg:grid-cols-2">
      <div className="card lg:col-span-2">
        <div className="mb-1 font-semibold">{id ? 'Progres Biaya vs Nilai Bersih (proyek berjalan)' : 'Cost vs Net Value (running projects)'}</div>
        <div className="mb-2 text-xs text-gray-500">{id ? 'Nilai Bersih = kontrak ÷ 1,11. Hijau < 70%, kuning 70–90%, merah ≥ 90%. Klik bar untuk buka proyek.' : 'Net value = contract ÷ 1.11. Green < 70%, amber 70–90%, red ≥ 90%. Click a bar to open.'}</div>
        {progres.length === 0 ? <div className="text-sm text-gray-500">-</div> : (
          <ResponsiveContainer width="100%" height={Math.max(160, progres.length * 34 + 30)}>
            <BarChart data={progres} layout="vertical" margin={{ left: 10, right: 40 }}>
              <XAxis type="number" domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} tickFormatter={(v) => v + '%'} fontSize={11} />
              <YAxis type="category" dataKey="nama" width={110} fontSize={11} />
              <Tooltip formatter={(_v, _n, x) => { const d = x.payload as (typeof progres)[0]; return [`${uang(d.b)} / ${uang(d.nb)} (${d.pct.toFixed(1)}%)`, d.judul] }} />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d) => nav(`/proyek/${(d as unknown as { id: number }).id}`)}
                label={{ position: 'right', fontSize: 11, formatter: (v: number) => v.toFixed(0) + '%' }}>
                {progres.map((d) => <Cell key={d.id} fill={d.pct >= 90 ? '#c8102e' : d.pct >= 70 ? '#f59e0b' : '#10b981'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">{id ? 'Komposisi Biaya' : 'Cost Breakdown'}</div>
          <select className="input w-auto max-w-[16rem] py-1 text-sm" value={pilih} onChange={(e) => setPilih(e.target.value ? Number(e.target.value) : '')}>
            <option value="">{id ? 'Semua proyek' : 'All projects'}</option>
            {pro.map((p) => <option key={p.id} value={p.id}>{p.kode_eba} · {p.nama.slice(0, 40)}</option>)}
          </select>
        </div>
        {totDonut === 0 ? <div className="text-sm text-gray-500">-</div> : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} fontSize={11}
                label={(x: { percent?: number }) => ((x.percent || 0) * 100).toFixed(0) + '%'}>
                {donut.map((_, i) => <Cell key={i} fill={WARNA[i % WARNA.length]} />)}
              </Pie>
              <Tooltip formatter={uang} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
        <div className="text-right text-sm font-semibold tabular-nums">Total {uang(totDonut)}</div>
      </div>

      <div className="card">
        <div className="mb-1 font-semibold">{id ? 'Piutang LEMIGAS per Umur' : 'Receivables by Age'}</div>
        <div className="mb-2 text-xs text-gray-500">{id ? 'Sisa belum diterima (kontrak ÷ 1,11 − diterima), umur dihitung dari tanggal selesai proyek.' : 'Unpaid balance, aged from project end date.'}</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={umur} margin={{ top: 20 }}>
            <XAxis dataKey="k" fontSize={11} />
            <YAxis tickFormatter={juta} fontSize={11} width={50} />
            <Tooltip formatter={uang} />
            <Bar dataKey="v" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 11, formatter: juta }}>
              {umur.map((u) => <Cell key={u.k} fill={u.w} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-sm">
          {umur.map((u) => <span key={u.k} className="text-gray-600 dark:text-gray-400">{u.k}: <b>{u.n}</b> {id ? 'proyek' : 'proj.'}</span>)}
          <span className="font-semibold tabular-nums">Total {uang(totPiutang)}</span>
        </div>
      </div>
    </div>
  )
}
