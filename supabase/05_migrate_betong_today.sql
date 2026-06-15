-- ================================================================
--  ⚠️  ONE-TIME ONLY — ย้ายข้อมูลระบบเก่า (pending_parcels) → parcels
--  เฉพาะ ปณ.เบตง 95110 · วันที่ 2026-06-15 (วันนี้ที่ระบบใหม่มองเห็น)
--  Supabase Dashboard → SQL Editor → New Query → Run ▶
--
--  หมายเหตุ:
--   • รูปภาพอยู่ bucket เดียวกัน (parcel-images) → image_url ใช้ได้เลย ไม่ต้องถ่ายใหม่
--   • pending_parcels ไม่มี platform → แปลงจาก is_lazada (true→'Y', false→'N')
--   • pending_parcels ไม่มี work_date/branch_id → เติมให้ตอน insert
--   • ON CONFLICT = ถ้ามีแถวเดิมวันนี้อยู่แล้ว จะอัปเดต image_url/รูปทับให้ (กันพลาด)
-- ================================================================

INSERT INTO public.parcels
    (branch_id, work_date, tracking_no, destination_branch, operator_id,
     last_scan_datetime, fail_reason, platform, is_lazada,
     holding_days_origin, holding_days_dest, attempt_count, aging_category,
     image_url, photo_allowed, created_at, updated_at)
SELECT
    '4ad80943-3f4f-4cd1-bf74-9a2a196cdc7d'::uuid,   -- branch_id (95110 เบตง)
    '2026-06-15'::date,                              -- work_date (วันนี้)
    tracking_no, destination_branch, operator_id,
    last_scan_datetime, fail_reason,
    CASE WHEN is_lazada THEN 'Y' ELSE 'N' END,      -- platform
    is_lazada,
    holding_days_origin, holding_days_dest, attempt_count, aging_category,
    image_url, photo_allowed, created_at, updated_at
FROM public.pending_parcels
ON CONFLICT (branch_id, tracking_no, work_date) DO UPDATE
    SET image_url     = EXCLUDED.image_url,
        photo_allowed = EXCLUDED.photo_allowed,
        fail_reason   = EXCLUDED.fail_reason,
        updated_at    = NOW();

-- ── ตรวจผล ──────────────────────────────────────────────────────
SELECT aging_category,
       COUNT(*)                                                     AS total,
       COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url <> 'NO_ITEM') AS มีรูป,
       COUNT(*) FILTER (WHERE image_url = 'NO_ITEM')                AS no_item,
       COUNT(*) FILTER (WHERE image_url IS NULL)                    AS ยังไม่มีรูป
FROM public.parcels
WHERE branch_id = '4ad80943-3f4f-4cd1-bf74-9a2a196cdc7d'
  AND work_date = '2026-06-15'
GROUP BY aging_category;

-- ── ↩️ ยกเลิก/ลบข้อมูลที่ย้ายมา (ถ้าต้องการ rollback) ──────────────
-- DELETE FROM public.parcels
-- WHERE branch_id = '4ad80943-3f4f-4cd1-bf74-9a2a196cdc7d'
--   AND work_date = '2026-06-15';
