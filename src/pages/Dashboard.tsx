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

      <div className="card overflow-x-auto p-0">
        <div className="border-b border-gray-200 px-4 py-3 font-semibold dark:border-gray-700">{t('laba_proyek')}</div>
        <table className="min-w-full">
          <thead><tr>
            <th className="th">{t('proyek')}</th><th className="th">{t('status')}</th>
            <th className="th text-right">{t('nilai_kontrak')}</th><th className="th text-right">{t('pendapatan')}</th>
            <th className="th text-right">{t('biaya')}</th><th className="th text-right">{t('laba')}</th><th className="th text-right">{t('margin')}</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {laba.length === 0 && <tr><td className="td text-gray-500" colSpan={7}>{t('kosong')}</td></tr>}
            {laba.map((p) => (
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
        </table>
      </div>
    </div>
  )
}
