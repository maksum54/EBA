import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'

export default function Login() {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr(error.message)
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <img src="/logo-eba.png" alt="EBA Karya Mandiri" className="mx-auto h-16" />
          <div className="mt-2 text-lg font-bold text-gray-800 dark:text-gray-100">EBA Finance</div>
        </div>
        <input className="input" type="email" placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder={t('password')} value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button className="btn-primary w-full justify-center" disabled={busy}>{t('login')}</button>
      </form>
    </div>
  )
}
