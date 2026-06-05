import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON, STORAGE_BUCKET } from './config'
import type {
  Parcel, Branch, TodayStats, OperatorStats,
  AvailableDate, AuthResult, QmsRow
} from '../types'

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON)

const hdrs = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }

// ── Auth ──────────────────────────────────────────────────────────
export async function authenticateBranch(postalCode: string, password: string): Promise<AuthResult> {
  const { data, error } = await sb.rpc('authenticate_branch', {
    p_postal_code: postalCode,
    p_password:    password,
  })
  if (error) return { success: false, message: error.message }
  return data as AuthResult
}

// ── Parcels ───────────────────────────────────────────────────────
export async function fetchParcels(branchId: string, date: string): Promise<Parcel[]> {
  const { data, error } = await sb
    .from('parcels')
    .select('*')
    .eq('branch_id', branchId)
    .eq('work_date', date)
    .order('holding_days_dest', { ascending: false })
  if (error) throw error
  return (data ?? []) as Parcel[]
}

export async function updateParcel(branchId: string, trackingNo: string, date: string, patch: Partial<Parcel>) {
  const { error } = await sb
    .from('parcels')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('branch_id', branchId)
    .eq('tracking_no', trackingNo)
    .eq('work_date', date)
  if (error) throw error
}

export async function updateParcelsInList(
  branchId: string,
  trackingNos: string[],
  date: string,
  patch: Partial<Parcel>
) {
  const { error } = await sb
    .from('parcels')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('branch_id', branchId)
    .eq('work_date', date)
    .in('tracking_no', trackingNos)
  if (error) throw error
}

export async function deleteParcel(branchId: string, trackingNo: string, date: string) {
  const { error } = await sb
    .from('parcels')
    .delete()
    .eq('branch_id', branchId)
    .eq('tracking_no', trackingNo)
    .eq('work_date', date)
  if (error) throw error
}

export async function upsertParcel(branchId: string, date: string, row: Partial<Parcel>) {
  const { error } = await sb
    .from('parcels')
    .upsert({ ...row, branch_id: branchId, work_date: date }, {
      onConflict: 'branch_id,tracking_no,work_date',
    })
  if (error) throw error
}

// ── Upload (bulk insert after delete today) ───────────────────────
export async function uploadParcels(
  branchId: string,
  date: string,
  rows: QmsRow[],
  category: '1-4 Days' | '5+ Days'
): Promise<number> {
  // Step 1: ลบเฉพาะ aging_category เดียวกัน ไม่แตะ category อื่น
  const { error: delErr } = await sb
    .from('parcels')
    .delete()
    .eq('branch_id', branchId)
    .eq('work_date', date)
    .eq('aging_category', category)
  if (delErr) throw delErr

  // Step 2: insert แบ่ง chunk 200 รายการ
  const records = rows.map(r => ({ ...r, branch_id: branchId, work_date: date }))
  const CHUNK = 200
  for (let i = 0; i < records.length; i += CHUNK) {
    const { error } = await sb.from('parcels').insert(records.slice(i, i + CHUNK))
    if (error) throw error
  }
  return records.length
}

// ── Stats ─────────────────────────────────────────────────────────
export async function fetchTodayStats(branchId: string, date: string): Promise<TodayStats> {
  const { data, error } = await sb.rpc('get_today_stats', {
    p_branch_id: branchId,
    p_date:      date,
  })
  if (error) throw error
  return data as TodayStats
}

export async function fetchOperatorsStats(branchId: string, date: string): Promise<OperatorStats[]> {
  const { data, error } = await sb.rpc('get_operators_stats', {
    p_branch_id: branchId,
    p_date:      date,
  })
  if (error) throw error
  return (data as OperatorStats[]) ?? []
}

export async function fetchAvailableDates(branchId: string): Promise<AvailableDate[]> {
  const { data, error } = await sb.rpc('get_available_dates', { p_branch_id: branchId })
  if (error) throw error
  return (data as AvailableDate[]) ?? []
}

// ── Branch settings ───────────────────────────────────────────────
export async function updateBranchSettings(opts: {
  branchId: string
  switchPassword?: string
  officeHeadName?: string
  officeHeadTitle?: string
  name?: string
}) {
  const { data, error } = await sb.rpc('update_branch_settings', {
    p_branch_id:         opts.branchId,
    p_switch_password:   opts.switchPassword   ?? null,
    p_office_head_name:  opts.officeHeadName   ?? null,
    p_office_head_title: opts.officeHeadTitle  ?? null,
    p_name:              opts.name             ?? null,
  })
  if (error) throw error
  return data
}

// ── Storage ───────────────────────────────────────────────────────
export async function uploadImage(
  branchId: string,
  date: string,
  trackingNo: string,
  blob: Blob
): Promise<string> {
  const fileName = `${branchId}/${date}/${trackingNo}_${Date.now()}.jpg`
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${fileName}`,
    { method: 'POST', headers: { ...hdrs, 'Content-Type': 'image/jpeg' }, body: blob }
  )
  if (!res.ok) throw new Error(`Storage upload failed: ${res.statusText}`)
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${fileName}`
}

export async function deleteImage(path: string) {
  // path = everything after /public/{bucket}/
  const filePath = path.split(`/public/${STORAGE_BUCKET}/`)[1]
  if (!filePath) return
  await sb.storage.from(STORAGE_BUCKET).remove([filePath])
}
