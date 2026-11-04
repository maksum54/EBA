import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, tgl, today } from '../lib/format'
import { KATEGORI_BELI } from '../lib/options'
import FotoNota, { thumb } from '../components/FotoNota'
import { MoneyInput, QtyInput } from '../components/NumInput'

/**
 * Pembelian: satu nota = header + banyak barang (volume × harga satuan).
 * Total dihitung otomatis; pembayaran ke supplier bisa dicicil.
 * Jurnal (beban/utang, utang/bank) dibuat otomatis di database.
 */
type Nota = {
  id: number; tanggal: string; no_nota: string | null; kategori: string; proyek_id: number | null
  supplier_id: number | null; uraian: string | null; jatuh_tempo: string | null; foto: string[]
  jumlah: number; dibayar: number; sisa: number; status: 'belum' | 'dicicil' | 'lunas'; lewat_tempo: boolean
}
type Item = { id?: number; nama: string; volume: number | string; satuan: string; harga_satuan: number | string }
type Bayar = { id: number; tanggal: string; jumlah: number; catatan: string | null }
type Ref = { id: number; nama: string; kode_eba?: string | null; kode_lpse?: string | null }

const itemKosong = (): Item => ({ nama: '', volume: 1, satuan: 'unit', harga_satuan: 0 })
const subtotal = (i: Item) => Math.round(Number(i.volume || 0) * Number(i.harga_satuan || 0) * 100) / 100

export default function Pembelian() {
  const { t, lang } = useT()
  const [rows, setRows] = useState<Nota[]>([])
  const [proyek, setProyek] = useState<Ref[]>([])
  const [supplier, setSupplier] = useState<Ref[]>([])
  const [form, setForm] = useState<(Partial<Nota> & { bayar_awal?: number | string }) | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [bayarNota, setBayarNota] = useState<Nota | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // Filter daftar nota
  const [fStatus, setFStatus] = useState('')
  const [fProyek, setFProyek] = useState('')
  const [fKat, setFKat] = useState('')
  const [cari, setCari] = useState('')

  const load = useCallback(async () => {
    const [n, p, s] = await Promise.all([
      supabase.from('v_pembelian').select('*').order('tanggal', { ascending: false }).order('id', { ascending: false }),
      supabase.from('proyek').select('id,nama,kode_eba,kode_lpse').order('id', { ascending: false }),
      supabase.from('supplier').select('id,nama').order('nama'),
    ])
    if (n.error) setErr(n.error.message)
    setRows((n.data as Nota[]) || [])
    setProyek((p.data as Ref[]) || [])
    setSupplier((s.data as Ref[]) || [])
  }, [])
  useEffect(() => { load() }, [load])

  const namaProyek = (id: number | null) => {
    if (!id) return t('kantor').replace(/—/g, '').trim()
    const p = proyek.find((x) => x.id === id)
    return p ? p.kode_eba || p.kode_lpse || p.nama : '#' + id
  }
  const namaSupplier = (id: number | null) => supplier.find((x) => x.id === id)?.nama || '-'

  const baru = () => {
    setErr('')
    setForm({ tanggal: today(), kategori: 'Material', proyek_id: null, supplier_id: null, foto: [], bayar_awal: 0 })
    setItems([itemKosong()])
  }
  const ubah = async (n: Nota) => {
    setErr('')
    const { data } = await supabase.from('pembelian_item').select('*').eq('pembelian_id', n.id).order('id')
    setForm({ ...n })
    setItems((data as Item[])?.length ? (data as Item[]) : [itemKosong()])
  }

  const total = items.reduce((a, i) => a + subtotal(i), 0)
  const setItem = (idx: number, k: keyof Item, v: string) => setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, [k]: v } : x)))

  const simpan = async () => {
    if (!form) return
    const valid = items.filter((i) => i.nama.trim())
    if (!valid.length) { setErr(t('minimal_item')); return }
    setBusy(true); setErr('')
    const header = {
      tanggal: form.tanggal, no_nota: form.no_nota || null, kategori: form.kategori,
      proyek_id: form.proyek_id ? Number(form.proyek_id) : null,
      supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      uraian: form.uraian || valid.map((i) => i.nama).join(', ').slice(0, 200),
      jatuh_tempo: form.jatuh_tempo || null, foto: form.foto || [],
    }
    let id = form.id
    if (id) {
      const { error } = await supabase.from('pembelian').update(header).eq('id', id)
      if (error) { setErr(error.message); setBusy(false); return }
      await supabase.from('pembelian_item').delete().eq('pembelian_id', id)
    } else {
      const { data, error } = await supabase.from('pembelian').insert({ ...header, jumlah: 0, status_bayar: 'utang' }).select('id').single()
      if (error) { setErr(error.message); setBusy(false); return }
      id = data.id as number
    }
    const { error: e2 } = await supabase.from('pembelian_item').insert(valid.map((i) => ({
      pembelian_id: id, nama: i.nama.trim(), volume: Number(i.volume || 0), satuan: i.satuan || 'unit', harga_satuan: Number(i.harga_satuan || 0),
    })))
    if (e2) { setErr(e2.message); setBusy(false); return }
    const awal = Math.min(Number(form.bayar_awal || 0), total)
    if (!form.id && awal > 0) {
      await supabase.from('pembayaran_supplier').insert({ pembelian_id: id, tanggal: form.tanggal, jumlah: awal, catatan: awal >= total ? 'Lunas' : 'DP' })
    }
    setBusy(false); setForm(null); load()
  }

  const hapus = async (id: number) => {
    if (!confirm(t('yakin_hapus'))) return
    const { error } = await supabase.from('pembelian').delete().eq('id', id)
    if (error) setErr(error.message)
    load()
  }

  const badge = (n: Nota) => {
    const c = n.status === 'lunas' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
      : n.status === 'dicicil' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
    return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${c}`}>{t('st_' + n.status)}</span>
  }

  const tampil = rows.filter((n) => {
    if (fStatus && n.status !== fStatus) return false
    if (fProyek === 'kantor' && n.proyek_id) return false
    if (fProyek && fProyek !== 'kantor' && n.proyek_id !== Number(fProyek)) return false
    if (fKat && n.kategori !== fKat) return false
    const q = cari.trim().toLowerCase()
    return !q || [n.no_nota, n.uraian, namaSupplier(n.supplier_id), namaProyek(n.proyek_id)].some((x) => String(x ?? '').toLowerCase().includes(q))
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t('pembelian')}</h1>
        <button className="btn-primary" onClick={baru}>+ {t('tambah')}</button>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{t('hint_pembelian')}</p>
      {err && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err}</div>}

      {form && (
        <div className="card space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <L k="tanggal"><input type="date" className="input" value={form.tanggal || ''} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} /></L>
            <L k="no_nota"><input className="input" value={form.no_nota || ''} onChange={(e) => setForm({ ...form, no_nota: e.target.value })} /></L>
            <L k="kategori">
              <select className="input" value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })}>
                {KATEGORI_BELI.map((o) => <option key={o.v} value={o.v}>{o[lang]}</option>)}
              </select>
            </L>
            <L k="proyek_id">
              <select className="input" value={form.proyek_id ?? ''} onChange={(e) => setForm({ ...form, proyek_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('kantor')}</option>
                {proyek.map((p) => <option key={p.id} value={p.id}>{(p.kode_eba || p.kode_lpse) + ' · ' + p.nama}</option>)}
              </select>
            </L>
            <L k="supplier_id">
              <select className="input" value={form.supplier_id ?? ''} onChange={(e) => setForm({ ...form, supplier_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('pilih')}</option>
                {supplier.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
              </select>
            </L>
            <L k="jatuh_tempo"><input type="date" className="input" value={form.jatuh_tempo || ''} onChange={(e) => setForm({ ...form, jatuh_tempo: e.target.value })} /></L>
          </div>

          {/* Rincian barang */}
          <div>
            <div className="mb-2 text-sm font-semibold">{t('item')}</div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 rounded-md border border-gray-100 p-2 dark:border-gray-800 sm:border-0 sm:p-0">
                  <input className="input col-span-12 sm:col-span-4" placeholder={t('nama_barang')} value={it.nama} onChange={(e) => setItem(idx, 'nama', e.target.value)} />
                  <QtyInput className="input col-span-3 sm:col-span-1" placeholder={t('volume')} value={it.volume} onChange={(v) => setItem(idx, 'volume', String(v))} />
                  <input className="input col-span-3 sm:col-span-2" placeholder={t('satuan')} value={it.satuan} onChange={(e) => setItem(idx, 'satuan', e.target.value)} />
                  <MoneyInput className="input col-span-6 sm:col-span-2 text-right" placeholder={t('harga_satuan')} value={it.harga_satuan} onChange={(v) => setItem(idx, 'harga_satuan', String(v))} />
                  <div className="col-span-10 self-center text-right text-sm tabular-nums sm:col-span-2">{rp(subtotal(it))}</div>
                  <button type="button" className="col-span-2 text-gray-400 hover:text-red-600 sm:col-span-1" onClick={() => setItems((xs) => xs.length > 1 ? xs.filter((_, i) => i !== idx) : [itemKosong()])} aria-label="hapus">✕</button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button type="button" className="btn-ghost" onClick={() => setItems((xs) => [...xs, itemKosong()])}>{t('tambah_item')}</button>
              <div className="text-base font-bold tabular-nums">{t('total')}: {rp(total)}</div>
            </div>
          </div>

          {!form.id && (
            <div className="grid gap-3 sm:grid-cols-2">
              <L k="bayar_awal">
                <div className="flex gap-2">
                  <MoneyInput className="input text-right" value={form.bayar_awal} onChange={(v) => setForm({ ...form, bayar_awal: v })} />
                  <button type="button" className="btn-ghost" onClick={() => setForm({ ...form, bayar_awal: total })}>{t('isi_lunas')}</button>
                </div>
                <span className="mt-0.5 block text-xs text-gray-500">{t('hint_bayar_awal')}</span>
              </L>
            </div>
          )}

          <L k="foto"><FotoNota value={form.foto || []} onChange={(v) => setForm({ ...form, foto: v })} /></L>

          <div className="flex gap-2">
            <button className="btn-primary" onClick={simpan} disabled={busy}>{t('simpan')}</button>
            <button className="btn-ghost" onClick={() => setForm(null)}>{t('batal')}</button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {[{ v: '', k: 'semua' }, { v: 'belum', k: 'st_belum' }, { v: 'dicicil', k: 'st_dicicil' }, { v: 'lunas', k: 'st_lunas' }].map((o) => (
          <button key={o.v} onClick={() => setFStatus(o.v)}
            className={`rounded-full border px-3 py-1 transition ${fStatus === o.v
              ? 'border-eba-600 bg-eba-600 text-white'
              : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
            {t(o.k)} <span className="opacity-70">{o.v ? rows.filter((n) => n.status === o.v).length : rows.length}</span>
          </button>
        ))}
        <select className="input w-auto" value={fProyek} onChange={(e) => setFProyek(e.target.value)}>
          <option value="">{t('semua_proyek')}</option>
          <option value="kantor">{t('kantor_singkat')}</option>
          {proyek.filter((p) => rows.some((n) => n.proyek_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.kode_eba || p.kode_lpse} · {p.nama.slice(0, 40)}</option>)}
        </select>
        <select className="input w-auto" value={fKat} onChange={(e) => setFKat(e.target.value)}>
          <option value="">{t('semua_kategori')}</option>
          {KATEGORI_BELI.map((o) => <option key={o.v} value={o.v}>{o[lang]}</option>)}
        </select>
        <input className="input ml-auto w-full max-w-xs" placeholder={'🔍 ' + t('cari_nota')} value={cari} onChange={(e) => setCari(e.target.value)} />
      </div>

      {bayarNota && <PanelBayar nota={bayarNota} onClose={() => { setBayarNota(null); load() }} />}

      {/* Daftar nota: kartu di HP, tabel di layar lebar */}
      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead><tr>
            <th className="th">{t('tanggal')}</th><th className="th">{t('no_nota')}</th><th className="th">{t('proyek_id')}</th>
            <th className="th">{t('supplier_id')}</th><th className="th">{t('uraian')}</th><th className="th text-right">{t('total')}</th>
            <th className="th text-right">{t('sisa')}</th><th className="th">{t('status')}</th><th className="th">{t('foto')}</th><th className="th" />
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {tampil.length === 0 && <tr><td className="td text-gray-500" colSpan={10}>{t('kosong')}</td></tr>}
            {tampil.map((n) => (
              <tr key={n.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="td whitespace-nowrap">{tgl(n.tanggal)}</td>
                <td className="td">{n.no_nota || '-'}</td>
                <td className="td">{namaProyek(n.proyek_id)}</td>
                <td className="td">{namaSupplier(n.supplier_id)}</td>
                <td className="td max-w-xs truncate" title={n.uraian || ''}><span className="text-xs text-gray-500">{n.kategori}</span> {n.uraian}</td>
                <td className="td whitespace-nowrap text-right tabular-nums">{rp(n.jumlah)}</td>
                <td className={`td whitespace-nowrap text-right tabular-nums ${n.lewat_tempo ? 'font-semibold text-eba-600' : ''}`} title={n.lewat_tempo ? t('lewat_tempo') : ''}>
                  {n.sisa > 0 ? rp(n.sisa) : '-'}{n.lewat_tempo && ' ⚠'}
                </td>
                <td className="td">{badge(n)}</td>
                <td className="td">
                  <div className="flex gap-1">{(n.foto || []).slice(0, 3).map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer"><img src={thumb(u)} alt="nota" className="h-8 w-8 rounded object-cover" /></a>
                  ))}</div>
                </td>
                <td className="td whitespace-nowrap text-right">
                  {n.sisa > 0 && <button className="font-medium text-eba-600 hover:underline" onClick={() => setBayarNota(n)}>{t('bayar')}</button>}
                  {n.sisa <= 0 && n.dibayar > 0 && <button className="text-gray-500 hover:underline" onClick={() => setBayarNota(n)}>{t('riwayat_bayar')}</button>}
                  <button className="ml-2 text-eba-600 hover:underline" onClick={() => ubah(n)}>{t('ubah')}</button>
                  <button className="ml-2 text-gray-500 hover:text-red-600" onClick={() => hapus(n.id)}>{t('hapus')}</button>
                </td>
              </tr>
            ))}
          </tbody>
          {tampil.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold dark:border-gray-600 dark:bg-gray-800/60">
                <td className="td" colSpan={5}>{t('total')} <span className="text-xs font-normal text-gray-500">({tampil.length} nota)</span></td>
                <td className="td whitespace-nowrap text-right tabular-nums">{rp(tampil.reduce((a, n) => a + Number(n.jumlah), 0))}</td>
                <td className="td whitespace-nowrap text-right tabular-nums text-eba-600">{rp(tampil.reduce((a, n) => a + Math.max(0, Number(n.sisa)), 0))}</td>
                <td className="td text-xs font-normal text-gray-500" colSpan={3}>{t('dibayar')}: {rp(tampil.reduce((a, n) => a + Number(n.dibayar), 0))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function L({ k, children }: { k: string; children: React.ReactNode }) {
  const { t } = useT()
  return <label className="block text-sm"><span className="mb-1 block text-gray-600 dark:text-gray-300">{t(k)}</span>{children}</label>
}

/** Panel pembayaran cicilan untuk satu nota. */
function PanelBayar({ nota, onClose }: { nota: Nota; onClose: () => void }) {
  const { t } = useT()
  const [list, setList] = useState<Bayar[]>([])
  const [tanggal, setTanggal] = useState(today())
  const [jumlah, setJumlah] = useState<number | string>(0)
  const [catatan, setCatatan] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('pembayaran_supplier').select('*').eq('pembelian_id', nota.id).order('tanggal')
    setList((data as Bayar[]) || [])
  }, [nota.id])
  useEffect(() => { load() }, [load])

  const dibayar = list.reduce((a, b) => a + Number(b.jumlah), 0)
  const sisa = Number(nota.jumlah) - dibayar

  const tambah = async () => {
    const j = Number(jumlah)
    if (!(j > 0)) return
    if (j > sisa + 0.01) { setErr(t('bayar_lebih')); return }
    setErr('')
    const { error } = await supabase.from('pembayaran_supplier').insert({ pembelian_id: nota.id, tanggal, jumlah: j, catatan: catatan || null })
    if (error) { setErr(error.message); return }
    setJumlah(0); setCatatan(''); load()
  }
  const hapus = async (id: number) => {
    if (!confirm(t('yakin_hapus'))) return
    await supabase.from('pembayaran_supplier').delete().eq('id', id); load()
  }

  return (
    <div className="card space-y-3 border-eba-500">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{t('riwayat_bayar')} · {nota.no_nota || nota.uraian}</div>
        <button className="btn-ghost" onClick={onClose}>{t('tutup')}</button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div><div className="text-xs text-gray-500">{t('total')}</div><div className="font-semibold tabular-nums">{rp(nota.jumlah)}</div></div>
        <div><div className="text-xs text-gray-500">{t('dibayar')}</div><div className="font-semibold tabular-nums">{rp(dibayar)}</div></div>
        <div><div className="text-xs text-gray-500">{t('sisa')}</div><div className={`font-semibold tabular-nums ${sisa > 0 ? 'text-eba-600' : 'text-green-700'}`}>{rp(sisa)}</div></div>
      </div>
      <table className="min-w-full text-sm">
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {list.map((b) => (
            <tr key={b.id}><td className="td">{tgl(b.tanggal)}</td><td className="td">{b.catatan}</td>
              <td className="td text-right tabular-nums">{rp(b.jumlah)}</td>
              <td className="td text-right"><button className="text-gray-500 hover:text-red-600" onClick={() => hapus(b.id)}>{t('hapus')}</button></td></tr>
          ))}
        </tbody>
      </table>
      {sisa > 0 && (
        <div className="grid gap-2 sm:grid-cols-4">
          <input type="date" className="input" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          <div className="flex gap-2">
            <MoneyInput className="input text-right" value={jumlah} onChange={(v) => setJumlah(v)} />
            <button type="button" className="btn-ghost" onClick={() => setJumlah(sisa)}>{t('isi_lunas')}</button>
          </div>
          <input className="input" placeholder={t('catatan')} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          <button className="btn-primary justify-center" onClick={tambah}>{t('catat_bayar')}</button>
        </div>
      )}
      {err && <div className="text-sm text-red-600">{err}</div>}
    </div>
  )
}
