import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseReady } from './lib/supabase'
import { useT } from './lib/i18n'
import Layout from './components/Layout'
import SlipGaji from './pages/SlipGaji'
import Login, { SandiBaru } from './pages/Login'
import Dashboard from './pages/Dashboard'
import ProyekDetail from './pages/ProyekDetail'
import Laporan from './pages/Laporan'
import Pembelian from './pages/Pembelian'
import GajiMingguan from './pages/GajiMingguan'
import GajiBulanan from './pages/GajiBulanan'
import {
  BiayaPage, GajiPage, KaryawanPage, KasbonPage, KlienPage, ManualPage, ProyekPage, RealisasiPage, SupplierPage, TerminPage,
} from './pages/modules'

export default function App() {
  const { t } = useT()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [pulih, setPulih] = useState(false)  // datang dari link "lupa kata sandi"

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((e, s) => { setSession(s); if (e === 'PASSWORD_RECOVERY') setPulih(true) })
    return () => data.subscription.unsubscribe()
  }, [])

  if (!supabaseReady) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card max-w-md space-y-2">
          <img src="/logo-eba.png" alt="EBA" className="h-12" />
          <h1 className="font-bold">{t('setup_title')}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">{t('setup_body')}</p>
        </div>
      </div>
    )
  }
  if (!ready) return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 dark:bg-gray-950">
      <img src="/icons/icon-192.png" alt="EBA" className="h-16 w-16 animate-pulse rounded-2xl" />
    </div>
  )
  if (!session) return <Login />
  if (pulih) return <SandiBaru selesai={() => setPulih(false)} />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout email={session.user.email || ''} />}>
          <Route index element={<Dashboard />} />
          <Route path="proyek" element={<ProyekPage />} />
          <Route path="proyek/:id" element={<ProyekDetail />} />
          <Route path="termin" element={<TerminPage />} />
          <Route path="pembelian" element={<Pembelian />} />
          <Route path="kasbon" element={<KasbonPage />} />
          <Route path="realisasi" element={<RealisasiPage />} />
          <Route path="gaji" element={<GajiPage />} />
          <Route path="slip" element={<SlipGaji />} />
          <Route path="gaji-mingguan" element={<GajiMingguan />} />
          <Route path="gaji-bulanan" element={<GajiBulanan />} />
          <Route path="biaya" element={<BiayaPage />} />
          <Route path="manual" element={<ManualPage />} />
          <Route path="karyawan" element={<KaryawanPage />} />
          <Route path="supplier" element={<SupplierPage />} />
          <Route path="klien" element={<KlienPage />} />
          <Route path="laporan" element={<Laporan />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
