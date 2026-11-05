import { Link } from 'react-router-dom'
import CrudPage, { type Field } from '../components/CrudPage'
import { useT } from '../lib/i18n'
import { STATUS_KASBON, STATUS_PROYEK, STATUS_TERMIN, TIPE_GAJI } from '../lib/options'

// PENTING: daftar kolom didefinisikan di luar komponen supaya tidak dibuat ulang tiap render.
type R = Record<string, unknown>
const labelProyek = (r: R) => `${r.kode_eba || r.kode_lpse || '#' + r.id} · ${r.nama}`
const refProyek = (nullLabel?: string): Field => ({ key: 'proyek_id', type: 'ref', ref: { table: 'proyek', label: labelProyek, nullLabel } })

export const F_KLIEN: Field[] = [
  { key: 'nama', type: 'text', required: true }, { key: 'alamat', type: 'text' }, { key: 'npwp', type: 'text' },
]
export const F_SUPPLIER: Field[] = [{ key: 'nama', type: 'text', required: true }, { key: 'kontak', type: 'text' }]
export const F_KARYAWAN: Field[] = [
  { key: 'nama', type: 'text', required: true }, { key: 'jabatan', type: 'text' },
  { key: 'tipe_gaji', type: 'select', options: TIPE_GAJI }, { key: 'tarif', type: 'money' }, { key: 'tarif_lembur', type: 'money' }, { key: 'aktif', type: 'bool' },
]
export const F_PROYEK: Field[] = [
  { key: 'kode_eba', type: 'text' }, { key: 'kode_lpse', type: 'text' }, { key: 'nama', type: 'text', required: true },
  { key: 'klien_id', type: 'ref', ref: { table: 'klien', label: (r) => String(r.nama) } },
  { key: 'nilai_kontrak', type: 'money' }, { key: 'status', type: 'select', options: STATUS_PROYEK },
  { key: 'tgl_mulai', type: 'date', defaultValue: '' }, { key: 'tgl_selesai', type: 'date', defaultValue: '', hideInTable: true },
  { key: 'catatan', type: 'text', hideInTable: true },
]
export const F_TERMIN: Field[] = [
  refProyek(), { key: 'nama', type: 'text', required: true },
  { key: 'nilai_dpp', type: 'money' }, { key: 'ppn', type: 'money' }, { key: 'pph', type: 'money' },
  { key: 'nilai_bersih', type: 'money', readOnly: true },
  { key: 'status', type: 'select', options: STATUS_TERMIN },
  { key: 'tgl_tagih', type: 'date', defaultValue: '' }, { key: 'tgl_terima', type: 'date', defaultValue: '' },
  { key: 'no_bukti_potong', type: 'text', hideInTable: true },
]
export const F_KASBON: Field[] = [
  { key: 'tanggal', type: 'date' },
  { key: 'karyawan_id', type: 'ref', ref: { table: 'karyawan', label: (r) => String(r.nama) } },
  refProyek('kantor'), { key: 'keperluan', type: 'text' }, { key: 'nominal', type: 'money' },
  { key: 'status', type: 'select', options: STATUS_KASBON }, { key: 'tgl_selesai', type: 'date', defaultValue: '' },
  { key: 'sisa_kembali', type: 'money' },
]
export const F_REALISASI: Field[] = [
  { key: 'kasbon_id', type: 'ref', ref: { table: 'kasbon', label: (r) => `#${r.id} · ${r.keperluan || ''} (${r.tanggal})` } },
  { key: 'tanggal', type: 'date' }, { key: 'uraian', type: 'text', required: true },
  { key: 'jumlah', type: 'money' }, { key: 'foto', type: 'photos' },
]
export const F_GAJI: Field[] = [
  { key: 'tanggal', type: 'date' }, { key: 'periode', type: 'text', required: true },
  { key: 'karyawan_id', type: 'ref', ref: { table: 'karyawan', label: (r) => `${r.nama} (${r.tipe_gaji})` } },
  refProyek('kantor'), { key: 'nominal', type: 'money' },
]
export const F_BIAYA: Field[] = [
  { key: 'tanggal', type: 'date' }, { key: 'kategori', type: 'text', defaultValue: 'Operasional' },
  { key: 'uraian', type: 'text', required: true }, refProyek('kantor'), { key: 'jumlah', type: 'money' },
]
export const F_MANUAL: Field[] = [
  { key: 'tanggal', type: 'date' }, { key: 'keterangan', type: 'text', required: true },
  { key: 'akun_debit', type: 'text', defaultValue: '1100' }, { key: 'akun_kredit', type: 'text', defaultValue: '3200' },
  { key: 'jumlah', type: 'money' },
]

// Hitung PPN 11% otomatis saat DPP diisi.
export const terminCalc = (f: R, k: string) =>
  k === 'nilai_dpp' ? { ...f, ppn: Math.round(Number(f.nilai_dpp || 0) * 0.11) } : f


export function ProyekPage() {
  const { t } = useT()
  return <CrudPage table="proyek" title={t('proyek')} hint={t('hint_proyek')} fields={F_PROYEK} filterKey="status" search total
    rowAction={(r) => <Link className="text-eba-600 hover:underline" to={`/proyek/${r.id}`}>{t('detail')}</Link>} />
}
export const TerminPage = () => { const { t } = useT(); return <CrudPage table="termin" title={t('termin')} hint={t('hint_termin')} fields={F_TERMIN} onFormChange={terminCalc} filterKey="status" search /> }
export const KasbonPage = () => { const { t } = useT(); return <CrudPage table="kasbon" title={t('kasbon')} hint={t('hint_kasbon')} fields={F_KASBON} orderBy="tanggal" filterKey="status" search /> }
export const RealisasiPage = () => { const { t } = useT(); return <CrudPage table="kasbon_realisasi" title={t('realisasi')} fields={F_REALISASI} orderBy="tanggal" /> }
export const GajiPage = () => {
  const { t, lang } = useT()
  return <CrudPage table="penggajian" title={t('penggajian')} fields={F_GAJI} orderBy="tanggal" search total filters={['periode', 'karyawan_id', 'proyek_id']}
    rowAction={(r) => <>
      <Link className="text-eba-600 hover:underline" to={`/slip?id=${r.id}`}>{lang === 'id' ? 'Slip' : 'Payslip'}</Link>
      <Link className="ml-2 text-gray-500 hover:underline" to={`/slip?periode=${encodeURIComponent(String(r.periode))}`} title={String(r.periode)}>{lang === 'id' ? 'Slip 1 periode' : 'All in period'}</Link>
    </>} />
}
export const BiayaPage = () => { const { t } = useT(); return <CrudPage table="biaya_lain" title={t('biaya_lain')} fields={F_BIAYA} orderBy="tanggal" /> }
export const KaryawanPage = () => { const { t } = useT(); return <CrudPage table="karyawan" title={t('karyawan')} fields={F_KARYAWAN} /> }
export const SupplierPage = () => { const { t } = useT(); return <CrudPage table="supplier" title={t('supplier')} fields={F_SUPPLIER} /> }
export const KlienPage = () => { const { t } = useT(); return <CrudPage table="klien" title={t('klien')} fields={F_KLIEN} /> }
export const ManualPage = () => { const { t } = useT(); return <CrudPage table="jurnal_manual" title={t('jurnal_manual')} hint={t('hint_manual')} fields={F_MANUAL} orderBy="tanggal" /> }
