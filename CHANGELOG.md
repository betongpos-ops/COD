# Changelog

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
