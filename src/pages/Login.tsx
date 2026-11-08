import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'

// Halaman login minimalis: kartu kecil di tengah layar + animasi masuk halus.
export default function Login() {
  const { t, lang } = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [lupa, setLupa] = useState(false)   // mode "lupa kata sandi"
  const [info, setInfo] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    setInfo('')
    if (lupa) {
      // Kirim email berisi link reset; link kembali ke aplikasi ini
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      if (error) setErr(error.message)
      else setInfo(lang === 'id' ? 'Link reset sudah dikirim. Cek email Anda (juga folder Spam).' : 'Reset link sent. Check your email (and Spam).')
      setBusy(false); return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr(error.message)
    setBusy(false)
  }

  return (
    <div className="flex min-h-[100dvh] bg-gray-50 dark:bg-gray-950">
      {/* panel kiri (layar lebar): identitas perusahaan dengan gradasi merah EBA */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-eba-700 via-eba-600 to-eba-900 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 animate-blob rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 animate-blob rounded-full bg-black/20 blur-3xl [animation-delay:-6s]" />
        {/* pola garis halus ala gambar teknik */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative animate-masuk">
          <div className="inline-flex rounded-xl bg-white px-4 py-2 shadow-lg"><img src="/logo-eba.png" alt="EBA" className="h-10" /></div>
        </div>
        <div className="relative animate-masuk [animation-delay:150ms]">
          <h1 className="text-4xl font-bold leading-tight">PT. EBA Karya Mandiri</h1>
          <p className="mt-2 text-lg text-white/80">Engineering · Build · Contractor</p>
          <p className="mt-8 max-w-md text-sm leading-relaxed text-white/70">
            {lang === 'id' ? 'Sistem keuangan internal: proyek, pembelian, penggajian, dan laporan dalam satu tempat.' : 'Internal finance system: projects, purchasing, payroll and reports in one place.'}
          </p>
        </div>
        <div className="relative text-xs text-white/50">© {new Date().getFullYear()} PT. EBA Karya Mandiri</div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 animate-blob rounded-full bg-eba-500/10 blur-3xl lg:hidden" />
      <form onSubmit={submit} className="relative w-full max-w-[300px] animate-masuk space-y-3">
        <div className="mb-6 text-center">
          <img src="/logo-eba.png" alt="EBA Karya Mandiri" className="mx-auto h-12 animate-masuk [animation-delay:80ms]" />
          <div className="mt-3 animate-masuk text-sm font-semibold tracking-wide text-gray-700 [animation-delay:160ms] dark:text-gray-200">EBA Finance</div>
        </div>

        <input className="input animate-masuk rounded-lg py-2.5 transition focus:border-eba-500 focus:outline-none focus:ring-2 focus:ring-eba-500/20 [animation-delay:240ms]"
          type="email" autoComplete="email" placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} required />
        {!lupa && <input className="input animate-masuk rounded-lg py-2.5 transition focus:border-eba-500 focus:outline-none focus:ring-2 focus:ring-eba-500/20 [animation-delay:300ms]"
          type="password" autoComplete="current-password" placeholder={t('password')} value={password} onChange={(e) => setPassword(e.target.value)} required />}

        {err && <div className="animate-goyang text-center text-xs text-red-600">{err}</div>}
        {info && <div className="animate-masuk text-center text-xs text-green-700 dark:text-green-400">{info}</div>}

        <button disabled={busy}
          className="btn-primary w-full animate-masuk justify-center rounded-lg py-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 [animation-delay:360ms]">
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : lupa ? (lang === 'id' ? 'Kirim link reset' : 'Send reset link') : t('login')}
        </button>
        <button type="button" onClick={() => { setLupa(!lupa); setErr(''); setInfo('') }}
          className="block w-full animate-masuk text-center text-xs text-gray-500 transition hover:text-eba-600 [animation-delay:400ms]">
          {lupa ? (lang === 'id' ? '← Kembali ke login' : '← Back to login') : (lang === 'id' ? 'Lupa kata sandi?' : 'Forgot password?')}
        </button>

        <p className="animate-masuk pt-4 text-center text-[11px] text-gray-400 [animation-delay:420ms]">PT. EBA Karya Mandiri</p>
      </form>
      </div>
    </div>
  )
}

// Layar "buat kata sandi baru" — muncul setelah pengguna membuka link reset dari email.
export function SandiBaru({ selesai }: { selesai: () => void }) {
  const { lang } = useT()
  const id = lang === 'id'
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (a.length < 8) return setErr(id ? 'Minimal 8 karakter.' : 'At least 8 characters.')
    if (a !== b) return setErr(id ? 'Kata sandi tidak sama.' : 'Passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: a })
    setBusy(false)
    if (error) setErr(error.message); else selesai()
  }
  const cls = 'input rounded-lg py-2.5 focus:border-eba-500 focus:outline-none focus:ring-2 focus:ring-eba-500/20'
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <form onSubmit={submit} className="w-full max-w-[300px] animate-masuk space-y-3">
        <img src="/logo-eba.png" alt="EBA" className="mx-auto mb-4 h-12" />
        <div className="text-center text-sm font-semibold">{id ? 'Buat kata sandi baru' : 'Set a new password'}</div>
        <input className={cls} type="password" autoComplete="new-password" placeholder={id ? 'Kata sandi baru' : 'New password'} value={a} onChange={(e) => setA(e.target.value)} required />
        <input className={cls} type="password" autoComplete="new-password" placeholder={id ? 'Ulangi kata sandi' : 'Repeat password'} value={b} onChange={(e) => setB(e.target.value)} required />
        {err && <div className="animate-goyang text-center text-xs text-red-600">{err}</div>}
        <button disabled={busy} className="btn-primary w-full justify-center rounded-lg py-2.5">{busy ? '…' : (id ? 'Simpan' : 'Save')}</button>
      </form>
    </div>
  )
}
