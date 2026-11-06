import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, tgl } from '../lib/format'
import { cetak } from '../lib/cetak'

/**
 * Slip gaji per pekerja, dengan kop asli EBA.
 *   /slip?id=12            → satu slip
 *   /slip?periode=Minggu…  → semua slip pada periode itu (1 slip per halaman)
 * Hanya membaca data, tidak mengubah apa pun.
 */
type Slip = {
  id: number; tanggal: string; periode: string; nominal: number
  hari: number | null; tarif: number | null; lembur: number; jam_lembur: number; hari_lembur: number
  tunjangan: number; potongan: number; keterangan: string | null; jam_pulang: string | null
  karyawan: { nama: string; jabatan: string | null; tipe_gaji: string } | null
  proyek: { nama: string; kode_eba: string | null } | null
}

export default function SlipGaji() {
  const { lang } = useT()
  const id = lang === 'id'
  const [q] = useSearchParams()
  const [rows, setRows] = useState<Slip[] | null>(null)
  const [nomor, setNomor] = useState<Record<number, string>>({})

  useEffect(() => {
    let s = supabase.from('penggajian').select('*, karyawan(nama,jabatan,tipe_gaji), proyek(nama,kode_eba)').order('id')
    if (q.get('id')) s = s.eq('id', Number(q.get('id')))
    else if (q.get('periode')) s = s.eq('periode', q.get('periode')!)
    s.then(async ({ data }) => {
      const rs = (data as Slip[]) || []
      setRows(rs)
      if (!rs.length) return
      // Nomor slip otomatis: SG/tahun/bulan/urut — urutan id dalam bulan tanggal bayar
      const bln = [...new Set(rs.map((r) => r.tanggal.slice(0, 7)))].sort()
      const akhir = new Date(bln[bln.length - 1] + '-01'); akhir.setMonth(akhir.getMonth() + 1, 0)
      const { data: semua } = await supabase.from('penggajian').select('id,tanggal')
        .gte('tanggal', bln[0] + '-01').lte('tanggal', akhir.toLocaleDateString('sv')).order('id')
      const urut: Record<string, number> = {}, no: Record<number, string> = {}
      for (const x of (semua as { id: number; tanggal: string }[]) || []) {
        const b = x.tanggal.slice(0, 7); urut[b] = (urut[b] || 0) + 1
        no[x.id] = `SG/${b.slice(0, 4)}/${b.slice(5, 7)}/${String(urut[b]).padStart(3, '0')}`
      }
      setNomor(no)
    })
  }, [q])

  if (!rows) return <div className="text-gray-500">{id ? 'Memuat…' : 'Loading…'}</div>
  if (rows.length === 0) return <div className="text-gray-500">{id ? 'Data tidak ditemukan.' : 'Not found.'}</div>

  const namaFile = rows.length === 1
    ? `Slip Gaji ${rows[0].karyawan?.nama || ''} ${rows[0].periode}`
    : `Slip Gaji ${rows[0].periode} (${rows.length} orang)`

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link to="/gaji" className="text-sm text-gray-500 hover:underline">← {id ? 'Riwayat Penggajian' : 'Payroll history'}</Link>
        <button className="btn-primary" onClick={() => cetak(namaFile)}>🖨 {id ? 'Cetak / Simpan PDF' : 'Print / Save PDF'} ({rows.length})</button>
      </div>

      {rows.map((r, i) => {
        const n = (v: unknown) => Number(v || 0)
        const pokok = n(r.nominal) - n(r.lembur) - n(r.tunjangan) + n(r.potongan)
        const harian = r.karyawan?.tipe_gaji === 'mingguan'
        const baris: [string, string, number][] = [
          [harian ? (id ? 'Upah harian' : 'Daily wage') : (id ? 'Gaji pokok' : 'Base salary'),
            harian && n(r.hari) ? `${n(r.hari)} ${id ? 'hari' : 'days'} × ${rp(n(r.tarif))}` : '', pokok],
        ]
        if (n(r.lembur)) baris.push([id ? 'Lembur' : 'Overtime', n(r.hari_lembur) ? `${n(r.hari_lembur)} ${id ? 'hari' : 'days'}` : '', n(r.lembur)])
        if (n(r.tunjangan)) baris.push([id ? 'Tunjangan' : 'Allowance', '', n(r.tunjangan)])
        return (
          <div key={r.id} className={`slip card mx-auto max-w-2xl ${i > 0 ? 'break-before-page' : ''} bg-white text-gray-900 print:max-w-none print:border-0 print:shadow-none`}>
            <img src="/kop-eba.png" alt="Kop PT. EBA Karya Mandiri" className="w-full" />
            <div className="my-4 text-center">
              <div className="text-lg font-bold tracking-wide">SLIP GAJI</div>
              <div className="text-sm">{r.periode}</div>
              {nomor[r.id] && <div className="text-xs text-gray-600">No. {nomor[r.id]}</div>}
            </div>

            <table className="mb-4 w-full text-sm">
              <tbody>
                {([
                  [id ? 'Nama' : 'Name', r.karyawan?.nama || '-'],
                  [id ? 'Jabatan' : 'Position', r.karyawan?.jabatan || (harian ? (id ? 'Pekerja harian' : 'Daily worker') : '-')],
                  [id ? 'Proyek' : 'Project', r.proyek ? `${r.proyek.kode_eba ? r.proyek.kode_eba + ' · ' : ''}${r.proyek.nama}` : (id ? 'Kantor' : 'Office')],
                  [id ? 'Tanggal bayar' : 'Pay date', tgl(r.tanggal)],
                ] as [string, string][]).map(([k, v]) => (
                  <tr key={k} className="align-top"><td className="w-32 py-0.5 text-gray-600">{k}</td><td className="w-4 py-0.5">:</td><td className="py-0.5 font-semibold">{v}</td></tr>
                ))}
              </tbody>
            </table>

            <table className="w-full border-collapse text-sm">
              <thead><tr className="border-y border-gray-400">
                <th className="py-1.5 text-left">{id ? 'Keterangan' : 'Description'}</th><th className="py-1.5 text-left font-normal text-gray-600" />
                <th className="py-1.5 text-right">{id ? 'Jumlah' : 'Amount'}</th>
              </tr></thead>
              <tbody>
                {baris.map(([a, b, v]) => (
                  <tr key={a} className="border-b border-gray-200">
                    <td className="py-1.5">{a}</td><td className="py-1.5 text-gray-600">{b}</td>
                    <td className="py-1.5 text-right tabular-nums">{rp(v)}</td>
                  </tr>
                ))}
                {n(r.potongan) > 0 && (
                  <tr className="border-b border-gray-200">
                    <td className="py-1.5">{id ? 'Potongan' : 'Deductions'}</td><td className="py-1.5 text-gray-600">{r.keterangan || ''}</td>
                    <td className="py-1.5 text-right tabular-nums text-red-700">− {rp(n(r.potongan))}</td>
                  </tr>
                )}
              </tbody>
              <tfoot><tr className="border-y-2 border-gray-500">
                <td className="py-2 font-bold" colSpan={2}>{id ? 'TOTAL DITERIMA' : 'NET PAY'}</td>
                <td className="py-2 text-right text-base font-bold tabular-nums">{rp(n(r.nominal))}</td>
              </tr></tfoot>
            </table>
            {r.keterangan && !n(r.potongan) && <p className="mt-2 text-xs text-gray-600">{id ? 'Catatan' : 'Note'}: {r.keterangan}</p>}

            <div className="mt-10 grid grid-cols-2 gap-8 text-center text-sm">
              <div>{id ? 'Penerima,' : 'Received by,'}<div className="mt-16 border-t border-gray-500 pt-1 font-semibold">{r.karyawan?.nama}</div></div>
              <div>{id ? 'Hormat kami,' : 'Sincerely,'}<div className="mt-16 border-t border-gray-500 pt-1 font-semibold">PT. EBA Karya Mandiri</div></div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
