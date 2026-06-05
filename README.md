# ระบบติดตาม COD พัสดุคงค้าง

ระบบสำหรับติดตามและตรวจสอบพัสดุ COD (Cash on Delivery) ที่คงค้างในที่ทำการไปรษณีย์
รองรับหลายสาขา (Multi-tenant) บน Supabase + GitHub Pages

**Live URL:** https://betongpos-ops.github.io/COD/

---

## Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | Vite + TypeScript (Vanilla, ไม่มี Framework) |
| Database | Supabase (PostgreSQL) |
| Storage | Supabase Storage (เก็บรูปภาพ) |
| Hosting | GitHub Pages (via GitHub Actions) |
| Build | Vite MPA (Multi-Page Application) |

---

## หน้าในระบบ

| ไฟล์ | URL | คำอธิบาย |
|---|---|---|
| `index.html` | `/COD/` | หน้า Login เลือกสาขา + โหมด |
| `admin.html` | `/COD/admin.html` | หน้า Admin จัดการพัสดุ |
| `employee.html` | `/COD/employee.html` | หน้าพนักงาน ถ่ายรูปยืนยัน |
| `settings.html` | `/COD/settings.html` | หน้าตั้งค่าสาขา (Admin เท่านั้น) |

---

## โครงสร้างโปรเจกต์

```
COD/
├── .github/
│   └── workflows/
│       └── deploy.yml          # Auto-deploy เมื่อ push ขึ้น main
├── src/
│   ├── types/
│   │   └── index.ts            # TypeScript types ทั้งหมด
│   ├── lib/
│   │   ├── config.ts           # Supabase URL + anon key
│   │   ├── supabase.ts         # API functions ทั้งหมด
│   │   ├── auth.ts             # Session (localStorage)
│   │   ├── compress.ts         # Compress รูปก่อน upload
│   │   └── utils.ts            # Helper functions
│   ├── pages/
│   │   ├── login.ts            # Logic หน้า Login
│   │   ├── admin.ts            # Logic หน้า Admin
│   │   ├── employee.ts         # Logic หน้าพนักงาน
│   │   └── settings.ts         # Logic หน้าตั้งค่า
│   └── styles/
│       └── main.css            # Design system (CSS variables)
├── supabase/
│   └── 02_schema_v2.sql        # SQL script สำหรับสร้าง schema
├── index.html                  # Login page entry
├── admin.html                  # Admin page entry
├── employee.html               # Employee page entry
├── settings.html               # Settings page entry
├── vite.config.ts              # Vite: base=/COD/, MPA input
├── tsconfig.json
└── package.json
```

---

## การทำงานของระบบ

### Flow หลัก (ทุกวัน)

```
ตอนเช้า
  Admin → อัปโหลด Excel จาก QMS (ไฟล์ 1-4 วัน + ไฟล์ 5+ วัน)
         → ระบบ reset เฉพาะ category นั้น แล้ว insert ใหม่

กลางวัน
  Admin → ดูรายการ → กด "อนุญาตถ่ายรูปทั้งกลุ่ม" ต่อพนักงาน
  User  → เปิดหน้าพนักงาน → เลือกชื่อตัวเอง → ถ่ายรูปยืนยัน
  Admin → ถ้าไม่มีชิ้นงานจริง → กด "ไม่มีชิ้นงาน" → บังคับส่งเงิน New CA POS

เย็น
  Admin → Export .xlsx ส่งผู้บังคับบัญชา
         ชื่อไฟล์: XXXXX_ติดตาม COD ค้าง 1-4 และ 5 วัน (D-M-YY).xlsx
```

### สถานะชิ้นงาน (image_url + photo_allowed)

| สถานะ | image_url | photo_allowed | ความหมาย |
|---|---|---|---|
| `locked` | null | false | รออนุญาตจาก Admin |
| `unlocked` | null | true | Admin unlock แล้ว รอพนักงานถ่ายรูป |
| `photo_done` | URL | any | ถ่ายรูปแล้ว ยืนยันมีของ |
| `no_item` | 'NO_ITEM' | false | ไม่มีชิ้นงาน → บังคับส่งเงิน New CA POS |

### Logic สำคัญ
- **พนักงานถ่ายรูปได้ก็ต่อเมื่อ** Admin กด "อนุญาต" ก่อนเท่านั้น
- **หลังถ่ายรูป** → `photo_allowed` reset เป็น `false` อัตโนมัติ (ต้อง unlock ใหม่ถ้าจะถ่ายซ้ำ)
- **Group View** → "อนุญาตทั้งกลุ่ม" จะ unlock ทุก category (ไม่แยก tab)
- **Upload Excel** แยก category อิสระ: อัปโหลด 1-4 วัน ไม่กระทบ 5+ วัน

---

## การ Login

| โหมด | รหัสผ่าน |
|---|---|
| พนักงาน | รหัสไปรษณีย์ของสาขา (เช่น `95110`) |
| Admin | `switch_password` ที่ตั้งค่าใน branches table |

Session เก็บใน `localStorage` key: `cod_session`

---

## Database Schema

### ตาราง `branches` (สาขาไปรษณีย์)
| Column | Type | คำอธิบาย |
|---|---|---|
| `id` | UUID | Primary key |
| `postal_code` | VARCHAR(10) | รหัสไปรษณีย์ (UNIQUE, ใช้เป็น login ID) |
| `name` | TEXT | ชื่อสาขา |
| `office_head_name` | TEXT | ชื่อหัวหน้า (ใช้ในรายงาน) |
| `office_head_title` | TEXT | ตำแหน่ง (เช่น หน.ปณ.เบตง) |
| `switch_password` | VARCHAR(50) | รหัสผ่าน Admin |
| `is_active` | BOOLEAN | เปิด/ปิดการใช้งาน |

### ตาราง `parcels` (ชิ้นงานพัสดุ)
| Column | Type | คำอธิบาย |
|---|---|---|
| `id` | UUID | Primary key |
| `branch_id` | UUID | FK → branches (RLS key) |
| `work_date` | DATE | วันที่ทำงาน (ใช้แทนการลบทุกวัน) |
| `tracking_no` | VARCHAR(50) | หมายเลขพัสดุ |
| `operator_id` | VARCHAR(100) | ชื่อพนักงานจาก QMS |
| `aging_category` | VARCHAR(20) | '1-4 Days' หรือ '5+ Days' |
| `platform` | VARCHAR(20) | 'N' / 'Y'(Lazada) / 'Shopee' |
| `image_url` | TEXT | null / 'NO_ITEM' / URL รูป |
| `photo_allowed` | BOOLEAN | Admin unlock หรือยัง |
| `work_date` | DATE | วันที่อัปโหลด |

**Unique constraint:** `(branch_id, tracking_no, work_date)`

### Storage
- Bucket: `parcel-images`
- Path: `{branch_id}/{work_date}/{tracking_no}_{timestamp}.jpg`
- Public bucket (อ่านได้โดยไม่ต้อง auth)
- Compress ก่อน upload: max 1200px width, JPEG quality 75%

---

## การติดตั้ง (Development)

### 1. Clone และติดตั้ง

```bash
git clone https://github.com/betongpos-ops/COD.git
cd COD
npm install
```

### 2. รัน SQL ใน Supabase

เปิด Supabase Dashboard → SQL Editor → วาง `supabase/02_schema_v2.sql` → Run

### 3. รัน Dev Server

```bash
npm run dev
```

เปิด: `http://localhost:5173/COD/`

มือถือ (WiFi เดียวกัน): `http://{IP_เครื่อง}:5173/COD/`

### 4. Build สำหรับ Production

```bash
npm run build
# output อยู่ที่ dist/
```

---

## การ Deploy (GitHub Pages)

Push ขึ้น `main` branch → GitHub Actions จะ build และ deploy อัตโนมัติ

```bash
git add .
git commit -m "your message"
git push origin main
```

ดู progress: `https://github.com/betongpos-ops/COD/actions`

**หมายเหตุ:** ไฟล์ `dist/.nojekyll` จะถูกสร้างอัตโนมัติใน workflow เพื่อปิด Jekyll processing

---

## การเพิ่มสาขา (ปณ.) ใหม่

รัน SQL ใน Supabase SQL Editor:

```sql
INSERT INTO public.branches (name, postal_code, switch_password, office_head_name, office_head_title)
VALUES (
    'ที่ทำการไปรษณีย์ XXX',   -- ชื่อสาขา
    'XXXXX',                  -- รหัสไปรษณีย์ (ใช้เป็น login + รหัสพนักงาน)
    'AdminPassword',          -- รหัสผ่าน Admin (เปลี่ยนหลัง setup!)
    'ชื่อหัวหน้า',             -- ใช้ในรายงานเร่งส่งเงิน
    'ตำแหน่ง'                  -- เช่น หน.ปณ.สุไหงโก-ลก
);
```

ทุกสาขาใช้ **URL เดียวกัน** — ระบบแยกข้อมูลด้วย `branch_id` + Row Level Security

---

## การเปลี่ยนรหัสผ่าน Admin

Login Admin → เมนู (☰) → **ตั้งค่าระบบ** → เปลี่ยนรหัสผ่าน Admin

หรือรัน SQL:
```sql
SELECT public.update_branch_settings(
    (SELECT id FROM branches WHERE postal_code = '95110'),
    'NewAdminPassword',  -- switch_password ใหม่
    NULL, NULL, NULL
);
```

---

## ฟีเจอร์หลัก

### หน้า Admin
- อัปโหลด Excel จาก QMS (2 ไฟล์: 1-4 วัน / 5+ วัน)
- ดูข้อมูลแบบ Table / Group by พนักงาน
- อนุญาต / ยกเลิกอนุญาตถ่ายรูป (รายชิ้น หรือทั้งกลุ่ม)
- ระบุ "ไม่มีชิ้นงาน" → บังคับส่งเงิน New CA POS
- ดูข้อมูลย้อนหลัง (date picker)
- Export .xlsx พร้อมรูปภาพ
- พิมพ์รายงาน COD (A4)
- พิมพ์รายงานเร่งส่งเงิน (มีบาร์โค้ด)
- คัดลอกส่งไลน์

### หน้าพนักงาน
- เลือกชื่อตัวเอง → ดูรายการพัสดุ
- ถ่ายรูปยืนยัน (ต้องให้ Admin unlock ก่อน)
- แสดง badge: มีรูป / ยังไม่มีรูป / ไม่มีชิ้นงาน

### หน้าตั้งค่า (Admin)
- แก้ไขชื่อสาขา / หัวหน้า / ตำแหน่ง
- เปลี่ยนรหัสผ่าน Admin
- ดูสถิติข้อมูลย้อนหลัง

---

## RPC Functions (Supabase)

| Function | คำอธิบาย |
|---|---|
| `authenticate_branch(postal_code, password)` | Login + ตรวจสอบ role |
| `get_today_stats(branch_id, date)` | สถิติวันที่ระบุ |
| `get_operators_stats(branch_id, date)` | สถิติรายพนักงาน |
| `get_available_dates(branch_id)` | รายการวันที่มีข้อมูล |
| `delete_branch_date_parcels(branch_id, date)` | ลบข้อมูลของวันที่ระบุ |
| `delete_expired_parcels()` | ลบข้อมูลเก่า >7 วัน (pg_cron) |
| `update_branch_settings(...)` | แก้ไขข้อมูลสาขา |

---

## ลบข้อมูลอัตโนมัติ (pg_cron)

เปิดใช้งาน pg_cron ใน Supabase → Database → Extensions → pg_cron

จากนั้นรัน:
```sql
SELECT cron.schedule(
    'cod-expire-parcels',
    '0 18 * * *',    -- ทุกวัน 01:00 น. (UTC+7)
    'SELECT public.delete_expired_parcels()'
);
```

ระบบจะลบข้อมูลที่ `work_date` เก่ากว่า 7 วันโดยอัตโนมัติ

---

## ประวัติการพัฒนา

| วันที่ | เวอร์ชัน | รายละเอียด |
|---|---|---|
| มิ.ย. 2569 | v1.0 | ระบบเดิม: Google Apps Script + Google Sheets + Supabase สาขาเดียว |
| มิ.ย. 2569 | v2.0 | ย้ายเป็น Vite + TypeScript + GitHub Pages, Multi-tenant (หลายสาขา) |
