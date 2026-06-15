// ── ประกาศฟีเจอร์ใหม่ (infographic modal) ─────────────────────────
//  แสดงครั้งแรกที่เข้าหน้า User / Admin ภายในช่วงเวลาที่กำหนด
//  - กด "รับทราบ" → จำไว้ ไม่แสดงอีก (ต่อเครื่อง/เบราว์เซอร์)
//  - เลยวันหมดอายุ → ไม่แสดงอีกแม้ยังไม่กดรับทราบ
//
//  ⚙️ เปลี่ยนรอบประกาศใหม่: แก้ ANN_ID (ขึ้นเลขใหม่) + ANN_EXPIRES
// ------------------------------------------------------------------
const ANN_ID = '2026-06-ป210'
// แสดงถึงสิ้นวันนี้ (เวลาไทย) — ตั้งไว้ 3 วันนับจากวันประกาศ
const ANN_EXPIRES = new Date('2026-06-18T23:59:59+07:00').getTime()

type Role = 'admin' | 'employee'

interface Feature { icon: string; color: string; title: string; desc: string }

const COMMON: Feature[] = [
  {
    icon: 'fa-file-signature', color: '#002169',
    title: 'บัญชีส่งมอบภายใน (ป.210)',
    desc: 'พิมพ์ใบส่งมอบพัสดุระหว่างพนักงานกับผู้ควบคุมฯ สรุปแยกตามวันคงค้าง พร้อมช่องลงนาม',
  },
  {
    icon: 'fa-eye', color: '#0369a1',
    title: 'ปุ่มดูรหัสผ่าน',
    desc: 'กดรูปดวงตา 👁 ในช่องรหัสผ่าน เพื่อดูสิ่งที่พิมพ์ ลดการกรอกผิด',
  },
]

const BY_ROLE: Record<Role, Feature[]> = {
  employee: [
    {
      icon: 'fa-print', color: '#15803d',
      title: 'พิมพ์ ป.210 ของฉัน',
      desc: 'หน้ารายการพัสดุ → ปุ่ม "พิมพ์บัญชีส่งมอบ ป.210 ของฉัน" ได้ใบของตัวเองทันที',
    },
  ],
  admin: [
    {
      icon: 'fa-users', color: '#15803d',
      title: 'พิมพ์ ป.210 ทุกคนทีเดียว',
      desc: 'เมนู (☰) → "บัญชีส่งมอบ ป.210" ระบบสร้างให้คนละ 1 แผ่นอัตโนมัติ',
    },
    {
      icon: 'fa-user-tie', color: '#b45309',
      title: 'ตั้งชื่อผู้ควบคุมฯ',
      desc: 'ตั้งค่าระบบ → กรอก "ชื่อผู้ควบคุมฯ" จะแสดงเป็นช่อง "ถึง / ผู้รับมอบ" ในใบ ป.210',
    },
  ],
}

const STYLE = `
.ann-overlay { position: fixed; inset: 0; z-index: 4000; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(15,23,42,.55); backdrop-filter: blur(2px); animation: ann-fade .2s ease-out; }
.ann-card { background: #fff; width: 100%; max-width: 440px; max-height: 92vh; overflow-y: auto;
  border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,.28); position: relative;
  animation: ann-pop .26s cubic-bezier(.16,1,.3,1); }
.ann-x { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; border: none; border-radius: 50%;
  background: rgba(255,255,255,.2); color: #fff; font-size: 20px; line-height: 1; cursor: pointer; z-index: 2; }
.ann-x:hover { background: rgba(255,255,255,.35); }
.ann-head { background: linear-gradient(135deg, #ef3e25, #c8290f); color: #fff; padding: 24px 22px 20px;
  border-radius: 18px 18px 0 0; text-align: center; }
.ann-badge { display: inline-block; background: rgba(255,255,255,.22); font-size: 12px; font-weight: 600;
  padding: 3px 12px; border-radius: 999px; letter-spacing: .3px; margin-bottom: 10px; }
.ann-head h2 { font-size: 19px; font-weight: 700; margin: 0 0 6px; }
.ann-sub { font-size: 13px; opacity: .92; margin: 0; line-height: 1.5; }
.ann-features { padding: 18px 20px 4px; display: flex; flex-direction: column; gap: 14px; }
.ann-feat { display: flex; gap: 13px; align-items: flex-start; }
.ann-ic { flex-shrink: 0; width: 42px; height: 42px; border-radius: 11px; display: flex; align-items: center;
  justify-content: center; color: #fff; font-size: 17px; }
.ann-ft { font-size: 14.5px; font-weight: 600; color: #111827; line-height: 1.35; }
.ann-fd { font-size: 12.5px; color: #4b5563; line-height: 1.55; margin-top: 2px; }
.ann-foot { padding: 14px 20px 22px; }
.ann-ok { width: 100%; background: #002169; color: #fff; border: none; border-radius: 11px; padding: 13px;
  font-family: inherit; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .15s; }
.ann-ok:hover { background: #001752; }
@keyframes ann-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes ann-pop { from { opacity: 0; transform: translateY(14px) scale(.97) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) {
  .ann-overlay, .ann-card { animation: none; }
}
`

export function showAnnouncement(role: Role): void {
  // เลยกำหนด หรือ เคยกดรับทราบแล้ว → ไม่แสดง
  if (Date.now() > ANN_EXPIRES) return
  const ackKey = `cod_ann_${ANN_ID}`
  if (localStorage.getItem(ackKey)) return

  const feats = [...COMMON, ...BY_ROLE[role]]
  const featHtml = feats.map(f => `
    <div class="ann-feat">
      <div class="ann-ic" style="background:${f.color};"><i class="fas ${f.icon}"></i></div>
      <div>
        <div class="ann-ft">${f.title}</div>
        <div class="ann-fd">${f.desc}</div>
      </div>
    </div>`).join('')

  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const overlay = document.createElement('div')
  overlay.className = 'ann-overlay'
  overlay.innerHTML = `
    <div class="ann-card" role="dialog" aria-modal="true" aria-label="ประกาศฟีเจอร์ใหม่">
      <button class="ann-x" aria-label="ปิด">&times;</button>
      <div class="ann-head">
        <span class="ann-badge"><i class="fas fa-bullhorn"></i> อัปเดตใหม่</span>
        <h2>มีฟีเจอร์ใหม่ในระบบ COD</h2>
        <p class="ann-sub">ปรับปรุงให้การส่งมอบและใช้งานสะดวกขึ้น</p>
      </div>
      <div class="ann-features">${featHtml}</div>
      <div class="ann-foot"><button class="ann-ok"><i class="fas fa-check"></i> รับทราบ</button></div>
    </div>`

  const close = (ack: boolean) => {
    if (ack) localStorage.setItem(ackKey, new Date().toISOString())
    overlay.remove()
    style.remove()
    document.body.style.overflow = ''
  }

  overlay.querySelector('.ann-ok')!.addEventListener('click', () => close(true))
  overlay.querySelector('.ann-x')!.addEventListener('click', () => close(true))
  overlay.addEventListener('click', e => { if (e.target === overlay) close(true) })

  document.body.style.overflow = 'hidden'
  document.body.appendChild(overlay)
}
