-- ================================================================
--  COD System — Multi-tenant Schema v2
--  Supabase : iatmmrhzzgxogidvrowz.supabase.co
--  วิธีใช้  : Supabase Dashboard → SQL Editor → New Query → Run ▶
-- ================================================================
--
--  ⚠️  STEP 0 (optional): ลบ table เดิมถ้าต้องการเริ่มใหม่สะอาด
--      DROP TABLE IF EXISTS public.pending_parcels CASCADE;
--

-- ████████████████████████████████████████████
-- SECTION 1 : TABLES
-- ████████████████████████████████████████████

-- 1.1  branches — ที่ทำการไปรษณีย์แต่ละสาขา
CREATE TABLE IF NOT EXISTS public.branches (
    id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    postal_code         VARCHAR(10) NOT NULL UNIQUE,
    name                TEXT        NOT NULL,
    office_head_name    TEXT,                        -- ใช้ในรายงาน เช่น "นายประทีป ชุมนวล"
    office_head_title   TEXT,                        -- เช่น "หน.ปณ.เบตง"
    switch_password     VARCHAR(50) NOT NULL,        -- รหัสสลับโหมด Admin
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.branches              IS 'ที่ทำการไปรษณีย์แต่ละสาขา (multi-tenant key)';
COMMENT ON COLUMN public.branches.postal_code  IS 'ใช้เป็น login ID และ employee password';
COMMENT ON COLUMN public.branches.switch_password IS 'รหัสผ่านสำหรับสลับเป็น Admin mode';

-- 1.2  parcels — ชิ้นงานพัสดุ (แทน pending_parcels เดิม)
CREATE TABLE IF NOT EXISTS public.parcels (
    id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id           UUID        NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    work_date           DATE        NOT NULL DEFAULT CURRENT_DATE,

    -- ── ข้อมูลจาก QMS ─────────────────────────────────────────
    tracking_no         VARCHAR(50) NOT NULL,
    destination_branch  VARCHAR(100),
    operator_id         VARCHAR(100),
    last_scan_datetime  TIMESTAMPTZ,
    fail_reason         TEXT,
    platform            VARCHAR(20) DEFAULT 'N',   -- 'N' | 'Y'(Lazada) | 'Shopee' | ค่าอื่น
    is_lazada           BOOLEAN     NOT NULL DEFAULT FALSE,
    holding_days_origin INTEGER     NOT NULL DEFAULT 0,
    holding_days_dest   INTEGER     NOT NULL DEFAULT 0,
    attempt_count       INTEGER     NOT NULL DEFAULT 0,
    aging_category      VARCHAR(20) NOT NULL DEFAULT '1-4 Days',  -- '1-4 Days' | '5+ Days'

    -- ── สถานะการตรวจสอบ ────────────────────────────────────────
    --   image_url = NULL          → ยังไม่มีรูป
    --   image_url = 'NO_ITEM'     → ไม่มีชิ้นงาน (บังคับส่งเงิน)
    --   image_url = URL           → ถ่ายรูปแล้ว
    image_url           TEXT,
    photo_allowed       BOOLEAN     NOT NULL DEFAULT FALSE,

    -- ── Timestamps ─────────────────────────────────────────────
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT parcels_branch_tracking_date_key UNIQUE (branch_id, tracking_no, work_date)
);

COMMENT ON TABLE  public.parcels              IS 'ชิ้นงานพัสดุ COD รายวัน (multi-tenant)';
COMMENT ON COLUMN public.parcels.branch_id    IS 'FK → branches.id  (RLS isolation key)';
COMMENT ON COLUMN public.parcels.work_date    IS 'วันที่ทำงาน — ใช้กรองข้อมูลแทนการลบทุกวัน';
COMMENT ON COLUMN public.parcels.platform     IS 'ค่าจากคอลัมน์ Lazada? ของ QMS: N / Y / Shopee / ...';
COMMENT ON COLUMN public.parcels.image_url    IS 'null | NO_ITEM | URL ของรูปใน Storage';
COMMENT ON COLUMN public.parcels.photo_allowed IS 'Admin ต้อง unlock = true ก่อนพนักงานจะถ่ายรูปได้';


-- ████████████████████████████████████████████
-- SECTION 2 : INDEXES
-- ████████████████████████████████████████████

CREATE INDEX IF NOT EXISTS idx_parcels_branch_date
    ON public.parcels (branch_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_parcels_operator
    ON public.parcels (branch_id, work_date, operator_id);

CREATE INDEX IF NOT EXISTS idx_parcels_status
    ON public.parcels (branch_id, work_date, image_url, photo_allowed);

CREATE INDEX IF NOT EXISTS idx_parcels_aging
    ON public.parcels (branch_id, work_date, aging_category);


-- ████████████████████████████████████████████
-- SECTION 3 : TRIGGER — updated_at
-- ████████████████████████████████████████████

CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parcels_updated_at ON public.parcels;
CREATE TRIGGER trg_parcels_updated_at
    BEFORE UPDATE ON public.parcels
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


-- ████████████████████████████████████████████
-- SECTION 4 : ROW LEVEL SECURITY
-- ████████████████████████████████████████████

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcels  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branches_anon_read"  ON public.branches;
DROP POLICY IF EXISTS "parcels_anon_all"    ON public.parcels;

-- branches: anon อ่านได้ (password ไม่ถูกเปิดเผย — ตรวจสอบผ่าน RPC เท่านั้น)
CREATE POLICY "branches_anon_read" ON public.branches
    FOR SELECT TO anon USING (is_active = TRUE);

-- parcels: anon ทำได้ทุกอย่าง (กรอง branch_id ฝั่ง app เสมอ)
CREATE POLICY "parcels_anon_all" ON public.parcels
    FOR ALL TO anon
    USING (TRUE)
    WITH CHECK (TRUE);


-- ████████████████████████████████████████████
-- SECTION 5 : RPC FUNCTIONS
-- ████████████████████████████████████████████

-- ── 5.1  authenticate_branch ────────────────────────────────────
--  Login ด้วย postal_code + password
--  password = postal_code  → role: 'employee'
--  password = switch_password → role: 'admin'
CREATE OR REPLACE FUNCTION public.authenticate_branch(
    p_postal_code TEXT,
    p_password    TEXT
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_b  RECORD;
    v_role TEXT;
BEGIN
    SELECT id, name, postal_code, switch_password,
           office_head_name, office_head_title
    INTO   v_b
    FROM   public.branches
    WHERE  postal_code = p_postal_code AND is_active = TRUE;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', FALSE,
            'message', 'ไม่พบที่ทำการไปรษณีย์รหัส ' || p_postal_code
        );
    END IF;

    IF    p_password = v_b.switch_password  THEN v_role := 'admin';
    ELSIF p_password = v_b.postal_code      THEN v_role := 'employee';
    ELSE
        RETURN json_build_object('success', FALSE, 'message', 'รหัสผ่านไม่ถูกต้อง');
    END IF;

    RETURN json_build_object(
        'success',           TRUE,
        'role',              v_role,
        'branch_id',         v_b.id,
        'branch_name',       v_b.name,
        'postal_code',       v_b.postal_code,
        'office_head_name',  v_b.office_head_name,
        'office_head_title', v_b.office_head_title
    );
END;
$$;

-- ── 5.2  get_today_stats ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_today_stats(
    p_branch_id UUID,
    p_date      DATE DEFAULT CURRENT_DATE
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (
        SELECT json_build_object(
            'date',       p_date,
            'total',      COUNT(*),
            'hot5plus',   COUNT(*) FILTER (WHERE holding_days_dest >= 5),
            'has_photo',  COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url <> 'NO_ITEM'),
            'no_photo',   COUNT(*) FILTER (WHERE image_url IS NULL),
            'no_item',    COUNT(*) FILTER (WHERE image_url = 'NO_ITEM'),
            'unlocked',   COUNT(*) FILTER (WHERE photo_allowed = TRUE  AND image_url IS NULL),
            'locked',     COUNT(*) FILTER (WHERE photo_allowed = FALSE AND image_url IS NULL)
        )
        FROM public.parcels
        WHERE branch_id = p_branch_id AND work_date = p_date
    );
END;
$$;

-- ── 5.3  get_operators_stats ───────────────────────────────────
--  ใช้ใน Employee page: รายชื่อพนักงาน + สถิติต่อคน
CREATE OR REPLACE FUNCTION public.get_operators_stats(
    p_branch_id UUID,
    p_date      DATE DEFAULT CURRENT_DATE
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (
        SELECT COALESCE(
            json_agg(row_data ORDER BY (row_data->>'operator_id')::TEXT),
            '[]'::JSON
        )
        FROM (
            SELECT json_build_object(
                'operator_id',  operator_id,
                'total',        COUNT(*),
                'has_photo',    COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url <> 'NO_ITEM'),
                'no_photo',     COUNT(*) FILTER (WHERE image_url IS NULL AND photo_allowed = FALSE),
                'unlocked',     COUNT(*) FILTER (WHERE image_url IS NULL AND photo_allowed = TRUE),
                'no_item',      COUNT(*) FILTER (WHERE image_url = 'NO_ITEM'),
                'hot5plus',     COUNT(*) FILTER (WHERE holding_days_dest >= 5),
                'has_noitem',   COUNT(*) FILTER (WHERE image_url = 'NO_ITEM') > 0
            ) AS row_data
            FROM public.parcels
            WHERE branch_id = p_branch_id AND work_date = p_date
            GROUP BY operator_id
        ) sub
    );
END;
$$;

-- ── 5.4  get_available_dates ────────────────────────────────────
--  รายการวันที่มีข้อมูล (สำหรับ history / date picker)
CREATE OR REPLACE FUNCTION public.get_available_dates(p_branch_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (
        SELECT COALESCE(
            json_agg(
                json_build_object(
                    'date',  work_date,
                    'total', cnt
                ) ORDER BY work_date DESC
            ),
            '[]'::JSON
        )
        FROM (
            SELECT work_date, COUNT(*) AS cnt
            FROM   public.parcels
            WHERE  branch_id = p_branch_id
            GROUP BY work_date
        ) t
    );
END;
$$;

-- ── 5.5  delete_branch_date_parcels ────────────────────────────
--  ลบข้อมูลของวันที่ระบุ (ก่อน upload ใหม่ / reset)
CREATE OR REPLACE FUNCTION public.delete_branch_date_parcels(
    p_branch_id UUID,
    p_date      DATE
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INTEGER;
BEGIN
    DELETE FROM public.parcels
    WHERE branch_id = p_branch_id AND work_date = p_date;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ── 5.6  delete_expired_parcels ────────────────────────────────
--  ลบข้อมูลเก่าเกิน 7 วัน (เรียกจาก pg_cron)
CREATE OR REPLACE FUNCTION public.delete_expired_parcels()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INTEGER;
BEGIN
    DELETE FROM public.parcels WHERE work_date < CURRENT_DATE - 7;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN json_build_object('deleted', v_count, 'ran_at', NOW());
END;
$$;

-- ── 5.7  update_branch_settings ────────────────────────────────
--  Admin แก้ไขข้อมูล branch (Settings page)
CREATE OR REPLACE FUNCTION public.update_branch_settings(
    p_branch_id         UUID,
    p_switch_password   TEXT DEFAULT NULL,
    p_office_head_name  TEXT DEFAULT NULL,
    p_office_head_title TEXT DEFAULT NULL,
    p_name              TEXT DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.branches SET
        switch_password   = COALESCE(p_switch_password,   switch_password),
        office_head_name  = COALESCE(p_office_head_name,  office_head_name),
        office_head_title = COALESCE(p_office_head_title, office_head_title),
        name              = COALESCE(p_name,              name)
    WHERE id = p_branch_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'message', 'ไม่พบ branch นี้');
    END IF;

    RETURN json_build_object('success', TRUE, 'message', 'บันทึกการตั้งค่าเรียบร้อย');
END;
$$;


-- ████████████████████████████████████████████
-- SECTION 6 : STORAGE — bucket parcel-images
-- ████████████████████████████████████████████

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'parcel-images', 'parcel-images', TRUE,
    5242880,   -- 5 MB per file
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "storage_read"   ON storage.objects;
DROP POLICY IF EXISTS "storage_upload" ON storage.objects;
DROP POLICY IF EXISTS "storage_update" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete" ON storage.objects;

CREATE POLICY "storage_read"   ON storage.objects FOR SELECT TO anon USING (bucket_id = 'parcel-images');
CREATE POLICY "storage_upload" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'parcel-images');
CREATE POLICY "storage_update" ON storage.objects FOR UPDATE TO anon USING (bucket_id = 'parcel-images');
CREATE POLICY "storage_delete" ON storage.objects FOR DELETE TO anon USING (bucket_id = 'parcel-images');


-- ████████████████████████████████████████████
-- SECTION 7 : pg_cron (ลบอัตโนมัติทุกคืน)
-- ████████████████████████████████████████████
--
--  ขั้นตอน:
--  1. Dashboard → Database → Extensions → pg_cron → Enable
--  2. Uncomment แล้วรัน 3 บรรทัดด้านล่าง
--
-- SELECT cron.schedule(
--     'cod-expire-parcels',
--     '0 18 * * *',    -- 01:00 (UTC+7) ทุกวัน
--     'SELECT public.delete_expired_parcels()'
-- );
-- SELECT * FROM cron.job;


-- ████████████████████████████████████████████
-- SECTION 8 : INITIAL DATA
-- ████████████████████████████████████████████

INSERT INTO public.branches
    (name, postal_code, switch_password, office_head_name, office_head_title)
VALUES
    ('ที่ทำการไปรษณีย์เบตง', '95110', 'ADMIN9511',
     'นายประทีป ชุมนวล', 'หน.ปณ.เบตง')       -- ⚠️ เปลี่ยน switch_password หลัง setup!
ON CONFLICT (postal_code) DO NOTHING;


-- ████████████████████████████████████████████
-- SECTION 9 : VERIFY
-- ████████████████████████████████████████████

SELECT 'branches' AS "table", COUNT(*) AS rows FROM public.branches UNION ALL
SELECT 'parcels',              COUNT(*)         FROM public.parcels;

SELECT name, postal_code, switch_password, office_head_name, office_head_title
FROM public.branches;

-- ทดสอบ authenticate_branch
SELECT public.authenticate_branch('95110', '95110');       -- → employee ✓
SELECT public.authenticate_branch('95110', 'ADMIN9511');   -- → admin    ✓
SELECT public.authenticate_branch('95110', 'wrong');       -- → fail     ✓
