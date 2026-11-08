import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, Building2, ClipboardList, CreditCard, FileText, HandCoins, LayoutDashboard, LogOut, Menu, Moon, Receipt, Search, ShoppingCart, Sun, Truck, Users, Wallet, Wrench, BookOpen, CalendarDays, Briefcase } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CariCepat, ProgresRute, UIHost } from './UI'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { applyTheme, getTheme } from '../lib/theme'

const NAV: { group: string; items: [string, string][] }[] = [
  { group: '', items: [['/', 'dashboard'], ['/proyek', 'proyek'], ['/laporan', 'laporan']] },
  { group: 'transaksi', items: [['/status-bayar', 'status_pembayaran'], ['/termin', 'termin'], ['/pembelian', 'pembelian'], ['/kasbon', 'kasbon'],
    ['/realisasi', 'realisasi'], ['/gaji-mingguan', 'gaji_mingguan'], ['/gaji-bulanan', 'gaji_bulanan'], ['/gaji', 'penggajian'], ['/biaya', 'biaya_lain'], ['/manual', 'jurnal_manual']] },
  { group: 'master', items: [['/karyawan', 'karyawan'], ['/supplier', 'supplier'], ['/klien', 'klien']] },
]

const IKON: Record<string, LucideIcon> = {
  '/': LayoutDashboard, '/proyek': Briefcase, '/laporan': BarChart3, '/status-bayar': ClipboardList, '/termin': FileText,
  '/pembelian': ShoppingCart, '/kasbon': HandCoins, '/realisasi': Receipt, '/gaji-mingguan': CalendarDays, '/gaji-bulanan': Wallet,
  '/gaji': CreditCard, '/biaya': Wrench, '/manual': BookOpen, '/karyawan': Users, '/supplier': Truck, '/klien': Building2,
}

export default function Layout({ email }: { email: string }) {
  const { t, lang, setLang } = useT()
  const [theme, setTheme] = useState(getTheme())
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const toggleTheme = () => { const n = theme === 'dark' ? 'light' : 'dark'; setTheme(n); applyTheme(n) }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <ProgresRute /><UIHost /><CariCepat />
      <header className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <button className="btn-ghost md:hidden" onClick={() => setOpen(!open)} aria-label="menu"><Menu className="h-4 w-4" /></button>
          <img src="/logo-eba.png" alt="EBA" className="h-8" />
          <span className="font-semibold">Finance</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button className="btn-ghost hidden text-gray-500 sm:inline-flex" onClick={() => window.dispatchEvent(new Event('buka-cari'))} title="Cari cepat">
            <Search className="h-4 w-4" /> {lang === 'id' ? 'Cari…' : 'Search…'} <kbd className="ml-2 rounded border border-gray-300 px-1 text-[10px] dark:border-gray-600">Ctrl K</kbd>
          </button>
          <button className="btn-ghost sm:hidden" onClick={() => window.dispatchEvent(new Event('buka-cari'))} aria-label="cari"><Search className="h-4 w-4" /></button>
          <span className="hidden text-gray-500 lg:inline">{email}</span>
          <button className="btn-ghost" onClick={() => setLang(lang === 'id' ? 'en' : 'id')}>{lang === 'id' ? 'EN' : 'ID'}</button>
          <button className="btn-ghost" onClick={toggleTheme}>{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4" /><span className="hidden sm:inline">{t('logout')}</span></button>
        </div>
      </header>
      <div className="flex">
        {open && <div className="no-print fixed inset-0 top-[49px] z-20 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}
        <nav className={`no-print ${open ? "block" : "hidden"} fixed left-0 top-[49px] z-30 h-[calc(100dvh-49px)] shadow-lg md:sticky md:z-auto md:shadow-none w-56 shrink-0 self-start overflow-y-auto border-r border-gray-200 bg-white p-3 md:block dark:border-gray-800 dark:bg-gray-900`}>
          {NAV.map((g) => (
            <div key={g.group} className="mb-4">
              {g.group && <div className="mb-1 px-2 text-xs font-semibold uppercase text-gray-400">{t(g.group)}</div>}
              {g.items.map(([to, k]) => (
                <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}
                  className={({ isActive }) => `flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${isActive
                    ? 'bg-eba-50 font-semibold text-eba-700 dark:bg-eba-900/40 dark:text-eba-100'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
                  {(() => { const I = IKON[to]; return I ? <I className="h-4 w-4 shrink-0 opacity-70" /> : null })()}
                  {t(k)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-6"><div key={loc.pathname} className="halaman"><Outlet /></div></main>
      </div>
    </div>
  )
}
