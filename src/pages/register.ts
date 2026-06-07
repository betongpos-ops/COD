import Swal from 'sweetalert2'
import { registerBranch } from '../lib/supabase'
import { navigateTo } from '../lib/auth'

// ── Navigation ────────────────────────────────────────────────────
window.goLogin = () => navigateTo('index.html')

// ── Submit ────────────────────────────────────────────────────────
window.submitRegister = async function () {
  const postal    = (document.getElementById('r_postal_code') as HTMLInputElement).value.trim()
  const name      = (document.getElementById('r_name')        as HTMLInputElement).value.trim()
  const headName  = (document.getElementById('r_head_name')   as HTMLInputElement).value.trim()
  const headTitle = (document.getElementById('r_head_title')  as HTMLInputElement).value.trim()
  const pw        = (document.getElementById('r_password')    as HTMLInputElement).value.trim()
  const pw2       = (document.getElementById('r_password2')   as HTMLInputElement).value.trim()

  // Client-side validation
  if (!postal) { alert('กรุณากรอกรหัสไปรษณีย์'); return }
  if (postal.length < 4) { alert('รหัสไปรษณีย์ต้องมีอย่างน้อย 4 หลัก'); return }
  if (!name) { alert('กรุณากรอกชื่อที่ทำการ'); return }
  if (pw && pw.length < 4) { alert('รหัสผ่าน Admin ต้องมีอย่างน้อย 4 ตัวอักษร'); return }
  if (pw && pw !== pw2) { alert('รหัสผ่านไม่ตรงกัน'); return }
  if (pw && pw === postal) { alert('รหัสผ่าน Admin ต้องไม่เท่ากับรหัสไปรษณีย์'); return }

  Swal.fire({ title: 'กำลังสมัครใช้งาน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })

  try {
    const result = await registerBranch({
      postalCode:     postal,
      name,
      officeHeadName:  headName  || undefined,
      officeHeadTitle: headTitle || undefined,
      switchPassword:  pw        || undefined,
    })

    if (!result.success) {
      Swal.fire({ icon: 'error', title: 'สมัครไม่สำเร็จ', text: result.message })
      return
    }

    Swal.close()

    // แสดง Success screen
    const adminPw = pw || postal + '_ADMIN'
    ;(document.getElementById('sc_name')     as HTMLElement).textContent = name
    ;(document.getElementById('sc_postal')   as HTMLElement).textContent = postal
    ;(document.getElementById('sc_emp_pw')   as HTMLElement).textContent = postal
    ;(document.getElementById('sc_admin_pw') as HTMLElement).textContent = adminPw

    document.getElementById('formSection')!.style.display    = 'none'
    document.getElementById('successSection')!.style.display = 'block'

  } catch (err) {
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: String(err) })
  }
}

// ── Global declarations ───────────────────────────────────────────
declare global {
  interface Window {
    submitRegister: () => void
    goLogin: () => void
  }
}
