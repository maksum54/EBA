import { lazy, useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseReady } from './lib/supabase'
import { useT } from './lib/i18n'
import Layout from './components/Layout'
import Login, { SandiBaru } from './pages/Login'
// Tiap halaman dimuat saat dibuka saja, supaya pembukaan pertama ringan.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const StatusBayar = lazy(() => import('./pages/StatusBayar'))
const SlipGaji = lazy(() => import('./pages/SlipGaji'))
const ProyekDetail = lazy(() => import('./pages/ProyekDetail'))
const Laporan = lazy(() => import('./pages/Laporan'))
const Pembelian = lazy(() => import('./pages/Pembelian'))
const GajiMingguan = lazy(() => import('./pages/GajiMingguan'))
const GajiBulanan = lazy(() => import('./pages/GajiBulanan'))
const modul = (n: 'BiayaPage' | 'GajiPage' | 'KaryawanPage' | 'KasbonPage' | 'KlienPage' | 'ManualPage' | 'ProyekPage' | 'RealisasiPage' | 'SupplierPage' | 'TerminPage') =>
  lazy(() => import('./pages/modules').then((m) => ({ default: m[n] })))
const BiayaPage = modul('BiayaPage'), GajiPage = modul('GajiPage'), KaryawanPage = modul('KaryawanPage'), KasbonPage = modul('KasbonPage'), KlienPage = modul('KlienPage')
const ManualPage = modul('ManualPage'), ProyekPage = modul('ProyekPage'), RealisasiPage = modul('RealisasiPage'), SupplierPage = modul('SupplierPage'), TerminPage = modul('TerminPage')

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
          <Route path="status-bayar" element={<StatusBayar />} />
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
