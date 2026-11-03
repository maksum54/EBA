import { useEffect, useState } from 'react'
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

      <div className="card overflow-x-auto p-0">
        <div className="border-b border-gray-200 px-4 py-3 font-semibold dark:border-gray-700">{t('pendapatan')} & {t('biaya')}</div>
        <table className="min-w-full">
          <thead><tr><th className="th">{t('tanggal')}</th><th className="th">{t('akun')}</th><th className="th">{t('keterangan')}</th>
            <th className="th text-right">{t('pendapatan')}</th><th className="th text-right">{t('biaya')}</th></tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.length === 0 && <tr><td className="td text-gray-500" colSpan={5}>{t('kosong')}</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="td whitespace-nowrap">{tgl(r.tanggal)}</td>
                <td className="td">{r.akun_kode} {r.akun_nama}</td>
                <td className="td">{r.keterangan}</td>
                <td className="td text-right tabular-nums">{r.tipe === 'pendapatan' ? rp(r.kredit - r.debit) : ''}</td>
                <td className="td text-right tabular-nums">{r.tipe === 'beban' ? rp(r.debit - r.kredit) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
