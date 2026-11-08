import { Angka, Badge, SkeletonBaris, Sparkline } from '../components/UI'
import { FileSpreadsheet, Printer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import GrafikDashboard from '../components/GrafikDashboard'
import { eksporExcel } from '../lib/excel'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, tgl, today } from '../lib/format'
import { STATUS_PROYEK } from '../lib/options'
import Kop from '../components/Kop'
import { cetak, tglFile } from '../lib/cetak'

type Laba = { id: number; kode_eba: string | null; kode_lpse: string | null; nama: string; status: string;
  nilai_kontrak: number; pendapatan: number; biaya: number; laba: number }
type BB = { akun_kode: string; debit: number; kredit: number }

export default function Dashboard() {
  const nav = useNavigate()
  const tabelRef = useRef<HTMLTableElement>(null)
  const { t, lang } = useT()
  const [laba, setLaba] = useState<Laba[]>([])
  const [siap, setSiap] = useState(false)
  const [saldo, setSaldo] = useState({ bank: 0, utang: 0, kasbon: 0, piutang: 0 })
  // Filter status proyek (disimpan supaya tetap saat halaman dibuka lagi)
  const [fs, setFs] = useState<string>(() => { try { return localStorage.getItem('eba-filter-proyek') || '' } catch { return '' } })
  const pilihFs = (v: string) => { setFs(v); try { localStorage.setItem('eba-filter-proyek', v) } catch { /* abaikan */ } }

  // "Perlu Tindakan" + grafik bulanan
  type Aksi = { to: string; label: string; n: number; total: number; warna: string }
  const [aksi, setAksi] = useState<Aksi[]>([])
  const [bulan, setBulan] = useState<{ b: string; pend: number; biaya: number }[]>([])
  useEffect(() => {
    (async () => {
      const geser = (hari: number) => { const d = new Date(); d.setDate(d.getDate() - hari); return d.toLocaleDateString('sv') }
      const awal6 = (() => { const d = new Date(); d.setMonth(d.getMonth() - 5, 1); return d.toLocaleDateString('sv') })()
      const [ut, tg, tr, kb, bb, rb, pl] = await Promise.all([
        supabase.from('v_pembelian').select('sisa').eq('lewat_tempo', true),
        supabase.from('termin').select('nilai_bersih,tgl_tagih').eq('status', 'ditagih'),
        supabase.from('termin').select('nilai_bersih').eq('status', 'rencana'),
        supabase.from('kasbon').select('nominal,tanggal').eq('status', 'terbuka').lte('tanggal', geser(7)),
        supabase.from('v_buku_besar').select('tanggal,tipe,debit,kredit').in('tipe', ['pendapatan', 'beban']).gte('tanggal', awal6),
        supabase.from('rab_proyek').select('proyek_id,nilai'),
        supabase.from('v_proyek_laba').select('id,biaya'),
      ])
      // Proyek yang biayanya sudah >= 90% RAB
      const rabP: Record<number, number> = {}
      for (const r of (rb.data as { proyek_id: number; nilai: number }[]) || []) rabP[r.proyek_id] = (rabP[r.proyek_id] || 0) + Number(r.nilai)
      const lewatRab = ((pl.data as { id: number; biaya: number }[]) || []).filter((x) => rabP[x.id] > 0 && Number(x.biaya) >= rabP[x.id] * 0.9)
      const sum = (d: unknown, k: string) => ((d as Record<string, number>[]) || []).reduce((a, r) => a + Number(r[k]), 0)
      const len = (d: unknown) => ((d as unknown[]) || []).length
      const telatTagih = ((tg.data as { nilai_bersih: number; tgl_tagih: string | null }[]) || []).filter((r) => r.tgl_tagih && r.tgl_tagih <= geser(30))
      const id = lang === 'id'
      setAksi([
        { to: '/pembelian', label: id ? 'Utang supplier lewat jatuh tempo' : 'Overdue supplier bills', n: len(ut.data), total: sum(ut.data, 'sisa'), warna: 'border-red-500 text-red-700 dark:text-red-300' },
        { to: '/termin', label: id ? 'Termin ditagih > 30 hari belum cair' : 'Invoices unpaid > 30 days', n: telatTagih.length, total: telatTagih.reduce((a, r) => a + Number(r.nilai_bersih), 0), warna: 'border-amber-500 text-amber-700 dark:text-amber-300' },
        { to: '/termin', label: id ? 'Termin ditagih, menunggu cair' : 'Invoices awaiting payment', n: len(tg.data), total: sum(tg.data, 'nilai_bersih'), warna: 'border-blue-500 text-blue-700 dark:text-blue-300' },
        { to: '/termin', label: id ? 'Termin belum ditagih' : 'Invoices not yet billed', n: len(tr.data), total: sum(tr.data, 'nilai_bersih'), warna: 'border-gray-400 text-gray-700 dark:text-gray-300' },
        { to: '/kasbon', label: id ? 'Kasbon > 7 hari belum direalisasi' : 'Advances open > 7 days', n: len(kb.data), total: sum(kb.data, 'nominal'), warna: 'border-eba-500 text-eba-700 dark:text-eba-100' },
        { to: lewatRab.length === 1 ? `/proyek/${lewatRab[0].id}` : '/proyek', label: id ? 'Proyek biaya ≥ 90% RAB' : 'Projects ≥ 90% of budget', n: lewatRab.length, total: lewatRab.reduce((a, x) => a + Number(x.biaya), 0), warna: 'border-red-500 text-red-700 dark:text-red-300' },
      ].filter((a) => a.n > 0))
      // Grafik 6 bulan terakhir
      const m: Record<string, { pend: number; biaya: number }> = {}
      for (let i = 5; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i, 1); m[d.toLocaleDateString('sv').slice(0, 7)] = { pend: 0, biaya: 0 } }
      for (const r of (bb.data as { tanggal: string; tipe: string; debit: number; kredit: number }[]) || []) {
        const x = m[r.tanggal.slice(0, 7)]; if (!x) continue
        if (r.tipe === 'pendapatan') x.pend += Number(r.kredit) - Number(r.debit)
        else x.biaya += Number(r.debit) - Number(r.kredit)
      }
      setBulan(Object.entries(m).map(([b, v]) => ({ b, ...v })))
    })()
  }, [lang])

  useEffect(() => {
    (async () => {
      const [l, bb, tm, tglm] = await Promise.all([
        supabase.from('v_proyek_laba').select('*').order('id', { ascending: false }),
        supabase.from('v_buku_besar').select('akun_kode,debit,kredit').in('akun_kode', ['1100', '1300', '2100']),
        supabase.from('termin').select('nilai_bersih,status').neq('status', 'diterima'),
        supabase.from('proyek').select('id,tgl_mulai'),
      ])
      setLaba((l.data as Laba[]) || []); setSiap(true)
      setMulai(Object.fromEntries(((tglm.data as { id: number; tgl_mulai: string | null }[]) || []).map((x) => [x.id, x.tgl_mulai || ''])))
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

  // Filter pembayaran klien: pendapatan (DPP) dibanding nilai kontrak sebelum PPN
  const [fb, setFb] = useState<'' | 'lunas' | 'sebagian' | 'belum'>('')
  const stBayar = (p: Laba) => {
    const dpp = Number(p.nilai_kontrak) / 1.11, d = Number(p.pendapatan)
    return d <= 0 ? 'belum' : d >= dpp - 1 ? 'lunas' : 'sebagian'
  }
  // Filter periode: proyek yang tanggal mulainya dalam N bulan terakhir (termasuk bulan ini)
  const [mulai, setMulai] = useState<Record<number, string>>({})
  const [periode, setPeriode] = useState(0)
  const batasPeriode = (() => { const d = new Date(); d.setMonth(d.getMonth() - (periode - 1), 1); return d.toLocaleDateString('sv') })()
  const labaP = periode ? laba.filter((p) => (mulai[p.id] || '') >= batasPeriode) : laba
  const perStatus = fs ? labaP.filter((p) => p.status === fs) : labaP
  const tersaring = fb ? perStatus.filter((p) => stBayar(p) === fb) : perStatus
  // Urutkan kolom: klik ▲/▼ di judul kolom (klik lagi untuk membalik, ketiga kali kembali normal)
  const [urut, setUrut] = useState<{ k: string; d: 1 | -1 } | null>(null)
  const nilaiUrut: Record<string, (p: Laba) => number | string> = {
    proyek: (p) => p.kode_eba || p.kode_lpse || '', status: (p) => p.status,
    kontrak: (p) => Number(p.nilai_kontrak), pend: (p) => Number(p.pendapatan), biaya: (p) => Number(p.biaya),
    laba: (p) => Number(p.laba), margin: (p) => (p.pendapatan > 0 ? p.laba / p.pendapatan : -Infinity),
    bersih: (p) => Number(p.nilai_kontrak) / 1.11, proyeksi: (p) => Number(p.nilai_kontrak) / 1.11 - Number(p.biaya),
  }
  const tampil = !urut ? tersaring : [...tersaring].sort((a, b) => {
    const f = nilaiUrut[urut.k], x = f(a), y = f(b)
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'id', { numeric: true })) * urut.d
  })
  const Th = ({ k, kanan, title, children }: { k: string; kanan?: boolean; title?: string; children: React.ReactNode }) => {
    const aktif = urut?.k === k
    const klik = (d: 1 | -1) => setUrut(aktif && urut?.d === d ? null : { k, d })
    return (
      <th className={`th ${kanan ? 'text-right' : ''}`} title={title}>
        <span className={`inline-flex items-center gap-1 ${kanan ? 'flex-row-reverse' : ''}`}>
          <span>{children}</span>
          <span className="no-print inline-flex flex-col leading-none text-[10px]">
            <button type="button" onClick={() => klik(1)} className={aktif && urut?.d === 1 ? 'text-eba-600' : 'text-gray-400 hover:text-gray-700'} title="Urut naik">▲</button>
            <button type="button" onClick={() => klik(-1)} className={aktif && urut?.d === -1 ? 'text-eba-600' : 'text-gray-400 hover:text-gray-700'} title="Urut turun">▼</button>
          </span>
        </span>
      </th>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="no-print text-xl font-bold">{t('dashboard')}</h1>
      <div className="no-print grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([k, v, c]) => (
          <div key={k} className="card card-hover">
            <div className="text-xs font-medium uppercase text-gray-500">{t(k)}</div>
            <div className={`mt-1 text-xl font-bold tabular-nums ${c}`}><Angka nilai={v} /></div>
          </div>
        ))}
      </div>
      {bulan.length >= 2 && (() => {
        // KPI bulan ini vs bulan lalu
        const ini = bulan[bulan.length - 1], lalu = bulan[bulan.length - 2]
        const kpi: [string, number, number, boolean][] = [
          [lang === 'id' ? 'Pendapatan bulan ini' : 'Revenue this month', ini.pend, lalu.pend, true],
          [lang === 'id' ? 'Biaya bulan ini' : 'Expenses this month', ini.biaya, lalu.biaya, false],
          [lang === 'id' ? 'Laba bulan ini' : 'Profit this month', ini.pend - ini.biaya, lalu.pend - lalu.biaya, true],
        ]
        return (
          <div className="no-print grid gap-3 sm:grid-cols-3">
            {kpi.map(([k, v, l, naikBagus], ki) => {
              const tren = bulan.map((x) => ki === 0 ? x.pend : ki === 1 ? x.biaya : x.pend - x.biaya)
              const pct = l !== 0 ? ((v - l) / Math.abs(l)) * 100 : v !== 0 ? 100 : 0
              const naik = v > l, sama = v === l
              const bagus = sama ? null : naik === naikBagus
              return (
                <div key={k} className="card card-hover">
                  <div className="text-xs font-medium uppercase text-gray-500">{k}</div>
                  <div className={`mt-1 text-xl font-bold tabular-nums ${v < 0 ? 'text-eba-600' : ''}`}><Angka nilai={v} /></div>
                  <div className="mt-1 text-gray-400"><Sparkline data={tren} warna={ki === 1 ? '#c0302b' : '#16a34a'} /></div>
                  <div className={`mt-0.5 text-xs tabular-nums ${bagus === null ? 'text-gray-500' : bagus ? 'text-green-700 dark:text-green-400' : 'text-eba-600'}`}>
                    {sama ? '=' : naik ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}% <span className="text-gray-500">{lang === 'id' ? 'vs bulan lalu' : 'vs last month'} ({rp(l)})</span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}
      <div className="no-print card">
        <div className="mb-3 font-semibold">⚡ {lang === 'id' ? 'Perlu Tindakan' : 'Action Needed'}</div>
        {aksi.length === 0 ? (
          <div className="text-sm text-green-700 dark:text-green-400">✓ {lang === 'id' ? 'Semua beres, tidak ada yang tertunda.' : 'All clear, nothing pending.'}</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {aksi.map((a) => (
              <Link key={a.label} to={a.to} className={`rounded-lg border-l-4 bg-gray-50 p-3 transition hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800 ${a.warna}`}>
                <div className="text-xs text-gray-600 dark:text-gray-400">{a.label}</div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <b className="text-lg tabular-nums">{rp(a.total)}</b>
                  <span className="text-xs text-gray-500">{a.n} item →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {bulan.length > 0 && (() => {
        const max = Math.max(1, ...bulan.flatMap((x) => [x.pend, x.biaya]))
        const nm = (b: string) => new Date(b + '-01').toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { month: 'short', year: '2-digit' })
        const tp = bulan.reduce((a, x) => a + x.pend, 0), tb = bulan.reduce((a, x) => a + x.biaya, 0)
        return (
          <div className="no-print card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{lang === 'id' ? 'Pendapatan vs Biaya (6 bulan)' : 'Revenue vs Expenses (6 months)'}</span>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm bg-green-600" />{t('pendapatan')} {rp(tp)}</span>
                <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm bg-eba-600" />{t('biaya')} {rp(tb)}</span>
              </div>
            </div>
            <div className="flex h-48 items-end gap-2 sm:gap-4">
              {bulan.map((x) => (
                <div key={x.b} className="flex h-full flex-1 flex-col items-center justify-end">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div title={`${t('pendapatan')}: ${rp(x.pend)}`} className="w-1/2 max-w-8 rounded-t bg-green-600 transition-all" style={{ height: `${(x.pend / max) * 100}%`, minHeight: x.pend ? 2 : 0 }} />
                    <div title={`${t('biaya')}: ${rp(x.biaya)}`} className="w-1/2 max-w-8 rounded-t bg-eba-600 transition-all" style={{ height: `${(x.biaya / max) * 100}%`, minHeight: x.biaya ? 2 : 0 }} />
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">{nm(x.b)}</div>
                  <div className={`text-[10px] tabular-nums ${x.pend - x.biaya < 0 ? 'text-eba-600' : 'text-green-700 dark:text-green-400'}`}>
                    {x.pend || x.biaya ? (x.pend - x.biaya >= 0 ? '+' : '−') + (Math.abs(x.pend - x.biaya) / 1e6).toFixed(1) + 'jt' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      <GrafikDashboard />

      <Kop judul={t('laba_proyek')} sub={`${fs ? STATUS_PROYEK.find((x) => x.v === fs)?.[lang] : t('semua_status')}${fb ? ' · ' + ({ lunas: 'Sudah diterima', sebagian: 'Sebagian', belum: 'Belum diterima' } as Record<string, string>)[fb] : ''}${periode ? ' · ' + (periode === 1 ? 'Bulan ini' : periode + ' bulan terakhir') : ''} · ${t('per_tanggal')} ${tgl(today())}`} />
      <div className="card overflow-x-auto p-0">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <span className="font-semibold">{t('laba_proyek')}</span>
          <div className="no-print flex flex-wrap gap-1 text-sm">
            {[{ v: '', id: 'Semua', en: 'All' }, ...STATUS_PROYEK].map((o) => {
              const n = o.v ? labaP.filter((p) => p.status === o.v).length : labaP.length
              return (
                <button key={o.v} onClick={() => pilihFs(o.v)}
                  className={`rounded-full border px-3 py-1 transition ${fs === o.v
                    ? 'border-eba-600 bg-eba-600 text-white'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
                  {o[lang]} <span className="opacity-70">{n}</span>
                </button>
              )
            })}
            <span className="mx-1 self-center text-gray-300">|</span>
            <select className="input w-auto rounded-full py-1 text-sm" value={periode} onChange={(e) => setPeriode(Number(e.target.value))} title={lang === 'id' ? 'Berdasarkan tanggal mulai proyek' : 'By project start date'}>
              <option value={0}>{lang === 'id' ? '📅 Semua waktu' : '📅 All time'}</option>
              {[1, 2, 3, 4, 5, 6, 9, 12, 18, 24].map((n) => (
                <option key={n} value={n}>{n === 1 ? (lang === 'id' ? 'Bulan ini' : 'This month') : `${n} ${lang === 'id' ? 'bulan terakhir' : 'months'}`}</option>
              ))}
            </select>
            <span className="mx-1 self-center text-gray-300">|</span>
            {([['', lang === 'id' ? 'Semua bayar' : 'All'], ['lunas', lang === 'id' ? '🟢 Sudah diterima' : '🟢 Received'], ['sebagian', lang === 'id' ? '🟡 Sebagian' : '🟡 Partial'], ['belum', lang === 'id' ? '🔴 Belum diterima' : '🔴 Not received']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFb(v)}
                className={`rounded-full border px-3 py-1 transition ${fb === v
                  ? 'border-gray-800 bg-gray-800 text-white dark:border-gray-200 dark:bg-gray-200 dark:text-gray-900'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
                {l} <span className="opacity-70">{v ? perStatus.filter((p) => stBayar(p) === v).length : perStatus.length}</span>
              </button>
            ))}
            <button className="ml-2 inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              onClick={() => eksporExcel(tabelRef.current, `Rekap Proyek ${tglFile()}`)}><FileSpreadsheet className="h-4 w-4 text-green-700" /> Excel</button>
            <button className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              onClick={() => cetak(`Rekap Proyek ${fs ? (STATUS_PROYEK.find((x) => x.v === fs)?.id || fs) : 'Semua'} ${tglFile()}`)}><Printer className="h-4 w-4" /> {t('cetak')}</button>
          </div>
        </div>
        <table ref={tabelRef} className="cetak-rapat min-w-full">
          <thead><tr>
            <Th k="proyek">{t('proyek')}</Th><Th k="status">{t('status')}</Th>
            <Th k="kontrak" kanan>{t('nilai_kontrak')}</Th><Th k="pend" kanan>{t('pendapatan')}</Th>
            <Th k="biaya" kanan>{t('biaya')}</Th><Th k="laba" kanan>{t('laba')}</Th><Th k="margin" kanan>{t('margin')}</Th>
            <Th k="bersih" kanan title="Nilai kontrak ÷ 1,11">{lang === 'id' ? 'Nilai Bersih (−PPN)' : 'Net Value (−VAT)'}</Th>
            <Th k="proyeksi" kanan title="Nilai bersih − biaya">{lang === 'id' ? 'Proyeksi Laba' : 'Projected Profit'}</Th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {!siap ? <SkeletonBaris kolom={9} /> : tampil.length === 0 && <tr><td className="td text-gray-500" colSpan={9}>{t('kosong')}</td></tr>}
            {tampil.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" onClick={() => nav(`/proyek/${p.id}`)}>
                <td className="td">
                  <Link to={`/proyek/${p.id}`} className="font-medium text-eba-600 hover:underline">{p.kode_eba || p.kode_lpse}</Link>
                  <div className="text-xs text-gray-500">{p.nama}</div>
                </td>
                <td className="td"><Badge status={p.status} label={STATUS_PROYEK.find((s) => s.v === p.status)?.[lang] || p.status} /></td>
                <td className="td text-right tabular-nums">{rp(p.nilai_kontrak)}</td>
                <td className="td text-right tabular-nums">{rp(p.pendapatan)}</td>
                <td className="td text-right tabular-nums">{rp(p.biaya)}</td>
                <td className={`td text-right font-semibold tabular-nums ${p.laba < 0 ? 'text-eba-600' : 'text-green-700 dark:text-green-400'}`}>{rp(p.laba)}</td>
                <td className="td text-right tabular-nums">{p.pendapatan > 0 ? ((p.laba / p.pendapatan) * 100).toFixed(1) + '%' : '-'}</td>
                {(() => { const nb = Math.round(Number(p.nilai_kontrak) / 1.11), pl = nb - Number(p.biaya), m = nb > 0 ? (pl / nb) * 100 : 0
                  return <>
                    <td className="td text-right tabular-nums">{rp(nb)}</td>
                    <td className={`td whitespace-nowrap text-right font-semibold tabular-nums ${m < 10 ? 'text-eba-600' : 'text-green-700 dark:text-green-400'}`}>{rp(pl)}
                      <div className="text-[11px] font-normal">{nb > 0 ? m.toFixed(1) + '%' : '-'}</div></td>
                  </> })()}
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
            const nb = aktif.reduce((a, p) => a + Math.round(Number(p.nilai_kontrak) / 1.11), 0), pl = nb - biaya
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
                  <td className="td text-right tabular-nums">{rp(nb)}</td>
                  <td className={`td whitespace-nowrap text-right tabular-nums ${pl < 0 ? 'text-eba-600' : 'text-green-700 dark:text-green-400'}`}>{rp(pl)}
                    <div className="text-[11px] font-normal">{nb > 0 ? ((pl / nb) * 100).toFixed(1) + '%' : '-'}</div></td>
                </tr>
              </tfoot>
            )
          })()}
        </table>
      </div>
    </div>
  )
}
