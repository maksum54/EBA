import { useUrut } from '../components/UI'
import { semua } from '../lib/semua'
import { FileSpreadsheet, Printer } from 'lucide-react'
import { eksporExcel } from '../lib/excel'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, today } from '../lib/format'
import { MoneyInput } from '../components/NumInput'
import Kop from '../components/Kop'
import { cetak, tglFile } from '../lib/cetak'

/**
 * Status pembayaran dari klien per proyek.
 * Tombol "✓ Sudah dibayar" langsung membuat Termin berstatus "diterima"
 * (jurnal Bank Mandiri ↔ Pendapatan dibuat otomatis oleh database).
 */
type P = { id: number; kode_eba: string | null; nama: string; nilai_kontrak: number; status: string; catatan: string | null; tgl_mulai: string | null }
type Tm = { proyek_id: number; nilai_dpp: number; ppn: number; nilai_bersih: number; status: string }
type Form = { pid: number; tgl: string; dpp: number; pphPct: number; nama: string }

const ambilPph = () => 0  // kebijakan EBA: PPh tidak dipotong (isi manual kalau ada bukti potong)

export default function StatusBayar() {
  const { lang } = useT()
  const id = lang === 'id'
  const [proyek, setProyek] = useState<P[]>([])
  const [termin, setTermin] = useState<Tm[]>([])
  const [fs, setFs] = useState<'' | 'belum' | 'sebagian' | 'lunas'>('')
  const [penyedia, setPenyedia] = useState<'' | 'ardana' | 'eba'>('')
  const [cari, setCari] = useState('')
  const [bln, setBln] = useState('')   // filter bulan 'YYYY-MM'
  const namaBulan = (ym: string) => ym ? new Date(ym + '-01').toLocaleDateString(id ? 'id-ID' : 'en-GB', { month: 'long', year: 'numeric' }) : (id ? 'Tanpa tanggal' : 'No date')
  const [form, setForm] = useState<Form | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('proyek').select('id,kode_eba,nama,nilai_kontrak,status,catatan,tgl_mulai').in('status', ['berjalan', 'selesai']).order('tgl_mulai', { ascending: false }),
      semua(() => supabase.from('termin').select('proyek_id,nilai_dpp,ppn,nilai_bersih,status').order('id')),
    ])
    setProyek((a.data as P[]) || [])
    setTermin((b.data as Tm[]) || [])
  }, [])
  useEffect(() => { load() }, [load])

  // Hitung per proyek: nilai kontrak (termasuk PPN) vs yang sudah diterima (DPP + PPN)
  const data = proyek.map((p) => {
    const tm = termin.filter((t) => t.proyek_id === p.id)
    const terima = tm.filter((t) => t.status === 'diterima').reduce((a, t) => a + Number(t.nilai_dpp) + Number(t.ppn), 0)
    const bersih = tm.filter((t) => t.status === 'diterima').reduce((a, t) => a + Number(t.nilai_bersih), 0)
    const kontrak = Number(p.nilai_kontrak)
    const sisa = Math.max(0, Math.round(kontrak / 1.11) - bersih)   // sisa yang belum masuk ke Mandiri (tanpa PPN)
    const st: 'belum' | 'sebagian' | 'lunas' = kontrak > 0 && kontrak - terima < 1 ? 'lunas' : terima > 0 ? 'sebagian' : 'belum'
    const ardana = (p.catatan || '').toUpperCase().includes('ARDANA')
    return { ...p, kontrak, terima, bersih, sisa, st, ardana }
  })
  const { urutkan, panah } = useUrut<(typeof data)[number]>({
    proyek: (x) => x.kode_eba || '', kontrak: (x) => x.kontrak, ppn: (x) => x.kontrak - x.kontrak / 1.11, harus: (x) => x.kontrak / 1.11,
    terima: (x) => x.bersih, sisa: (x) => x.sisa, status: (x) => ({ belum: 0, sebagian: 1, lunas: 2 })[x.st],
  })
  const tampil = urutkan(data.filter((x) =>
    (!fs || x.st === fs) &&
    (!bln || (x.tgl_mulai || '').slice(0, 7) === bln) &&
    (!penyedia || (penyedia === 'ardana' ? x.ardana : !x.ardana)) &&
    (!cari.trim() || `${x.kode_eba} ${x.nama} ${x.catatan}`.toLowerCase().includes(cari.toLowerCase()))))

  const buka = (x: (typeof data)[number]) => {
    setErr('')
    setForm({ pid: x.id, tgl: today(), dpp: x.sisa, pphPct: ambilPph(), nama: x.terima > 0 ? 'Pelunasan' : 'Pembayaran Penuh' })
  }
  const simpan = async () => {
    if (!form) return
    setBusy(true); setErr('')
    const ppn = Math.round(form.dpp * 0.11)
    const pph = Math.round(form.dpp * form.pphPct / 100)
    try { localStorage.setItem('eba-pph-pct', String(form.pphPct)) } catch { /* abaikan */ }
    const { error } = await supabase.from('termin').insert({
      proyek_id: form.pid, nama: form.nama, nilai_dpp: form.dpp, ppn, pph,
      status: 'diterima', tgl_tagih: form.tgl, tgl_terima: form.tgl,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setForm(null); load()
  }

  const chip = (st: string) => st === 'lunas'
    ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">🟢 {id ? 'Lunas' : 'Paid'}</span>
    : st === 'sebagian'
      ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">🟡 {id ? 'Sebagian' : 'Partial'}</span>
      : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">🔴 {id ? 'Belum' : 'Unpaid'}</span>

  const tombol = (aktif: boolean) => `rounded-full border px-3 py-1 transition ${aktif
    ? 'border-eba-600 bg-eba-600 text-white'
    : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'}`
  const tot = (k: 'kontrak' | 'terima' | 'sisa') => tampil.reduce((a, x) => a + x[k], 0)
  const labelSt = { '': id ? 'Semua' : 'All', belum: id ? 'Belum dibayar' : 'Unpaid', sebagian: id ? 'Sebagian' : 'Partial', lunas: id ? 'Lunas' : 'Paid' }

  return (
    <div className="space-y-4">
      <Kop judul={id ? 'Status Pembayaran Proyek' : 'Project Payment Status'} sub={`${labelSt[fs]}${bln ? ' · ' + namaBulan(bln) : ''}${penyedia ? ' · ' + (penyedia === 'ardana' ? 'PT Ardana' : 'PT EBA') : ''} · ${tglFile()}`} />
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{id ? 'Status Pembayaran Proyek' : 'Project Payment Status'}</h1>
        <button className="btn-ghost" onClick={() => eksporExcel(document.querySelector<HTMLTableElement>('main table'), `Status Pembayaran ${tglFile()}`)}><FileSpreadsheet className="h-4 w-4 text-green-700" /> Excel</button>
        <button className="btn-ghost" onClick={() => cetak(`Status Pembayaran ${labelSt[fs]} ${tglFile()}`)}><Printer className="h-4 w-4" /> {id ? 'Cetak' : 'Print'}</button>
      </div>
      <p className="no-print text-sm text-gray-500">
        {id ? 'Klik "✓ Sudah dibayar" kalau klien sudah transfer. Aplikasi langsung membuat Termin "diterima" dan mencatat uang masuk ke Bank Mandiri.'
          : 'Click "✓ Paid" when the client has paid. A received invoice is created and recorded to Bank Mandiri.'}
      </p>

      <div className="no-print flex flex-wrap items-center gap-2 text-sm">
        {(['', 'belum', 'sebagian', 'lunas'] as const).map((k) => (
          <button key={k} className={tombol(fs === k)} onClick={() => setFs(k)}>
            {labelSt[k]} <span className="opacity-70">{k ? data.filter((x) => x.st === k).length : data.length}</span>
          </button>
        ))}
        <select className="input w-auto" value={penyedia} onChange={(e) => setPenyedia(e.target.value as '' | 'ardana' | 'eba')}>
          <option value="">{id ? 'Penyedia: Semua' : 'Vendor: All'}</option>
          <option value="ardana">PT Ardana</option>
          <option value="eba">PT EBA</option>
        </select>
        <select className={`input w-auto ${bln ? 'border-eba-500' : ''}`} value={bln} onChange={(e) => setBln(e.target.value)}>
          <option value="">{id ? 'Bulan: Semua' : 'Month: All'}</option>
          {[...new Set(data.map((x) => (x.tgl_mulai || '').slice(0, 7)))].sort().reverse().map((m) => (
            <option key={m} value={m}>{namaBulan(m)} ({data.filter((x) => (x.tgl_mulai || '').slice(0, 7) === m).length})</option>
          ))}
        </select>
        <input className="input ml-auto w-full max-w-xs" placeholder={'🔍 ' + (id ? 'Cari nama / kode / nomor PO' : 'Search')} value={cari} onChange={(e) => setCari(e.target.value)} />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full">
          <thead><tr>
            <th className="th">{id ? 'Proyek' : 'Project'}{panah('proyek')}</th>
            <th className="th text-right">{id ? 'Nilai Kontrak' : 'Contract'}{panah('kontrak')}</th>
            <th className="th text-right">PPN 11%{panah('ppn')}<div className="text-[10px] font-normal normal-case">{id ? 'dipotong LEMIGAS' : 'withheld'}</div></th>
            <th className="th text-right">{id ? 'Harus Diterima' : 'Net due'}{panah('harus')}<div className="text-[10px] font-normal normal-case">{id ? 'kontrak − PPN' : 'contract − VAT'}</div></th>
            <th className="th text-right">{id ? 'Sudah Diterima' : 'Received'}{panah('terima')}</th>
            <th className="th text-right">{id ? 'Sisa' : 'Outstanding'}{panah('sisa')}</th>
            <th className="th">Status{panah('status')}</th><th className="th no-print" />
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {tampil.length === 0 && <tr><td className="td text-gray-500" colSpan={8}>{id ? 'Tidak ada data.' : 'No data.'}</td></tr>}
            {tampil.map((x, i) => (
              <Fragment key={x.id}>
                {(i === 0 || (tampil[i - 1].tgl_mulai || '').slice(0, 7) !== (x.tgl_mulai || '').slice(0, 7)) && (() => {
                  const m = (x.tgl_mulai || '').slice(0, 7)
                  const grp = tampil.filter((y) => (y.tgl_mulai || '').slice(0, 7) === m)
                  return (
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <td className="td py-1.5 text-sm font-semibold">📅 {namaBulan(m)} <span className="font-normal text-gray-500">({grp.length})</span></td>
                      <td className="td py-1.5 text-right text-xs tabular-nums text-gray-600">{rp(grp.reduce((a, y) => a + y.kontrak, 0))}</td>
                      <td className="td py-1.5" /><td className="td py-1.5" />
                      <td className="td py-1.5 text-right text-xs tabular-nums text-gray-600">{rp(grp.reduce((a, y) => a + y.bersih, 0))}</td>
                      <td className="td py-1.5 text-right text-xs font-semibold tabular-nums text-gray-600">{rp(grp.reduce((a, y) => a + y.sisa, 0))}</td>
                      <td className="td py-1.5" colSpan={2} />
                    </tr>
                  )
                })()}
                <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="td">
                    <Link to={`/proyek/${x.id}`} className="font-medium text-eba-600 hover:underline">{x.kode_eba || '#' + x.id}</Link>
                    {x.ardana && <span className="ml-2 rounded bg-gray-100 px-1.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-400">ARDANA</span>}
                    <div className="text-xs text-gray-500">{x.nama}</div>
                    {x.tgl_mulai && <div className="text-[11px] text-gray-400">{new Date(x.tgl_mulai).toLocaleDateString(id ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
                  </td>
                  <td className="td whitespace-nowrap text-right tabular-nums">{rp(x.kontrak)}</td>
                  <td className="td whitespace-nowrap text-right tabular-nums text-gray-500">{rp(x.kontrak - Math.round(x.kontrak / 1.11))}</td>
                  <td className="td whitespace-nowrap text-right tabular-nums">{rp(Math.round(x.kontrak / 1.11))}</td>
                  <td className="td whitespace-nowrap text-right tabular-nums">{rp(x.bersih)}</td>
                  <td className={`td whitespace-nowrap text-right tabular-nums ${x.sisa > 0 ? 'font-semibold' : 'text-gray-400'}`}>{rp(x.sisa)}</td>
                  <td className="td whitespace-nowrap">{chip(x.st)}</td>
                  <td className="td no-print whitespace-nowrap text-right">
                    {x.st !== 'lunas' && (
                      <button className="rounded-md border border-green-600 px-2.5 py-1 text-sm text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/30" onClick={() => buka(x)}>
                        ✓ {id ? 'Sudah dibayar' : 'Paid'}
                      </button>
                    )}
                  </td>
                </tr>
                {form?.pid === x.id && (() => {
                  const ppn = Math.round(form.dpp * 0.11), pph = Math.round(form.dpp * form.pphPct / 100)
                  return (
                    <tr className="no-print bg-green-50/60 dark:bg-green-900/10">
                      <td className="td" colSpan={8}>
                        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                          <label>{id ? 'Keterangan' : 'Label'}<input className="input" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></label>
                          <label>{id ? 'Tanggal diterima' : 'Date received'}<input type="date" className="input" value={form.tgl} onChange={(e) => setForm({ ...form, tgl: e.target.value })} /></label>
                          <label>DPP ({id ? 'sebelum PPN' : 'excl. VAT'})<MoneyInput className="input text-right" value={form.dpp} onChange={(v) => setForm({ ...form, dpp: Number(v) || 0 })} /></label>
                          <label>PPh %<input type="number" step="0.01" min="0" className="input text-right" value={form.pphPct} onChange={(e) => setForm({ ...form, pphPct: Number(e.target.value) || 0 })} /></label>
                          <div className="text-xs leading-5 text-gray-600 dark:text-gray-300">
                            PPN 11%: <b>{rp(ppn)}</b> ({id ? 'dipungut klien' : 'collected by client'})<br />
                            PPh: <b>{rp(pph)}</b><br />
                            {id ? 'Masuk Bank Mandiri' : 'To Bank Mandiri'}: <b className="text-green-700 dark:text-green-400">{rp(form.dpp - pph)}</b>
                          </div>
                        </div>
                        {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
                        <div className="mt-3 flex gap-2">
                          <button className="btn-primary" disabled={busy || form.dpp <= 0} onClick={simpan}>{busy ? '…' : (id ? 'Simpan sebagai Diterima' : 'Save as received')}</button>
                          <button className="btn-ghost" onClick={() => setForm(null)}>{id ? 'Batal' : 'Cancel'}</button>
                        </div>
                      </td>
                    </tr>
                  )
                })()}
              </Fragment>
            ))}
          </tbody>
          {tampil.length > 0 && (
            <tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold dark:border-gray-600 dark:bg-gray-800/60">
              <td className="td">TOTAL <span className="text-xs font-normal text-gray-500">({tampil.length})</span></td>
              <td className="td whitespace-nowrap text-right tabular-nums">{rp(tot('kontrak'))}</td>
              <td className="td whitespace-nowrap text-right tabular-nums text-gray-500">{rp(tampil.reduce((a, x) => a + x.kontrak - Math.round(x.kontrak / 1.11), 0))}</td>
              <td className="td whitespace-nowrap text-right tabular-nums">{rp(tampil.reduce((a, x) => a + Math.round(x.kontrak / 1.11), 0))}</td>
              <td className="td whitespace-nowrap text-right tabular-nums">{rp(tampil.reduce((a, x) => a + x.bersih, 0))}</td>
              <td className="td whitespace-nowrap text-right tabular-nums">{rp(tot('sisa'))}</td>
              <td className="td" colSpan={2} />
            </tr></tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
