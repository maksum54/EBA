import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp } from '../lib/format'
import { STATUS_PROYEK } from '../lib/options'

type Laba = { id: number; kode_eba: string | null; kode_lpse: string | null; nama: string; status: string;
  nilai_kontrak: number; pendapatan: number; biaya: number; laba: number }
type BB = { akun_kode: string; debit: number; kredit: number }

export default function Dashboard() {
  const { t, lang } = useT()
  const [laba, setLaba] = useState<Laba[]>([])
  const [saldo, setSaldo] = useState({ bank: 0, utang: 0, kasbon: 0, piutang: 0 })
  const [telat, setTelat] = useState(0)
  // Filter status proyek (disimpan supaya tetap saat halaman dibuka lagi)
  const [fs, setFs] = useState<string>(() => { try { return localStorage.getItem('eba-filter-proyek') || '' } catch { return '' } })
  const pilihFs = (v: string) => { setFs(v); try { localStorage.setItem('eba-filter-proyek', v) } catch { /* abaikan */ } }

  // Utang supplier yang sudah lewat jatuh tempo (merah di dashboard)
  useEffect(() => {
    supabase.from('v_pembelian').select('sisa').eq('lewat_tempo', true)
      .then(({ data }) => setTelat(((data as { sisa: number }[]) || []).reduce((a, r) => a + Number(r.sisa), 0)))
  }, [])

  useEffect(() => {
    (async () => {
      const [l, bb, tm] = await Promise.all([
        supabase.from('v_proyek_laba').select('*').order('id', { ascending: false }),
        supabase.from('v_buku_besar').select('akun_kode,debit,kredit').in('akun_kode', ['1100', '1300', '2100']),
        supabase.from('termin').select('nilai_bersih,status').neq('status', 'diterima'),
      ])
      setLaba((l.data as Laba[]) || [])
      const s = (kode: string, sign: 1 | -1) => ((bb.data as BB[]) || [])
        .filter((r) => r.akun_kode === kode).reduce((a, r) => a + sign * (Number(r.debit) - Number(r.kredit)), 0)
      setSaldo({
        bank: s('1100', 1), kasbon: s('1300', 1), utang: s('2100', -1),
        piutang: ((tm.data as { nilai_bersih: number }[]) || []).reduce((a, r) => a + Number(r.nilai_bersih), 0),
      })
    })()
  }, [])

  const tiles: [string, number, string][] = [
    ['saldo_bank', saldo.bank, 'text-gray-900 dark:text-gray-100'],
    ['piutang_termin', saldo.piutang, 'text-blue-700 dark:text-blue-300'],
    ['utang_supplier', saldo.utang, 'text-amber-700 dark:text-amber-300'],
    ['kasbon_terbuka', saldo.kasbon, saldo.kasbon > 0 ? 'text-eba-600' : 'text-gray-900 dark:text-gray-100'],
  ]

  const tampil = fs ? laba.filter((p) => p.status === fs) : laba

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('dashboard')}</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([k, v, c]) => (
          <div key={k} className="card">
            <div className="text-xs font-medium uppercase text-gray-500">{t(k)}</div>
            <div className={`mt-1 text-xl font-bold tabular-nums ${c}`}>{rp(v)}</div>
          </div>
        ))}
      </div>
      {telat > 0 && (
        <Link to="/pembelian" className="block rounded-lg border border-eba-500 bg-eba-50 p-3 text-sm text-eba-700 dark:bg-eba-900/30 dark:text-eba-100">
          ⚠ {t('utang_lewat_tempo')}: <b className="tabular-nums">{rp(telat)}</b>
        </Link>
      )}

      <div className="card overflow-x-auto p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <span className="font-semibold">{t('laba_proyek')}</span>
          <div className="flex flex-wrap gap-1 text-sm">
            {[{ v: '', id: 'Semua', en: 'All' }, ...STATUS_PROYEK].map((o) => {
              const n = o.v ? laba.filter((p) => p.status === o.v).length : laba.length
              return (
                <button key={o.v} onClick={() => pilihFs(o.v)}
                  className={`rounded-full border px-3 py-1 transition ${fs === o.v
                    ? 'border-eba-600 bg-eba-600 text-white'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
                  {o[lang]} <span className="opacity-70">{n}</span>
                </button>
              )
            })}
          </div>
        </div>
        <table className="min-w-full">
          <thead><tr>
            <th className="th">{t('proyek')}</th><th className="th">{t('status')}</th>
            <th className="th text-right">{t('nilai_kontrak')}</th><th className="th text-right">{t('pendapatan')}</th>
            <th className="th text-right">{t('biaya')}</th><th className="th text-right">{t('laba')}</th><th className="th text-right">{t('margin')}</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {tampil.length === 0 && <tr><td className="td text-gray-500" colSpan={7}>{t('kosong')}</td></tr>}
            {tampil.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="td">
                  <Link to={`/proyek/${p.id}`} className="font-medium text-eba-600 hover:underline">{p.kode_eba || p.kode_lpse}</Link>
                  <div className="text-xs text-gray-500">{p.nama}</div>
                </td>
                <td className="td">{STATUS_PROYEK.find((s) => s.v === p.status)?.[lang]}</td>
                <td className="td text-right tabular-nums">{rp(p.nilai_kontrak)}</td>
                <td className="td text-right tabular-nums">{rp(p.pendapatan)}</td>
                <td className="td text-right tabular-nums">{rp(p.biaya)}</td>
                <td className={`td text-right font-semibold tabular-nums ${p.laba < 0 ? 'text-eba-600' : 'text-green-700 dark:text-green-400'}`}>{rp(p.laba)}</td>
                <td className="td text-right tabular-nums">{p.pendapatan > 0 ? ((p.laba / p.pendapatan) * 100).toFixed(1) + '%' : '-'}</td>
              </tr>
            ))}
          </tbody>
          {tampil.length > 0 && (() => {
            // Total semua proyek (proyek Tender & Batal tidak dihitung di nilai kontrak)
            const aktif = fs ? tampil : tampil.filter((p) => p.status !== 'tender' && p.status !== 'batal')
            const kontrak = aktif.reduce((a, p) => a + Number(p.nilai_kontrak), 0)
            const pend = tampil.reduce((a, p) => a + Number(p.pendapatan), 0)
            const biaya = tampil.reduce((a, p) => a + Number(p.biaya), 0)
            const lr = pend - biaya
            return (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold dark:border-gray-600 dark:bg-gray-800/60">
                  <td className="td">{t('total')} <span className="text-xs font-normal text-gray-500">({aktif.length} {t('proyek').toLowerCase()}{fs ? '' : ' · ' + t('tanpa_tender')})</span></td>
                  <td className="td" />
                  <td className="td text-right tabular-nums">{rp(kontrak)}</td>
                  <td className="td text-right tabular-nums">{rp(pend)}</td>
                  <td className="td text-right tabular-nums">{rp(biaya)}</td>
                  <td className={`td text-right tabular-nums ${lr < 0 ? 'text-eba-600' : 'text-green-700 dark:text-green-400'}`}>{rp(lr)}</td>
                  <td className="td text-right tabular-nums">{pend > 0 ? ((lr / pend) * 100).toFixed(1) + '%' : '-'}</td>
                </tr>
              </tfoot>
            )
          })()}
        </table>
      </div>
    </div>
  )
}
