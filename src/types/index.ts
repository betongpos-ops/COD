// ── Branch ──────────────────────────────────────────────────────
export interface Branch {
  id: string
  postal_code: string
  name: string
  office_head_name: string | null
  office_head_title: string | null
  controller_name: string | null
  is_active: boolean
  created_at: string
}

// ── Parcel ──────────────────────────────────────────────────────
export interface Parcel {
  id: string
  branch_id: string
  work_date: string            // 'YYYY-MM-DD'
  tracking_no: string
  destination_branch: string | null
  operator_id: string | null
  last_scan_datetime: string | null
  fail_reason: string | null
  platform: string | null      // 'N' | 'Y' | 'Shopee' | other
  is_lazada: boolean
  holding_days_origin: number
  holding_days_dest: number
  attempt_count: number
  aging_category: '1-4 Days' | '5+ Days'
  image_url: string | null     // null | 'NO_ITEM' | URL
  photo_allowed: boolean
  created_at: string
  updated_at: string
}

// Derived parcel status (computed from image_url + photo_allowed)
export type ParcelStatus = 'locked' | 'unlocked' | 'photo_done' | 'no_item'

export function getParcelStatus(p: Pick<Parcel, 'image_url' | 'photo_allowed'>): ParcelStatus {
  if (p.image_url === 'NO_ITEM') return 'no_item'
  if (p.image_url)               return 'photo_done'
  if (p.photo_allowed)           return 'unlocked'
  return 'locked'
}

// ── Auth / Session ───────────────────────────────────────────────
export interface AuthResult {
  success: boolean
  message?: string
  role?: 'admin' | 'employee'
  branch_id?: string
  branch_name?: string
  postal_code?: string
  office_head_name?: string | null
  office_head_title?: string | null
  controller_name?: string | null
}

export interface Session {
  branch_id: string
  branch_name: string
  postal_code: string
  role: 'admin' | 'employee'
  office_head_name: string | null
  office_head_title: string | null
  controller_name: string | null
}

// ── Stats ─────────────────────────────────────────────────────────
export interface TodayStats {
  date: string
  total: number
  hot5plus: number
  has_photo: number
  no_photo: number
  no_item: number
  unlocked: number
  locked: number
}

export interface OperatorStats {
  operator_id: string
  total: number
  has_photo: number
  no_photo: number
  unlocked: number
  no_item: number
  hot5plus: number
  has_noitem: boolean
}

export interface AvailableDate {
  date: string   // 'YYYY-MM-DD'
  total: number
}

// ── Upload ────────────────────────────────────────────────────────
export interface QmsRow {
  tracking_no: string
  destination_branch: string | null
  operator_id: string | null
  last_scan_datetime: string | null
  fail_reason: string | null
  platform: string
  is_lazada: boolean
  holding_days_origin: number
  holding_days_dest: number
  attempt_count: number
  aging_category: '1-4 Days' | '5+ Days'
}
