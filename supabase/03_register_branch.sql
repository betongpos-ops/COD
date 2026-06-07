-- ================================================================
--  COD System — Self-service Branch Registration
--  Supabase Dashboard → SQL Editor → New Query → Run ▶
-- ================================================================

-- ── register_branch ──────────────────────────────────────────────
--  สาขาใหม่สมัครใช้งานด้วยตัวเอง ไม่ต้องรัน SQL
--  ตรวจสอบ postal_code ซ้ำ → insert → คืน result
CREATE OR REPLACE FUNCTION public.register_branch(
    p_postal_code       TEXT,
    p_name              TEXT,
    p_office_head_name  TEXT DEFAULT NULL,
    p_office_head_title TEXT DEFAULT NULL,
    p_switch_password   TEXT DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_id UUID;
    v_code TEXT := trim(p_postal_code);
    v_name TEXT := trim(p_name);
    v_pass TEXT := trim(COALESCE(p_switch_password, ''));
BEGIN
    -- Validate
    IF v_code IS NULL OR length(v_code) < 4 THEN
        RETURN json_build_object('success', FALSE, 'message', 'รหัสไปรษณีย์ต้องมีอย่างน้อย 4 หลัก');
    END IF;
    IF v_name IS NULL OR length(v_name) < 3 THEN
        RETURN json_build_object('success', FALSE, 'message', 'กรุณากรอกชื่อที่ทำการอย่างน้อย 3 ตัวอักษร');
    END IF;
    IF length(v_pass) > 0 AND length(v_pass) < 4 THEN
        RETURN json_build_object('success', FALSE, 'message', 'รหัสผ่าน Admin ต้องมีอย่างน้อย 4 ตัวอักษร');
    END IF;
    IF length(v_pass) > 0 AND v_pass = v_code THEN
        RETURN json_build_object('success', FALSE, 'message', 'รหัสผ่าน Admin ต้องไม่เท่ากับรหัสไปรษณีย์');
    END IF;

    -- Check duplicate
    IF EXISTS (SELECT 1 FROM public.branches WHERE postal_code = v_code) THEN
        RETURN json_build_object('success', FALSE, 'message', 'รหัสไปรษณีย์ ' || v_code || ' มีในระบบแล้ว — ติดต่อผู้ดูแลระบบถ้าต้องการรีเซ็ตรหัสผ่าน');
    END IF;

    -- Insert
    INSERT INTO public.branches (
        postal_code, name,
        office_head_name, office_head_title,
        switch_password, is_active
    )
    VALUES (
        v_code, v_name,
        NULLIF(trim(COALESCE(p_office_head_name, '')),  ''),
        NULLIF(trim(COALESCE(p_office_head_title, '')), ''),
        CASE WHEN length(v_pass) > 0 THEN v_pass ELSE v_code || '_ADMIN' END,
        TRUE
    )
    RETURNING id INTO v_id;

    RETURN json_build_object(
        'success',    TRUE,
        'branch_id',  v_id,
        'message',    'สมัครใช้งานสำเร็จ'
    );
END;
$$;

-- ── ทดสอบ ────────────────────────────────────────────────────────
-- SELECT public.register_branch('12345', 'ที่ทำการไปรษณีย์ทดสอบ', 'นายทดสอบ', 'หน.ปณ.ทดสอบ', 'ADMIN1234');
-- SELECT public.register_branch('12345', 'ซ้ำ');   -- → ซ้ำ
-- SELECT public.register_branch('12345', 'xx');    -- → ชื่อสั้น
-- DELETE FROM public.branches WHERE postal_code = '12345';  -- cleanup
