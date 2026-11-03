import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { rp, tgl, today } from '../lib/format'
import type { Opt } from '../lib/options'
import FotoNota, { thumb } from './FotoNota'

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
}

export default function CrudPage({ table, title, hint, fields, orderBy = 'id', fixed, onFormChange, rowAction }: Props) {
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
    const { data, error } = await q
    if (error) setErr(error.message)
    setRows((data as Row[]) || [])
    // ambil data dropdown relasi (proyek, supplier, karyawan, ...)
    const r: Record<string, Row[]> = {}
    for (const f of fields.filter((f) => f.type === 'ref')) {
      let rq = supabase.from(f.ref!.table).select('*').order('id', { ascending: false })
      for (const [k, v] of Object.entries(f.ref!.filter || {})) rq = rq.eq(k, v as never)
      r[f.key] = ((await rq).data as Row[]) || []
    }
    setRefs(r)
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
    setForm(null)
    load()
  }

  const remove = async (id: number) => {
    if (!confirm(t('yakin_hapus'))) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) setErr(error.message)
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{title}</h1>
        <button className="btn-primary" onClick={() => setForm(blank())}>+ {t('tambah')}</button>
      </div>
      {hint && <p className="text-sm text-gray-500 dark:text-gray-400">{hint}</p>}
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
                ) : (
                  <input className="input"
                    type={f.type === 'money' || f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'}
                    step={f.type === 'money' ? '1' : undefined}
                    value={String(form[f.key] ?? '')} onChange={(e) => setField(f.key, e.target.value)} />
                )}
                {f.type === 'money' && Number(form[f.key]) > 0 && (
                  <span className="mt-0.5 block text-xs text-gray-500">{rp(Number(form[f.key]))}</span>
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
          <thead><tr>{cols.map((f) => <th key={f.key} className="th">{t(f.key)}</th>)}<th className="th" /></tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? (
              <tr><td className="td text-gray-500" colSpan={cols.length + 1}>{t('memuat')}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="td text-gray-500" colSpan={cols.length + 1}>{t('kosong')}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                {cols.map((f) => (
                  <td key={f.key} className={'td ' + (f.type === 'money' ? 'whitespace-nowrap text-right tabular-nums' : '')}>{show(f, r)}</td>
                ))}
                <td className="td whitespace-nowrap text-right">
                  {rowAction?.(r)}
                  <button className="ml-2 text-eba-600 hover:underline" onClick={() => setForm({ ...r })}>{t('ubah')}</button>
                  <button className="ml-2 text-gray-500 hover:text-red-600" onClick={() => remove(r.id)}>{t('hapus')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
