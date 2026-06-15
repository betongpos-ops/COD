// ── บัญชีส่งมอบภายใน (ป.210) ──────────────────────────────────────
//  Generator กลาง ใช้ร่วมกันทั้งหน้า Admin (พิมพ์ทุกคน) และพนักงาน (พิมพ์ของตัวเอง)
//  1 แผ่น = พนักงาน 1 คน · ส่งมอบ พนักงาน → ผู้ควบคุมฯ
import type { Parcel } from '../types'
import { getParcelStatus } from '../types'
import { formatDateThai } from './utils'

export interface Handover210Meta {
  branchName: string
  controllerName: string   // ช่อง "ถึง" (ผู้รับมอบ)
  workDate: string         // 'YYYY-MM-DD'
  logoSrc?: string
}

export interface OperatorGroup {
  operator: string
  parcels: Parcel[]
}

// HTML escape (ข้อมูลมาจากไฟล์ QMS — กันอักขระพิเศษทำ markup เพี้ยน)
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function statusLabel(p: Parcel): string {
  return getParcelStatus(p) === 'photo_done' ? '✓ ตรวจแล้ว' : 'รอตรวจสอบ'
}

// แถวรายการ 1 ชิ้น (ใช้ใน 1 ใน 2 คอลัมน์)
function itemRow(p: Parcel, no: number): string {
  const reason = p.fail_reason ? `<div class="h-reason">${esc(p.fail_reason)}</div>` : ''
  return `<tr>
    <td class="h-no">${no}</td>
    <td class="h-tk">${esc(p.tracking_no)}</td>
    <td class="h-rm"><span class="h-rm-line">${p.holding_days_dest} วัน · ${statusLabel(p)}</span>${reason}</td>
  </tr>`
}

function columnTable(items: Parcel[], startNo: number): string {
  const head = `<tr class="h-head"><th style="width:24pt;">ที่</th><th>เลขที่สิ่งของ (Tracking)</th><th style="width:96pt;">หมายเหตุ</th></tr>`
  const body = items.length
    ? items.map((p, i) => itemRow(p, startNo + i)).join('')
    : `<tr><td class="h-empty" colspan="3">— ไม่มีรายการ —</td></tr>`
  return `<table class="h-table">${head}${body}</table>`
}

// แผ่นเดียว = พนักงาน 1 คน
function buildSheet(group: OperatorGroup, meta: Handover210Meta, isLast: boolean): string {
  const operator = group.operator || 'ไม่ระบุตัวตน'
  const noItem   = group.parcels
    .filter(p => getParcelStatus(p) === 'no_item')
    .sort((a, b) => b.holding_days_dest - a.holding_days_dest || a.tracking_no.localeCompare(b.tracking_no))
  const handover = group.parcels
    .filter(p => getParcelStatus(p) !== 'no_item')
    .sort((a, b) => b.holding_days_dest - a.holding_days_dest || a.tracking_no.localeCompare(b.tracking_no))

  // สรุปแยกตามจำนวนวันคงค้าง (ค่าจริงทุกค่า)
  const byDay = new Map<number, number>()
  handover.forEach(p => byDay.set(p.holding_days_dest, (byDay.get(p.holding_days_dest) ?? 0) + 1))
  const summaryChips = [...byDay.keys()].sort((a, b) => a - b)
    .map(d => `<span class="h-chip">ค้าง <b>${d}</b> วัน: <b>${byDay.get(d)}</b></span>`)
    .join('')

  // แบ่ง 2 คอลัมน์ (ซ้ายเต็มก่อน แล้วต่อขวา) — ลำดับต่อเนื่อง
  const half  = Math.ceil(handover.length / 2)
  const left  = handover.slice(0, half)
  const right = handover.slice(half)
  const logo  = meta.logoSrc
    ? `<img src="${meta.logoSrc}" class="h-logo" alt="ไปรษณีย์ไทย">`
    : `<div class="h-logo-text">ไปรษณีย์ไทย</div>`

  const noItemRows = noItem.map((p, i) => `<tr>
    <td class="h-no">${i + 1}</td>
    <td class="h-tk">${esc(p.tracking_no)}</td>
    <td class="h-ni-day">${p.holding_days_dest} วัน</td>
    <td class="h-ni-chk">
      <span class="h-chk-opt"><span class="h-cbx"></span> ส่งเงินแล้ว</span>
      <span class="h-chk-opt"><span class="h-cbx"></span> ปฏิเสธส่งเงิน</span>
    </td>
  </tr>`).join('')
  const noItemBlock = noItem.length ? `
    <div class="h-noitem">
      <div class="h-noitem-title">⚠ ไม่มีชิ้นงาน ${noItem.length} รายการ — ต้องส่งเงินเข้าระบบ New CA POS</div>
      <table class="h-table h-ni-table">
        <tr class="h-head"><th style="width:24pt;">ที่</th><th>เลขที่สิ่งของ (Tracking)</th><th style="width:56pt;">วันถือครอง</th><th style="width:108pt;">ผู้ควบคุมฯ ติ๊ก</th></tr>
        ${noItemRows}
      </table>
    </div>` : ''

  return `<section class="h-sheet${isLast ? ' h-last' : ''}">
    <div class="h-top">
      <div class="h-top-left">${logo}<div class="h-title">บัญชีส่งมอบภายใน (ป.210)</div></div>
      <div class="h-top-right">
        <div>ที่ทำการ: <b>${esc(meta.branchName)}</b></div>
        <div>วันที่: <b>${formatDateThai(meta.workDate)}</b></div>
      </div>
    </div>

    <div class="h-fromto">
      <div><span class="h-lbl">จาก</span> <b>${esc(operator)}</b></div>
      <div><span class="h-lbl">ถึง</span> <b>${esc(meta.controllerName) || '....................................'}</b></div>
    </div>

    <div class="h-summary">
      <span class="h-summary-lbl">สรุปบริการ</span>
      ${summaryChips || '<span class="h-chip">— ไม่มีรายการส่งมอบ —</span>'}
      <span class="h-chip h-chip-total">รวม <b>${handover.length}</b> ชิ้น</span>
    </div>

    <div class="h-cols">
      <div class="h-col">${columnTable(left, 1)}</div>
      <div class="h-col">${columnTable(right, left.length + 1)}</div>
    </div>

    ${noItemBlock}

    <div class="h-sign">
      <div class="h-sign-box">
        <div class="h-sign-line"></div>
        <div class="h-sign-role">ลงชื่อผู้มอบ</div>
        <div class="h-sign-name">( ${esc(operator)} )</div>
      </div>
      <div class="h-sign-box">
        <div class="h-sign-line"></div>
        <div class="h-sign-role">ลงชื่อผู้รับมอบ</div>
        <div class="h-sign-name">( ${esc(meta.controllerName) || '............................'} )</div>
      </div>
    </div>
  </section>`
}

const STYLE = `
@page { size: A4 portrait; margin: 12mm 12mm 14mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Sarabun', sans-serif; font-size: 10pt; color: #111827; background: #f3f4f6; }
@media print { .no-print { display: none !important; } body { background: #fff; } }
.toolbar { background: #002169; color: #fff; padding: 10px 18px; display: flex; align-items: center; gap: 10px; position: sticky; top: 0; z-index: 99; }
.toolbar .ttl { flex: 1; font-size: 15px; font-weight: 700; }
.btn-print { background: #ef3e25; color: #fff; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-family: inherit; font-weight: 600; }
.btn-close { background: rgba(255,255,255,.15); color: #fff; border: 1px solid rgba(255,255,255,.3); padding: 8px 14px; border-radius: 6px; font-size: 14px; cursor: pointer; font-family: inherit; }
.h-wrap { max-width: 200mm; margin: 0 auto; padding: 8px; }
.h-sheet { background: #fff; border: 2px solid #002169; padding: 10pt 12pt; margin-bottom: 12px; page-break-after: always; }
.h-sheet.h-last { page-break-after: auto; }
@media print { .h-sheet { margin-bottom: 0; } }
.h-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12pt; border-bottom: 1.5px solid #002169; padding-bottom: 6pt; }
.h-top-left { display: flex; align-items: center; gap: 10pt; }
.h-logo { height: 30pt; width: auto; max-width: 150pt; object-fit: contain; }
.h-logo-text { font-size: 12pt; font-weight: 700; color: #002169; }
.h-title { font-size: 14pt; font-weight: 700; color: #002169; }
.h-top-right { text-align: right; font-size: 9pt; color: #374151; line-height: 1.7; }
.h-fromto { display: flex; gap: 24pt; flex-wrap: wrap; margin-top: 7pt; font-size: 10.5pt; }
.h-lbl { display: inline-block; min-width: 28pt; color: #6b7280; }
.h-summary { margin-top: 7pt; padding: 5pt 8pt; background: #f1f5fb; border: 1px solid #c7d2e8; border-radius: 4pt; display: flex; flex-wrap: wrap; gap: 6pt 10pt; align-items: center; }
.h-summary-lbl { font-weight: 700; color: #002169; font-size: 9.5pt; }
.h-chip { font-size: 9pt; color: #374151; }
.h-chip-total { margin-left: auto; background: #002169; color: #fff; padding: 2pt 8pt; border-radius: 3pt; }
.h-cols { display: flex; gap: 10pt; margin-top: 8pt; align-items: flex-start; }
.h-col { flex: 1; min-width: 0; }
.h-table { width: 100%; border-collapse: collapse; }
.h-table th { background: #002169; color: #fff; font-size: 8.5pt; font-weight: 600; padding: 3pt 5pt; border: 1px solid #002169; text-align: left; }
.h-table td { border: 1px solid #cbd5e1; padding: 3pt 5pt; font-size: 9pt; vertical-align: top; }
.h-no { text-align: center; color: #6b7280; width: 24pt; }
.h-tk { font-family: 'IBM Plex Mono', monospace; font-size: 8.5pt; word-break: break-all; }
.h-rm-line { font-size: 8.5pt; white-space: nowrap; }
.h-reason { font-size: 7.5pt; color: #6b7280; margin-top: 1pt; }
.h-empty { text-align: center; color: #9ca3af; font-size: 8.5pt; padding: 8pt; }
.h-table tr { page-break-inside: avoid; }
.h-noitem { margin-top: 9pt; border: 2px solid #ef3e25; background: #fff1ef; border-radius: 4pt; padding: 7pt 10pt; }
.h-noitem-title { color: #c8290f; font-size: 12pt; font-weight: 700; }
.h-ni-table { margin-top: 7pt; }
.h-ni-table th { background: #ef3e25; border-color: #ef3e25; }
.h-ni-table td { border-color: #f3b6ac; }
.h-ni-day { text-align: center; font-weight: 600; color: #c8290f; white-space: nowrap; }
.h-ni-chk { font-size: 8.5pt; color: #374151; }
.h-chk-opt { display: block; white-space: nowrap; line-height: 1.7; }
.h-cbx { display: inline-block; width: 11pt; height: 11pt; border: 1.2px solid #555;
  border-radius: 2px; vertical-align: -1.5pt; margin-right: 4pt; }
.h-sign { display: flex; justify-content: space-around; gap: 30pt; margin-top: 22pt; page-break-inside: avoid; }
.h-sign-box { text-align: center; flex: 1; max-width: 220pt; }
.h-sign-line { border-bottom: 1px dotted #6b7280; height: 30pt; }
.h-sign-role { font-size: 9pt; color: #6b7280; margin-top: 3pt; }
.h-sign-name { font-size: 10pt; font-weight: 600; margin-top: 2pt; }
`

export function buildHandover210Doc(groups: OperatorGroup[], meta: Handover210Meta): string {
  const sheets = groups.map((g, i) => buildSheet(g, meta, i === groups.length - 1)).join('')
  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<title>บัญชีส่งมอบภายใน ป.210</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${STYLE}</style></head>
<body>
<div class="no-print toolbar"><span class="ttl">บัญชีส่งมอบภายใน (ป.210) — ${groups.length} แผ่น</span>
<button class="btn-print" onclick="window.print()">🖨 พิมพ์ / บันทึก PDF</button>
<button class="btn-close" onclick="window.close()">✕ ปิด</button></div>
<div class="h-wrap">${sheets}</div>
</body></html>`
}

// เปิดหน้าตัวอย่างก่อนพิมพ์ — คืน false ถ้า popup ถูกบล็อก
export function openHandover210(html: string): boolean {
  const win = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), '_blank')
  return !!win
}

// โหลดโลโก้เป็น data URL (สำหรับฝังในหน้า blob) — คืน '' ถ้าโหลดไม่ได้
export async function getLogoDataUrl(): Promise<string> {
  const paths = [import.meta.env.BASE_URL + 'Topbar-1.png', '/Topbar-1.png']
  for (const path of paths) {
    try {
      const resp = await fetch(path)
      if (!resp.ok) continue
      const blob = await resp.blob()
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    } catch { continue }
  }
  return ''
}
