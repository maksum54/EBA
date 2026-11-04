import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, tgl } from '../lib/format'
import CrudPage from '../components/CrudPage'
import Kop from '../components/Kop'
import { cetak, tglFile } from '../lib/cetak'
import { F_TERMIN, terminCalc } from './modules'

type Laba = { kode_eba: string | null; kode_lpse: string | null; nama: string; nilai_kontrak: number; pendapatan: number; biaya: number; laba: number }
type BB = { jurnal_id: number; tanggal: string; keterangan: string; akun_kode: string; akun_nama: string; tipe: string; debit: number; kredit: number }

// Detail satu proyek: ringkasan untung-rugi, termin, dan rincian biaya.
export default function ProyekDetail() {
  const { id } = useParams()
  const pid = Number(id)
  const { t } = useT()
  const [p, setP] = useState<Laba | null>(null)
  const [rows, setRows] = useState<BB[]>([])

  useEffect(() => {
    (async () => {
      const [a, b] = await Promise.all([
        supabase.from('v_proyek_laba').select('*').eq('id', pid).single(),
        supabase.from('v_buku_besar').select('*').eq('proyek_id', pid).in('tipe', ['pendapatan', 'beban']).order('tanggal'),
      ])
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
