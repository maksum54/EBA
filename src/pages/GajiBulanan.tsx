import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, tgl, today } from '../lib/format'
import Kop from '../components/Kop'
import { cetak } from '../lib/cetak'
import { MoneyInput, QtyInput } from '../components/NumInput'
import { hitungLembur, jamPerHari, PILIHAN_PULANG } from './GajiMingguan'

/**
 * Gaji Bulanan — karyawan bertipe gaji "bulanan" (supervisor, MEP, admin, ...).
 * Total = gaji pokok + tunjangan + lembur − potongan.
 * Lembur resmi: upah sejam = gaji pokok ÷ 173; jam ke-1 tiap hari 1,5×, berikutnya 2×.
 * Jurnal otomatis: D Beban Upah Proyek (proyek) / Beban Gaji Kantor (kantor) — K Bank Mandiri.
 */
type Kar = { id: number; nama: string; jabatan: string | null; tarif: number; tarif_lembur: number }
type Pro = { id: number; nama: string; kode_eba: string | null; kode_lpse: string | null }
type Baris = { pokok: number | string; tunj: number | string; pulang: string; hl: number | string; tl: number | string; pot: number | string; ket: string; proyek_id: number | null }
type Tersimpan = { id?: number; karyawan_id: number; nominal: number; tarif: number | null; tunjangan: number | null; potongan: number | null
  lembur: number | null; jam_lembur: number | null; jam_pulang: string | null; hari_lembur: number | null; tarif_lembur: number | null
  keterangan: string | null; proyek_id: number | null; tanggal: string }

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const ymSekarang = () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } }

export default function GajiBulanan() {
  const { t } = useT()
  const [ym, setYm] = useState(ymSekarang())
  const [tglBayar, setTglBayar] = useState(today())
  const [proyekUmum, setProyekUmum] = useState<number | null>(null)
  const [kar, setKar] = useState<Kar[]>([])
  const [pro, setPro] = useState<Pro[]>([])
  const [baris, setBaris] = useState<Record<number, Baris>>({})
  const [sudah, setSudah] = useState<Record<number, Tersimpan>>({})
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [muatUlang, setMuatUlang] = useState(0)

  const periode = `Bulan ${BULAN[ym.m]} ${ym.y}`
  const geserBulan = (n: number) => setYm(({ y, m }) => { const x = new Date(y, m + n, 1); return { y: x.getFullYear(), m: x.getMonth() } })

  const kosong = (k: Kar): Baris => ({ pokok: k.tarif, tunj: '', pulang: '', hl: '', tl: k.tarif_lembur || Math.round(k.tarif / 173), pot: '', ket: '', proyek_id: proyekUmum })
  const lemburDari = (b: Baris) => {
    const per = jamPerHari(b.pulang), hari = b.pulang ? Number(b.hl || 0) : 0
    return hitungLembur(per * hari, hari, hari, Number(b.tl || 0))
  }
  const nominal = (b?: Baris) => (b ? Number(b.pokok || 0) + Number(b.tunj || 0) + lemburDari(b).rp - Number(b.pot || 0) : 0)
  const rinci = (b: Baris) => {
    const l = lemburDari(b)
    return { tarif: Number(b.pokok || 0), tunjangan: Number(b.tunj || 0), potongan: Number(b.pot || 0), keterangan: b.ket || null,
      jam_pulang: b.pulang || null, hari_lembur: b.pulang ? Number(b.hl || 0) : 0, jam_lembur: jamPerHari(b.pulang) * (b.pulang ? Number(b.hl || 0) : 0),
      tarif_lembur: Number(b.tl || 0), lembur: l.rp, hari: null }
  }

  useEffect(() => {
    (async () => {
      const [k, p] = await Promise.all([
        supabase.from('karyawan').select('id,nama,jabatan,tarif,tarif_lembur').eq('tipe_gaji', 'bulanan').eq('aktif', true).order('nama'),
        supabase.from('proyek').select('id,nama,kode_eba,kode_lpse').in('status', ['berjalan', 'tender']).order('id', { ascending: false }),
      ])
      setKar((k.data as Kar[]) || [])
      setPro((p.data as Pro[]) || [])
    })()
  }, [])

  useEffect(() => {
    setMsg(''); setErr('')
    supabase.from('penggajian')
      .select('id,karyawan_id,nominal,tarif,tunjangan,potongan,lembur,jam_lembur,jam_pulang,hari_lembur,tarif_lembur,keterangan,proyek_id,tanggal')
      .eq('periode', periode)
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return }
        const sv: Record<number, Tersimpan> = Object.fromEntries(((data as Tersimpan[]) || []).map((r) => [r.karyawan_id, r]))
        const b: Record<number, Baris> = {}
        for (const k of kar) {
          const x = sv[k.id]
          b[k.id] = x ? {
            pokok: x.tarif ?? k.tarif, tunj: x.tunjangan || '', pulang: x.jam_pulang || '', hl: x.hari_lembur || '',
            tl: x.tarif_lembur || k.tarif_lembur || Math.round(k.tarif / 173), pot: x.potongan || '', ket: x.keterangan || '', proyek_id: x.proyek_id,
          } : kosong(k)
        }
        setSudah(sv); setBaris(b)
        const pertama = Object.values(sv)[0]
        if (pertama) setProyekUmum(pertama.proyek_id ?? null)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kar, periode, muatUlang])

  const set = (id: number, k: keyof Baris, v: string | number | null) => setBaris((x) => ({ ...x, [id]: { ...x[id], [k]: v } }))
  const semuaProyek = (v: number | null) => { setProyekUmum(v); setBaris((x) => Object.fromEntries(Object.entries(x).map(([k, b]) => [k, { ...b, proyek_id: v }]))) }

  const beda = (k: Kar) => {
    const s = sudah[k.id], b = baris[k.id]
    if (!s || !b) return false
    const r = rinci(b)
    return r.tarif !== Number(s.tarif || 0) || r.tunjangan !== Number(s.tunjangan || 0) || r.potongan !== Number(s.potongan || 0)
      || (r.jam_pulang || '') !== (s.jam_pulang || '') || r.hari_lembur !== Number(s.hari_lembur || 0)
      || r.tarif_lembur !== Number(s.tarif_lembur || 0) || (r.keterangan || '') !== (s.keterangan || '')
      || (b.proyek_id ?? null) !== (s.proyek_id ?? null)
  }
  const baru = useMemo(() => kar.filter((k) => !sudah[k.id] && nominal(baris[k.id]) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kar, baris, sudah])
  const berubah = kar.filter(beda)

  const simpan = async () => {
    if (!baru.length && !berubah.length) { setErr(''); setMsg(t('gm_tidak_ada_perubahan')); return }
    setBusy(true); setErr(''); setMsg('')
    for (const k of berubah) {
      const b = baris[k.id], s = sudah[k.id]
      const upd = { ...rinci(b), proyek_id: b.proyek_id, nominal: nominal(b) }
      const { error } = await supabase.from('penggajian').update(upd).eq('id', s.id!)
      if (error) { setErr(error.message); setBusy(false); return }
    }
    if (baru.length) {
      const rows = baru.map((k) => ({ tanggal: tglBayar, periode, karyawan_id: k.id, proyek_id: baris[k.id].proyek_id, nominal: nominal(baris[k.id]), ...rinci(baris[k.id]) }))
      const { error } = await supabase.from('penggajian').insert(rows)
      if (error) { setErr(error.message); setBusy(false); return }
    }
    setBusy(false)
    setMsg(`${baru.length + berubah.length} ${t('gm_tersimpan')}`)
    setMuatUlang((n) => n + 1)
  }

  const hapusGaji = async (k: Kar) => {
    const s = sudah[k.id]
    if (!s?.id || !confirm(t('yakin_hapus'))) return
    const { error } = await supabase.from('penggajian').delete().eq('id', s.id)
    if (error) { setErr(error.message); return }
    setMuatUlang((n) => n + 1)
  }
  const hapusSemua = async () => {
    const ids = Object.values(sudah).map((x) => x.id).filter(Boolean) as number[]
    if (!ids.length || !confirm(t('gm_konfirmasi_hapus_semua').replace('{n}', String(ids.length)))) return
    const { error } = await supabase.from('penggajian').delete().in('id', ids)
    if (error) { setErr(error.message); return }
    setMsg(`${ids.length} ${t('gm_terhapus')}`); setMuatUlang((n) => n + 1)
  }

  const rekap = kar.filter((k) => sudah[k.id]).map((k) => ({ ...sudah[k.id], nama: k.nama, jabatan: k.jabatan }))
  const totalRekap = rekap.reduce((a, r) => a + Number(r.nominal), 0)
  const totalBaru = baru.reduce((a, k) => a + nominal(baris[k.id]), 0)
  const labelPro = (id: number | null) => { const p = pro.find((x) => x.id === id); return p ? p.kode_eba || p.kode_lpse : t('kantor_singkat') }
  const bulanFile = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`

  return (
    <div className="space-y-4">
      {/* ===================== LAYAR ===================== */}
      <div className="no-print space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">{t('gaji_bulanan')}</h1>
          {rekap.length > 0 && <button className="btn-ghost" onClick={() => cetak(`Gaji Bulanan ${bulanFile}`)}>🖨 {t('cetak')}</button>}
        </div>

        <div className="card flex flex-wrap items-end gap-4">
          <div>
            <div className="mb-1 text-xs text-gray-500">{t('gb_bulan')}</div>
            <div className="flex items-center gap-1">
              <button className="btn-ghost px-2" onClick={() => geserBulan(-1)} aria-label="bulan sebelumnya">‹</button>
              <div className="min-w-[10rem] text-center font-semibold">{BULAN[ym.m]} {ym.y}</div>
              <button className="btn-ghost px-2" onClick={() => geserBulan(1)} aria-label="bulan berikutnya">›</button>
            </div>
          </div>
          <label className="text-sm"><div className="mb-1 text-xs text-gray-500">{t('gm_tgl_bayar')}</div>
            <input type="date" className="input" value={tglBayar} onChange={(e) => setTglBayar(e.target.value)} />
          </label>
          <label className="min-w-[14rem] flex-1 text-sm"><div className="mb-1 text-xs text-gray-500">{t('proyek_id')}</div>
            <select className="input" value={proyekUmum ?? ''} onChange={(e) => semuaProyek(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('kantor')}</option>
              {pro.map((p) => <option key={p.id} value={p.id}>{(p.kode_eba || p.kode_lpse) + ' · ' + p.nama}</option>)}
            </select>
            <span className="mt-0.5 block text-xs text-gray-500">{t('gm_hint_proyek')}</span>
          </label>
        </div>

        {err && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err}</div>}
        {msg && <div className="rounded-md bg-green-50 p-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">✓ {msg}</div>}

        <div className="card overflow-x-auto p-0">
          <div className="border-b border-gray-200 bg-amber-50/60 px-4 py-1.5 text-xs text-amber-900 dark:border-gray-700 dark:bg-amber-950/30 dark:text-amber-200">ⓘ {t('gb_info')}</div>
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/60"><tr>
              <th className="th w-8">#</th><th className="th">{t('nama')}</th>
              <th className="th text-center">{t('gb_pokok')}</th><th className="th text-center">{t('gb_tunjangan')}</th>
              <th className="th text-center">{t('gm_pulang')}</th><th className="th text-center">{t('gm_hari_lembur')}</th>
              <th className="th text-center">{t('gm_tarif_lembur')}</th><th className="th text-center">{t('gb_potongan')}</th>
              <th className="th">{t('proyek_id')}</th><th className="th text-right">{t('total')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {kar.length === 0 && <tr><td className="td text-gray-500" colSpan={10}>{t('gb_tidak_ada')}</td></tr>}
              {kar.map((k, i) => {
                const b = baris[k.id], s = sudah[k.id]
                if (!b) return null
                const l = lemburDari(b)
                return (
                  <tr key={k.id}>
                    <td className="td text-gray-500">{i + 1}</td>
                    <td className="td">
                      <div className="font-medium">{k.nama}
                        {s && !beda(k) && <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-300">✓ {t('gm_dibayar')}</span>}
                        {beda(k) && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">✎ {t('gm_diubah')}</span>}
                      </div>
                      <div className="text-xs text-gray-500">{k.jabatan}</div>
                    </td>
                    <td className="td text-center"><MoneyInput className="input mx-auto w-32 text-right" value={b.pokok} onChange={(v) => set(k.id, 'pokok', v)} /></td>
                    <td className="td text-center"><MoneyInput className="input mx-auto w-28 text-right" value={b.tunj} onChange={(v) => set(k.id, 'tunj', v)} /></td>
                    <td className="td text-center">
                      <select className="input mx-auto w-28 text-center" value={b.pulang} onChange={(e) => set(k.id, 'pulang', e.target.value)}>
                        <option value="">—</option>
                        {PILIHAN_PULANG.map((j) => <option key={j} value={j}>{j} ({jamPerHari(j)} j)</option>)}
                      </select>
                    </td>
                    <td className="td text-center"><QtyInput className="input mx-auto w-16 text-center" value={b.hl} onChange={(v) => set(k.id, 'hl', v)} /></td>
                    <td className="td text-center"><MoneyInput className="input mx-auto w-24 text-right" value={b.tl} onChange={(v) => set(k.id, 'tl', v)} />
                      {l.rp > 0 && <div className="mt-0.5 whitespace-nowrap text-[11px] text-gray-500 tabular-nums">{l.jam1}×1,5{l.jam2 > 0 && ` + ${l.jam2}×2`} = {rp(l.rp)}</div>}
                    </td>
                    <td className="td text-center"><MoneyInput className="input mx-auto w-28 text-right" value={b.pot} onChange={(v) => set(k.id, 'pot', v)} /></td>
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

        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-6 text-sm">
            <div><div className="text-xs text-gray-500">{t('gm_dibayar')}</div><div className="font-semibold tabular-nums">{rekap.length} {t('gm_orang')} · {rp(totalRekap)}</div></div>
            {berubah.length > 0 && <div><div className="text-xs text-gray-500">{t('gm_diubah')}</div><div className="font-semibold text-amber-600">{berubah.length} {t('gm_orang')}</div></div>}
            {baru.length > 0 && <div><div className="text-xs text-gray-500">{t('gm_akan_disimpan')}</div><div className="font-semibold tabular-nums text-eba-600">{baru.length} {t('gm_orang')} · {rp(totalBaru)}</div></div>}
          </div>
          <div className="flex flex-wrap gap-2">
            {rekap.length > 0 && <button className="btn-ghost text-red-600" disabled={busy} onClick={hapusSemua}>🗑 {t('gb_hapus_semua')}</button>}
            {(berubah.length > 0 || baru.length > 0) && <button className="btn-ghost" disabled={busy} onClick={() => setMuatUlang((n) => n + 1)}>↺ {t('gm_batal_ubah')}</button>}
            <button className="btn-primary px-5 py-2" disabled={busy} onClick={simpan}>{t('simpan')}</button>
          </div>
        </div>
      </div>

      {/* ===================== CETAK / PDF ===================== */}
      <div className="print-only text-[11pt] text-black">
        <Kop judul={t('gb_judul')} sub={`${BULAN[ym.m]} ${ym.y}`} />
        <div className="mb-3 text-sm">{t('gm_tgl_bayar')}: {rekap[0] ? tgl(rekap[0].tanggal) : '-'}</div>
        <table className="w-full border-collapse text-sm [&_td]:border [&_td]:border-black [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-black [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1.5">
          <thead><tr>
            <th className="w-8">No</th><th className="text-left">{t('nama')}</th><th className="text-left">{t('jabatan')}</th>
            <th className="text-right">{t('gb_pokok')}</th><th className="text-right">{t('gb_tunjangan')}</th>
            <th className="text-right">{t('gm_lembur')}</th><th className="text-right">{t('gb_potongan')}</th>
            <th className="text-right">{t('total')}</th><th>{t('proyek_id')}</th><th className="w-24">{t('gm_ttd')}</th>
          </tr></thead>
          <tbody>
            {rekap.map((r, i) => (
              <tr key={r.karyawan_id}>
                <td className="text-center">{i + 1}</td><td>{r.nama}</td><td>{r.jabatan}</td>
                <td className="text-right">{rp(r.tarif)}</td>
                <td className="text-right">{r.tunjangan ? rp(r.tunjangan) : '-'}</td>
                <td className="text-right">{r.lembur ? `${r.jam_lembur} jam = ${rp(r.lembur)}` : '-'}</td>
                <td className="text-right">{r.potongan ? '(' + rp(r.potongan) + ')' : '-'}</td>
                <td className="text-right font-semibold">{rp(r.nominal)}</td>
                <td className="text-center">{labelPro(r.proyek_id)}</td>
                <td className="h-9 align-top text-[8pt] text-gray-500">{i + 1}.</td>
              </tr>
            ))}
            <tr className="font-bold"><td colSpan={7} className="text-right">{t('total')}</td><td className="text-right">{rp(totalRekap)}</td><td /><td /></tr>
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
