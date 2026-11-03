// Kop surat PT EBA Karya Mandiri — tampil hanya saat dicetak / simpan PDF.
export default function Kop({ judul, sub }: { judul: string; sub?: string }) {
  return (
    <div className="print-only mb-4">
      <div className="flex items-center gap-4 border-b-4 border-eba-600 pb-2">
        <img src="/logo-eba.png" alt="EBA" className="h-16" />
        <div className="text-xs leading-tight">
          <div className="text-lg font-bold">PT. EBA KARYA MANDIRI</div>
          <div className="italic">Engineering · Build · Contractor</div>
          <div>Jl. H. Kelot 2, No.19A, Larangan Selatan, Larangan, Kota Tangerang – Banten 15154</div>
          <div>E-mail: info@pt-eba.com · Website: pt-eba.com · Telp.: 0856-1217-007 / 0813-8237-7307</div>
          <div>NPWP: 1000 0000 0987 8198</div>
        </div>
      </div>
      <div className="mt-3 text-center">
        <div className="text-base font-bold uppercase">{judul}</div>
        {sub && <div className="text-sm">{sub}</div>}
      </div>
    </div>
  )
}
