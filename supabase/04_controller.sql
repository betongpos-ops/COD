-- ================================================================
--  COD System — เพิ่ม "ผู้ควบคุมฯ" (controller) สำหรับบัญชีส่งมอบภายใน ป.210
--  Supabase Dashboard → SQL Editor → New Query → Run ▶  (รันครั้งเดียว)
-- ================================================================

-- ── 1. เพิ่มคอลัมน์ controller_name ───────────────────────────────
ALTER TABLE public.branches
    ADD COLUMN IF NOT EXISTS controller_name TEXT;

COMMENT ON COLUMN public.branches.controller_name
    IS 'ชื่อผู้ควบคุมฯ — ช่อง "ถึง" ในบัญชีส่งมอบภายใน (ป.210)';


-- ── 2. authenticate_branch — คืนค่า controller_name เพิ่ม ─────────
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
           office_head_name, office_head_title, controller_name
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
        'office_head_title', v_b.office_head_title,
        'controller_name',   v_b.controller_name
    );
END;
$$;


-- ── 3. update_branch_settings — รับ controller_name เพิ่ม ─────────
CREATE OR REPLACE FUNCTION public.update_branch_settings(
    p_branch_id         UUID,
    p_switch_password   TEXT DEFAULT NULL,
    p_office_head_name  TEXT DEFAULT NULL,
    p_office_head_title TEXT DEFAULT NULL,
    p_name              TEXT DEFAULT NULL,
    p_controller_name   TEXT DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.branches SET
        switch_password   = COALESCE(p_switch_password,   switch_password),
        office_head_name  = COALESCE(p_office_head_name,  office_head_name),
        office_head_title = COALESCE(p_office_head_title, office_head_title),
        name              = COALESCE(p_name,              name),
        controller_name   = COALESCE(p_controller_name,   controller_name)
    WHERE id = p_branch_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'message', 'ไม่พบ branch นี้');
    END IF;

    RETURN json_build_object('success', TRUE, 'message', 'บันทึกการตั้งค่าเรียบร้อย');
END;
$$;


-- ── ทดสอบ ────────────────────────────────────────────────────────
-- SELECT public.update_branch_settings(
--     (SELECT id FROM branches WHERE postal_code = '95110'),
--     NULL, NULL, NULL, NULL, 'นายผู้ควบคุม ตัวอย่าง');
-- SELECT public.authenticate_branch('95110', '95110');   -- → ต้องมี controller_name
