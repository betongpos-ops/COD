// ── Date helpers ─────────────────────────────────────────────────

export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function formatDateThai(iso: string): string {
  if (!iso) return '-'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function formatDateTimeThai(iso: string | null): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${dd}/${mm}/${yy} ${hh}:${min}`
  } catch {
    return iso
  }
}

// Parse "30/05/2026 18:44" from QMS date column
export function parseQmsDate(s: string | number | null): string | null {
  if (!s) return null
  try {
    const str = String(s).trim()
    const [datePart, timePart] = str.split(' ')
    const [d, m, y] = datePart.split('/')
    return `${y}-${m}-${d}T${timePart ?? '00:00'}:00+07:00`
  } catch {
    return null
  }
}

// Parse "X Day" string from QMS holding_days columns
export function parseDays(s: string | number | null): number {
  if (s == null) return 0
  if (typeof s === 'number') return s
  const n = parseInt(String(s))
  return isNaN(n) ? 0 : n
}

// ── Platform badge ────────────────────────────────────────────────
export type Platform = 'N' | 'Lazada' | 'Shopee' | 'other'

export function normalizePlatform(raw: string | null | undefined): Platform {
  if (!raw || raw === 'N') return 'N'
  const v = raw.trim().toLowerCase()
  if (v === 'y' || v === 'lazada') return 'Lazada'
  if (v === 'shopee')              return 'Shopee'
  return 'other'
}

export function platformBadgeHtml(raw: string | null | undefined): string {
  const p = normalizePlatform(raw)
  if (p === 'N') return ''
  const cls: Record<string, string> = {
    Lazada: 'badge-lazada',
    Shopee: 'badge-shopee',
    other:  'badge-platform',
  }
  return `<span class="badge ${cls[p]}">${p === 'other' ? raw ?? '' : p}</span>`
}

// ── String helpers ────────────────────────────────────────────────
export function normalizeTracking(raw: string | number | null): string {
  return String(raw ?? '').replace(/[\s ​﻿]+/g, '').toUpperCase()
}

export function escJs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// ── Chunk array ───────────────────────────────────────────────────
export function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}
