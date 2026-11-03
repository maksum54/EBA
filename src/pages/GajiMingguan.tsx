import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, tgl, today } from '../lib/format'
import Kop from '../components/Kop'

/**
 * Gaji Mingguan Massal — khusus pekerja harian (tipe gaji "mingguan").
 * Pilih minggu → isi jumlah hari kerja tiap orang → Simpan.
 * Nominal = hari × tarif harian + lembur. Tiap baris jadi 1 data penggajian
 * (jurnal otomatis: D Beban Upah Proyek / K Bank Mandiri).
 */
type Kar = { id: number; nama: string; tarif: number }
type Pro = { id: number; nama: string; kode_eba: string | null; kode_lpse: string | null }
type Baris = { hari: number | string; tarif: number | string; lembur: number | string; proyek_id: number | null }

// Senin dari minggu yang memuat tanggal d
const senin = (d: string) => {
  const x = new Date(d + 'T00:00:00')
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x.toISOString().slice(0, 10)
}
const tambahHari = (d: string, n: number) => {
  const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10)
}

export default function GajiMingguan() {
  const { t } = useT()
  const [mulai, setMulai] = useState(senin(today()))
  const [tglBayar, setTglBayar] = useState(today())
  const [proyekUmum, setProyekUmum] = useState<number | null>(null)
  const [kar, setKar] = useState<Kar[]>([])
  const [pro, setPro] = useState<Pro[]>([])
  const [baris, setBaris] = useState<Record<number, Baris>>({})
  const [sudah, setSudah] = useState<Record<number, number>>({}) // karyawan_id → nominal yg sudah tersimpan
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const selesai = tambahHari(mulai, 6)
  const periode = `Minggu ${tgl(mulai)} – ${tgl(selesai)}`

  // Muat pekerja harian aktif & proyek berjalan
  useEffect(() => {
    (async () => {
      const [k, p] = await Promise.all([
        supabase.from('karyawan').select('id,nama,tarif').eq('tipe_gaji', 'mingguan').eq('aktif', true).order('nama'),
        supabase.from('proyek').select('id,nama,kode_eba,kode_lpse').in('status', ['berjalan', 'tender']).order('id', { ascending: false }),
      ])
      setKar((k.data as Kar[]) || [])
      const ps = (p.data as Pro[]) || []
      setPro(ps)
      setProyekUmum((cur) => cur ?? ps.find((x) => x.kode_eba)?.id ?? null)
    })()
  }, [])

  // Isi ulang tabel tiap ganti minggu / daftar pekerja; cek yang sudah digaji minggu ini
  useEffect(() => {
    const b: Record<number, Baris> = {}
    for (const k of kar) b[k.id] = { hari: 0, tarif: k.tarif, lembur: 0, proyek_id: proyekUmum }
    setBaris(b)
    setMsg('')
    supabase.from('penggajian').select('karyawan_id,nominal').eq('periode', periode).then(({ data }) => {
      const s: Record<number, number> = {}
      for (const r of (data as { karyawan_id: number; nominal: number }[]) || []) s[r.karyawan_id] = (s[r.karyawan_id] || 0) + Number(r.nominal)
      setSudah(s)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kar, periode])

  const nominal = (b?: Baris) => (b ? Number(b.hari || 0) * Number(b.tarif || 0) + Number(b.lembur || 0) : 0)
  const set = (id: number, k: keyof Baris, v: string | number | null) => setBaris((x) => ({ ...x, [id]: { ...x[id], [k]: v } }))
  const semuaProyek = (id: number | null) => {
    setProyekUmum(id)
    setBaris((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, { ...v, proyek_id: id }])))
  }
  const semuaHari = (h: number) => setBaris((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, { ...v, hari: h }])))

  const isi = useMemo(() => kar.filter((k) => !sudah[k.id] && nominal(baris[k.id]) > 0), [kar, baris, sudah])
  const total = isi.reduce((a, k) => a + nominal(baris[k.id]), 0)
  const totalHari = isi.reduce((a, k) => a + Number(baris[k.id]?.hari || 0), 0)

  const simpan = async () => {
    if (!isi.length) return
    setBusy(true); setErr(''); setMsg('')
    const rows = isi.map((k) => {
      const b = baris[k.id]
      return {
        tanggal: tglBayar, periode, karyawan_id: k.id, proyek_id: b.proyek_id,
        nominal: nominal(b),
      }
    })
    const { error } = await supabase.from('penggajian').insert(rows)
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMsg(`${rows.length} ${t('gm_tersimpan')} · ${rp(total)}`)
    setSudah((s) => ({ ...s, ...Object.fromEntries(rows.map((r) => [r.karyawan_id, r.nominal])) }))
  }

  const labelPro = (p: Pro) => `${p.kode_eba || p.kode_lpse} · ${p.nama}`

  return (
    <div className="space-y-4">
      <Kop judul={t('gm_judul')} sub={periode} />
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t('gm_judul')}</h1>
        <button className="btn-ghost" onClick={() => window.print()}>{t('cetak')}</button>
      </div>
      <p className="no-print text-sm text-gray-500 dark:text-gray-400">{t('gm_hint')}</p>

      <div className="no-print card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm"><span className="mb-1 block text-gray-600 dark:text-gray-300">{t('gm_minggu')}</span>
          <input type="date" className="input" value={mulai} onChange={(e) => e.target.value && setMulai(senin(e.target.value))} />
          <span className="mt-0.5 block text-xs text-gray-500">{periode}</span>
        </label>
        <label className="block text-sm"><span className="mb-1 block text-gray-600 dark:text-gray-300">{t('gm_tgl_bayar')}</span>
          <input type="date" className="input" value={tglBayar} onChange={(e) => setTglBayar(e.target.value)} />
        </label>
        <label className="block text-sm lg:col-span-2"><span className="mb-1 block text-gray-600 dark:text-gray-300">{t('gm_proyek_semua')}</span>
          <select className="input" value={proyekUmum ?? ''} onChange={(e) => semuaProyek(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('kantor')}</option>
            {pro.map((p) => <option key={p.id} value={p.id}>{labelPro(p)}</option>)}
          </select>
        </label>
      </div>

      <div className="no-print flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500">{t('gm_isi_semua')}:</span>
        {[5, 6, 7].map((h) => <button key={h} className="btn-ghost" onClick={() => semuaHari(h)}>{h} {t('gm_hari')}</button>)}
        <button className="btn-ghost" onClick={() => semuaHari(0)}>{t('gm_kosongkan')}</button>
      </div>

      {err && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err}</div>}
      {msg && <div className="rounded-md bg-green-50 p-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">✓ {msg}</div>}

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead><tr>
            <th className="th">#</th><th className="th">{t('nama')}</th><th className="th">{t('gm_hari_kerja')}</th>
            <th className="th">{t('gm_tarif_hari')}</th><th className="th">{t('gm_lembur')}</th>
            <th className="th no-print">{t('proyek_id')}</th><th className="th text-right">{t('total')}</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {kar.length === 0 && <tr><td className="td text-gray-500" colSpan={7}>{t('gm_tidak_ada')}</td></tr>}
            {kar.map((k, i) => {
              const b = baris[k.id]
              if (!b) return null
              const done = sudah[k.id]
              return (
                <tr key={k.id} className={done ? 'bg-green-50/60 dark:bg-green-950/30' : nominal(b) === 0 ? 'print:hidden' : ''}>
                  <td className="td text-gray-500">{i + 1}</td>
                  <td className="td font-medium">{k.nama}</td>
                  {done ? (
                    <td className="td text-sm text-green-700 dark:text-green-400" colSpan={4}>✓ {t('gm_sudah')} ({rp(done)})</td>
                  ) : (
                    <>
                      <td className="td"><input type="number" min={0} max={7} step={0.5} className="input w-20" value={b.hari} onChange={(e) => set(k.id, 'hari', e.target.value)} /></td>
                      <td className="td"><input type="number" className="input w-32" value={b.tarif} onChange={(e) => set(k.id, 'tarif', e.target.value)} /></td>
                      <td className="td"><input type="number" className="input w-32" value={b.lembur} onChange={(e) => set(k.id, 'lembur', e.target.value)} /></td>
                      <td className="td no-print">
                        <select className="input min-w-[10rem]" value={b.proyek_id ?? ''} onChange={(e) => set(k.id, 'proyek_id', e.target.value ? Number(e.target.value) : null)}>
                          <option value="">{t('kantor')}</option>
                          {pro.map((p) => <option key={p.id} value={p.id}>{p.kode_eba || p.kode_lpse}</option>)}
                        </select>
                      </td>
                    </>
                  )}
                  <td className="td whitespace-nowrap text-right font-semibold tabular-nums">{done ? rp(done) : rp(nominal(b))}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-gray-600">
              <td className="td" colSpan={2}><b>{t('total')}</b> <span className="no-print text-xs text-gray-500">({t('gm_baru')}: {isi.length} {t('gm_orang')}, {totalHari} {t('gm_hari')})</span></td>
              <td className="td" colSpan={4} />
              <td className="td whitespace-nowrap text-right text-base font-bold tabular-nums">
                {rp(total + Object.values(sudah).reduce((a, v) => a + v, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="no-print flex justify-end">
        <button className="btn-primary" disabled={busy || !isi.length} onClick={simpan}>
          {t('simpan')} {isi.length > 0 && `(${isi.length} ${t('gm_orang')} · ${rp(total)})`}
        </button>
      </div>
    </div>
  )
}
