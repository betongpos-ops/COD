export const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string
export const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON as string

// Image storage path: {branch_id}/{work_date}/{tracking_no}_{ts}.jpg
export const STORAGE_BUCKET = 'parcel-images'

// Data retention
export const DATA_KEEP_DAYS = 7
