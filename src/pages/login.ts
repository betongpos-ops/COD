import { sb } from '../lib/supabase'
import { login, saveSession, getSession, navigateTo } from '../lib/auth'
import { initPasswordToggles } from '../lib/pwtoggle'
import type { Branch, Session } from '../types'
import Swal from 'sweetalert2'

// ── Redirect if already logged in ────────────────────────────────
const existing = getSession()
if (existing) {
  navigateTo(existing.role === 'admin' ? 'admin.html' : 'employee.html')
}

// ── State ─────────────────────────────────────────────────────────
let allBranches: Branch[] = []
let selectedBranch: Branch | null = null

// ── Load branches ─────────────────────────────────────────────────
async function loadBranches() {
  const { data, error } = await sb.from('branches').select('id,name,postal_code,is_active').eq('is_active', true).order('postal_code')
  if (error || !data?.length) {
    document.getElementById('branchList')!.innerHTML = `
      <div class="center-msg">
        <i class="fas fa-exclamation-triangle" style="font-size:28px;display:block;margin-bottom:8px;color:var(--amber-600);"></i>
        <p>ไม่สามารถโหลดข้อมูลได้</p>
      </div>`
    return
  }
  allBranches = data as Branch[]
  renderBranches(allBranches)
}

function renderBranches(list: Branch[]) {
  const el = document.getElementById('branchList')!
  if (!list.length) {
    el.innerHTML = `<div class="no-result"><i class="fas fa-search" style="font-size:20px;display:block;margin-bottom:6px;"></i>ไม่พบที่ทำการที่ค้นหา</div>`
    return
  }
  el.innerHTML = list.map(b => `
    <button class="branch-chip" onclick="selectBranch('${b.postal_code}')">
      <span class="branch-chip-code">${b.postal_code}</span>
      <span class="branch-chip-name">${b.name}</span>
      <i class="fas fa-chevron-right" style="margin-left:auto;color:var(--gray-300);font-size:12px;"></i>
    </button>`).join('')
}

// ── Step navigation ───────────────────────────────────────────────
function showStep(n: number) {
  document.querySelectorAll('.login-step').forEach(el => el.classList.remove('active'))
  document.getElementById(`step${n}`)!.classList.add('active')
}

window.filterBranches = function () {
  const q = (document.getElementById('branchSearch') as HTMLInputElement).value.toLowerCase().trim()
  renderBranches(q ? allBranches.filter(b => b.postal_code.includes(q) || b.name.toLowerCase().includes(q)) : allBranches)
}

window.selectBranch = function (postalCode: string) {
  selectedBranch = allBranches.find(b => b.postal_code === postalCode) ?? null
  if (!selectedBranch) return
  document.getElementById('selectedBranchLabel')!.textContent = `${selectedBranch.postal_code} — ${selectedBranch.name}`
  document.getElementById('loginSub')!.textContent = 'เลือกโหมดการใช้งาน'
  showStep(2)
}

window.backToStep1 = function () {
  selectedBranch = null
  document.getElementById('loginSub')!.textContent = 'เลือกที่ทำการไปรษณีย์'
  showStep(1)
}

window.backToStep2 = function () {
  document.getElementById('loginSub')!.textContent = 'เลือกโหมดการใช้งาน';
  (document.getElementById('adminPasswordInput') as HTMLInputElement).value = ''
  showStep(2)
}

window.chooseMode = async function (mode: 'employee' | 'admin') {
  if (!selectedBranch) return

  if (mode === 'employee') {
    // Employee: validate postalCode as password via RPC
    const result = await login(selectedBranch.postal_code, selectedBranch.postal_code)
    if (!result.success) {
      Swal.fire('ข้อผิดพลาด', result.message ?? 'เข้าสู่ระบบไม่สำเร็จ', 'error')
      return
    }
    saveSession(result as Session)
    navigateTo('employee.html')
  } else {
    document.getElementById('step3BranchLabel')!.textContent = selectedBranch.name
    document.getElementById('loginSub')!.textContent = 'รหัสผ่าน Admin'
    showStep(3)
    setTimeout(() => (document.getElementById('adminPasswordInput') as HTMLInputElement).focus(), 100)
  }
}

window.submitAdminLogin = async function () {
  if (!selectedBranch) return
  const pw = (document.getElementById('adminPasswordInput') as HTMLInputElement).value.trim()
  if (!pw) return

  Swal.fire({ title: 'กำลังตรวจสอบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })

  const result = await login(selectedBranch.postal_code, pw)
  if (!result.success) {
    Swal.fire('ไม่สำเร็จ', result.message ?? 'รหัสผ่านไม่ถูกต้อง', 'error')
    return
  }
  Swal.close()
  saveSession(result as Session)
  navigateTo('admin.html')
}

// ── Global declarations ───────────────────────────────────────────
declare global {
  interface Window {
    filterBranches: () => void
    selectBranch: (code: string) => void
    backToStep1: () => void
    backToStep2: () => void
    chooseMode: (mode: 'employee' | 'admin') => void
    submitAdminLogin: () => void
  }
}

// ── Init ──────────────────────────────────────────────────────────
loadBranches()
initPasswordToggles()
