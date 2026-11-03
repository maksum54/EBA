/**
 * Input angka yang ramah pengguna:
 * - Rupiah tampil dengan titik ribuan saat diketik: 1500000 → "1.500.000"
 * - Angka 0 tidak ditampilkan (kotak kosong + placeholder "0"), jadi tidak perlu dihapus dulu
 * - Saat diklik, isi langsung terseleksi → tinggal ketik angka baru
 */
type Props = {
  value: number | string | null | undefined
  onChange: (v: number | '') => void
  className?: string
  placeholder?: string
  decimal?: boolean // untuk hari / jam (boleh 5,5)
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

export function MoneyInput({ value, onChange, className = 'input', placeholder = '0' }: Props) {
  const n = Number(value || 0)
  return (
    <input
      type="text" inputMode="numeric" className={className} placeholder={placeholder}
      value={n ? fmt.format(n) : ''}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '')
        onChange(digits ? Number(digits) : '')
      }}
    />
  )
}

export function QtyInput({ value, onChange, className = 'input', placeholder = '0' }: Props) {
  const v = value === 0 || value === '0' || value == null ? '' : String(value).replace('.', ',')
  return (
    <input
      type="text" inputMode="decimal" className={className} placeholder={placeholder}
      value={v}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.')
        if (raw === '') return onChange('')
        // biarkan "5." sementara diketik
        onChange((raw.endsWith('.') ? raw : Number(raw)) as number)
      }}
    />
  )
}
