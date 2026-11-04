import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, tgl } from '../lib/format'
import CrudPage from '../components/CrudPage'
import Kop from '../components/Kop'
import { cetak, tglFile } from '../lib/cetak'
import { F_TERMIN, terminCalc } from './modules'
import { MoneyInput } from '../components/NumInput'

type Laba = { kode_eba: string | null; kode_lpse: string | null; nama: string; nilai_kontrak: number; pendapatan: number; biaya: number; laba: number }
type BB = { jurnal_id: number; tanggal: string; keterangan: string; akun_kode: string; akun_nama: string; tipe: string; debit: number; kredit: number }

// Kategori biaya proyek yang bisa diberi anggaran
const AKUN_RAB: [string, string, string][] = [
  ['5100', 'Material', 'Materials'], ['5200', 'Upah Tukang', 'Labour'],
  ['5300', 'Lapangan (Kasbon)', 'Site (Advances)'], ['5400', 'Lainnya', 'Other'],
]

// Detail satu proyek: ringkasan untung-rugi, termin, dan rincian biaya.
export default function ProyekDetail() {
  const { id } = useParams()
  const pid = Number(id)
  const { t, lang } = useT()
  const [rab, setRab] = useState<Record<string, number>>({})
  const [rabMsg, setRabMsg] = useState('')
  const [p, setP] = useState<Laba | null>(null)
  const [rows, setRows] = useState<BB[]>([])

  useEffect(() => {
    (async () => {
      const [a, b, c] = await Promise.all([
        supabase.from('v_proyek_laba').select('*').eq('id', pid).single(),
        supabase.from('v_buku_besar').select('*').eq('proyek_id', pid).in('tipe', ['pendapatan', 'beban']).order('tanggal'),
        supabase.from('rab_proyek').select('akun_kode,nilai').eq('proyek_id', pid),
      ])
      setRab(Object.fromEntries(((c.data as { akun_kode: string; nilai: number }[]) || []).map((r) => [r.akun_kode, Number(r.nilai)])))
      setP(a.data as Laba)
      setRows((b.data as BB[]) || [])
    })()
  }, [pid])

  const [tutup, setTutup] = useState<Record<string, boolean>>({})
  // Kelompokkan per akun: pendapatan dulu, lalu biaya dari yang terbesar
  const grup = useMemo(() => {
    const m = new Map<string, { kode: string; nama: string; tipe: string; total: number; rows: BB[] }>()
    for (const r of rows) {
      const g = m.get(r.akun_kode) || { kode: r.akun_kode, nama: r.akun_nama, tipe: r.tipe, total: 0, rows: [] }
      g.total += r.tipe === 'pendapatan' ? r.kredit - r.debit : r.debit - r.kredit
      g.rows.push(r); m.set(r.akun_kode, g)
    }
    return [...m.values()].sort((a, b) => (a.tipe === b.tipe ? b.total - a.total : a.tipe === 'pendapatan' ? -1 : 1))
  }, [rows])

  // Realisasi biaya per akun (untuk dibandingkan dengan RAB)
  const real = (kode: string) => grup.find((g) => g.kode === kode)?.total || 0
  const simpanRab = async () => {
    setRabMsg('')
    const data = AKUN_RAB.map(([kode]) => ({ proyek_id: pid, akun_kode: kode, nilai: rab[kode] || 0 }))
    const { error } = await supabase.from('rab_proyek').upsert(data, { onConflict: 'proyek_id,akun_kode' })
    setRabMsg(error ? error.message : '✓ ' + (lang === 'id' ? 'RAB tersimpan' : 'Budget saved'))
  }

  if (!p) return <div className="text-gray-500">{t('memuat')}</div>

  return (
    <div className="space-y-6">
      <Kop judul={`${t('laba_proyek')}`} sub={`${p.kode_eba || ''} ${p.kode_lpse ? '· LPSE ' + p.kode_lpse : ''} — ${p.nama}`} />
      <div className="no-print flex items-center justify-between">
        <Link to="/proyek" className="text-sm text-gray-500 hover:underline">{t('kembali')}</Link>
        <button className="btn-ghost" onClick={() => cetak(`Laporan Proyek ${p.kode_eba || p.kode_lpse || ''} ${tglFile()}`)}>{t('cetak')}</button>
      </div>
      <div className="no-print">
        <h1 className="text-xl font-bold">{p.kode_eba || p.kode_lpse} — {p.nama}</h1>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {([['nilai_kontrak', p.nilai_kontrak], ['pendapatan', p.pendapatan], ['biaya', p.biaya], ['laba', p.laba]] as [string, number][]).map(([k, v]) => (
          <div key={k} className="card">
            <div className="text-xs uppercase text-gray-500">{t(k)}</div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${k === 'laba' && v < 0 ? 'text-eba-600' : ''}`}>{rp(v)}</div>
          </div>
        ))}
      </div>

      {/* Anggaran (RAB) vs realisasi */}
      {(() => {
        const tRab = AKUN_RAB.reduce((a, [k]) => a + (rab[k] || 0), 0)
        const tReal = AKUN_RAB.reduce((a, [k]) => a + real(k), 0)
        const bar = (r: number, b: number) => {
          if (!b) return null
          const pct = (r / b) * 100
          const c = pct > 100 ? 'bg-red-600' : pct >= 90 ? 'bg-amber-500' : 'bg-green-600'
          return (
            <div className="flex items-center gap-2">
              <div className="h-2 w-full min-w-16 overflow-hidden rounded bg-gray-200 dark:bg-gray-700"><div className={`h-full ${c}`} style={{ width: Math.min(100, pct) + '%' }} /></div>
              <span className={`w-12 text-right text-xs tabular-nums ${pct > 100 ? 'font-bold text-red-600' : ''}`}>{pct.toFixed(0)}%</span>
            </div>
          )
        }
        return (
          <div className="card overflow-x-auto p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <span className="font-semibold">{lang === 'id' ? 'Anggaran (RAB) vs Realisasi' : 'Budget vs Actual'}</span>
              <div className="no-print flex items-center gap-2 text-sm">
                {rabMsg && <span className="text-xs text-gray-500">{rabMsg}</span>}
                <button className="btn-primary" onClick={simpanRab}>{t('simpan')}</button>
              </div>
            </div>
            <table className="min-w-full">
              <thead><tr>
                <th className="th">{lang === 'id' ? 'Kategori' : 'Category'}</th><th className="th text-right">RAB</th>
                <th className="th text-right">{lang === 'id' ? 'Realisasi' : 'Actual'}</th><th className="th text-right">{lang === 'id' ? 'Sisa' : 'Remaining'}</th><th className="th w-40" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {AKUN_RAB.map(([k, id, en]) => {
                  const b = rab[k] || 0, r = real(k)
                  return (
                    <tr key={k}>
                      <td className="td">{lang === 'id' ? id : en}</td>
                      <td className="td w-44"><MoneyInput className="input text-right" value={b} onChange={(v) => setRab((x) => ({ ...x, [k]: Number(v) || 0 }))} /></td>
                      <td className="td text-right tabular-nums">{rp(r)}</td>
                      <td className={`td text-right tabular-nums ${b && b - r < 0 ? 'font-semibold text-red-600' : ''}`}>{b ? rp(b - r) : '-'}</td>
                      <td className="td">{bar(r, b)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold dark:border-gray-600 dark:bg-gray-800/60">
                <td className="td">{t('total')}</td><td className="td text-right tabular-nums">{rp(tRab)}</td>
                <td className="td text-right tabular-nums">{rp(tReal)}</td>
                <td className={`td text-right tabular-nums ${tRab && tRab - tReal < 0 ? 'text-red-600' : ''}`}>{tRab ? rp(tRab - tReal) : '-'}</td>
                <td className="td">{bar(tReal, tRab)}</td>
              </tr></tfoot>
            </table>
            {tRab > 0 && p.nilai_kontrak > 0 && (
              <div className="px-4 py-2 text-xs text-gray-500">
                {lang === 'id' ? 'Perkiraan laba sesuai RAB' : 'Planned profit'}: <b>{rp(p.nilai_kontrak / 1.11 - tRab)}</b> ({lang === 'id' ? 'nilai kontrak sebelum PPN − RAB' : 'contract excl. VAT − budget'})
              </div>
            )}
          </div>
        )
      })()}

      <div className="no-print">
        <CrudPage table="termin" title={t('termin')} hint={t('hint_termin')} fields={F_TERMIN} fixed={{ proyek_id: pid }} onFormChange={terminCalc} />
      </div>

      {/* Rincian per kategori (akun), dengan subtotal */}
      <div className="card overflow-x-auto p-0">
        <div className="border-b border-gray-200 px-4 py-3 font-semibold dark:border-gray-700">{t('pendapatan')} & {t('biaya')} — {t('per_kategori')}</div>
        {grup.length === 0 && <div className="td text-gray-500">{t('kosong')}</div>}
        <table className="min-w-full">
          <tbody>
            {grup.map((g) => (
              <Fragment key={g.kode}>
                <tr className="cursor-pointer select-none bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/60 dark:hover:bg-gray-800"
                  onClick={() => setTutup((x) => ({ ...x, [g.kode]: !x[g.kode] }))}>
                  <td className="td font-semibold" colSpan={2}>
                    <span className="mr-1 inline-block w-3 text-gray-400">{tutup[g.kode] ? '▸' : '▾'}</span>
                    {g.nama} <span className="ml-1 text-xs font-normal text-gray-500">({g.rows.length})</span>
                  </td>
                  <td className={`td text-right font-semibold tabular-nums ${g.tipe === 'pendapatan' ? 'text-green-700 dark:text-green-400' : ''}`}>{rp(g.total)}</td>
                </tr>
                {!tutup[g.kode] && g.rows.map((r, i) => (
                  <tr key={g.kode + i} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="td w-28 whitespace-nowrap pl-9 text-gray-500">{tgl(r.tanggal)}</td>
                    <td className="td">{r.keterangan}</td>
                    <td className="td whitespace-nowrap text-right tabular-nums">{rp(r.tipe === 'pendapatan' ? r.kredit - r.debit : r.debit - r.kredit)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {grup.length > 0 && (
              <tr className="border-t-2 border-gray-300 dark:border-gray-600">
                <td className="td font-bold" colSpan={2}>{t('laba')}</td>
                <td className={`td text-right text-base font-bold tabular-nums ${p.laba < 0 ? 'text-eba-600' : 'text-green-700 dark:text-green-400'}`}>{rp(p.laba)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
