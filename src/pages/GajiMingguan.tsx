import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, tgl, today } from '../lib/format'
import Kop from '../components/Kop'
import { cetak } from '../lib/cetak'
import { MoneyInput, QtyInput } from '../components/NumInput'

/**
 * Gaji Mingguan Massal — khusus pekerja harian (tipe gaji "mingguan").
 * Pilih minggu → isi hari kerja → Simpan. Total = hari × tarif + lembur.
 * Jurnal otomatis: D Beban Upah Proyek / K Bank Mandiri.
 */
type Kar = { id: number; nama: string; tarif: number; tarif_lembur: number }
type Pro = { id: number; nama: string; kode_eba: string | null; kode_lpse: string | null }
type Baris = { hari: number | string; tarif: number | string; jam: number | string; pulang: string; hl: number | string; tl: number | string; proyek_id: number | null }
type Tersimpan = { id?: number; karyawan_id: number; nominal: number; hari: number | null; tarif: number | null; lembur: number | null; jam_lembur?: number | null; jam_pulang?: string | null; hari_lembur?: number | null; tarif_lembur?: number | null; proyek_id: number | null; tanggal: string }

/**
 * Lembur resmi (PP 35/2021), hari kerja biasa, lembur mulai pukul 17.00.
 * tl = upah sejam (1/173 × upah sebulan; harian: upah sehari × 25 / 173).
 * Tiap hari lembur: jam ke-1 = 1,5 × upah sejam, jam ke-2 dst = 2 × upah sejam.
 * Jika "hari lembur" kosong, jam dianggap tersebar di hari kerja (maks. 1 jam pertama per hari).
 */
export function hitungLembur(jam: number, hariLembur: number, hariKerja: number, tl: number) {
  if (!(jam > 0) || !(tl > 0)) return { hariPakai: 0, jam1: 0, jam2: 0, rp: 0 }
  const hariPakai = Math.min(jam, hariLembur > 0 ? hariLembur : Math.max(1, hariKerja || 1))
  const jam1 = hariPakai            // jam pertama tiap hari lembur
  const jam2 = Math.max(0, jam - jam1)
  return { hariPakai, jam1, jam2, rp: Math.round(tl * (1.5 * jam1 + 2 * jam2)) }
}

// Lembur dihitung mulai pukul 17.00. "22:00" → 5 jam per hari.
const MULAI_LEMBUR = 17
export const jamPerHari = (pulang: string) => {
  if (!pulang) return 0
  const [h, m] = pulang.split(':').map(Number)
  let jam = h + (m || 0) / 60
  if (jam < MULAI_LEMBUR) jam += 24 // lewat tengah malam, mis. 01:00
  return Math.max(0, Math.round((jam - MULAI_LEMBUR) * 2) / 2) // dibulatkan per 30 menit
}
// Pilihan jam pulang (bukan jam sekarang): 17:30 s/d 24:00 tiap 30 menit
export const PILIHAN_PULANG = Array.from({ length: 14 }, (_, i) => {
  const t = 17.5 + i * 0.5
  return `${String(Math.floor(t)).padStart(2, '0')}:${t % 1 ? '30' : '00'}`
})
const keJam = (x: number) => { const t = MULAI_LEMBUR + x; const h = Math.floor(t) % 24; return `${String(h).padStart(2, '0')}:${t % 1 ? '30' : '00'}` }

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
  const [muatUlang, setMuatUlang] = useState(0) // naikkan untuk membuang perubahan & ambil ulang dari database

  const kosong = (k: Kar): Baris => ({ hari: '', tarif: k.tarif, jam: '', pulang: '', hl: '', tl: k.tarif_lembur || 0, proyek_id: proyekUmum })
  // Hari lembur kosong = sama dengan hari kerja. Total jam = (pulang − 17.00) × hari lembur.
  const hariL = (b: Baris) => (b.pulang ? Number(b.hl || 0) || Number(b.hari || 0) : 0)
  const jamTotal = (b: Baris) => jamPerHari(b.pulang) * hariL(b)
  const lemburDari = (b: Baris) => hitungLembur(jamTotal(b), hariL(b), Number(b.hari || 0), Number(b.tl || 0))
  const rinci = (b: Baris) => ({ hari: Number(b.hari || 0), tarif: Number(b.tarif || 0), jam_lembur: jamTotal(b),
    jam_pulang: b.pulang || null, hari_lembur: hariL(b), tarif_lembur: Number(b.tl || 0), lembur: lemburDari(b).rp })

  const selesai = geser(mulai, 6)
  const periode = `Minggu ${tgl(mulai)} – ${tgl(selesai)}`
  // Tanggal bayar otomatis = akhir minggu (atau hari ini kalau minggunya belum selesai),
  // supaya gaji yang diinput belakangan tetap masuk ke periode yang benar di laporan.
  useEffect(() => { setTglBayar(selesai < today() ? selesai : today()) }, [selesai])

  useEffect(() => {
    (async () => {
      const [k, p] = await Promise.all([
        supabase.from('karyawan').select('id,nama,tarif,tarif_lembur').eq('tipe_gaji', 'mingguan').eq('aktif', true).order('nama'),
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
    supabase.from('penggajian').select('id,karyawan_id,nominal,hari,tarif,lembur,jam_lembur,jam_pulang,hari_lembur,tarif_lembur,proyek_id,tanggal').eq('periode', periode)
      .then(({ data }) => {
        const sv: Record<number, Tersimpan> = Object.fromEntries(((data as Tersimpan[]) || []).map((r) => [r.karyawan_id, r]))
        const b: Record<number, Baris> = {}
        for (const k of kar) {
          const x = sv[k.id]
          b[k.id] = x
            ? { hari: x.hari ?? '', tarif: x.tarif ?? k.tarif, jam: x.jam_lembur || '', pulang: x.jam_pulang || (x.jam_lembur && x.hari_lembur ? keJam(Number(x.jam_lembur) / Number(x.hari_lembur)) : ''), hl: x.hari_lembur || '', tl: x.tarif_lembur || k.tarif_lembur || 0, proyek_id: x.proyek_id }
            : kosong(k)
        }
        setSudah(sv); setBaris(b)
        // tampilkan proyek yang tersimpan di pilihan atas
        const pertama = Object.values(sv)[0]
        if (pertama) setProyekUmum(pertama.proyek_id ?? null)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kar, periode, muatUlang])

  // Upah = hari × tarif harian + lembur resmi (1,5× jam pertama, 2× jam berikutnya)
  const uangLembur = (b?: Baris) => (b ? lemburDari(b).rp : 0)
  const nominal = (b?: Baris) => (b ? Number(b.hari || 0) * Number(b.tarif || 0) + uangLembur(b) : 0)
  const set = (id: number, k: keyof Baris, v: string | number | null) => setBaris((x) => ({ ...x, [id]: { ...x[id], [k]: v } }))
  const semua = (patch: Partial<Baris>) => setBaris((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, { ...v, ...patch }])))

  const baru = useMemo(() => kar.filter((k) => !sudah[k.id] && nominal(baris[k.id]) > 0), [kar, baris, sudah])
  const totalBaru = baru.reduce((a, k) => a + nominal(baris[k.id]), 0)
  // Baris tersimpan yang angkanya diubah
  const beda = (k: Kar) => {
    const s = sudah[k.id], b = baris[k.id]
    if (!s || !b) return false
    return Number(b.hari || 0) !== Number(s.hari || 0) || Number(b.tarif || 0) !== Number(s.tarif || 0)
      || jamTotal(b) !== Number(s.jam_lembur || 0) || hariL(b) !== Number(s.hari_lembur || 0)
      || Number(b.tl || 0) !== Number(s.tarif_lembur || 0) && jamTotal(b) > 0
      || (b.proyek_id ?? null) !== (s.proyek_id ?? null)
  }
  const berubah = kar.filter(beda)
  // Batalkan semua perubahan yang belum disimpan
  const batal = () => { setMuatUlang((n) => n + 1) }
  // Hapus SEMUA gaji yang sudah tersimpan di minggu ini (mis. salah minggu / salah proyek)
  const hapusSemua = async () => {
    const ids = Object.values(sudah).map((x) => x.id).filter(Boolean) as number[]
    if (!ids.length || !confirm(t('gm_konfirmasi_hapus_semua').replace('{n}', String(ids.length)))) return
    setBusy(true)
    const { error } = await supabase.from('penggajian').delete().in('id', ids)
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMsg(`${ids.length} ${t('gm_terhapus')}`)
    setMuatUlang((n) => n + 1)
  }
  const hapusGaji = async (k: Kar) => {
    const s = sudah[k.id]
    if (!s?.id || !confirm(t('yakin_hapus'))) return
    const { error } = await supabase.from('penggajian').delete().eq('id', s.id)
    if (error) { setErr(error.message); return }
    setSudah((x) => { const y = { ...x }; delete y[k.id]; return y })
    setBaris((x) => ({ ...x, [k.id]: kosong(k) }))
  }

  const simpan = async () => {
    if (!baru.length && !berubah.length) { setErr(''); setMsg(t('gm_tidak_ada_perubahan')); return }
    setBusy(true); setErr(''); setMsg('')
    // 1) perbarui baris yang diubah
    for (const k of berubah) {
      const b = baris[k.id], s = sudah[k.id]
      const upd = { ...rinci(b), proyek_id: b.proyek_id, nominal: nominal(b) }
      const { error } = await supabase.from('penggajian').update(upd).eq('id', s.id!)
      if (error) { setErr(error.message); setBusy(false); return }
      setSudah((x) => ({ ...x, [k.id]: { ...s, ...upd } }))
    }
    if (!baru.length) { setBusy(false); setMsg(`${berubah.length} ${t('gm_diperbarui')}`); return }
    const rows = baru.map((k) => {
      const b = baris[k.id]
      return { tanggal: tglBayar, periode, karyawan_id: k.id, proyek_id: b.proyek_id, nominal: nominal(b),
        ...rinci(b) }
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
          {rekap.length > 0 && <button className="btn-ghost" onClick={() => cetak(`Gaji Mingguan ${mulai} sd ${selesai}`)}>🖨 {t('cetak')}</button>}
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
            <span className="mt-0.5 block text-xs text-gray-500">{t('gm_hint_proyek')}</span>
          </label>
        </div>

        {err && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err}</div>}
        {msg && <div className="rounded-md bg-green-50 p-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">✓ {msg}</div>}

        <div className="card overflow-x-auto p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2 text-sm dark:border-gray-700">
            <span className="text-gray-500">{t('gm_isi_semua')}:</span>
            {[5, 6, 7].map((h) => <button key={h} className="btn-ghost py-1" onClick={() => semua({ hari: h })}>{h} {t('gm_hari')}</button>)}
            <button className="btn-ghost py-1" onClick={() => semua({ hari: '' })}>{t('gm_kosongkan')}</button>
            <span className="ml-3 text-gray-500">{t('gm_pulang_semua')}:</span>
            {['18:00', '19:00', '20:00', '21:00'].map((j) => <button key={j} className="btn-ghost py-1" onClick={() => semua({ pulang: j })}>{j}</button>)}
            <button className="btn-ghost py-1" onClick={() => semua({ pulang: '', hl: '' })}>{t('gm_tanpa_lembur')}</button>
          </div>
          <div className="border-b border-gray-200 bg-amber-50/60 px-4 py-1.5 text-xs text-amber-900 dark:border-gray-700 dark:bg-amber-950/30 dark:text-amber-200">ⓘ {t('gm_info_lembur')}</div>
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/60"><tr>
              <th className="th w-8">#</th><th className="th">{t('nama')}</th>
              <th className="th text-center">{t('gm_hari_kerja')}</th><th className="th text-center">{t('gm_tarif_hari')}</th>
              <th className="th text-center">{t('gm_pulang')}</th><th className="th text-center">{t('gm_hari_lembur')}</th><th className="th text-center">{t('gm_tarif_lembur')}</th>
              <th className="th">{t('proyek_id')}</th>
              <th className="th text-right">{t('total')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {kar.length === 0 && <tr><td className="td text-gray-500" colSpan={9}>{t('gm_tidak_ada')}</td></tr>}
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
                    <td className="td text-center"><QtyInput className="input mx-auto w-16 text-center" value={b.hari} onChange={(v) => set(k.id, 'hari', v)} /></td>
                    <td className="td text-center"><MoneyInput className="input mx-auto w-28 text-right" value={b.tarif} onChange={(v) => set(k.id, 'tarif', v)} /></td>
                    <td className="td text-center">
                      <div className="flex items-center justify-center gap-1">
                        <select className="input w-28 text-center" value={b.pulang} onChange={(e) => set(k.id, 'pulang', e.target.value)}>
                          <option value="">—</option>
                          {PILIHAN_PULANG.map((j) => <option key={j} value={j}>{j} ({jamPerHari(j)} j)</option>)}
                        </select>
                        {b.pulang && <button type="button" className="text-gray-400 hover:text-red-600" title={t('gm_tanpa_lembur')} onClick={() => set(k.id, 'pulang', '')}>✕</button>}
                      </div>
                      {jamPerHari(b.pulang) > 0 && <div className="mt-0.5 text-[11px] text-gray-500">{jamPerHari(b.pulang)} {t('gm_jam_per_hari')}</div>}
                    </td>
                    <td className="td text-center"><QtyInput className="input mx-auto w-16 text-center" placeholder={b.pulang ? String(Number(b.hari || 0) || 0) : '0'} value={b.hl} onChange={(v) => set(k.id, 'hl', v)} /></td>
                    <td className="td text-center"><MoneyInput className="input mx-auto w-24 text-right" value={b.tl} onChange={(v) => set(k.id, 'tl', v)} />
                      {uangLembur(b) > 0 && (() => { const l = lemburDari(b); return (
                        <div className="mt-0.5 whitespace-nowrap text-[11px] leading-tight text-gray-500 tabular-nums">
                          {l.jam1}×1,5{l.jam2 > 0 && ` + ${l.jam2}×2`} = {rp(l.rp)}
                        </div>) })()}
                    </td>
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
          <div className="flex flex-wrap gap-2">
            {rekap.length > 0 && <button className="btn-ghost text-red-600" disabled={busy} onClick={hapusSemua}>🗑 {t('gm_hapus_semua')}</button>}
            {(berubah.length > 0 || baru.length > 0) && <button className="btn-ghost" disabled={busy} onClick={batal}>↺ {t('gm_batal_ubah')}</button>}
            <button className="btn-primary px-5 py-2" disabled={busy} onClick={simpan}>{t('simpan')}</button>
          </div>
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
                <td className="text-right">{r.jam_lembur ? `${r.jam_pulang ? 's/d ' + r.jam_pulang + ', ' : ''}${r.jam_lembur} jam = ${rp(r.lembur)}` : '-'}</td>
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
