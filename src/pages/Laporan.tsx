import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, tgl, today } from '../lib/format'
import Kop from '../components/Kop'
import { cetak } from '../lib/cetak'

type BB = { jurnal_id: number; tanggal: string; keterangan: string; sumber: string; akun_kode: string; akun_nama: string; tipe: string; debit: number; kredit: number }
type Tab = 'laba_rugi' | 'neraca' | 'buku_besar'

// Laporan formal dari jurnal: Laba Rugi (periode), Neraca (per tanggal), Buku Besar.
export default function Laporan() {
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('laba_rugi')
  const [dari, setDari] = useState('2026-11-03')
  const [sampai, setSampai] = useState(today())
  const [all, setAll] = useState<BB[]>([])

  useEffect(() => {
    supabase.from('v_buku_besar').select('*').lte('tanggal', sampai).order('tanggal').order('jurnal_id')
      .then(({ data }) => setAll((data as BB[]) || []))
  }, [sampai])

  const periode = useMemo(() => all.filter((r) => r.tanggal >= dari), [all, dari])

  // Saldo per akun. Aset & beban bersaldo debit; lainnya bersaldo kredit.
  const saldoAkun = (rows: BB[], tipe: string) => {
    const m = new Map<string, { nama: string; v: number }>()
    for (const r of rows.filter((x) => x.tipe === tipe)) {
      const v = ['aset', 'beban'].includes(tipe) ? r.debit - r.kredit : r.kredit - r.debit
      const cur = m.get(r.akun_kode) || { nama: r.akun_nama, v: 0 }
      cur.v += Number(v); m.set(r.akun_kode, cur)
    }
    return [...m.entries()].sort().map(([kode, x]) => ({ kode, ...x }))
  }
  const sum = (xs: { v: number }[]) => xs.reduce((a, x) => a + x.v, 0)

  const Section = ({ title, items, total }: { title: string; items: { kode: string; nama: string; v: number }[]; total: number }) => (
    <>
      <tr className="bg-gray-50 dark:bg-gray-800"><td className="td font-semibold" colSpan={2}>{title}</td></tr>
      {items.map((i) => <tr key={i.kode}><td className="td pl-6">{i.kode} {i.nama}</td><td className="td text-right tabular-nums">{rp(i.v)}</td></tr>)}
      <tr><td className="td font-semibold">{t('total')} {title}</td><td className="td text-right font-semibold tabular-nums">{rp(total)}</td></tr>
    </>
  )

  const pend = saldoAkun(periode, 'pendapatan'), beb = saldoAkun(periode, 'beban')
  const aset = saldoAkun(all, 'aset'), kew = saldoAkun(all, 'kewajiban'), eku = saldoAkun(all, 'ekuitas')
  const labaKum = sum(saldoAkun(all, 'pendapatan')) - sum(saldoAkun(all, 'beban'))
  const totEku = sum(eku) + labaKum
  const seimbang = Math.abs(sum(aset) - (sum(kew) + totEku)) < 1

  const judul = t(tab)
  const sub = tab === 'neraca' ? `${t('per_tanggal')} ${tgl(sampai)}` : `${tgl(dari)} – ${tgl(sampai)}`

  return (
    <div className="space-y-4">
      <Kop judul={judul} sub={sub} />
      <div className="no-print flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-bold">{t('laporan')}</h1>
        {tab !== 'neraca' && <label className="text-sm">{t('dari')}<input type="date" className="input" value={dari} onChange={(e) => setDari(e.target.value)} /></label>}
        <label className="text-sm">{tab === 'neraca' ? t('per_tanggal') : t('sampai')}<input type="date" className="input" value={sampai} onChange={(e) => setSampai(e.target.value)} /></label>
        <button className="btn-ghost" onClick={() => cetak(tab === 'neraca' ? `Neraca per ${sampai}` : `${tab === 'laba_rugi' ? 'Laba Rugi' : 'Buku Besar'} ${dari} sd ${sampai}`)}>{t('cetak')}</button>
      </div>
      <div className="no-print flex gap-2">
        {(['laba_rugi', 'neraca', 'buku_besar'] as Tab[]).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={tab === k ? 'btn-primary' : 'btn-ghost'}>{t(k)}</button>
        ))}
      </div>

      <div className="card overflow-x-auto p-0">
        {tab === 'laba_rugi' && (
          <table className="min-w-full"><tbody>
            <Section title={t('pendapatan')} items={pend} total={sum(pend)} />
            <Section title={t('beban')} items={beb} total={sum(beb)} />
            <tr className="border-t-2 border-gray-300"><td className="td text-base font-bold">{t('laba')}</td>
              <td className={`td text-right text-base font-bold tabular-nums ${sum(pend) - sum(beb) < 0 ? 'text-eba-600' : ''}`}>{rp(sum(pend) - sum(beb))}</td></tr>
          </tbody></table>
        )}
        {tab === 'neraca' && (
          <table className="min-w-full"><tbody>
            <Section title={t('aset')} items={aset} total={sum(aset)} />
            <Section title={t('kewajiban')} items={kew} total={sum(kew)} />
            <Section title={t('ekuitas')} items={[...eku, { kode: '', nama: t('laba_berjalan'), v: labaKum }]} total={totEku} />
            <tr className="border-t-2 border-gray-300"><td className="td font-bold">{t('kewajiban')} + {t('ekuitas')}</td>
              <td className="td text-right font-bold tabular-nums">{rp(sum(kew) + totEku)}</td></tr>
            <tr><td className="td" colSpan={2}>
              <span className={seimbang ? 'text-green-700 dark:text-green-400' : 'font-bold text-eba-600'}>{seimbang ? '✓ ' + t('seimbang') : '✗ ' + t('tidak_seimbang')}</span>
            </td></tr>
          </tbody></table>
        )}
        {tab === 'buku_besar' && (
          <table className="min-w-full">
            <thead><tr><th className="th">{t('tanggal')}</th><th className="th">{t('akun')}</th><th className="th">{t('keterangan')}</th>
              <th className="th text-right">{t('debit')}</th><th className="th text-right">{t('kredit')}</th></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {periode.length === 0 && <tr><td className="td text-gray-500" colSpan={5}>{t('kosong')}</td></tr>}
              {periode.map((r, i) => (
                <tr key={i}><td className="td whitespace-nowrap">{tgl(r.tanggal)}</td><td className="td">{r.akun_kode} {r.akun_nama}</td>
                  <td className="td">{r.keterangan}</td>
                  <td className="td text-right tabular-nums">{r.debit ? rp(r.debit) : ''}</td>
                  <td className="td text-right tabular-nums">{r.kredit ? rp(r.kredit) : ''}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
