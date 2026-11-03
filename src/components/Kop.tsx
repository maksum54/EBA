// Kop surat PT EBA Karya Mandiri — gambar asli dari "KOP PT-EBA.docx" (tidak diubah).
// Tampil hanya saat dicetak / simpan PDF.
export default function Kop({ judul, sub }: { judul: string; sub?: string }) {
  return (
    <div className="print-only mb-4">
      <img src="/kop-eba.png" alt="Kop PT. EBA Karya Mandiri" className="w-full" />
      <div className="mt-3 text-center">
        <div className="text-base font-bold uppercase">{judul}</div>
        {sub && <div className="text-sm">{sub}</div>}
      </div>
    </div>
  )
}
