import Swal from 'sweetalert2'
import { requireSession, navigateTo, login, saveSession, clearSession } from '../lib/auth'
import { fetchParcels, uploadImage, updateParcel, fetchBranchControllerName } from '../lib/supabase'
import { compressImage } from '../lib/compress'
import { todayISO, platformBadgeHtml, escJs } from '../lib/utils'
import { fetchOperatorsStats } from '../lib/supabase'
import { buildHandover210Doc, openHandover210, getLogoDataUrl } from '../lib/handover210'
import { initPasswordToggles } from '../lib/pwtoggle'
import { showAnnouncement } from '../lib/announcement'
import type { Parcel, OperatorStats, Session } from '../types'
import { getParcelStatus } from '../types'

// ── Session ───────────────────────────────────────────────────────
const session: Session = requireSession()
document.getElementById('branchLabel')!.textContent = `${session.postal_code} — ${session.branch_name}`

const currentDate = todayISO()
let allOperators: OperatorStats[] = []
let currentTracking = ''
let currentOperator = ''
let currentParcels: Parcel[] = []

// ── Load operators ────────────────────────────────────────────────
async function loadOperators() {
  try {
    allOperators = await fetchOperatorsStats(session.branch_id, currentDate)
    if (!allOperators.length) {
      // fallback: derive from raw parcels
      const parcels = await fetchParcels(session.branch_id, currentDate)
      const map: Record<string, OperatorStats> = {}
      parcels.forEach(p => {
        const op = p.operator_id ?? 'ไม่ระบุ'
        if (!map[op]) map[op] = { operator_id: op, total: 0, has_photo: 0, no_photo: 0, unlocked: 0, no_item: 0, hot5plus: 0, has_noitem: false }
        map[op].total++
        const st = getParcelStatus(p)
        if (st === 'photo_done') map[op].has_photo++
        else if (st === 'unlocked') map[op].unlocked++
        else if (st === 'no_item') { map[op].no_item++; map[op].has_noitem = true }
        else map[op].no_photo++
        if (p.holding_days_dest >= 5) map[op].hot5plus++
      })
      allOperators = Object.values(map)
    }
    renderOperators(allOperators)
  } catch {
    document.getElementById('operator-list')!.innerHTML = `<div class="center-msg"><i class="fas fa-exclamation-triangle" style="font-size:28px;color:var(--amber-600);"></i><p>ไม่สามารถโหลดรายชื่อได้</p></div>`
  }
}

function renderOperators(ops: OperatorStats[]) {
  const el = document.getElementById('operator-list')!
  if (!ops.length) {
    const today = currentDate
    el.innerHTML = `<div class="center-msg"><i class="fas fa-inbox" style="font-size:36px;"></i><p>ยังไม่มีข้อมูลวันที่ ${today.split('-').reverse().join('/')}</p><p style="margin-top:8px;font-size:12px;color:var(--gray-400);">Admin ต้องอัปโหลดไฟล์ QMS ก่อน</p></div>`
    return
  }
  const sorted = [...ops].sort((a, b) => a.operator_id.localeCompare(b.operator_id, 'th'))
  el.innerHTML = sorted.map(op => {
    const noPhoto = op.no_photo + op.unlocked
    const badges = [
      `<span class="stat-badge b-normal"><i class="fas fa-box" style="font-size:9px;"></i> ${op.total}</span>`,
      op.has_photo ? `<span class="stat-badge b-photo"><i class="fas fa-image" style="font-size:9px;"></i> ${op.has_photo}</span>` : '',
      noPhoto > 0  ? `<span class="stat-badge b-nophoto"><i class="fas fa-camera" style="font-size:9px;"></i> ${noPhoto}</span>` : '',
      op.no_item > 0 ? `<span class="stat-badge b-noitem"><i class="fas fa-exclamation-circle" style="font-size:9px;"></i> ${op.no_item} ส่งเงิน</span>` : '',
      // hot5plus badge ไม่แสดงในหน้าพนักงาน
    ].filter(Boolean).join('')

    const esc = escJs(op.operator_id)
    return `<button class="operator-btn${op.has_noitem ? ' has-noitem' : ''}" onclick="loadTasks('${esc}')">
      <div class="op-left">
        <div class="op-avatar"><i class="fas fa-user"></i></div>
        <div>
          <div class="op-name">${op.operator_id}</div>
          <div class="op-badges">${badges}</div>
        </div>
      </div>
      <div class="op-right">
        ${op.has_noitem ? '<i class="fas fa-exclamation-circle op-alert-icon"></i>' : '<i class="fas fa-chevron-right op-arrow"></i>'}
      </div>
    </button>`
  }).join('')
}

window.filterOperators = function () {
  const q = (document.getElementById('opSearch') as HTMLInputElement).value.toLowerCase().trim()
  renderOperators(q ? allOperators.filter(op => op.operator_id.toLowerCase().includes(q)) : allOperators)
}

// ── Load parcel tasks ─────────────────────────────────────────────
window.loadTasks = async function (operatorId: string) {
  document.getElementById('page-select')!.classList.add('hidden')
  document.getElementById('page-tasks')!.classList.remove('hidden')
  document.getElementById('changeBtn')!.classList.remove('hidden')
  document.getElementById('currentUser')!.textContent = operatorId

  const listEl = document.getElementById('parcel-list')!
  listEl.innerHTML = `<div class="center-msg"><i class="fas fa-spinner fa-spin"></i><p>กำลังโหลดพัสดุ...</p></div>`

  try {
    const all = await fetchParcels(session.branch_id, currentDate)
    const parcels = all.filter(p => p.operator_id === operatorId)
      .sort((a, b) => b.holding_days_dest - a.holding_days_dest)
    currentOperator = operatorId
    currentParcels = parcels
    document.getElementById('taskCount')!.textContent = String(parcels.length)
    listEl.innerHTML = parcels.length
      ? parcels.map(p => renderCard(p)).join('')
      : `<div class="center-msg"><i class="fas fa-check-circle" style="color:var(--blue-400);"></i><p>ไม่มีพัสดุคงค้าง</p></div>`
  } catch {
    Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดพัสดุได้', 'error')
  }
}

function renderCard(p: Parcel): string {
  const isHot    = p.holding_days_dest >= 5
  const st       = getParcelStatus(p)
  const platBadge = platformBadgeHtml(p.platform)
  const daysBadge = `<span class="days-badge ${isHot ? 'hot' : 'normal'}">${isHot ? '<i class="fas fa-fire" style="font-size:10px;margin-right:3px;"></i>' : ''}ค้าง ${p.holding_days_dest} วัน</span>`
  const esc = escJs(p.tracking_no)

  let photoSection: string
  if (st === 'no_item') {
    photoSection = `<div class="card-photo">
      <div class="noitem-banner">
        <div class="noitem-banner-icon"><i class="fas fa-ban"></i></div>
        <div>
          <div class="noitem-banner-text">ไม่มีชิ้นงาน ให้ส่งเงินเข้าระบบ New CA POS</div>
          <div class="noitem-banner-sub">สถานะนี้ตั้งโดยผู้ควบคุม</div>
        </div>
      </div>
    </div>`
  } else if (st === 'photo_done') {
    photoSection = `<div class="card-photo">
      <div class="photo-preview">
        <img src="${p.image_url}" onclick="window.open('${p.image_url}','_blank')" loading="lazy">
        <div class="photo-status"><i class="fas fa-check-circle"></i> ส่งรูปแล้ว</div>
      </div>
      <button class="btn-photo secondary" onclick="triggerCamera('${esc}',false)">
        <i class="fas fa-camera"></i> ถ่ายใหม่ / เปลี่ยนรูป
      </button>
    </div>`
  } else {
    photoSection = `<div class="card-photo">
      <button class="btn-photo primary" onclick="triggerCamera('${esc}',${p.photo_allowed})">
        <i class="fas fa-camera" style="font-size:18px;"></i> ถ่ายรูปหมายเหตุ
      </button>
    </div>`
  }

  return `<div class="parcel-card" id="card-${p.tracking_no}">
    <div class="card-top">
      <div class="card-toprow">
        <div class="card-tracking">${p.tracking_no}${platBadge}</div>
        ${daysBadge}
      </div>
      <div class="card-meta">
        <span><i class="fas fa-map-marker-alt"></i>${p.destination_branch ?? '-'}</span>
        <span><i class="fas fa-redo-alt"></i>พยายาม ${p.attempt_count} ครั้ง</span>
      </div>
    </div>
    <div class="card-reason">
      <div class="reason-label">สาเหตุล่าสุด</div>
      <div class="reason-text">${p.fail_reason ?? 'ไม่มีข้อมูล'}</div>
    </div>
    ${photoSection}
  </div>`
}

// ── Camera trigger (check allowed) ───────────────────────────────
window.triggerCamera = function (trackingNo: string, photoAllowed: boolean) {
  if (!photoAllowed) {
    Swal.fire({
      icon: 'warning', title: 'ยังไม่ได้รับอนุญาต',
      html: 'โปรดนำชิ้นงานที่มีอยู่จริง ไปแสดงให้ผู้ควบคุมฯ<br><br>หรือ หัวหน้า ปณ. ตรวจนับก่อน จึงจะถ่ายภาพได้',
      confirmButtonText: 'รับทราบ', confirmButtonColor: '#ef3e25',
    })
    return
  }
  currentTracking = trackingNo
  document.getElementById('cameraInput')!.click()
}

// ── Handle photo selected ─────────────────────────────────────────
window.handlePhotoSelected = async function (event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !currentTracking) return
  Swal.fire({ title: 'กำลังอัปโหลด...', text: 'กำลังบีบอัดและอัปโหลดรูปภาพ', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
  try {
    const blob = await compressImage(file)
    const url  = await uploadImage(session.branch_id, currentDate, currentTracking, blob)
    // อัปเดต DB: set image_url + photo_allowed = false (ต้องให้ Admin unlock ใหม่ถ้าจะถ่ายซ้ำ)
    await updateParcel(session.branch_id, currentTracking, currentDate, { image_url: url, photo_allowed: false })
    Swal.fire({ icon: 'success', title: 'อัปโหลดสำเร็จ!', showConfirmButton: false, timer: 1300 })
    // อัปเดต UI ทันที
    const cardEl = document.getElementById(`card-${currentTracking}`)
    if (cardEl) {
      const photoDiv = cardEl.querySelector('.card-photo')
      if (photoDiv) {
        const esc = escJs(currentTracking)
        photoDiv.innerHTML = `
          <div class="photo-preview">
            <img src="${url}" onclick="window.open('${url}','_blank')">
            <div class="photo-status"><i class="fas fa-check-circle"></i> ส่งรูปแล้ว</div>
          </div>
          <button class="btn-photo secondary" onclick="triggerCamera('${esc}',false)">
            <i class="fas fa-camera"></i> ถ่ายใหม่ / เปลี่ยนรูป
          </button>`
      }
    }
  } catch (err) {
    Swal.fire('ข้อผิดพลาด', 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่', 'error')
    console.error(err)
  } finally { (event.target as HTMLInputElement).value = '' }
}

// ── Switch user ───────────────────────────────────────────────────
window.showUserSelection = function () {
  document.getElementById('page-tasks')!.classList.add('hidden')
  document.getElementById('changeBtn')!.classList.add('hidden')
  document.getElementById('page-select')!.classList.remove('hidden')
  ;(document.getElementById('opSearch') as HTMLInputElement).value = ''
  loadOperators()
}

// ── Prompt Admin login ────────────────────────────────────────────
window.promptAdminLogin = function () {
  Swal.fire({
    title: 'เข้าสู่โหมด Admin',
    html: `<div style="text-align:left;margin-bottom:4px;font-size:12px;font-weight:600;color:var(--gray-600);text-transform:uppercase;">รหัสผ่าน Admin</div><input id="swal-pw" type="password" class="swal2-input" placeholder="รหัสผ่าน Admin" style="margin:0;">`,
    focusConfirm: false, showCancelButton: true,
    confirmButtonText: 'เข้าสู่ระบบ', cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#ef3e25',
    didOpen: () => { const p = Swal.getPopup(); if (p) initPasswordToggles(p) },
    preConfirm: async () => {
      const pw = (document.getElementById('swal-pw') as HTMLInputElement).value
      if (!pw) { Swal.showValidationMessage('กรุณากรอกรหัสผ่าน'); return false }
      const result = await login(session.postal_code, pw)
      if (!result.success) { Swal.showValidationMessage(result.message ?? 'รหัสผ่านไม่ถูกต้อง'); return false }
      saveSession(result as Session)
      return true
    },
  }).then(r => { if (r.isConfirmed) navigateTo('admin.html') })
}

// ── พิมพ์บัญชีส่งมอบ ป.210 ของตัวเอง ──────────────────────────────
window.printMyHandover210 = async function () {
  if (!currentOperator || !currentParcels.length) {
    Swal.fire('ไม่มีรายการ', 'ยังไม่มีพัสดุให้ส่งมอบ', 'info'); return
  }
  Swal.fire({ title: 'กำลังเตรียมเอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
  const [logoSrc, controllerName] = await Promise.all([
    getLogoDataUrl(),
    fetchBranchControllerName(session.branch_id),
  ])
  Swal.close()
  const html = buildHandover210Doc(
    [{ operator: currentOperator, parcels: currentParcels }],
    {
      branchName:     session.branch_name,
      controllerName: controllerName ?? session.controller_name ?? '',
      workDate:       currentDate,
      logoSrc,
    }
  )
  if (!openHandover210(html)) Swal.fire('ถูกบล็อก', 'กรุณาอนุญาต Pop-up', 'warning')
}

window.doLogout = function () {
  clearSession()
  navigateTo('index.html')
}

// ── Global declarations ───────────────────────────────────────────
declare global {
  interface Window {
    filterOperators: () => void
    loadTasks: (op: string) => void
    triggerCamera: (t: string, allowed: boolean) => void
    handlePhotoSelected: (e: Event) => void
    showUserSelection: () => void
    promptAdminLogin: () => void
    printMyHandover210: () => void
    doLogout: () => void
  }
}

// ── Init ──────────────────────────────────────────────────────────
loadOperators()
showAnnouncement('employee')
