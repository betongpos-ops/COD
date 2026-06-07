# Changelog

## [3.0.0] — มิถุนายน 2569

### เปลี่ยนแปลงหลัก
- ย้าย Hosting จาก **GitHub Pages → Vercel** (auto-deploy จาก `main` branch)
- `base: '/COD/'` → `base: '/'` — ลบ prefix ออก, URL สะอาดขึ้น
- Supabase credentials ย้ายจาก hardcode → **environment variables** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON`)

### UI / Brand
- **Thai Post brand colors** ทุกหน้า รวมทั้งรายงาน:
  - แดง `#ef3e25` (brand red) แทน `#ef4444`
  - น้ำเงิน `#002169` (navy) แทน `#1c2840`
- **Topbar** (Admin + พนักงาน): พื้นหลังเปลี่ยนเป็นสีแดง `#ef3e25`
- **Font**: IBM Plex Sans Thai → **Sarabun** (Google Fonts)
- **Footer ทุกหน้า**: `© 2026 | 95110 · IMRON SAMOH` / `imron.samoh@gmail.com`

### Logo
- Logo CI-compliant (`Topbar-1.png`, `Login card.png`):
  - Logo บนพื้นขาวเท่านั้น
  - พื้นมืด → กรอบขาว rounded รอบ Logo
  - ห้ามยืด/บีบ (`object-fit: contain`)
- **PDF Reports**: Logo แสดงบนหัวรายงานแล้ว — fetch + base64 encode (`FileReader`) เพื่อฝังในหน้า blob URL
- Bug fix: `fetch()` path ผิดเมื่อ `base: '/COD/'` → ใช้ `import.meta.env.BASE_URL` + fallback `/Topbar-1.png`

### Dashboard KPI
- ออกแบบใหม่ (4 tiles) แทน `.stats-bar` เดิม:
  - **Navy** (solid bg) — ยอดพัสดุทั้งหมด
  - **Red** (tinted bg + solid icon) — พัสดุ 5+ วัน
  - **Green** (white + top border) — มีรูปแล้ว
  - **Amber** (white + top border) — รอถ่ายรูป
- ใช้ Font Awesome icons แทน emoji
- แต่ละ tile มีรูปแบบต่างกัน (ไม่ใช่ identical card grid)
- คลิก tile → filter รายการ (เหมือนเดิม)

### เพิ่มใหม่
- **หน้าลงทะเบียนสาขา** (`register.html` + `src/pages/register.ts`): ผู้จัดการสาขาใหม่สมัครใช้งานเองได้
- **SQL** `supabase/03_register_branch.sql`: RPC `register_branch(...)` สำหรับหน้า register
- **`src/vite-env.d.ts`**: `/// <reference types="vite/client" />` แก้ TypeScript error `TS2339: Property 'env' does not exist on type 'ImportMeta'`
- **Admin management dropdown** (☰): รวม actions (ตั้งค่า, ลงทะเบียน ปณ. ใหม่, ออกจากระบบ) ไว้ที่เดียว
- **Link ลงทะเบียน ปณ. ใหม่** บนหน้า Login

### ปรับปรุง
- GitHub Actions workflow (`deploy.yml`): ลบ `on.push.branches: [main]` ออก — ใช้ `workflow_dispatch` เท่านั้น (Vercel จัดการ deploy แทน)
- `src/lib/auth.ts`: ลบ type workaround `(import.meta as unknown as ...)` หลัง `vite-env.d.ts` จัดการ types ให้
- CSS: ลบ `border-bottom` สีแดงออกจาก Topbar → `rgba(0,0,0,.14)` (ลด visual noise)
- CSS: ปรับสี `.brand-sub`, `.brand-branch`, `.btn-hamburger`, `.topbar-mode-btn`, `.topbar-mgmt-btn` สำหรับ Topbar สีแดง

---

## [2.0.0] — มิถุนายน 2569

### เปลี่ยนแปลงหลัก (Breaking Changes)
- ย้ายจาก Google Apps Script → **Vite + TypeScript**
- ย้ายจากระบบสาขาเดียว → **Multi-tenant** (หลายสาขา)
- URL ใหม่: `https://betongpos-ops.github.io/COD/`

### เพิ่มใหม่
- **Multi-tenant**: แยกข้อมูลต่อสาขาด้วย `branch_id` + Row Level Security
- **หน้า Login**: เลือกสาขา → เลือกโหมด (3 steps)
- **หน้าตั้งค่า** (`settings.html`): แก้ไขข้อมูลสาขา, เปลี่ยนรหัสผ่าน
- **Date bar**: ดูข้อมูลย้อนหลัง 7 วัน โดยไม่ต้องลบข้อมูลทุกวัน
- **Upload แยก category**: อัปโหลด 1-4 วัน ไม่กระทบ 5+ วัน
- **Platform badges**: แสดง Lazada (สีม่วง) และ Shopee (สีส้ม) แยกกัน
- **Logout button**: ทั้งหน้า Admin และพนักงาน
- **ชื่อไฟล์ Export**: `XXXXX_ติดตาม COD ค้าง 1-4 และ 5 วัน (D-M-YY).xlsx`

### แก้ไข
- Group View: "อนุญาตทั้งกลุ่ม" unlock ทุก category (ไม่แยก tab 1-4/5+)
- หน้าพนักงาน: ลบ badge ไฟ 🔥 5+ วัน ออก
- Storage path: เปลี่ยนเป็น `{branch_id}/{work_date}/{tracking_no}_{ts}.jpg`
- CSS contrast ตาม WCAG AA: `#9ca3af` → `#6b7280`
- Fix overflow ของ stat cards
- เพิ่ม `.nojekyll` ใน deploy workflow แก้ CSS ไม่โหลดบน GitHub Pages

### Database
- ตารางใหม่: `branches` (แทน config แบบ hardcode)
- ตารางใหม่: `parcels` (แทน `pending_parcels`, เพิ่ม `branch_id`, `work_date`, `platform`)
- Unique constraint: `(branch_id, tracking_no, work_date)`
- RPC functions ใหม่: 7 functions
- Storage bucket: `parcel-images`

---

## [1.0.0] — 2568

### ระบบแรก (Google Apps Script)
- Google Apps Script + Google Sheets
- Supabase สำหรับ Storage รูปภาพ
- สาขาเดียว: ปณ.เบตง 95110
- หน้า Admin (`Index.html`) + หน้าพนักงาน (`Employee.html`)
- ลบข้อมูลทุกเช้า แล้ว upload ใหม่
- Export .xlsx พร้อมรูปภาพ (ExcelJS)
- พิมพ์รายงาน A4 + รายงานเร่งส่งเงิน (มีบาร์โค้ด)
