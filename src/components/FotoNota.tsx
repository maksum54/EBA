import { useRef, useState } from 'react'
import { useT } from '../lib/i18n'

// Cloudinary: cloud name & unsigned preset bukan rahasia, aman di browser.
// Bisa diganti lewat env VITE_CLOUDINARY_CLOUD / VITE_CLOUDINARY_PRESET.
const CLOUD = (import.meta.env.VITE_CLOUDINARY_CLOUD as string) || 'arhb5wxk'
const PRESET = (import.meta.env.VITE_CLOUDINARY_PRESET as string) || 'eba_nota'

/** Perkecil foto di HP sebelum upload: sisi terpanjang 1600 px, JPEG kualitas 0.75 (±300 KB). */
async function kompres(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const img = await createImageBitmap(file)
  const skala = Math.min(1, 1600 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * skala)
  c.height = Math.round(img.height * skala)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.75))
}

async function upload(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', await kompres(file))
  fd.append('upload_preset', PRESET)
  fd.append('folder', 'eba-finance/nota')
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: 'POST', body: fd })
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error?.message || 'Upload gagal')
  return j.secure_url as string
}

/** Thumbnail kecil dari URL Cloudinary (hemat kuota & cepat dimuat). */
export const thumb = (url: string) => url.replace('/upload/', '/upload/c_fill,w_160,h_160,q_auto,f_auto/')

/**
 * Daftar foto nota + tombol ambil foto (kamera HP) / pilih dari galeri.
 * value = array URL, disimpan sebagai jsonb di database.
 */
export default function FotoNota({ value, onChange, readOnly }: { value: string[]; onChange?: (v: string[]) => void; readOnly?: boolean }) {
  const { t } = useT()
  const kamera = useRef<HTMLInputElement>(null)
  const galeri = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0)
  const [err, setErr] = useState('')

  const pilih = async (files: FileList | null) => {
    if (!files?.length || !onChange) return
    setErr('')
    const list = Array.from(files)
    setBusy(list.length)
    const hasil: string[] = []
    for (const f of list) {
      try { hasil.push(await upload(f)) } catch (e) { setErr((e as Error).message) }
      setBusy((n) => n - 1)
    }
    onChange([...(value || []), ...hasil])
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(value || []).map((u, i) => (
          <div key={u} className="relative">
            <a href={u} target="_blank" rel="noreferrer">
              <img src={thumb(u)} alt={`nota ${i + 1}`} className="h-20 w-20 rounded-md border border-gray-200 object-cover dark:border-gray-700" />
            </a>
            {!readOnly && (
              <button type="button" onClick={() => onChange?.(value.filter((x) => x !== u))}
                className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-eba-600 text-xs leading-5 text-white" aria-label="hapus foto">×</button>
            )}
          </div>
        ))}
        {busy > 0 && <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed text-xs text-gray-500">{t('mengunggah')}</div>}
      </div>
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => kamera.current?.click()}>📷 {t('foto_kamera')}</button>
          <button type="button" className="btn-ghost" onClick={() => galeri.current?.click()}>🖼 {t('foto_galeri')}</button>
          <input ref={kamera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pilih(e.target.files); e.target.value = '' }} />
          <input ref={galeri} type="file" accept="image/*" multiple hidden onChange={(e) => { pilih(e.target.files); e.target.value = '' }} />
        </div>
      )}
      {err && <div className="text-xs text-red-600">{err}</div>}
    </div>
  )
}
