import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, tgl, today } from '../lib/format'
import Kop from '../components/Kop'
import { cetak } from '../lib/cetak'

type BB = { jurnal_id: number; tanggal: string; keterangan: string; sumber: string; akun_kode: string; akun_nama: string; tipe: string; debit: number; kredit: number }
type Tab = 'laba_rugi' | 'neraca' | 'buku_besar'

// Laporan formal dari jurnal: Laba Rugi (periode), Neraca (per tanggal), Buku Besar.
export default function Laporan() {
  const { t, lang } = useT()
  const [rinci, setRinci] = useState(true)                       // tampilkan transaksi per akun
  const [tutup, setTutup] = useState<Record<string, boolean>>({}) // akun yang dilipat (layar saja)
  const [tab, setTab] = useState<Tab>('laba_rugi')
  const [dari, setDari] = useState(today().slice(0, 4) + '-01-01') // awal tahun berjalan
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

  // Tombol cepat periode (Minggu ini mulai Senin)
  const lokal = (d: Date) => d.toLocaleDateString('sv')
  const cepat: [string, () => void][] = [
    [lang === 'id' ? 'Minggu ini' : 'This week', () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); setDari(lokal(d)); setSampai(today()) }],
    [lang === 'id' ? 'Minggu lalu' : 'Last week', () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); const e = new Date(d); e.setDate(d.getDate() + 6); setDari(lokal(d)); setSampai(lokal(e)) }],
    [lang === 'id' ? 'Bulan ini' : 'This month', () => { setDari(today().slice(0, 8) + '01'); setSampai(today()) }],
    [lang === 'id' ? 'Tahun ini' : 'This year', () => { setDari(today().slice(0, 4) + '-01-01'); setSampai(today()) }],
  ]

  const Section = ({ title, items, total, detail }: { title: string; items: { kode: string; nama: string; v: number }[]; total: number; detail?: boolean }) => (
    <>
      <tr className="bg-gray-50 dark:bg-gray-800"><td className="td font-semibold" colSpan={2}>{title}</td></tr>
      {items.map((i) => {
        const tx = detail && rinci ? periode.filter((r) => r.akun_kode === i.kode) : []
        const lipat = tutup[i.kode]
        return (
          <Fragment key={i.kode}>
            <tr className={tx.length ? 'cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800/50' : ''}
              onClick={() => tx.length && setTutup((x) => ({ ...x, [i.kode]: !x[i.kode] }))}>
              <td className={`td pl-6 ${tx.length ? 'font-medium' : ''}`}>
                {tx.length > 0 && <span className="no-print mr-1 inline-block w-3 text-gray-400">{lipat ? '▸' : '▾'}</span>}
                {i.kode} {i.nama} {tx.length > 0 && <span className="text-xs font-normal text-gray-500">({tx.length})</span>}
              </td>
              <td className={`td text-right tabular-nums ${tx.length ? 'font-medium' : ''}`}>{rp(i.v)}</td>
            </tr>
            {tx.map((r, k) => (
              <tr key={k} className={`text-sm text-gray-600 dark:text-gray-400 ${lipat ? 'hidden print:table-row' : ''}`}>
                <td className="td py-1 pl-12"><span className="mr-3 inline-block w-16 whitespace-nowrap tabular-nums">{tgl(r.tanggal).replace(/ \d{4}$/, '')}</span>{r.keterangan}</td>
                <td className="td whitespace-nowrap py-1 text-right tabular-nums">{rp(['aset', 'beban'].includes(r.tipe) ? r.debit - r.kredit : r.kredit - r.debit)}</td>
              </tr>
            ))}
          </Fragment>
        )
      })}
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
        <button className="btn-ghost" onClick={() => cetak(tab === 'neraca' ? `Neraca per ${sampai}` : `${tab === 'laba_rugi' ? 'Laba Rugi' : 'Buku Besar'} ${dari} sd ${sampai}${tab === 'laba_rugi' && rinci ? ' (rinci)' : ''}`)}>{t('cetak')}</button>
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">
        {(['laba_rugi', 'neraca', 'buku_besar'] as Tab[]).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={tab === k ? 'btn-primary' : 'btn-ghost'}>{t(k)}</button>
        ))}
        {tab !== 'neraca' && (
          <div className="ml-auto flex flex-wrap items-center gap-1 text-sm">
            {cepat.map(([l, f]) => (
              <button key={l} onClick={f} className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">{l}</button>
            ))}
            {tab === 'laba_rugi' && (
              <label className="ml-2 flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={rinci} onChange={(e) => { setRinci(e.target.checked); setTutup({}) }} />
                {lang === 'id' ? 'Tampilkan rincian' : 'Show details'}
              </label>
            )}
          </div>
        )}
      </div>

      <div className="card overflow-x-auto p-0">
        {tab === 'laba_rugi' && (
          <table className="min-w-full"><tbody>
            <Section title={t('pendapatan')} items={pend} total={sum(pend)} detail />
            <Section title={t('beban')} items={beb} total={sum(beb)} detail />
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
