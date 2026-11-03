import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, tgl, today } from '../lib/format'
import Kop from '../components/Kop'

/**
 * Gaji Mingguan Massal — khusus pekerja harian (tipe gaji "mingguan").
 * Pilih minggu → isi hari kerja → Simpan. Total = hari × tarif + lembur.
 * Jurnal otomatis: D Beban Upah Proyek / K Bank Mandiri.
 */
type Kar = { id: number; nama: string; tarif: number }
type Pro = { id: number; nama: string; kode_eba: string | null; kode_lpse: string | null }
type Baris = { hari: number | string; tarif: number | string; lembur: number | string; proyek_id: number | null }
type Tersimpan = { id?: number; karyawan_id: number; nominal: number; hari: number | null; tarif: number | null; lembur: number | null; proyek_id: number | null; tanggal: string }

// Tanggal lokal (WIB) → "YYYY-MM-DD". Jangan pakai toISOString (UTC, bisa mundur sehari).
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
const parse = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd) }
const senin = (d: string) => { const x = parse(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x) }
const geser = (d: string, n: number) => { const x = parse(d); x.setDate(x.getDate() + n); return iso(x) }

export default function GajiMingguan() {
  const { t } = useT()
  const [mulai, setMulai] = useState(senin(today()))
  const [tglBayar, setTglBayar] = useState(today())
  const [proyekUmum, setProyekUmum] = useState<number | null>(null)
  const [kar, setKar] = useState<Kar[]>([])
  const [pro, setPro] = useState<Pro[]>([])
  const [baris, setBaris] = useState<Record<number, Baris>>({})
  const [sudah, setSudah] = useState<Record<number, Tersimpan>>({})
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const selesai = geser(mulai, 6)
  const periode = `Minggu ${tgl(mulai)} – ${tgl(selesai)}`

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

  // Tiap ganti minggu: kosongkan form & ambil yang sudah tersimpan
  useEffect(() => {
    setMsg(''); setErr('')
    supabase.from('penggajian').select('id,karyawan_id,nominal,hari,tarif,lembur,proyek_id,tanggal').eq('periode', periode)
      .then(({ data }) => {
        const sv: Record<number, Tersimpan> = Object.fromEntries(((data as Tersimpan[]) || []).map((r) => [r.karyawan_id, r]))
        const b: Record<number, Baris> = {}
        for (const k of kar) {
          const x = sv[k.id]
          b[k.id] = x
            ? { hari: x.hari ?? '', tarif: x.tarif ?? k.tarif, lembur: x.lembur || '', proyek_id: x.proyek_id }
            : { hari: '', tarif: k.tarif, lembur: '', proyek_id: proyekUmum }
        }
        setSudah(sv); setBaris(b)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kar, periode])

  const nominal = (b?: Baris) => (b ? Number(b.hari || 0) * Number(b.tarif || 0) + Number(b.lembur || 0) : 0)
  const set = (id: number, k: keyof Baris, v: string | number | null) => setBaris((x) => ({ ...x, [id]: { ...x[id], [k]: v } }))
  const semua = (patch: Partial<Baris>) => setBaris((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, { ...v, ...patch }])))

  const baru = useMemo(() => kar.filter((k) => !sudah[k.id] && nominal(baris[k.id]) > 0), [kar, baris, sudah])
  const totalBaru = baru.reduce((a, k) => a + nominal(baris[k.id]), 0)
  // Baris tersimpan yang angkanya diubah
  const beda = (k: Kar) => {
    const s = sudah[k.id], b = baris[k.id]
    if (!s || !b) return false
    return Number(b.hari || 0) !== Number(s.hari || 0) || Number(b.tarif || 0) !== Number(s.tarif || 0)
      || Number(b.lembur || 0) !== Number(s.lembur || 0) || (b.proyek_id ?? null) !== (s.proyek_id ?? null)
  }
  const berubah = kar.filter(beda)
  const hapusGaji = async (k: Kar) => {
    const s = sudah[k.id]
    if (!s?.id || !confirm(t('yakin_hapus'))) return
    const { error } = await supabase.from('penggajian').delete().eq('id', s.id)
    if (error) { setErr(error.message); return }
    setSudah((x) => { const y = { ...x }; delete y[k.id]; return y })
    setBaris((x) => ({ ...x, [k.id]: { hari: '', tarif: k.tarif, lembur: '', proyek_id: proyekUmum } }))
  }

  const simpan = async () => {
    if (!baru.length && !berubah.length) return
    setBusy(true); setErr(''); setMsg('')
    // 1) perbarui baris yang diubah
    for (const k of berubah) {
      const b = baris[k.id], s = sudah[k.id]
      const upd = { hari: Number(b.hari || 0), tarif: Number(b.tarif || 0), lembur: Number(b.lembur || 0), proyek_id: b.proyek_id, nominal: nominal(b) }
      const { error } = await supabase.from('penggajian').update(upd).eq('id', s.id!)
      if (error) { setErr(error.message); setBusy(false); return }
      setSudah((x) => ({ ...x, [k.id]: { ...s, ...upd } }))
    }
    if (!baru.length) { setBusy(false); setMsg(`${berubah.length} ${t('gm_diperbarui')}`); return }
    const rows = baru.map((k) => {
      const b = baris[k.id]
      return { tanggal: tglBayar, periode, karyawan_id: k.id, proyek_id: b.proyek_id, nominal: nominal(b),
        hari: Number(b.hari || 0), tarif: Number(b.tarif || 0), lembur: Number(b.lembur || 0) }
    })
    const { data: ins, error } = await supabase.from('penggajian').insert(rows).select('id,karyawan_id')
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMsg(`${rows.length} ${t('gm_tersimpan')} · ${rp(totalBaru)}`)
    const ids = Object.fromEntries(((ins as { id: number; karyawan_id: number }[]) || []).map((r) => [r.karyawan_id, r.id]))
    setSudah((s) => ({ ...s, ...Object.fromEntries(rows.map((r) => [r.karyawan_id, { ...r, id: ids[r.karyawan_id] }])) }))
  }

  // Data rekap (untuk tampilan & cetak): yang sudah tersimpan
  const rekap = kar.filter((k) => sudah[k.id]).map((k) => ({ ...sudah[k.id], nama: k.nama }))
  const totalRekap = rekap.reduce((a, r) => a + Number(r.nominal), 0)
  const hariRekap = rekap.reduce((a, r) => a + Number(r.hari || 0), 0)
  const proyekRekap = [...new Set(rekap.map((r) => r.proyek_id))].map((id) => {
    const p = pro.find((x) => x.id === id); return p ? `${p.kode_eba || p.kode_lpse} · ${p.nama}` : t('kantor_singkat')
  }).join('; ')

  return (
    <div className="space-y-4">
      {/* ===================== TAMPILAN LAYAR ===================== */}
      <div className="no-print space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">{t('gaji_mingguan')}</h1>
          {rekap.length > 0 && <button className="btn-ghost" onClick={() => window.print()}>🖨 {t('cetak')}</button>}
        </div>

        {/* Pilih minggu: tombol ‹ › */}
        <div className="card flex flex-wrap items-end gap-4">
          <div>
            <div className="mb-1 text-xs text-gray-500">{t('gm_minggu')}</div>
            <div className="flex items-center gap-1">
              <button className="btn-ghost px-2" onClick={() => setMulai(geser(mulai, -7))} aria-label="minggu sebelumnya">‹</button>
              <div className="min-w-[13rem] text-center font-semibold">{tgl(mulai)} – {tgl(selesai)}</div>
              <button className="btn-ghost px-2" onClick={() => setMulai(geser(mulai, 7))} aria-label="minggu berikutnya">›</button>
            </div>
          </div>
          <label className="text-sm"><div className="mb-1 text-xs text-gray-500">{t('gm_tgl_bayar')}</div>
            <input type="date" className="input" value={tglBayar} onChange={(e) => setTglBayar(e.target.value)} />
          </label>
          <label className="min-w-[14rem] flex-1 text-sm"><div className="mb-1 text-xs text-gray-500">{t('proyek_id')}</div>
            <select className="input" value={proyekUmum ?? ''} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; setProyekUmum(v); semua({ proyek_id: v }) }}>
              <option value="">{t('kantor')}</option>
              {pro.map((p) => <option key={p.id} value={p.id}>{(p.kode_eba || p.kode_lpse) + ' · ' + p.nama}</option>)}
            </select>
          </label>
        </div>

        {err && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err}</div>}
        {msg && <div className="rounded-md bg-green-50 p-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">✓ {msg}</div>}

        <div className="card overflow-x-auto p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2 text-sm dark:border-gray-700">
            <span className="text-gray-500">{t('gm_isi_semua')}:</span>
            {[5, 6, 7].map((h) => <button key={h} className="btn-ghost py-1" onClick={() => semua({ hari: h })}>{h} {t('gm_hari')}</button>)}
            <button className="btn-ghost py-1" onClick={() => semua({ hari: '' })}>{t('gm_kosongkan')}</button>
          </div>
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/60"><tr>
              <th className="th w-8">#</th><th className="th">{t('nama')}</th>
              <th className="th text-center">{t('gm_hari_kerja')}</th><th className="th text-right">{t('gm_tarif_hari')}</th>
              <th className="th text-right">{t('gm_lembur')}</th><th className="th">{t('proyek_id')}</th>
              <th className="th text-right">{t('total')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {kar.length === 0 && <tr><td className="td text-gray-500" colSpan={7}>{t('gm_tidak_ada')}</td></tr>}
              {kar.map((k, i) => {
                const s = sudah[k.id]
                const b = baris[k.id]
                if (!b) return null
                return (
                  <tr key={k.id}>
                    <td className="td text-gray-500">{i + 1}</td>
                    <td className="td font-medium">{k.nama}
                      {s && !beda(k) && <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-300">✓ {t('gm_dibayar')}</span>}
                      {beda(k) && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">✎ {t('gm_diubah')}</span>}
                    </td>
                    <td className="td text-center"><input type="number" min={0} max={7} step={0.5} placeholder="0" className="input mx-auto w-16 text-center" value={b.hari} onChange={(e) => set(k.id, 'hari', e.target.value)} /></td>
                    <td className="td"><input type="number" className="input ml-auto w-28 text-right" value={b.tarif} onChange={(e) => set(k.id, 'tarif', e.target.value)} /></td>
                    <td className="td"><input type="number" placeholder="0" className="input ml-auto w-28 text-right" value={b.lembur} onChange={(e) => set(k.id, 'lembur', e.target.value)} /></td>
                    <td className="td">
                      <select className="input w-36" value={b.proyek_id ?? ''} onChange={(e) => set(k.id, 'proyek_id', e.target.value ? Number(e.target.value) : null)}>
                        <option value="">{t('kantor_singkat')}</option>
                        {pro.map((p) => <option key={p.id} value={p.id}>{p.kode_eba || p.kode_lpse}</option>)}
                      </select>
                    </td>
                    <td className="td whitespace-nowrap text-right font-semibold tabular-nums">{nominal(b) ? rp(nominal(b)) : '-'}
                      {s && <button className="ml-2 text-gray-400 hover:text-red-600" title={t('hapus')} onClick={() => hapusGaji(k)}>✕</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Ringkasan + simpan */}
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-6 text-sm">
            <div><div className="text-xs text-gray-500">{t('gm_dibayar')}</div><div className="font-semibold tabular-nums">{rekap.length} {t('gm_orang')} · {rp(totalRekap)}</div></div>
            {berubah.length > 0 && <div><div className="text-xs text-gray-500">{t('gm_diubah')}</div><div className="font-semibold tabular-nums text-amber-600">{berubah.length} {t('gm_orang')}</div></div>}
            {baru.length > 0 && <div><div className="text-xs text-gray-500">{t('gm_akan_disimpan')}</div><div className="font-semibold tabular-nums text-eba-600">{baru.length} {t('gm_orang')} · {rp(totalBaru)}</div></div>}
          </div>
          <button className="btn-primary px-5 py-2" disabled={busy || (!baru.length && !berubah.length)} onClick={simpan}>{t('simpan')}</button>
        </div>
      </div>

      {/* ===================== CETAK / PDF ===================== */}
      <div className="print-only text-[11pt] text-black">
        <Kop judul={t('gm_judul')} sub={periode} />
        <table className="mb-3 text-sm">
          <tbody>
            <tr><td className="pr-3">{t('proyek_id')}</td><td className="pr-1">:</td><td>{proyekRekap || '-'}</td></tr>
            <tr><td className="pr-3">{t('gm_tgl_bayar')}</td><td className="pr-1">:</td><td>{rekap[0] ? tgl(rekap[0].tanggal) : '-'}</td></tr>
          </tbody>
        </table>
        <table className="w-full border-collapse text-sm [&_td]:border [&_td]:border-black [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-black [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1.5">
          <thead><tr>
            <th className="w-8">No</th><th className="text-left">{t('nama')}</th><th>{t('gm_hari_kerja')}</th>
            <th className="text-right">{t('gm_tarif_hari')}</th><th className="text-right">{t('gm_lembur')}</th>
            <th className="text-right">{t('total')}</th><th className="w-28">{t('gm_ttd')}</th>
          </tr></thead>
          <tbody>
            {rekap.map((r, i) => (
              <tr key={r.karyawan_id}>
                <td className="text-center">{i + 1}</td><td>{r.nama}</td>
                <td className="text-center">{r.hari ?? '-'}</td>
                <td className="text-right">{r.tarif ? rp(r.tarif) : '-'}</td>
                <td className="text-right">{r.lembur ? rp(r.lembur) : '-'}</td>
                <td className="text-right">{rp(r.nominal)}</td>
                <td className="h-9 align-top text-[8pt] text-gray-500">{i + 1}.</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td colSpan={2} className="text-right">{t('total')}</td>
              <td className="text-center">{hariRekap}</td><td /><td />
              <td className="text-right">{rp(totalRekap)}</td><td />
            </tr>
          </tbody>
        </table>

        <div className="mt-10 grid grid-cols-2 text-center text-sm" style={{ breakInside: 'avoid' }}>
          <div>{t('gm_dibuat')}<div className="mt-20">( ............................................ )</div><div>{t('gm_admin')}</div></div>
          <div>{t('gm_disetujui')}<div className="mt-20">( ............................................ )</div><div>{t('gm_direktur')}</div></div>
        </div>
      </div>
    </div>
  )
}
