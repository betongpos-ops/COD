# ระบบติดตาม COD พัสดุคงค้าง

ระบบสำหรับติดตามและตรวจสอบพัสดุ COD (Cash on Delivery) ที่คงค้างในที่ทำการไปรษณีย์  
รองรับหลายสาขา (Multi-tenant) บน Supabase + Vercel

**Live URL:** _(ตั้งค่าหลัง deploy บน Vercel)_

---

## Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | Vite + TypeScript (Vanilla, ไม่มี Framework) |
| Database | Supabase (PostgreSQL + RLS) |
| Storage | Supabase Storage (เก็บรูปภาพ) |
| Hosting | Vercel (auto-deploy จาก GitHub) |
| Build | Vite MPA (Multi-Page Application) |
| Font | Sarabun (Google Fonts) |
| Icons | Font Awesome 6 |

---

## หน้าในระบบ

| ไฟล์ | URL | ผู้ใช้ |
|---|---|---|
| `index.html` | `/` | ทุกคน — Login เลือกสาขา + โหมด |
| `admin.html` | `/admin.html` | Admin — จัดการพัสดุทั้งหมด |
| `employee.html` | `/employee.html` | พนักงาน — ถ่ายรูปยืนยัน |
| `settings.html` | `/settings.html` | Admin — ตั้งค่าสาขา |
| `register.html` | `/register.html` | ผู้จัดการสาขาใหม่ — ลงทะเบียนสาขา |

---

## โครงสร้างโปรเจกต์

```
COD/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Pages workflow (disabled — ใช้ Vercel แทน)
├── public/                     # Static assets (copy ไปที่ dist/ โดยตรง)
│   ├── favicon.png             # Icon สัญลักษณ์ลูกศร (สำหรับ mobile)
│   ├── favicon-192.png         # PWA icon 192×192
│   ├── favicon-512.png         # PWA icon 512×512
│   ├── apple-touch-icon.png    # iOS icon
│   ├── Topbar-1.png            # Logo แนวนอนเต็ม (2134×335px) — ใช้บน Topbar desktop
│   └── Login card.png          # Logo แนวนอนเต็ม — ใช้บนหน้า Login/Register
├── src/
│   ├── types/
│   │   └── index.ts            # TypeScript types ทั้งหมด
│   ├── lib/
│   │   ├── config.ts           # Supabase URL + anon key (อ่านจาก env vars)
│   │   ├── supabase.ts         # API functions ทั้งหมด
│   │   ├── auth.ts             # Session (localStorage) + navigation
│   │   ├── compress.ts         # Compress รูปก่อน upload
│   │   └── utils.ts            # Helper functions
│   ├── pages/
│   │   ├── login.ts            # Logic หน้า Login
│   │   ├── admin.ts            # Logic หน้า Admin + PDF reports
│   │   ├── employee.ts         # Logic หน้าพนักงาน
│   │   ├── settings.ts         # Logic หน้าตั้งค่า
│   │   └── register.ts         # Logic หน้าลงทะเบียนสาขา
│   ├── styles/
│   │   └── main.css            # Design system (CSS custom properties)
│   └── vite-env.d.ts           # TypeScript types สำหรับ import.meta.env
├── supabase/
│   ├── 02_schema_v2.sql        # SQL: สร้าง schema หลัก (branches, parcels, RPC)
│   └── 03_register_branch.sql  # SQL: RPC สำหรับลงทะเบียนสาขาใหม่ผ่านหน้าเว็บ
├── index.html
├── admin.html
├── employee.html
├── settings.html
├── register.html
├── vite.config.ts              # Vite: base=/, MPA input (5 หน้า)
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
  พนักงาน → เปิดหน้าพนักงาน → เลือกชื่อตัวเอง → ถ่ายรูปยืนยัน
  Admin → ถ้าไม่มีชิ้นงานจริง → กด "ไม่มีชิ้นงาน" → บังคับส่งเงิน New CA POS

เย็น
  Admin → Export .xlsx ส่งผู้บังคับบัญชา
         ชื่อไฟล์: XXXXX_ติดตาม COD ค้าง 1-4 และ 5 วัน (D-M-YY).xlsx
```

### สถานะชิ้นงาน

| สถานะ | image_url | photo_allowed | ความหมาย |
|---|---|---|---|
| `locked` | null | false | รออนุญาตจาก Admin |
| `unlocked` | null | true | Admin unlock แล้ว รอพนักงานถ่ายรูป |
| `photo_done` | URL | any | ถ่ายรูปแล้ว ยืนยันมีของ |
| `no_item` | 'NO_ITEM' | false | ไม่มีชิ้นงาน → บังคับส่งเงิน New CA POS |

### Logic สำคัญ
- **พนักงานถ่ายรูปได้ก็ต่อเมื่อ** Admin กด "อนุญาต" ก่อนเท่านั้น
- **หลังถ่ายรูป** → `photo_allowed` reset เป็น `false` อัตโนมัติ
- **Group View** → "อนุญาตทั้งกลุ่ม" จะ unlock ทุก category (ไม่แยก tab)
- **Upload Excel** แยก category อิสระ: อัปโหลด 1-4 วัน ไม่กระทบ 5+ วัน

---

## การ Login

| โหมด | รหัสผ่าน |
|---|---|
| พนักงาน | รหัสไปรษณีย์ของสาขา (เช่น `95110`) |
| Admin | `switch_password` ที่ตั้งค่าในตาราง branches |

Session เก็บใน `localStorage` key: `cod_session`

---

## Environment Variables

ต้องตั้งค่าใน Vercel Dashboard (Project Settings → Environment Variables):

| Key | ค่า | หมายเหตุ |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | Project URL จาก Supabase |
| `VITE_SUPABASE_ANON` | `eyJ...` | anon/public key จาก Supabase |

สำหรับ local dev: สร้างไฟล์ `.env` ที่ root (gitignored):

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON=eyJ...
```

---

## Database Schema

### ตาราง `branches` (สาขาไปรษณีย์)

| Column | Type | คำอธิบาย |
|---|---|---|
| `id` | UUID | Primary key |
| `postal_code` | VARCHAR(10) | รหัสไปรษณีย์ (UNIQUE — ใช้เป็น login + รหัสพนักงาน) |
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
| `work_date` | DATE | วันที่ทำงาน |
| `tracking_no` | VARCHAR(50) | หมายเลขพัสดุ |
| `operator_id` | VARCHAR(100) | ชื่อพนักงานจาก QMS |
| `aging_category` | VARCHAR(20) | '1-4 Days' หรือ '5+ Days' |
| `platform` | VARCHAR(20) | 'N' / 'Y'(Lazada) / 'Shopee' |
| `image_url` | TEXT | null / 'NO_ITEM' / URL รูปภาพ |
| `photo_allowed` | BOOLEAN | Admin unlock หรือยัง |

**Unique constraint:** `(branch_id, tracking_no, work_date)`

### Storage

- Bucket: `parcel-images`
- Path: `{branch_id}/{work_date}/{tracking_no}_{timestamp}.jpg`
- Public bucket
- Compress ก่อน upload: max 1200px, JPEG quality 75%

---

## RPC Functions (Supabase)

| Function | คำอธิบาย |
|---|---|
| `authenticate_branch(postal_code, password)` | Login ตรวจสอบ role |
| `get_today_stats(branch_id, date)` | สถิติ KPI ของวันที่ระบุ |
| `get_operators_stats(branch_id, date)` | สถิติรายพนักงาน |
| `get_available_dates(branch_id)` | รายการวันที่มีข้อมูล |
| `delete_branch_date_parcels(branch_id, date)` | ลบข้อมูลของวันที่ระบุ |
| `delete_expired_parcels()` | ลบข้อมูลเก่า >7 วัน (pg_cron) |
| `update_branch_settings(...)` | แก้ไขข้อมูลสาขา |
| `register_branch(...)` | ลงทะเบียนสาขาใหม่ผ่านหน้าเว็บ |

---

## การติดตั้ง (Local Development)

### 1. Clone และติดตั้ง

```bash
git clone https://github.com/betongpos-ops/COD.git
cd COD
npm install
```

### 2. ตั้งค่า Environment Variables

```bash
# สร้างไฟล์ .env
VITE_SUPABASE_URL=https://iatmmrhzzgxogidvrowz.supabase.co
VITE_SUPABASE_ANON=eyJ...
```

### 3. รัน SQL ใน Supabase

เปิด Supabase Dashboard → SQL Editor:
1. รัน `supabase/02_schema_v2.sql` (schema หลัก)
2. รัน `supabase/03_register_branch.sql` (register RPC)

### 4. รัน Dev Server

```bash
npm run dev
```

เปิด: `http://localhost:5173/`  
มือถือ (WiFi เดียวกัน): `npm run dev -- --host` แล้วใช้ IP ของเครื่อง

### 5. Build

```bash
npm run build
# output: dist/
```

---

## การ Deploy (Vercel)

### ครั้งแรก

1. ไป [vercel.com](https://vercel.com) → **Add New → Project**
2. Import repository: `betongpos-ops/COD`
3. Framework: **Vite** (auto-detect)
4. ใส่ Environment Variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON`)
5. กด **Deploy**

### หลังจากนั้น

```bash
git add .
git commit -m "your message"
git push origin main
# Vercel จะ build และ deploy อัตโนมัติภายใน ~30 วินาที
```

ดู logs: Vercel Dashboard → Project → Deployments

---

## การเพิ่มสาขา (ปณ.) ใหม่

### วิธีที่ 1 — หน้าเว็บ (แนะนำ)

เปิด `/register.html` → กรอกข้อมูล → กด **สมัครใช้งาน**

ระบบจะสร้าง branch ใหม่และแสดงรหัสผ่านที่หน้าจอ  
_(บันทึกรหัสผ่าน Admin ทันที — ระบบจะไม่แสดงอีกครั้ง)_

### วิธีที่ 2 — SQL (Supabase SQL Editor)

```sql
INSERT INTO public.branches (name, postal_code, switch_password, office_head_name, office_head_title)
VALUES (
    'ที่ทำการไปรษณีย์ XXX',
    'XXXXX',
    'AdminPassword',
    'ชื่อหัวหน้า',
    'ตำแหน่ง'
);
```

ทุกสาขาใช้ **URL เดียวกัน** — ระบบแยกข้อมูลด้วย `branch_id` + Row Level Security

---

## การเปลี่ยนรหัสผ่าน Admin

Login Admin → เมนูจัดการ (☰) → **ตั้งค่าระบบ** → เปลี่ยนรหัสผ่าน Admin

---

## ลบข้อมูลอัตโนมัติ (pg_cron)

เปิดใช้งาน pg_cron ใน Supabase → Database → Extensions → pg_cron  
จากนั้นรัน:

```sql
SELECT cron.schedule(
    'cod-expire-parcels',
    '0 18 * * *',
    'SELECT public.delete_expired_parcels()'
);
```

ระบบลบข้อมูลที่ `work_date` เก่ากว่า 7 วันอัตโนมัติทุกวัน 01:00 น. (UTC+7)

---

## Brand & Design

- **สีหลัก (แดง):** `#ef3e25` — Thailand Post brand red
- **สีรอง (น้ำเงิน):** `#002169` — Thailand Post navy
- **Font:** Sarabun (Google Fonts)
- **CI Logo Rules:**
  - Logo ต้องอยู่บนพื้นขาวเท่านั้น
  - พื้นมืด → ต้องมีกรอบขาว rounded รอบ Logo
  - ห้ามยืด/บีบ Logo (ใช้ `object-fit: contain` เสมอ)

---

## ประวัติการพัฒนา

| วันที่ | เวอร์ชัน | รายละเอียด |
|---|---|---|
| มิ.ย. 2568 | v1.0 | Google Apps Script + Google Sheets + Supabase สาขาเดียว |
| มิ.ย. 2569 | v2.0 | ย้ายเป็น Vite + TypeScript + GitHub Pages, Multi-tenant |
| มิ.ย. 2569 | v3.0 | Thai Post UX redesign, Logo, KPI dashboard, Register page, Vercel |

---

© 2026 | 95110 · IMRON SAMOH | imron.samoh@gmail.com
