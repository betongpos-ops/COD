import Swal from 'sweetalert2'
import { requireSession, clearSession, navigateTo } from '../lib/auth'
import { fetchAvailableDates, updateBranchSettings } from '../lib/supabase'
import { formatDateThai, todayISO } from '../lib/utils'
import type { Session } from '../types'

const session: Session = requireSession('admin')
document.getElementById('branchLabel')!.textContent = `${session.postal_code} — ${session.branch_name}`

// ── Populate fields ───────────────────────────────────────────────
;(document.getElementById('s_postal_code') as HTMLInputElement).value = session.postal_code
;(document.getElementById('displayPostalCode') as HTMLElement).textContent = session.postal_code

// ── Load date stats ───────────────────────────────────────────────
async function loadDateStats() {
  try {
    const dates = await fetchAvailableDates(session.branch_id)
    const today = todayISO()
    const el = document.getElementById('dateStatsList')!
    if (!dates.length) {
      el.innerHTML = `<div class="no-result">ยังไม่มีข้อมูล</div>`
      return
    }
    el.innerHTML = `<table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="text-align:left;padding:8px 10px;font-size:12px;color:var(--gray-500);font-weight:600;text-transform:uppercase;border-bottom:1px solid var(--gray-200);">วันที่</th>
        <th style="text-align:center;padding:8px 10px;font-size:12px;color:var(--gray-500);font-weight:600;text-transform:uppercase;border-bottom:1px solid var(--gray-200);">จำนวน</th>
        <th style="padding:8px 10px;border-bottom:1px solid var(--gray-200);"></th>
      </tr></thead>
      <tbody>
      ${dates.map((d, i) => `<tr style="background:${i % 2 === 0 ? '#fff' : 'var(--gray-50)'};">
        <td style="padding:10px;font-size:14px;">
          ${formatDateThai(d.date)}
          ${d.date === today ? `<span class="badge badge-green" style="margin-left:6px;">วันนี้</span>` : ''}
        </td>
        <td style="padding:10px;text-align:center;font-family:var(--mono);font-weight:600;">${d.total}</td>
        <td style="padding:10px;text-align:right;"></td>
      </tr>`).join('')}
      </tbody>
    </table>`
  } catch { /* silent */ }
}

// Fetch branch name & head from DB for latest values
async function loadBranchInfo() {
  try {
    const { sb } = await import('../lib/supabase')
    const { data } = await sb.from('branches').select('name,office_head_name,office_head_title').eq('id', session.branch_id).single()
    if (data) {
      ;(document.getElementById('s_name') as HTMLInputElement).value = data.name ?? ''
      ;(document.getElementById('s_head_name') as HTMLInputElement).value = data.office_head_name ?? ''
      ;(document.getElementById('s_head_title') as HTMLInputElement).value = data.office_head_title ?? ''
    }
  } catch { /* use session values */ }
}

// ── Save branch info ──────────────────────────────────────────────
window.saveBranchInfo = async function () {
  const name  = (document.getElementById('s_name')       as HTMLInputElement).value.trim()
  const hName = (document.getElementById('s_head_name')  as HTMLInputElement).value.trim()
  const hTit  = (document.getElementById('s_head_title') as HTMLInputElement).value.trim()

  if (!name) { Swal.fire('แจ้งเตือน', 'กรุณากรอกชื่อที่ทำการ', 'warning'); return }

  Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
  try {
    await updateBranchSettings({
      branchId:        session.branch_id,
      name:            name || undefined,
      officeHeadName:  hName || undefined,
      officeHeadTitle: hTit  || undefined,
    })
    // Update session
    session.branch_name       = name
    session.office_head_name  = hName || null
    session.office_head_title = hTit  || null
    const { saveSession } = await import('../lib/auth')
    saveSession(session)
    document.getElementById('branchLabel')!.textContent = `${session.postal_code} — ${session.branch_name}`
    Swal.fire({ icon: 'success', title: 'บันทึกเรียบร้อย', showConfirmButton: false, timer: 1400 })
  } catch (err) { Swal.fire('ข้อผิดพลาด', String(err), 'error') }
}

// ── Save password ─────────────────────────────────────────────────
window.savePassword = async function () {
  const newPw  = (document.getElementById('s_new_password')     as HTMLInputElement).value.trim()
  const confPw = (document.getElementById('s_confirm_password') as HTMLInputElement).value.trim()

  if (!newPw)          { Swal.fire('แจ้งเตือน', 'กรุณากรอกรหัสผ่านใหม่', 'warning'); return }
  if (newPw !== confPw){ Swal.fire('แจ้งเตือน', 'รหัสผ่านไม่ตรงกัน', 'warning'); return }
  if (newPw === session.postal_code) { Swal.fire('แจ้งเตือน', 'รหัส Admin ต้องไม่เท่ากับรหัสไปรษณีย์', 'warning'); return }
  if (newPw.length < 4) { Swal.fire('แจ้งเตือน', 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร', 'warning'); return }

  const ok = await Swal.fire({
    icon: 'question', title: 'ยืนยันเปลี่ยนรหัสผ่าน?',
    html: `รหัสผ่าน Admin ใหม่: <b style="font-family:monospace;">${newPw}</b>`,
    showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก',
  })
  if (!ok.isConfirmed) return

  Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
  try {
    await updateBranchSettings({ branchId: session.branch_id, switchPassword: newPw })
    ;(document.getElementById('s_new_password')     as HTMLInputElement).value = ''
    ;(document.getElementById('s_confirm_password') as HTMLInputElement).value = ''
    Swal.fire({ icon: 'success', title: 'เปลี่ยนรหัสผ่านแล้ว', showConfirmButton: false, timer: 1400 })
  } catch (err) { Swal.fire('ข้อผิดพลาด', String(err), 'error') }
}

// ── Logout ────────────────────────────────────────────────────────
window.doLogout = async function () {
  const ok = await Swal.fire({
    icon: 'question', title: 'ออกจากระบบ?',
    text: 'Session จะถูกล้าง คุณจะต้อง Login ใหม่',
    showCancelButton: true, confirmButtonText: 'ออกจากระบบ', cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#ef3e25',
  })
  if (ok.isConfirmed) { clearSession(); navigateTo('index.html') }
}

window.goAdmin = () => navigateTo('admin.html')

// ── Global declarations ───────────────────────────────────────────
declare global {
  interface Window {
    saveBranchInfo: () => void
    savePassword: () => void
    doLogout: () => void
    goAdmin: () => void
  }
}

// ── Init ──────────────────────────────────────────────────────────
loadBranchInfo()
loadDateStats()
