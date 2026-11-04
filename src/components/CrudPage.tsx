import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, tgl, today } from '../lib/format'
import type { Opt } from '../lib/options'
import FotoNota, { thumb } from './FotoNota'
import { MoneyInput, QtyInput } from './NumInput'
import { ambilRef, segarkan } from '../lib/cache'

/**
 * Halaman tabel + form generik. Setiap modul (proyek, termin, pembelian, dst.)
 * cukup mendefinisikan daftar kolomnya; tambah/ubah/hapus ditangani di sini.
 * Jurnal akuntansi dibuat otomatis oleh trigger di database.
 */
type Row = Record<string, unknown> & { id: number }

export type Field = {
  key: string
  type: 'text' | 'number' | 'money' | 'date' | 'select' | 'ref' | 'bool' | 'url' | 'photos'
  options?: Opt[]                 // untuk 'select'
  ref?: { table: string; label: (r: Row) => string; nullLabel?: string; filter?: Record<string, unknown> } // untuk 'ref'
  required?: boolean
  readOnly?: boolean               // hanya ditampilkan (contoh: kolom generated)
  hideInTable?: boolean
  defaultValue?: unknown
}

type Props = {
  table: string
  title: string
  hint?: string
  fields: Field[]
  orderBy?: string
  fixed?: Record<string, unknown>  // filter + nilai tetap, contoh { proyek_id: 5 }
  onFormChange?: (form: Record<string, unknown>, changedKey: string) => Record<string, unknown>
  rowAction?: (r: Row) => React.ReactNode
  filterKey?: string   // kolom 'select' yang dipakai sebagai tombol filter (mis. 'status')
  search?: boolean     // tampilkan kotak cari
  filters?: string[]   // kolom yang diberi dropdown filter (nilai diambil dari data)
  total?: boolean      // tampilkan baris total untuk kolom uang
}

export default function CrudPage({ table, title, hint, fields, orderBy = 'id', fixed, onFormChange, rowAction, filterKey, search, filters = [], total }: Props) {
  const { t, lang } = useT()
  const [rows, setRows] = useState<Row[]>([])
  const [refs, setRefs] = useState<Record<string, Row[]>>({})
  const [form, setForm] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const fixedKey = JSON.stringify(fixed || {})

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from(table).select('*').order(orderBy, { ascending: false })
    for (const [k, v] of Object.entries(JSON.parse(fixedKey))) q = q.eq(k, v as never)
    // Ambil data utama + semua dropdown relasi SEKALIGUS (paralel), dropdown dari cache.
    const refFields = fields.filter((f) => f.type === 'ref')
    const [main, ...refData] = await Promise.all([
      q,
      ...refFields.map((f) => ambilRef(f.ref!.table, f.ref!.filter)),
    ])
    const { data, error } = main as { data: Row[] | null; error: { message: string } | null }
    if (error) setErr(error.message)
    setRows(data || [])
    setRefs(Object.fromEntries(refFields.map((f, i) => [f.key, refData[i] as Row[]])))
    setLoading(false)
  }, [table, orderBy, fixedKey, fields])

  useEffect(() => { load() }, [load])

  const blank = () => {
    const f: Record<string, unknown> = {}
    for (const fl of fields) {
      if (fl.readOnly) continue
      f[fl.key] = fl.defaultValue ?? (fl.type === 'date' ? today() : fl.type === 'bool' ? true : fl.type === 'photos' ? [] :
        fl.type === 'select' ? fl.options?.[0]?.v : fl.type === 'money' || fl.type === 'number' ? 0 : '')
    }
    return f
  }

  const setField = (k: string, v: unknown) => {
    setForm((prev) => {
      let next = { ...prev, [k]: v }
      if (onFormChange) next = onFormChange(next, k)
      return next
    })
  }

  const save = async () => {
    if (!form) return
    setErr('')
    const payload: Record<string, unknown> = { ...fixed }
    for (const fl of fields) {
      if (fl.readOnly) continue
      let v = form[fl.key]
      if (v === '' || v === undefined) v = null
      if ((fl.type === 'money' || fl.type === 'number') && v !== null) v = Number(v)
      if (fl.type === 'ref' && v !== null) v = Number(v)
      payload[fl.key] = v
    }
    const id = form.id as number | undefined
    const { error } = id
      ? await supabase.from(table).update(payload).eq('id', id)
      : await supabase.from(table).insert(payload)
    if (error) { setErr(error.message); return }
    segarkan(table)
    setForm(null)
    load()
  }

  const remove = async (id: number) => {
    if (!confirm(t('yakin_hapus'))) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) setErr(error.message)
    segarkan(table)
    load()
  }

  const optLabel = (f: Field, v: unknown) => f.options?.find((o) => o.v === v)?.[lang] ?? String(v ?? '-')
  const refLabel = (f: Field, v: unknown) => {
    if (v === null || v === undefined) return f.ref?.nullLabel ? t(f.ref.nullLabel) : '-'
    const r = refs[f.key]?.find((x) => x.id === v)
    return r ? f.ref!.label(r) : '#' + v
  }
  const show = (f: Field, r: Row) => {
    const v = r[f.key]
    switch (f.type) {
      case 'money': return rp(v as number)
      case 'date': return tgl(v as string)
      case 'select': return optLabel(f, v)
      case 'ref': return refLabel(f, v)
      case 'bool': return v ? '✓' : '—'
      case 'photos': return <div className="flex gap-1">{((v as string[]) || []).slice(0, 3).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={thumb(u)} alt="nota" className="h-8 w-8 rounded object-cover" /></a>)}</div>
      case 'url': return v ? <a className="text-eba-600 underline" href={String(v)} target="_blank" rel="noreferrer">nota</a> : '-'
      default: return String(v ?? '-')
    }
  }

  const cols = fields.filter((f) => !f.hideInTable && !(fixed && f.key in fixed))

  // ---- filter & pencarian (di browser, cepat) ----
  const fField = filterKey ? fields.find((f) => f.key === filterKey) : undefined
  const simpanKey = 'eba-filter-' + table
  const [fVal, setFVal] = useState<string>(() => { try { return localStorage.getItem(simpanKey) || '' } catch { return '' } })
  const pilihF = (v: string) => { setFVal(v); try { localStorage.setItem(simpanKey, v) } catch { /* abaikan */ } }
  const [cari, setCari] = useState('')
  const [dd, setDd] = useState<Record<string, string>>({})   // nilai dropdown filter
  const ddFields = filters.map((k) => fields.find((f) => f.key === k)).filter(Boolean) as Field[]
  const labelOf = (f: Field, v: unknown) => f.type === 'ref' ? refLabel(f, v) : f.type === 'select' ? optLabel(f, v) : f.type === 'date' ? tgl(v as string) : String(v ?? '-')
  const tampil = rows.filter((r) => {
    if (fField && fVal && r[fField.key] !== fVal) return false
    for (const f of ddFields) if (dd[f.key] && String(r[f.key] ?? '') !== dd[f.key]) return false
    if (!cari.trim()) return true
    const q = cari.toLowerCase()
    return cols.some((f) => {
      const v = f.type === 'ref' ? refLabel(f, r[f.key]) : f.type === 'select' ? optLabel(f, r[f.key]) : r[f.key]
      return String(v ?? '').toLowerCase().includes(q)
    })
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{title}</h1>
        <button className="btn-primary" onClick={() => setForm(blank())}>+ {t('tambah')}</button>
      </div>
      {hint && <p className="text-sm text-gray-500 dark:text-gray-400">{hint}</p>}
      {(fField || search || ddFields.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {fField && [{ v: '', id: 'Semua', en: 'All' }, ...(fField.options || [])].map((o) => (
            <button key={o.v} onClick={() => pilihF(o.v)}
              className={`rounded-full border px-3 py-1 transition ${fVal === o.v
                ? 'border-eba-600 bg-eba-600 text-white'
                : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
              {o[lang]} <span className="opacity-70">{o.v ? rows.filter((r) => r[fField.key] === o.v).length : rows.length}</span>
            </button>
          ))}
          {ddFields.map((f) => {
            const vals = [...new Set(rows.map((r) => String(r[f.key] ?? '')))]
              .map((v) => [v, v === '' ? labelOf(f, null) : labelOf(f, f.type === 'ref' ? Number(v) : v)] as [string, string])
              .sort((a, b) => f.key === 'periode' ? 0 : a[1].localeCompare(b[1]))
            return (
              <select key={f.key} className={`input w-auto max-w-[16rem] ${dd[f.key] ? 'border-eba-500 ring-1 ring-eba-500/30' : ''}`}
                value={dd[f.key] || ''} onChange={(e) => setDd((x) => ({ ...x, [f.key]: e.target.value }))}>
                <option value="">{t(f.key)}: {lang === 'id' ? 'Semua' : 'All'}</option>
                {vals.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )
          })}
          {Object.values(dd).some(Boolean) && <button className="text-xs text-gray-500 hover:text-eba-600" onClick={() => setDd({})}>✕ {lang === 'id' ? 'Reset filter' : 'Clear filters'}</button>}
          {search && <input className="input ml-auto w-full max-w-xs" placeholder={'🔍 ' + t('cari')} value={cari} onChange={(e) => setCari(e.target.value)} />}
        </div>
      )}
      {err && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err}</div>}

      {form && (
        <div className="card space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.filter((f) => !f.readOnly && !(fixed && f.key in fixed)).map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{t(f.key)}{f.required && ' *'}</span>
                {f.type === 'select' ? (
                  <select className="input" value={String(form[f.key] ?? '')} onChange={(e) => setField(f.key, e.target.value)}>
                    {f.options!.map((o) => <option key={o.v} value={o.v}>{o[lang]}</option>)}
                  </select>
                ) : f.type === 'ref' ? (
                  <select className="input" value={String(form[f.key] ?? '')} onChange={(e) => setField(f.key, e.target.value)}>
                    <option value="">{t(f.ref?.nullLabel || 'pilih')}</option>
                    {(refs[f.key] || []).map((r) => <option key={r.id} value={r.id}>{f.ref!.label(r)}</option>)}
                  </select>
                ) : f.type === 'photos' ? (
                  <FotoNota value={(form[f.key] as string[]) || []} onChange={(v) => setField(f.key, v)} />
                ) : f.type === 'bool' ? (
                  <input type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => setField(f.key, e.target.checked)} />
                ) : f.type === 'money' ? (
                  <MoneyInput className="input text-right" value={form[f.key] as number} onChange={(v) => setField(f.key, v)} />
                ) : f.type === 'number' ? (
                  <QtyInput value={form[f.key] as number} onChange={(v) => setField(f.key, v)} />
                ) : (
                  <input className="input"
                    type={f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'}
                    value={String(form[f.key] ?? '')} onChange={(e) => setField(f.key, e.target.value)} />
                )}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save}>{t('simpan')}</button>
            <button className="btn-ghost" onClick={() => setForm(null)}>{t('batal')}</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead><tr>{cols.map((f) => <th key={f.key} className={'th ' + (f.type === 'money' ? 'text-right' : f.type === 'bool' ? 'text-center' : '')}>{t(f.key)}</th>)}<th className="th" /></tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? (
              <tr><td className="td text-gray-500" colSpan={cols.length + 1}>{t('memuat')}</td></tr>
            ) : tampil.length === 0 ? (
              <tr><td className="td text-gray-500" colSpan={cols.length + 1}>{t('kosong')}</td></tr>
            ) : tampil.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                {cols.map((f) => (
                  <td key={f.key} className={'td ' + (f.type === 'money' ? 'whitespace-nowrap text-right tabular-nums' : f.type === 'bool' ? 'text-center' : '')}>{show(f, r)}</td>
                ))}
                <td className="td whitespace-nowrap text-right">
                  {rowAction?.(r)}
                  <button className="ml-2 text-eba-600 hover:underline" onClick={() => setForm({ ...r })}>{t('ubah')}</button>
                  <button className="ml-2 text-gray-500 hover:text-red-600" onClick={() => remove(r.id)}>{t('hapus')}</button>
                </td>
              </tr>
            ))}
          </tbody>
          {total && tampil.length > 0 && (
            <tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold dark:border-gray-600 dark:bg-gray-800/60">
              {cols.map((f, i) => (
                <td key={f.key} className={'td ' + (f.type === 'money' ? 'whitespace-nowrap text-right tabular-nums' : '')}>
                  {f.type === 'money' ? rp(tampil.reduce((a, r) => a + Number(r[f.key] || 0), 0))
                    : i === 0 ? <>{t('total')} <span className="text-xs font-normal text-gray-500">({tampil.length})</span></> : ''}
                </td>
              ))}<td className="td" />
            </tr></tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
