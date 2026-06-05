import Swal from 'sweetalert2'
import * as XLSX from 'xlsx'
import { requireSession, navigateTo } from '../lib/auth'
import {
  fetchParcels, updateParcel, updateParcelsInList,
  deleteParcel, upsertParcel, uploadParcels,
  uploadImage
} from '../lib/supabase'
import { compressImage } from '../lib/compress'
import {
  todayISO, formatDateThai, formatDateTimeThai,
  parseQmsDate, parseDays, platformBadgeHtml,
  normalizeTracking, escJs
} from '../lib/utils'
import { fetchAvailableDates } from '../lib/supabase'
import type { Parcel, Session } from '../types'
import { getParcelStatus } from '../types'

// ── Session ───────────────────────────────────────────────────────
const session: Session = requireSession('admin')
document.getElementById('branchLabel')!.textContent = `${session.postal_code} — ${session.branch_name}`

// ── State ─────────────────────────────────────────────────────────
let allData:       Parcel[]  = []
let currentTab:    string    = '1-4 Days'
let currentView:   string    = 'table'
let currentDate:   string    = todayISO()
let expandedGroups = new Set<string>()

// popup state
let popupTracking  = ''
let popupImageUrl  = ''
let popupAllowed   = false

// modal state
let modalMode:     'create' | 'update' = 'create'

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  await loadDateBar()
  await loadData()
}
init()

// ── Date bar ──────────────────────────────────────────────────────
async function loadDateBar() {
  try {
    const dates = await fetchAvailableDates(session.branch_id)
    const today = todayISO()
    const bar   = document.getElementById('dateBar')!

    // Always show today chip, even if no data
    const allDates = dates.some(d => d.date === today)
      ? dates
      : [{ date: today, total: 0 }, ...dates]

    bar.innerHTML = allDates.slice(0, 7).map(d => {
      const label = d.date === today ? 'วันนี้' : formatDateThai(d.date)
      return `<button class="date-chip ${d.date === currentDate ? 'active' : ''}"
        onclick="changeDate('${d.date}')">
        <i class="fas fa-calendar-day" style="font-size:11px;"></i> ${label}
        ${d.total > 0 ? `<span style="font-size:10px;opacity:.7;">(${d.total})</span>` : ''}
      </button>`
    }).join('')
  } catch { /* silent */ }
}

window.changeDate = async function (date: string) {
  currentDate = date
  document.querySelectorAll('.date-chip').forEach(el => {
    el.classList.toggle('active', el.getAttribute('onclick')?.includes(date) ?? false)
  })
  await loadData()
}

// ── Load data ─────────────────────────────────────────────────────
async function loadData() {
  try {
    allData = await fetchParcels(session.branch_id, currentDate)
    updateStats()
    applyFilters()
    document.getElementById('lastUpdated')!.textContent =
      new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  } catch {
    Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error')
  }
}

// ── Stats ─────────────────────────────────────────────────────────
function updateStats() {
  const total   = allData.length
  const hot5    = allData.filter(d => d.holding_days_dest >= 5).length
  const hasPhoto = allData.filter(d => d.image_url && d.image_url !== 'NO_ITEM').length
  const noPhoto  = allData.filter(d => !d.image_url).length
  document.getElementById('stat-total')!.textContent  = String(total)
  document.getElementById('stat-5plus')!.textContent  = String(hot5)
  document.getElementById('stat-img')!.textContent    = String(hasPhoto)
  document.getElementById('stat-nophoto')!.textContent = String(noPhoto)
}

// ── Stats drill-down modal ─────────────────────────────────────────
const STAT_CFG = {
  total:   { title: 'รายการทั้งหมด',    sub: 'พัสดุทุกชิ้น',                  icon: 'fa-boxes',  bg: 'var(--gray-100)', cl: 'var(--gray-700)', fn: (_: Parcel) => true },
  '5plus': { title: 'ค้าง 5+ วัน',      sub: 'ค้างตั้งแต่ 5 วันขึ้นไป',       icon: 'fa-fire',   bg: 'var(--red-50)',   cl: 'var(--red-600)',  fn: (d: Parcel) => d.holding_days_dest >= 5 },
  photo:   { title: 'มีรูปภาพแล้ว',     sub: 'ถ่ายรูปหมายเหตุแล้ว',           icon: 'fa-image',  bg: 'var(--green-50)', cl: 'var(--green-700)',fn: (d: Parcel) => !!(d.image_url && d.image_url !== 'NO_ITEM') },
  nophoto: { title: 'ยังไม่มีรูปภาพ',  sub: 'ยังไม่ได้ถ่ายรูป',              icon: 'fa-camera', bg: 'var(--amber-50)', cl: 'var(--amber-700)',fn: (d: Parcel) => !d.image_url },
} as const

window.openStatsModal = function (type: keyof typeof STAT_CFG) {
  const cfg  = STAT_CFG[type]
  const data = allData.filter(cfg.fn)
  const icon = document.getElementById('sm-icon')!
  icon.style.background = cfg.bg; icon.style.color = cfg.cl
  icon.innerHTML = `<i class="fas ${cfg.icon}"></i>`
  document.getElementById('sm-title')!.textContent = `${cfg.title} (${data.length})`
  document.getElementById('sm-sub')!.textContent   = cfg.sub

  const groups: Record<string, Parcel[]> = {}
  data.forEach(d => { const op = d.operator_id ?? 'ไม่ระบุ'; (groups[op] ??= []).push(d) })

  const body = document.getElementById('sm-body')!
  if (!Object.keys(groups).length) {
    body.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--gray-400);"><i class="fas fa-inbox" style="font-size:32px;display:block;margin-bottom:10px;"></i>ไม่พบข้อมูล</div>`
  } else {
    body.innerHTML = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, 'th')).map(([op, items]) => {
      const rows = items.map(i => {
        const st = getParcelStatus(i)
        const dot = st === 'no_item' ? 'noitem' : st === 'photo_done' ? 'has' : 'none'
        return `<div class="sm-parcel-row">
          <div class="sm-photo-dot ${dot}"></div>
          <span class="sm-tracking">${i.tracking_no}${platformBadgeHtml(i.platform)}</span>
          <span class="sm-dest">${i.destination_branch ?? ''}</span>
          <span class="badge ${i.holding_days_dest >= 5 ? 'badge-red' : 'badge-gray'}" style="font-size:10px;">${i.holding_days_dest}วัน</span>
        </div>`
      }).join('')
      const opId = escJs(op)
      return `<div class="sm-group" id="smg-${opId}">
        <div class="sm-group-hd" onclick="toggleSMGroup('${opId}')">
          <div class="sm-group-left"><div class="sm-group-av"><i class="fas fa-user"></i></div><div class="sm-group-name">${op}</div></div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="sm-group-badge" style="background:${cfg.bg};color:${cfg.cl};">${items.length} ชิ้น</span>
            <i class="fas fa-chevron-down sm-chevron"></i>
          </div>
        </div>
        <div class="sm-parcel-list">${rows}</div>
      </div>`
    }).join('')
  }
  document.getElementById('statsModal')!.classList.add('active')
}
window.closeStatsModal   = () => document.getElementById('statsModal')!.classList.remove('active')
window.toggleSMGroup     = (op: string) => document.getElementById(`smg-${op}`)?.classList.toggle('open')

// ── Filters ───────────────────────────────────────────────────────
function applyFilters() {
  const q        = (document.getElementById('searchInput') as HTMLInputElement).value.toLowerCase()
  const platform = (document.getElementById('filterPlatform') as HTMLSelectElement).value
  const imgF     = (document.getElementById('filterImage') as HTMLSelectElement).value

  const filtered = allData.filter(item => {
    const days     = item.holding_days_dest
    const matchTab = imgF === 'noitem' || currentView === 'group'
      ? true
      : currentTab === '1-4 Days' ? days < 5 : days >= 5
    const matchQ   = !q || [item.tracking_no, item.operator_id, item.fail_reason]
      .some(v => (v ?? '').toLowerCase().includes(q))
    const matchPlat = !platform || (item.platform ?? '').includes(platform) || (platform === 'Y' && item.is_lazada)
    const st       = getParcelStatus(item)
    const matchImg = !imgF || imgF === 'has' ? st === 'photo_done' : imgF === 'noitem' ? st === 'no_item' : !item.image_url
    return matchTab && matchQ && matchPlat && (imgF === '' || matchImg)
  })

  document.getElementById('countLabel')!.innerHTML =
    `<i class="fas fa-list-ul" style="margin-right:4px;"></i> พบข้อมูล <b>${filtered.length}</b> ชิ้น`

  if (currentView === 'table') {
    document.getElementById('viewTable')!.classList.remove('hidden')
    document.getElementById('viewGroup')!.classList.add('hidden')
    renderTable(filtered)
  } else {
    document.getElementById('viewTable')!.classList.add('hidden')
    document.getElementById('viewGroup')!.classList.remove('hidden')
    renderGroupView(filtered)
  }
}

window.applyFilters = applyFilters

window.onFilterImageChange = function () {
  const v = (document.getElementById('filterImage') as HTMLSelectElement).value
  if (v === 'noitem') {
    currentView = 'group'
    document.getElementById('viewBtnTable')!.classList.remove('active')
    document.getElementById('viewBtnGroup')!.classList.add('active')
  }
  applyFilters()
}

window.switchTab = function (tab: string) {
  currentTab = tab
  document.getElementById('tab-14')!.classList.toggle('active', tab === '1-4 Days')
  document.getElementById('tab-5p')!.classList.toggle('active', tab === '5+ Days')
  applyFilters()
}

window.switchView = function (view: string) {
  currentView = view
  document.getElementById('viewBtnTable')!.classList.toggle('active', view === 'table')
  document.getElementById('viewBtnGroup')!.classList.toggle('active', view === 'group')
  applyFilters()
}

// ── Table render ──────────────────────────────────────────────────
function renderTable(data: Parcel[]) {
  const tbody = document.getElementById('tableBody')!
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gray-400);">ไม่พบข้อมูล</td></tr>`
    return
  }
  tbody.innerHTML = data.map(item => {
    const isHot = item.holding_days_dest >= 5
    const dayBadge = `<span class="badge ${isHot ? 'badge-red' : 'badge-gray'}">${isHot ? '<i class="fas fa-fire" style="font-size:9px;margin-right:2px;"></i>' : ''}${item.holding_days_dest} วัน</span>`
    const platBadge = platformBadgeHtml(item.platform)
    const imgCell   = buildThumbCell(item)
    const esc = escJs(item.tracking_no)
    return `<tr>
      <td data-label="tracking">
        <div class="tracking-no">${item.tracking_no}</div>
        ${platBadge}${dayBadge}
      </td>
      <td data-label="ปลายทาง" style="color:var(--gray-600);">${item.destination_branch ?? '-'}</td>
      <td data-label="พนักงาน"><span style="color:var(--blue-500);font-weight:500;">${item.operator_id ?? '-'}</span></td>
      <td data-label="สาเหตุ"><span class="reason-cell" title="${item.fail_reason ?? ''}">${item.fail_reason ?? '-'}</span></td>
      <td data-label="วันค้าง" style="text-align:center;">${dayBadge}</td>
      <td data-label="img" style="text-align:center;"><div style="display:flex;justify-content:center;">${imgCell}</div></td>
      <td data-label="act" style="text-align:center;">
        <div class="table-actions">
          <button class="action-btn edit" onclick="openModal('update','${esc}')"><i class="fas fa-pen"></i></button>
          <button class="action-btn del"  onclick="deleteItem('${esc}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`
  }).join('')
}

// ── Group view ────────────────────────────────────────────────────
function renderGroupView(data: Parcel[]) {
  const el = document.getElementById('groupBody')!
  if (!data.length) {
    el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--gray-400);"><i class="fas fa-users" style="font-size:32px;display:block;margin-bottom:12px;"></i>ไม่พบข้อมูล</div>`
    return
  }
  const groups: Record<string, Parcel[]> = {}
  data.forEach(item => { const op = item.operator_id ?? 'ไม่ระบุ'; (groups[op] ??= []).push(item) })

  el.innerHTML = Object.entries(groups).map(([op, items]) => {
    const total    = items.length
    const hasPhoto = items.filter(i => i.image_url && i.image_url !== 'NO_ITEM').length
    const noItem   = items.filter(i => i.image_url === 'NO_ITEM').length
    const waiting  = items.filter(i => i.photo_allowed && !i.image_url).length
    const locked   = items.filter(i => !i.photo_allowed && !i.image_url).length
    const hot5     = items.filter(i => i.holding_days_dest >= 5).length
    const expanded = expandedGroups.has(op)
    const opEsc    = escJs(op)

    const pills = [
      `<span class="gs-pill gs-total"><i class="fas fa-box" style="font-size:9px;"></i> ${total} ชิ้น</span>`,
      hasPhoto ? `<span class="gs-pill gs-photo"><i class="fas fa-image" style="font-size:9px;"></i> ${hasPhoto} รูปแล้ว</span>` : '',
      waiting  ? `<span class="gs-pill gs-waiting"><i class="fas fa-unlock-alt" style="font-size:9px;"></i> ${waiting} รออยู่</span>` : '',
      locked   ? `<span class="gs-pill gs-locked"><i class="fas fa-lock" style="font-size:9px;"></i> ${locked} รออนุญาต</span>` : '',
      noItem   ? `<span class="gs-pill gs-noitem"><i class="fas fa-ban" style="font-size:9px;"></i> ${noItem} ไม่มีชิ้นงาน</span>` : '',
      hot5     ? `<span class="gs-pill gs-hot"><i class="fas fa-fire" style="font-size:9px;"></i> ${hot5} วัน5+</span>` : '',
    ].filter(Boolean).join('')

    let actionBtns = ''
    if (locked > 0)  actionBtns += `<button class="btn-allow-group" onclick="allowGroup('${opEsc}',true)"><i class="fas fa-unlock-alt"></i> อนุญาตถ่ายรูปทั้งกลุ่ม (${locked} ชิ้น)</button>`
    if (waiting > 0) actionBtns += `<button class="btn-revoke-group" onclick="allowGroup('${opEsc}',false)"><i class="fas fa-lock"></i> ยกเลิกอนุญาต (${waiting} ชิ้น)</button>`
    if (!locked && !waiting) actionBtns = `<div class="group-no-action"><i class="fas fa-check-circle"></i> ไม่มีรายการที่รอดำเนินการ</div>`

    const parcelRows = expanded
      ? `<div class="group-parcel-list">${items.map(i => buildGroupRow(i)).join('')}</div>`
      : ''

    return `<div class="group-card ${expanded ? 'expanded' : ''}">
      <div class="group-header" onclick="toggleGroup('${opEsc}')">
        <div class="group-header-left">
          <div class="group-avatar"><i class="fas fa-user"></i></div>
          <div style="flex:1;min-width:0;">
            <div class="group-name">${op}</div>
            <div class="group-stats">${pills}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;color:var(--gray-400);">${expanded ? 'ซ่อน' : 'ดูรายการ'}</span>
          <i class="fas fa-chevron-down group-chevron"></i>
        </div>
      </div>
      <div class="group-actions">${actionBtns}</div>
      ${parcelRows}
    </div>`
  }).join('')
}

function buildGroupRow(item: Parcel): string {
  const st = getParcelStatus(item)
  let statusEl: string
  if (st === 'no_item')    statusEl = `<span class="gpr-status s-noitem"><i class="fas fa-ban"></i> ไม่มีชิ้นงาน</span>`
  else if (st === 'photo_done') statusEl = `<span class="gpr-status s-photo"><i class="fas fa-check-circle"></i> มีรูปแล้ว</span>`
  else if (st === 'unlocked')   statusEl = `<span class="gpr-status s-waiting"><i class="fas fa-unlock-alt"></i> รอถ่ายรูป</span>`
  else                          statusEl = `<span class="gpr-status s-locked"><i class="fas fa-lock"></i> รออนุญาต</span>`
  const isHot = item.holding_days_dest >= 5
  const esc   = escJs(item.tracking_no)
  return `<div class="group-parcel-row">
    <div style="flex-shrink:0;">${buildThumbCell(item, '36px')}</div>
    <div style="flex:1;min-width:0;">
      <div class="gpr-tracking">${item.tracking_no}${platformBadgeHtml(item.platform)}</div>
      <div style="font-size:11px;color:var(--gray-400);margin-top:2px;">${item.destination_branch ?? ''}${item.fail_reason ? ' · ' + item.fail_reason.substring(0, 20) : ''}</div>
    </div>
    ${statusEl}
    <span class="badge ${isHot ? 'badge-red' : 'badge-gray'}" style="font-size:11px;flex-shrink:0;">${item.holding_days_dest}วัน</span>
    <div class="table-actions" style="flex-shrink:0;">
      <button class="action-btn edit" onclick="openModal('update','${esc}')"><i class="fas fa-pen"></i></button>
      <button class="action-btn del"  onclick="deleteItem('${esc}')"><i class="fas fa-trash"></i></button>
    </div>
  </div>`
}

function buildThumbCell(item: Parcel, size = '44px'): string {
  const st  = getParcelStatus(item)
  const esc = escJs(item.tracking_no)
  const oc  = `openImgPopup('${esc}','${item.image_url ? escJs(item.image_url) : ''}',${item.photo_allowed})`
  const sz  = `width:${size};height:${size};`
  if (st === 'no_item')
    return `<span class="noitem-chip" onclick="${oc}" style="${size !== '44px' ? 'font-size:10px;padding:2px 6px;' : ''}"><i class="fas fa-ban"></i> ไม่มีชิ้นงาน</span>`
  if (st === 'photo_done')
    return `<div class="thumb-wrap" style="${sz}" onclick="${oc}"><img src="${item.image_url}" alt="thumb" loading="lazy"><div class="thumb-badge allow"><i class="fas fa-check"></i></div></div>`
  return `<div class="thumb-wrap ${st === 'unlocked' ? 'thumb-allowed' : ''}" style="${sz}" onclick="${oc}" title="${st === 'unlocked' ? 'รออยู่' : 'รออนุญาต'}">
    <i class="fas fa-${st === 'unlocked' ? 'camera' : 'lock'} no-img" style="color:${st === 'unlocked' ? 'var(--green-600)' : 'var(--gray-300)'};font-size:${size === '36px' ? '14' : '18'}px;"></i>
  </div>`
}

window.toggleGroup = function (op: string) {
  if (expandedGroups.has(op)) expandedGroups.delete(op)
  else expandedGroups.add(op)
  applyFilters()
}

// ── Bulk allow/revoke ─────────────────────────────────────────────
window.allowGroup = async function (operatorId: string, allow: boolean) {
  const targets = allData.filter(i => {
    // Group view: ทำทุก category ไม่แยก tab
    // Table view: ทำเฉพาะ category ของ tab ปัจจุบัน
    const matchCat = currentView === 'group'
      ? true
      : (currentTab === '1-4 Days' ? i.holding_days_dest < 5 : i.holding_days_dest >= 5)
    return i.operator_id === operatorId && matchCat && !i.image_url
  })
  if (!targets.length) { Swal.fire('ไม่มีรายการ', 'ไม่มีพัสดุที่ต้องอัปเดต', 'info'); return }

  const ok = await Swal.fire({
    icon: 'question',
    title: allow ? 'อนุญาตถ่ายรูปทั้งกลุ่ม?' : 'ยกเลิกอนุญาตทั้งกลุ่ม?',
    html: `<b>${operatorId}</b><br>จำนวน <b>${targets.length} ชิ้น</b>`,
    showCancelButton: true,
    confirmButtonText: allow ? '<i class="fas fa-unlock-alt"></i> อนุญาตเลย' : '<i class="fas fa-lock"></i> ยกเลิก',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: allow ? '#16a34a' : '#6b7280',
  })
  if (!ok.isConfirmed) return

  Swal.fire({ title: 'กำลังอัปเดต...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
  try {
    await updateParcelsInList(session.branch_id, targets.map(i => i.tracking_no), currentDate, { photo_allowed: allow })
    Swal.fire({ icon: 'success', title: `${allow ? 'อนุญาต' : 'ยกเลิกอนุญาต'}แล้ว ${targets.length} ชิ้น`, showConfirmButton: false, timer: 1400 })
    loadData()
  } catch (err) { Swal.fire('ข้อผิดพลาด', String(err), 'error') }
}

// ── Image popup ───────────────────────────────────────────────────
window.openImgPopup = function (trackingNo: string, imageUrl: string, allowed: boolean) {
  popupTracking  = trackingNo
  popupImageUrl  = imageUrl
  popupAllowed   = allowed
  document.getElementById('popupTrackingLabel')!.textContent = trackingNo
  const isNoItem = imageUrl === 'NO_ITEM'
  const hasPhoto = imageUrl && !isNoItem
  const show = (id: string, v: boolean) => { (document.getElementById(id) as HTMLElement).style.display = v ? 'flex' : 'none' }
  show('btnAllow',      !isNoItem && !allowed)
  show('btnRevoke',     !isNoItem && !!allowed)
  show('popupDiv1',     !isNoItem)
  show('btnCamera',     !isNoItem)
  show('btnUploadImg',  !isNoItem)
  show('btnViewImg',    !!hasPhoto)
  show('popupDiv2',     !isNoItem)
  show('btnNoItem',     !isNoItem)
  show('btnClearNoItem', !!isNoItem)
  document.getElementById('imgPopupOverlay')!.classList.add('show')
}
const closeImgPopup = () => document.getElementById('imgPopupOverlay')!.classList.remove('show')
window.closeImgPopup = closeImgPopup
window.imgActionView  = () => { if (popupImageUrl && popupImageUrl !== 'NO_ITEM') window.open(popupImageUrl, '_blank'); closeImgPopup() }
window.imgActionCamera = () => { closeImgPopup(); document.getElementById('adminCamera')!.click() }
window.imgActionUpload = () => { closeImgPopup(); document.getElementById('adminGallery')!.click() }

window.imgActionAllow = async function (allow: boolean) {
  closeImgPopup()
  Swal.fire({ title: allow ? 'กำลังอนุญาต...' : 'กำลังยกเลิก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
  try {
    await updateParcel(session.branch_id, popupTracking, currentDate, { photo_allowed: allow })
    Swal.fire({ icon: 'success', title: allow ? 'อนุญาตถ่ายรูปแล้ว' : 'ยกเลิกอนุญาตแล้ว', showConfirmButton: false, timer: 1200 })
    loadData()
  } catch (err) { Swal.fire('ข้อผิดพลาด', String(err), 'error') }
}

window.imgActionNoItem = async function () {
  closeImgPopup()
  const ok = await Swal.fire({
    icon: 'question', title: 'ยืนยันสถานะ "ไม่มีชิ้นงาน"?',
    html: `<span style="font-family:monospace;font-weight:600;">${popupTracking}</span><br><br>ระบบจะเปลี่ยนเป็น<br><b>"ไม่มีชิ้นงาน ให้ส่งเงินเข้าระบบ New CA POS"</b>`,
    showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#d97706',
  })
  if (!ok.isConfirmed) return
  try {
    await updateParcel(session.branch_id, popupTracking, currentDate, { image_url: 'NO_ITEM', photo_allowed: false })
    Swal.fire({ icon: 'success', title: 'บันทึกสถานะแล้ว', showConfirmButton: false, timer: 1200 })
    loadData()
  } catch (err) { Swal.fire('ข้อผิดพลาด', String(err), 'error') }
}

window.imgActionClearNoItem = async function () {
  closeImgPopup()
  try {
    await updateParcel(session.branch_id, popupTracking, currentDate, { image_url: null, photo_allowed: false })
    Swal.fire({ icon: 'success', title: 'ยกเลิกสถานะแล้ว', showConfirmButton: false, timer: 1200 })
    loadData()
  } catch (err) { Swal.fire('ข้อผิดพลาด', String(err), 'error') }
}

// Admin photo upload
window.handleAdminPhoto = async function (event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !popupTracking) return
  Swal.fire({ title: 'กำลังอัปโหลด...', text: 'กำลังบีบอัดและอัปโหลดรูปภาพ', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
  try {
    const blob = await compressImage(file)
    const url  = await uploadImage(session.branch_id, currentDate, popupTracking, blob)
    await updateParcel(session.branch_id, popupTracking, currentDate, { image_url: url })
    Swal.fire({ icon: 'success', title: 'อัปโหลดสำเร็จ!', showConfirmButton: false, timer: 1400 })
    loadData()
  } catch (err) {
    Swal.fire('ข้อผิดพลาด', 'อัปโหลดรูปไม่สำเร็จ', 'error')
    console.error(err)
  } finally { (event.target as HTMLInputElement).value = '' }
}

// ── CRUD modal ────────────────────────────────────────────────────
window.openModal = function (mode: 'create' | 'update', trackingNo?: string) {
  modalMode = mode
  const icon    = document.getElementById('mhIcon')!
  const imgSec  = document.getElementById('imgSection')!
  const inp     = document.getElementById('m_tracking') as HTMLInputElement

  if (mode === 'create') {
    document.getElementById('modalTitle')!.textContent = 'เพิ่มรายการใหม่'
    document.getElementById('modalSub')!.textContent   = ''
    icon.className = 'mh-icon create'; icon.innerHTML = '<i class="fas fa-plus"></i>'
    ;(document.getElementById('crudModal')!.querySelector('form') as HTMLFormElement).reset()
    inp.readOnly = false; inp.classList.remove('readonly-input')
    imgSec.classList.add('hidden')
  } else {
    const item = allData.find(d => d.tracking_no === trackingNo)
    if (!item) return
    document.getElementById('modalTitle')!.textContent = 'แก้ไขข้อมูลพัสดุ'
    document.getElementById('modalSub')!.textContent   = item.tracking_no
    icon.className = 'mh-icon update'; icon.innerHTML = '<i class="fas fa-pen"></i>'
    inp.readOnly = true; inp.classList.add('readonly-input')
    inp.value = item.tracking_no
    ;(document.getElementById('m_operator')  as HTMLInputElement).value = item.operator_id ?? ''
    ;(document.getElementById('m_dest')      as HTMLInputElement).value = item.destination_branch ?? ''
    ;(document.getElementById('m_reason')    as HTMLInputElement).value = item.fail_reason ?? ''
    ;(document.getElementById('m_attempt')   as HTMLInputElement).value = String(item.attempt_count)
    ;(document.getElementById('m_origin')    as HTMLInputElement).value = String(item.holding_days_origin)
    ;(document.getElementById('m_dest_days') as HTMLInputElement).value = String(item.holding_days_dest)
    ;(document.getElementById('m_lazada')    as HTMLInputElement).checked = item.is_lazada
    if (item.last_scan_datetime)
      (document.getElementById('m_scan') as HTMLInputElement).value = item.last_scan_datetime.substring(0, 16)
    popupTracking  = item.tracking_no
    popupImageUrl  = item.image_url ?? ''
    popupAllowed   = item.photo_allowed
    imgSec.classList.remove('hidden')
    renderModalPhotoSection(item)
  }
  document.getElementById('crudModal')!.classList.add('active')
}

const closeModal = () => document.getElementById('crudModal')!.classList.remove('active')
window.closeModal = closeModal

function renderModalPhotoSection(item: Parcel) {
  const st = getParcelStatus(item)
  let preview = ''
  if (st === 'no_item')
    preview = `<div class="modal-noitem-banner"><div class="modal-noitem-icon"><i class="fas fa-ban"></i></div><div><div style="font-size:12px;font-weight:600;color:var(--red-600);">ไม่มีชิ้นงาน ให้ส่งเงินเข้าระบบ New CA POS</div></div></div>`
  else if (st === 'photo_done')
    preview = `<div class="modal-photo-preview" onclick="window.open('${item.image_url}','_blank')"><img src="${item.image_url}" alt="photo"></div>`
  else
    preview = `<div class="modal-photo-empty"><i class="fas fa-${st === 'unlocked' ? 'unlock-alt' : 'lock'}" style="font-size:26px;display:block;margin-bottom:6px;color:${st === 'unlocked' ? 'var(--green-600)' : 'var(--gray-300)'};"></i><div style="font-size:12px;font-weight:500;">${st === 'unlocked' ? 'รอพนักงานถ่ายรูป' : 'ยังไม่ได้รับอนุญาต'}</div></div>`
  document.getElementById('modalPhotoPreview')!.innerHTML = preview

  let btns = ''
  if (st !== 'no_item') {
    btns += st === 'locked'
      ? `<button type="button" class="pab pab-green" onclick="modalAllow(true)"><i class="fas fa-unlock-alt"></i>อนุญาตถ่ายรูป</button>`
      : `<button type="button" class="pab pab-gray"  onclick="modalAllow(false)"><i class="fas fa-lock"></i>ยกเลิกอนุญาต</button>`
    btns += `<button type="button" class="pab pab-red"  onclick="document.getElementById('adminCamera').click()"><i class="fas fa-camera"></i>ถ่ายรูป</button>`
    btns += `<button type="button" class="pab pab-blue" onclick="document.getElementById('adminGallery').click()"><i class="fas fa-image"></i>อัปโหลดรูป</button>`
    if (st === 'photo_done') btns += `<button type="button" class="pab pab-gray" onclick="window.open('${item.image_url}','_blank')"><i class="fas fa-eye"></i>ดูรูปปัจจุบัน</button>`
    btns += `<button type="button" class="pab pab-amber ${st === 'photo_done' ? '' : 'full-col'}" onclick="modalNoItem()"><i class="fas fa-ban"></i>ไม่มีชิ้นงาน</button>`
  } else {
    btns = `<button type="button" class="pab pab-gray full-col" onclick="modalClearNoItem()"><i class="fas fa-undo"></i>ยกเลิกสถานะ "ไม่มีชิ้นงาน"</button>`
  }
  document.getElementById('modalPhotoActions')!.innerHTML = btns
}

window.modalAllow = async function (allow: boolean) {
  try {
    Swal.fire({ title: allow ? 'กำลังอนุญาต...' : 'กำลังยกเลิก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
    await updateParcel(session.branch_id, popupTracking, currentDate, { photo_allowed: allow })
    Swal.fire({ icon: 'success', title: allow ? 'อนุญาตถ่ายรูปแล้ว' : 'ยกเลิกอนุญาตแล้ว', showConfirmButton: false, timer: 1000 })
    await refreshModal()
  } catch (err) { Swal.fire('ข้อผิดพลาด', String(err), 'error') }
}

window.modalNoItem = async function () {
  const ok = await Swal.fire({ icon: 'question', title: 'ยืนยัน "ไม่มีชิ้นงาน"?', html: `<b>${popupTracking}</b>`, showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#d97706' })
  if (!ok.isConfirmed) return
  await updateParcel(session.branch_id, popupTracking, currentDate, { image_url: 'NO_ITEM', photo_allowed: false })
  Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', showConfirmButton: false, timer: 1000 })
  await refreshModal()
}

window.modalClearNoItem = async function () {
  await updateParcel(session.branch_id, popupTracking, currentDate, { image_url: null, photo_allowed: false })
  Swal.fire({ icon: 'success', title: 'ยกเลิกสถานะแล้ว', showConfirmButton: false, timer: 1000 })
  await refreshModal()
}

async function refreshModal() {
  const items = await fetchParcels(session.branch_id, currentDate)
  const item  = items.find(d => d.tracking_no === popupTracking)
  if (item) {
    const idx = allData.findIndex(d => d.tracking_no === popupTracking)
    if (idx >= 0) allData[idx] = item
    renderModalPhotoSection(item)
  }
  updateStats(); applyFilters()
}

// Save CRUD
window.saveItem = async function (e: Event) {
  e.preventDefault()
  const tracking  = (document.getElementById('m_tracking') as HTMLInputElement).value.trim().toUpperCase()
  if (!tracking) return
  const holdDest = parseInt((document.getElementById('m_dest_days') as HTMLInputElement).value) || 0
  const scanVal  = (document.getElementById('m_scan') as HTMLInputElement).value
  const payload: Partial<Parcel> = {
    tracking_no:         tracking,
    operator_id:         (document.getElementById('m_operator') as HTMLInputElement).value || null,
    destination_branch:  (document.getElementById('m_dest') as HTMLInputElement).value || null,
    fail_reason:         (document.getElementById('m_reason') as HTMLInputElement).value || null,
    attempt_count:       parseInt((document.getElementById('m_attempt') as HTMLInputElement).value) || 0,
    holding_days_origin: parseInt((document.getElementById('m_origin') as HTMLInputElement).value) || 0,
    holding_days_dest:   holdDest,
    is_lazada:           (document.getElementById('m_lazada') as HTMLInputElement).checked,
    aging_category:      holdDest >= 5 ? '5+ Days' : '1-4 Days',
    last_scan_datetime:  scanVal ? scanVal + ':00+07:00' : null,
    platform:            (document.getElementById('m_lazada') as HTMLInputElement).checked ? 'Y' : 'N',
  }

  const btn = document.getElementById('saveBtn') as HTMLButtonElement
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true
  try {
    await upsertParcel(session.branch_id, currentDate, payload)
    Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', showConfirmButton: false, timer: 1400 })
    closeModal(); loadData()
  } catch (err) { Swal.fire('ข้อผิดพลาด', String(err), 'error')
  } finally { btn.innerHTML = '<i class="fas fa-save"></i> บันทึก'; btn.disabled = false }
}

window.deleteItem = async function (trackingNo: string) {
  const ok = await Swal.fire({ title: 'ยืนยันการลบ?', icon: 'warning', html: `<span style="font-family:monospace;">${trackingNo}</span>`, showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบเลย', cancelButtonText: 'ยกเลิก' })
  if (!ok.isConfirmed) return
  try { await deleteParcel(session.branch_id, trackingNo, currentDate); loadData() }
  catch { Swal.fire('Error', 'ลบไม่สำเร็จ', 'error') }
}

// ── Delete all today ──────────────────────────────────────────────
window.deleteAllToday = async function () {
  if (!allData.length) { Swal.fire('ไม่มีข้อมูล', 'ตารางว่างเปล่า', 'info'); return }
  const ok = await Swal.fire({
    title: 'ล้างข้อมูลวันนี้?',
    html: `ลบข้อมูลทั้งหมด <b>${allData.length} ชิ้น</b><br><span style="color:var(--red-600);">ไม่สามารถกู้คืนได้</span><br><br>พิมพ์ <b>ยืนยันการลบ</b> เพื่อดำเนินการ`,
    input: 'text', icon: 'warning', showCancelButton: true,
    confirmButtonColor: '#dc2626', confirmButtonText: 'ล้างข้อมูล', cancelButtonText: 'ยกเลิก',
    inputValidator: v => v !== 'ยืนยันการลบ' ? 'กรุณาพิมพ์ "ยืนยันการลบ" ให้ถูกต้อง' : undefined,
  })
  if (!ok.isConfirmed) return
  Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
  try {
    const { sb } = await import('../lib/supabase')
    const { error } = await sb.rpc('delete_branch_date_parcels', { p_branch_id: session.branch_id, p_date: currentDate })
    if (error) throw error
    Swal.fire({ icon: 'success', title: 'ล้างข้อมูลเรียบร้อย', showConfirmButton: false, timer: 1500 })
    loadData()
  } catch (err) { Swal.fire('ข้อผิดพลาด', String(err), 'error') }
}

// ── Upload Excel ──────────────────────────────────────────────────
window.triggerUpload = (cat: string) => document.getElementById(cat === '1-4' ? 'fileUpload14' : 'fileUpload5p')!.click()

window.processUpload = async function (category: '1-4 Days' | '5+ Days', input: HTMLInputElement) {
  const file = input.files?.[0]; if (!file) return
  const today = todayISO()
  const catLabel = category === '1-4 Days' ? 'พัสดุ 1-4 วัน' : 'พัสดุ 5 วันขึ้นไป'

  // ตรวจเฉพาะ category ที่กำลังจะ upload ไม่แตะ category อื่น
  const hasSameCategory = currentDate === today && allData.some(d => d.aging_category === category)

  if (hasSameCategory) {
    const existCount = allData.filter(d => d.aging_category === category).length
    const ok = await Swal.fire({
      icon: 'warning',
      title: `มีข้อมูล "${catLabel}" วันนี้อยู่แล้ว`,
      html: `พบ <b>${existCount} รายการ</b> (${catLabel})<br>
             การอัปโหลดจะ<b>แทนที่เฉพาะหมวดนี้</b><br>
             ข้อมูล${category === '1-4 Days' ? ' 5 วันขึ้นไป' : ' 1-4 วัน'}จะ<b>ไม่ถูกแตะต้อง</b><br><br>
             ต้องการดำเนินการต่อหรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ดำเนินการต่อ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#d97706',
    })
    if (!ok.isConfirmed) { input.value = ''; return }
  }

  Swal.fire({ title: 'กำลังอ่านไฟล์...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target!.result as ArrayBuffer), { type: 'array' })
      const rows: import('../types').QmsRow[] = []
      wb.SheetNames.forEach(name => {
        XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }).forEach((row: unknown) => {
          const r = row as Record<string, string | number>
          const rawNo = r['หมายเลขสิ่งของ']
          if (!rawNo) return
          const tn = normalizeTracking(rawNo)
          if (!tn) return
          const daysRaw = parseDays(r['จำนวนวันที่ถือครอง (นับจากวันที่ปลายทาง)'])
          const platRaw = String(r['Lazada?'] ?? 'N').trim()
          rows.push({
            tracking_no:         tn,
            destination_branch:  String(r['รหัสที่ทำการปลายทาง'] ?? '') || null,
            operator_id:         String(r['ผู้ดำเนินการ'] ?? '') || null,
            last_scan_datetime:  parseQmsDate(String(r['วันที่ เวลา (สแกนผลการนำจ่ายล่าสุด)'] ?? '')),
            fail_reason:         String(r['สาเหตุ'] ?? '') || null,
            platform:            platRaw,
            is_lazada:           platRaw === 'Y',
            holding_days_origin: parseDays(r['จำนวนวันที่ถือครอง (นับจากวันที่รับฝาก)']),
            holding_days_dest:   daysRaw,
            attempt_count:       parseDays(r['จำนวนครั้งที่พยายามนำจ่าย']),
            aging_category:      category,
          })
        })
      })
      // dedup
      const dedup: Record<string, import('../types').QmsRow> = {}
      rows.forEach(r => { dedup[r.tracking_no] = r })
      const final = Object.values(dedup)
      const count = await uploadParcels(session.branch_id, today, final, category)
      currentDate = today
      await loadDateBar()
      Swal.fire({ icon: 'success', title: 'นำเข้าสำเร็จ!', html: `นำเข้า <b>${count}</b> รายการ (${category})` })
      await loadData()
    } catch (err) { Swal.fire('ข้อผิดพลาด', String(err), 'error') }
    finally { input.value = '' }
  }
  reader.readAsArrayBuffer(file)
}

// ── Export Excel ──────────────────────────────────────────────────
window.exportExcel = async function () {
  if (!allData.length) { Swal.fire('ไม่พบข้อมูล', '', 'info'); return }
  Swal.fire({ title: 'กำลัง Export...', html: '<div id="expStatus">กำลังโหลด ExcelJS...</div>', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
  try {
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    const setStatus = (t: string) => { const el = document.getElementById('expStatus'); if (el) el.textContent = t }
    const itemsWithImg = allData.filter(d => d.image_url && d.image_url !== 'NO_ITEM')
    let imgFetched = 0

    async function createSheet(sheetName: string, dataset: Parcel[]) {
      const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] })
      ws.columns = [
        { header: 'ลำดับ', key: 'no', width: 7 }, { header: 'หมายเลขสิ่งของ', key: 'tracking', width: 22 },
        { header: 'ปลายทาง', key: 'dest', width: 16 }, { header: 'ผู้ดำเนินการ', key: 'op', width: 18 },
        { header: 'วันที่สแกนล่าสุด', key: 'scan', width: 20 }, { header: 'สาเหตุ', key: 'reason', width: 30 },
        { header: 'Platform', key: 'plat', width: 10 }, { header: 'ค้าง (ต้นทาง)', key: 'orig', width: 14 },
        { header: 'ค้าง (ปลายทาง)', key: 'dest2', width: 14 }, { header: 'ครั้งที่พยายาม', key: 'att', width: 13 },
        { header: 'รูปหมายเหตุ', key: 'img', width: 18 },
      ]
      ws.getRow(1).eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }; cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 }; cell.alignment = { vertical: 'middle', horizontal: 'center' } })
      ws.getRow(1).height = 28
      for (let i = 0; i < dataset.length; i++) {
        const item = dataset[i]; const rowIdx = i + 2
        const isNoItem = item.image_url === 'NO_ITEM'; const hasPhoto = item.image_url && !isNoItem
        ws.addRow({ no: i + 1, tracking: item.tracking_no, dest: item.destination_branch ?? '', op: item.operator_id ?? '', scan: formatDateTimeThai(item.last_scan_datetime), reason: item.fail_reason ?? '', plat: item.platform ?? 'N', orig: item.holding_days_origin, dest2: item.holding_days_dest, att: item.attempt_count, img: isNoItem ? 'ไม่มีชิ้นงาน' : hasPhoto ? '' : 'ยังไม่มีรูป' })
        const row = ws.getRow(rowIdx); row.height = hasPhoto ? 56 : 22
        row.eachCell(cell => { cell.alignment = { vertical: 'middle', wrapText: false }; cell.font = { size: 10 }; if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } } })
        if (hasPhoto) {
          try {
            setStatus(`กำลังโหลดรูป ${++imgFetched}/${itemsWithImg.length}`)
            const imgRes = await fetch(item.image_url!); if (!imgRes.ok) continue
            const blob = await imgRes.blob(); const ab = await blob.arrayBuffer()
            const b64 = btoa(String.fromCharCode(...new Uint8Array(ab))); const ext = (blob.type.split('/')[1] || 'jpeg')
            const imgId = wb.addImage({ base64: b64, extension: ext as 'jpeg' })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ws.addImage(imgId, { tl: { col: 10, row: rowIdx - 1 }, br: { col: 11, row: rowIdx }, editAs: 'oneCell' } as any)
          } catch { /* skip */ }
        }
      }
    }

    const d14  = allData.filter(i => i.holding_days_dest < 5)
    const d5p  = allData.filter(i => i.holding_days_dest >= 5)
    setStatus('กำลังสร้าง Sheet 1-4 วัน...'); await createSheet(`COD 1-4 วัน`, d14)
    setStatus('กำลังสร้าง Sheet 5+ วัน...'); await createSheet(`COD 5 วันขึ้นไป`, d5p)
    setStatus('กำลังสร้างไฟล์...')
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url
    const [ey, em, ed] = currentDate.split('-')
    const thaiYY = (parseInt(ey) + 543) % 100
    a.download = `${session.postal_code}_ติดตาม COD ค้าง 1-4 และ 5 วัน (${parseInt(ed)}-${parseInt(em)}-${thaiYY}).xlsx`
    a.click(); URL.revokeObjectURL(url)
    Swal.fire('สำเร็จ!', `Export เรียบร้อย (รูป ${itemsWithImg.length} รูป)`, 'success')
  } catch (err) { Swal.fire('ข้อผิดพลาด', String(err), 'error') }
}

// ── Reports ───────────────────────────────────────────────────────
window.generateReport = function () {
  if (!allData.length) { Swal.fire('ไม่มีข้อมูล', '', 'info'); return }
  const groups: Record<string, Parcel[]> = {}
  allData.forEach(d => { const op = d.operator_id ?? 'ไม่ระบุตัวตน'; (groups[op] ??= []).push(d) })
  const ops = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'th'))
  const headName  = session.office_head_name  ?? ''
  const headTitle = session.office_head_title ?? ''
  const printDt   = new Date().toLocaleString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const TH = 'padding:5px 7px;border:1px solid #6b7280;font-size:8.5pt;text-align:left;white-space:nowrap;'
  const TD = 'padding:4px 7px;border:1px solid #d1d5db;font-size:9pt;vertical-align:top;'
  const colHd = `<tr style="background:#1c2840;color:#fff;"><th style="${TH}text-align:center;width:28px;">ที่</th><th style="${TH}width:138px;">Tracking No.</th><th style="${TH}width:62px;">ปลายทาง</th><th style="${TH}">สาเหตุล่าสุด</th><th style="${TH}text-align:center;width:46px;">ค้าง</th><th style="${TH}text-align:center;width:88px;">สถานะชิ้นงาน</th></tr>`

  function buildRows(arr: Parcel[]) {
    return arr.map((d, i) => {
      const noItem = d.image_url === 'NO_ITEM'; const hasPhoto = d.image_url && !noItem
      const bg = i % 2 === 0 ? '#fff' : '#f8fafc'; const stBg = noItem ? '#fff1f1' : hasPhoto ? '#f0fdf4' : '#fefce8'
      const stCl = noItem ? '#b91c1c' : hasPhoto ? '#15803d' : '#92400e'; const stTx = noItem ? '✗ ไม่มีชิ้นงาน' : hasPhoto ? '✓ มีชิ้นงาน' : '⋯ ยังไม่ตรวจสอบ'
      return `<tr style="background:${bg};"><td style="${TD}text-align:center;">${i + 1}</td><td style="${TD}font-family:monospace;font-size:8.5pt;">${d.tracking_no}</td><td style="${TD}">${d.destination_branch ?? '-'}</td><td style="${TD}word-break:break-word;max-width:160px;">${d.fail_reason ?? '-'}</td><td style="${TD}text-align:center;">${d.holding_days_dest} วัน</td><td style="${TD}text-align:center;background:${stBg};color:${stCl};font-weight:600;font-size:8pt;">${stTx}</td></tr>`
    }).join('')
  }

  let gtHas = 0, gtNo = 0
  const summaryRows: { op: string; has14: number; no14: number; tot14: number; has5p: number; no5p: number; tot5p: number }[] = []
  const sectHtml = ops.map(op => {
    const items = groups[op]; const d14 = items.filter(d => d.holding_days_dest < 5); const d5p = items.filter(d => d.holding_days_dest >= 5)
    const has14 = d14.filter(d => d.image_url && d.image_url !== 'NO_ITEM').length; const no14 = d14.filter(d => d.image_url === 'NO_ITEM').length
    const has5p = d5p.filter(d => d.image_url && d.image_url !== 'NO_ITEM').length; const no5p = d5p.filter(d => d.image_url === 'NO_ITEM').length
    gtHas += has14 + has5p; gtNo += no14 + no5p; summaryRows.push({ op, has14, no14, tot14: d14.length, has5p, no5p, tot5p: d5p.length })
    const s14 = d14.length ? `<div style="background:#e0f2fe;padding:4px 10px;border-left:4px solid #0284c7;font-size:8.5pt;font-weight:700;color:#0369a1;">▸ COD 1-4 วัน (${d14.length} รายการ | มีชิ้นงาน: ${has14} | ไม่มีชิ้นงาน: ${no14})</div><table style="width:100%;border-collapse:collapse;">${colHd}${buildRows(d14)}</table>` : ''
    const s5p = d5p.length ? `<div style="background:#fee2e2;padding:4px 10px;border-left:4px solid #dc2626;font-size:8.5pt;font-weight:700;color:#991b1b;${d14.length ? 'margin-top:8pt;' : ''}">▸ COD 5+ วัน (${d5p.length} รายการ | มีชิ้นงาน: ${has5p} | ไม่มีชิ้นงาน: ${no5p})</div><table style="width:100%;border-collapse:collapse;">${colHd}${buildRows(d5p)}</table>` : ''
    return `<div style="margin-bottom:14pt;page-break-inside:avoid;"><div style="background:#1c2840;color:#fff;padding:5px 10px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:10.5pt;font-weight:700;">&#128100; ${op}</span><span style="font-size:8.5pt;">&#10003; มีชิ้นงาน: ${has14 + has5p} | &#10007; ไม่มีชิ้นงาน: ${no14 + no5p} | รวม: ${items.length}</span></div>${s14}${s5p}</div>`
  }).join('')

  const TD2 = 'padding:3px 8px;border:1px dashed #9ca3af;font-size:9pt;'; const THS = 'padding:4px 8px;border:1px solid #374151;font-size:8.5pt;text-align:center;background:#374151;color:#fff;white-space:nowrap;'
  const gT14h = summaryRows.reduce((s, r) => s + r.has14, 0); const gT14n = summaryRows.reduce((s, r) => s + r.no14, 0); const gT14t = summaryRows.reduce((s, r) => s + r.tot14, 0)
  const gT5h  = summaryRows.reduce((s, r) => s + r.has5p, 0); const gT5n  = summaryRows.reduce((s, r) => s + r.no5p, 0);  const gT5t  = summaryRows.reduce((s, r) => s + r.tot5p, 0)
  const sumBody = summaryRows.map((r, i) => `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};"><td style="${TD2}">${r.op}</td><td style="${TD2}text-align:center;color:#15803d;font-weight:600;">${r.has14}</td><td style="${TD2}text-align:center;${r.no14 > 0 ? 'color:#d97706;font-weight:600;' : ''}">${r.no14 || '-'}</td><td style="${TD2}text-align:center;font-weight:600;">${r.tot14}</td><td style="${TD2}text-align:center;color:#15803d;font-weight:600;">${r.has5p}</td><td style="${TD2}text-align:center;${r.no5p > 0 ? 'color:#d97706;font-weight:600;' : ''}">${r.no5p || '-'}</td><td style="${TD2}text-align:center;font-weight:600;">${r.tot5p}</td><td style="${TD2}text-align:center;color:#15803d;font-weight:600;">${r.has14 + r.has5p}</td><td style="${TD2}text-align:center;${(r.no14 + r.no5p) > 0 ? 'color:#d97706;font-weight:600;' : ''}">${(r.no14 + r.no5p) || '-'}</td><td style="${TD2}text-align:center;font-weight:600;">${r.tot14 + r.tot5p}</td></tr>`).join('')

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>รายงาน COD</title><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet"><style>@page{size:A4;margin:14mm 12mm 18mm;}*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Sarabun',sans-serif;font-size:10pt;color:#111827;background:#fff;}@media print{.no-print{display:none!important;}}.toolbar{background:#1c2840;color:#fff;padding:10px 18px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:99;}.btn-print{background:#ef4444;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:14px;cursor:pointer;font-family:inherit;font-weight:600;}.btn-close{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:8px 14px;border-radius:6px;font-size:14px;cursor:pointer;font-family:inherit;}.wrap{padding:2pt 4pt;}</style></head><body><div class="no-print toolbar"><span style="flex:1;font-size:15px;font-weight:700;">รายงาน COD — ตัวอย่างก่อนพิมพ์</span><button class="btn-print" onclick="window.print()">🖨 พิมพ์ / บันทึก PDF</button><button class="btn-close" onclick="window.close()">✕ ปิด</button></div><div class="wrap"><div style="border:2px solid #1c2840;padding:8pt 12pt;margin-bottom:12pt;"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12pt;"><div><div style="font-size:14pt;font-weight:700;color:#1c2840;">ระบบจัดการพัสดุคงค้าง COD</div><div style="font-size:11pt;font-weight:600;margin-top:3pt;">รายงาน: พัสดุ COD ที่มีอยู่จริง (Actual COD Report)</div><div style="font-size:8.5pt;color:#4b5563;margin-top:3pt;">ที่ทำการไปรษณีย์: ${session.branch_name}</div></div><div style="text-align:right;flex-shrink:0;"><div style="font-size:8.5pt;color:#4b5563;">วันที่พิมพ์</div><div style="font-size:10pt;font-weight:600;">${printDt}</div><div style="font-size:8.5pt;color:#4b5563;margin-top:4pt;">ผู้ดำเนินการ: <b>${ops.length}</b> คน | รวม: <b>${allData.length}</b> ชิ้น</div></div></div><div style="margin-top:7pt;display:flex;gap:8pt;flex-wrap:wrap;"><span style="background:#f0fdf4;color:#15803d;padding:3pt 8pt;border-radius:3pt;font-size:9pt;font-weight:600;">✓ มีชิ้นงาน: ${gtHas}</span><span style="background:#fff1f1;color:#b91c1c;padding:3pt 8pt;border-radius:3pt;font-size:9pt;font-weight:600;">✗ ไม่มีชิ้นงาน: ${gtNo}</span><span style="background:#fefce8;color:#92400e;padding:3pt 8pt;border-radius:3pt;font-size:9pt;font-weight:600;">⋯ ยังไม่ตรวจสอบ: ${allData.length - gtHas - gtNo}</span></div></div>${sectHtml}<div style="margin-top:14pt;page-break-inside:avoid;"><div style="background:#1c2840;color:#fff;padding:5pt 10pt;font-size:10pt;font-weight:700;">สรุปรายงาน — จำแนกตามผู้ดำเนินการ</div><table style="width:100%;border-collapse:collapse;"><tr style="background:#374151;color:#fff;"><th style="${THS}" rowspan="2">ผู้ดำเนินการ</th><th style="${THS}" colspan="3">COD 1-4 วัน</th><th style="${THS}" colspan="3">COD 5+ วัน</th><th style="${THS}" colspan="3">รวมทั้งหมด</th></tr><tr style="background:#4b5563;color:#fff;"><th style="${THS}font-size:8pt;">มีชิ้นงาน</th><th style="${THS}font-size:8pt;">ไม่มีชิ้นงาน</th><th style="${THS}font-size:8pt;">รวม</th><th style="${THS}font-size:8pt;">มีชิ้นงาน</th><th style="${THS}font-size:8pt;">ไม่มีชิ้นงาน</th><th style="${THS}font-size:8pt;">รวม</th><th style="${THS}font-size:8pt;">มีชิ้นงาน</th><th style="${THS}font-size:8pt;">ไม่มีชิ้นงาน</th><th style="${THS}font-size:8pt;">รวม</th></tr>${sumBody}<tr style="background:#1c2840;color:#fff;font-weight:700;"><td style="${TD2}border-color:#374151;">รวมทั้งหมด</td><td style="${TD2}border-color:#374151;text-align:center;">${gT14h}</td><td style="${TD2}border-color:#374151;text-align:center;">${gT14n}</td><td style="${TD2}border-color:#374151;text-align:center;">${gT14t}</td><td style="${TD2}border-color:#374151;text-align:center;">${gT5h}</td><td style="${TD2}border-color:#374151;text-align:center;">${gT5n}</td><td style="${TD2}border-color:#374151;text-align:center;">${gT5t}</td><td style="${TD2}border-color:#374151;text-align:center;">${gtHas}</td><td style="${TD2}border-color:#374151;text-align:center;">${gtNo}</td><td style="${TD2}border-color:#374151;text-align:center;">${gT14t + gT5t}</td></tr></table></div></div></body></html>`

  const win = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), '_blank')
  if (!win) Swal.fire('ถูกบล็อก', 'กรุณาอนุญาต Pop-up', 'warning')
}

window.generateUrgentReport = function () {
  const reportData = allData.filter(d => d.image_url === 'NO_ITEM').sort((a, b) => (a.operator_id ?? '').localeCompare(b.operator_id ?? '', 'th'))
  if (!reportData.length) { Swal.fire('ไม่มีข้อมูล', 'ยังไม่มีรายการ "ไม่มีชิ้นงาน"', 'info'); return }
  const now = new Date(); const printTime = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); const printDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
  const headName = session.office_head_name ?? ''; const headTitle = session.office_head_title ?? ''
  const TH = 'padding:5px 7px;border:1.5px solid #374151;font-size:8.5pt;text-align:center;background:#1c2840;color:#fff;white-space:nowrap;vertical-align:middle;'; const TD = 'padding:4px 7px;border:1px solid #6b7280;font-size:9pt;vertical-align:middle;'
  const opSummary: Record<string, number> = {}; reportData.forEach(d => { const op = d.operator_id ?? 'ไม่ระบุ'; opSummary[op] = (opSummary[op] ?? 0) + 1 })
  const TDS = 'padding:3px 8px;border:1px dashed #9ca3af;font-size:9pt;vertical-align:middle;'; const THS = 'padding:4px 8px;border:1px solid #374151;font-size:8.5pt;text-align:center;background:#374151;color:#fff;white-space:nowrap;'
  const sumHtml = Object.entries(opSummary).sort(([a], [b]) => a.localeCompare(b, 'th')).map(([op, cnt], i) => `<tr style="background:${i % 2 === 0 ? '#fff' : '#fef9f0'};"><td style="${TDS}text-align:center;">${i + 1}</td><td style="${TDS}font-weight:500;">${op}</td><td style="${TDS}text-align:center;font-weight:700;color:#b91c1c;font-size:11pt;">${cnt}</td><td style="${TDS}text-align:center;color:#6b7280;font-size:8.5pt;">ชิ้น</td></tr>`).join('')
  const rows = reportData.map((d, i) => `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};"><td style="${TD}text-align:center;">${i + 1}</td><td style="${TD}">${d.operator_id ?? '-'}</td><td style="${TD}text-align:center;padding:1px 4px;"><div style="font-family:'Libre Barcode 39 Extended Text',cursive;font-size:34pt;line-height:1.15;">*${d.tracking_no}*</div></td><td style="${TD}text-align:center;">${d.holding_days_dest} วัน</td><td style="${TD}text-align:center;">${d.attempt_count} ครั้ง</td><td style="${TD}min-width:70pt;"></td></tr>`).join('')
  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>รายงานเร่งส่งเงิน</title><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&family=Libre+Barcode+39+Extended+Text&display=swap" rel="stylesheet"><style>@page{size:A4 portrait;margin:12mm 12mm 16mm;}*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Sarabun',sans-serif;font-size:10pt;color:#111827;background:#fff;}@media print{.no-print{display:none!important;}}.toolbar{background:#1c2840;color:#fff;padding:10px 18px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:99;}.btn-print{background:#ef4444;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:14px;cursor:pointer;font-family:inherit;font-weight:600;}.btn-close{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:8px 14px;border-radius:6px;font-size:14px;cursor:pointer;font-family:inherit;}.wrap{padding:3pt 4pt;}table{width:100%;border-collapse:collapse;}</style></head><body><div class="no-print toolbar"><span style="flex:1;font-size:15px;font-weight:700;">รายงานเร่งส่งเงิน — ตัวอย่างก่อนพิมพ์</span><button class="btn-print" onclick="window.print()">🖨 พิมพ์ / บันทึก PDF</button><button class="btn-close" onclick="window.close()">✕ ปิด</button></div><div class="wrap"><div style="border:2px solid #1c2840;margin-bottom:8pt;"><div style="background:#1c2840;color:#fff;padding:6pt 12pt;text-align:center;"><div style="font-size:13pt;font-weight:700;line-height:1.7;">รายงานชิ้นงาน COD ที่ตรวจสอบแล้ว พบว่า "ไม่มีชิ้นงานอยู่จริง"</div><div style="font-size:10.5pt;font-weight:600;color:#fca5a5;">โปรดดำเนินการ นำส่งเงินเข้าระบบ New CA POS ภายในวันนี้</div></div><div style="padding:6pt 12pt;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4pt;font-size:9.5pt;"><div><b>หน่วยงาน :</b> ${session.branch_name}</div><div><b>สถานะเมื่อ :</b> ${printTime} น.</div><div><b>วันที่รายงาน :</b> ${printDate}</div><div style="background:#fff1f1;color:#b91c1c;padding:2pt 8pt;border-radius:3pt;font-weight:600;">${reportData.length} รายการ</div></div></div><div style="margin-bottom:10pt;border:1.5px solid #374151;"><div style="background:#374151;color:#fff;padding:5pt 10pt;font-size:9.5pt;font-weight:700;">สรุปจำนวนรายการ — จำแนกตามผู้ปฏิบัติงาน</div><table><thead><tr><th style="${THS}width:28pt;">ลำดับ</th><th style="${THS}text-align:left;">ผู้ปฏิบัติงาน</th><th style="${THS}width:70pt;">จำนวน</th><th style="${THS}width:40pt;"></th></tr></thead><tbody>${sumHtml}</tbody></table></div><div style="background:#374151;color:#fff;padding:5pt 10pt;font-size:9.5pt;font-weight:700;margin-bottom:0;">รายละเอียดชิ้นงาน พร้อมบาร์โค้ด</div><table><thead><tr><th style="${TH}width:28pt;">ลำดับที่</th><th style="${TH}width:90pt;">ผู้ปฏิบัติงาน</th><th style="${TH}">เลขที่สิ่งของ &amp; บาร์โค้ด</th><th style="${TH}width:52pt;">วันถือครอง</th><th style="${TH}width:48pt;">ครั้งที่นำจ่าย</th><th style="${TH}width:72pt;">รับทราบ</th></tr></thead><tbody>${rows}</tbody></table><div style="margin-top:10pt;padding:7pt 10pt;border:1px solid #d1d5db;font-size:9pt;color:#374151;line-height:1.8;">ขอรับรองว่าข้อมูลที่ระบุข้างต้นนี้เป็นข้อมูลจริง ผ่านการตรวจสอบจากผู้ควบคุมฯ แล้ว จึงเรียนมาให้ดำเนินการ</div><div style="margin-top:16pt;display:flex;justify-content:flex-end;"><div style="text-align:center;line-height:2;"><div style="height:46pt;border-bottom:1px dotted #6b7280;width:200pt;display:flex;align-items:flex-end;justify-content:center;padding-bottom:3pt;"><span style="font-size:8.5pt;color:#9ca3af;">(ลายมือชื่อผู้ออกรายงาน)</span></div><div style="font-size:10.5pt;font-weight:700;margin-top:2pt;">( ${headName} )</div><div style="font-size:10pt;">${headTitle}</div></div></div></div></body></html>`
  const win = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), '_blank')
  if (!win) Swal.fire('ถูกบล็อก', 'กรุณาอนุญาต Pop-up', 'warning')
}

// ── LINE text ─────────────────────────────────────────────────────
window.generateLineText = function () {
  if (!allData.length) { Swal.fire('ไม่พบข้อมูล', '', 'info'); return }
  const target = allData.filter(i => currentTab === '1-4 Days' ? i.holding_days_dest < 5 : i.holding_days_dest >= 5)
  const map: Record<string, { total: number; hasImg: number; noImgList: string[] }> = {}
  target.forEach(i => {
    const op = i.operator_id ?? 'ไม่ระบุ'
    if (!map[op]) map[op] = { total: 0, hasImg: 0, noImgList: [] }
    map[op].total++
    if (i.image_url && i.image_url !== 'NO_ITEM') map[op].hasImg++
    else if (!i.image_url) map[op].noImgList.push(i.tracking_no)
  })
  let text = `📋 รายการที่ยังไม่ถ่ายรูป (${currentTab === '1-4 Days' ? '1-4 วัน' : '5 วันขึ้นไป'})\n\n`
  let hasMissing = false
  for (const [op, d] of Object.entries(map)) {
    if (!d.noImgList.length) continue
    hasMissing = true
    text += `👤 ${op}\n✅ ถ่ายรูปแล้ว ${d.hasImg} ชิ้น\n❌ ที่ยังไม่ถ่ายรูป :\n${d.noImgList.join('\n')}\n⚠️ รวมไม่ถ่ายรูป ${d.noImgList.length} ชิ้น\n\n`
  }
  if (!hasMissing) { Swal.fire('ยอดเยี่ยม!', 'พนักงานทุกคนถ่ายรูปครบแล้ว', 'success'); return }
  Swal.fire({
    title: 'ข้อความสำหรับส่ง LINE',
    html: `<textarea id="lineOut" style="width:100%;height:250px;padding:12px;border-radius:8px;border:1px solid #ccc;font-size:14px;resize:none;" readonly>${text}</textarea>`,
    showCancelButton: true, confirmButtonText: '<i class="fas fa-copy"></i> คัดลอก', cancelButtonText: 'ปิด', confirmButtonColor: '#10b981',
  }).then(r => {
    if (r.isConfirmed) {
      const ta = document.getElementById('lineOut') as HTMLTextAreaElement
      navigator.clipboard.writeText(ta.value).then(() => Swal.fire({ icon: 'success', title: 'คัดลอกแล้ว!', showConfirmButton: false, timer: 1500 }))
    }
  })
}

// ── Navigation ────────────────────────────────────────────────────
window.openMobileMenu  = () => { document.getElementById('mobileMenuOverlay')!.classList.add('show'); document.body.style.overflow = 'hidden' }
window.closeMobileMenu = () => { document.getElementById('mobileMenuOverlay')!.classList.remove('show'); document.body.style.overflow = '' }
window.goEmployee      = () => navigateTo('employee.html')
window.goSettings      = () => navigateTo('settings.html')

window.doLogout = async function () {
  const { clearSession } = await import('../lib/auth')
  clearSession()
  navigateTo('index.html')
}

// ── Global declarations ───────────────────────────────────────────
declare global {
  interface Window {
    changeDate: (d: string) => void
    applyFilters: () => void
    onFilterImageChange: () => void
    switchTab: (t: string) => void
    switchView: (v: string) => void
    openStatsModal: (t: keyof typeof STAT_CFG) => void
    closeStatsModal: () => void
    toggleSMGroup: (op: string) => void
    toggleGroup: (op: string) => void
    allowGroup: (op: string, allow: boolean) => void
    openImgPopup: (t: string, url: string, allowed: boolean) => void
    closeImgPopup: () => void
    imgActionView: () => void
    imgActionCamera: () => void
    imgActionUpload: () => void
    imgActionAllow: (allow: boolean) => void
    imgActionNoItem: () => void
    imgActionClearNoItem: () => void
    handleAdminPhoto: (e: Event) => void
    openModal: (mode: 'create' | 'update', trackingNo?: string) => void
    closeModal: () => void
    modalAllow: (allow: boolean) => void
    modalNoItem: () => void
    modalClearNoItem: () => void
    saveItem: (e: Event) => void
    deleteItem: (t: string) => void
    deleteAllToday: () => void
    triggerUpload: (cat: string) => void
    processUpload: (cat: '1-4 Days' | '5+ Days', input: HTMLInputElement) => void
    exportExcel: () => void
    generateReport: () => void
    generateUrgentReport: () => void
    generateLineText: () => void
    openMobileMenu: () => void
    closeMobileMenu: () => void
    goEmployee: () => void
    goSettings: () => void
    doLogout: () => void
  }
}
