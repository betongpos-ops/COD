import Swal from 'sweetalert2'
import { QMS_API_URL } from './config'
import { sb } from './supabase'

export const QMS_API_URL_STORAGE_KEY = 'qms_api_url'

export function getQmsApiUrl(): string {
  const saved = localStorage.getItem(QMS_API_URL_STORAGE_KEY)?.trim()
  return saved || QMS_API_URL
}

export function normalizeQmsApiUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function htmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function verifySuperAdmin(username: string, password: string): Promise<boolean> {
  const { data, error } = await sb.rpc('verify_super_admin', {
    p_username: username,
    p_password: password,
  })
  if (error) throw error
  return data === true
}

export async function setQmsApiUrlWithSuperAdmin(): Promise<void> {
  const auth = await Swal.fire({
    title: 'ยืนยันสิทธิ์ Super Admin',
    html: `
      <div style="text-align:left">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Username</label>
        <input id="superAdminUser" class="swal2-input" style="margin:0 0 10px;width:100%;" autocomplete="username" placeholder="admin">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Password</label>
        <input id="superAdminPassword" class="swal2-input" style="margin:0;width:100%;" type="password" autocomplete="current-password" placeholder="รหัสผ่าน Super Admin">
      </div>`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'ยืนยันสิทธิ์',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#002169',
    preConfirm: async () => {
      const username = (document.getElementById('superAdminUser') as HTMLInputElement).value.trim()
      const password = (document.getElementById('superAdminPassword') as HTMLInputElement).value
      if (!username || !password) {
        Swal.showValidationMessage('กรุณากรอก Username และ Password')
        return false
      }
      try {
        const ok = await verifySuperAdmin(username, password)
        if (!ok) {
          Swal.showValidationMessage('Username หรือ Password ไม่ถูกต้อง')
          return false
        }
        return true
      } catch (err) {
        console.error('[QMS API URL] verify_super_admin failed', err)
        const message = err instanceof Error ? err.message : String(err)
        Swal.showValidationMessage(`ตรวจสิทธิ์ไม่สำเร็จ: ${message}`)
        return false
      }
    },
  })
  if (!auth.isConfirmed) return

  const hasOverride = !!localStorage.getItem(QMS_API_URL_STORAGE_KEY)
  const currentUrl = normalizeQmsApiUrl(getQmsApiUrl())
  const currentSource = hasOverride ? 'URL ที่บันทึกไว้ในเครื่องนี้' : 'ค่าเริ่มต้นจากระบบ'
  const result = await Swal.fire({
    title: 'ตั้งค่า QMS API',
    html: `
      <div style="text-align:left">
        <div style="margin-bottom:10px;font-size:13px;color:#4b5563;line-height:1.5;">
          สถานะปัจจุบัน: <b>${currentSource}</b><br>
          URL ที่ระบบจะใช้ตอนนี้:<br>
          <code style="display:block;margin-top:5px;padding:7px 9px;border-radius:6px;background:#f3f4f6;color:#111827;word-break:break-all;">${htmlEscape(currentUrl)}</code>
        </div>
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">QMS API URL</label>
        <input id="qmsApiUrlInput" class="swal2-input" style="margin:0;width:100%;" value="${htmlEscape(currentUrl)}" placeholder="https://xxxx.ngrok-free.dev" autocomplete="off">
        <div style="margin-top:8px;font-size:12px;color:#6b7280;line-height:1.5;">
          ตรวจสอบหรือแก้ลิงก์ ngrok ได้จากช่องนี้ หากกดใช้ค่าเริ่มต้น ระบบจะลบ URL ที่บันทึกไว้ในเครื่องนี้
        </div>
      </div>`,
    focusConfirm: false,
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: 'บันทึก URL',
    denyButtonText: 'ใช้ค่าเริ่มต้น',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#002169',
    preConfirm: () => {
      const raw = (document.getElementById('qmsApiUrlInput') as HTMLInputElement).value.trim()
      if (!raw) {
        Swal.showValidationMessage('กรุณากรอก URL ใหม่')
        return false
      }
      if (!/^https?:\/\//i.test(raw)) {
        Swal.showValidationMessage('URL ต้องขึ้นต้นด้วย http:// หรือ https://')
        return false
      }
      return normalizeQmsApiUrl(raw)
    },
  })

  if (result.isConfirmed && result.value) {
    localStorage.setItem(QMS_API_URL_STORAGE_KEY, result.value)
    Swal.fire({
      icon: 'success',
      title: 'บันทึก QMS API แล้ว',
      html: `ระบบจะใช้ URL นี้สำหรับการดึงข้อมูล QMS ในเครื่องนี้<br><code style="word-break:break-all;">${htmlEscape(result.value)}</code>`,
      confirmButtonColor: '#002169',
    })
  } else if (result.isDenied) {
    localStorage.removeItem(QMS_API_URL_STORAGE_KEY)
    Swal.fire({
      icon: 'success',
      title: 'กลับไปใช้ค่าเริ่มต้นแล้ว',
      html: `ลบ URL ที่บันทึกไว้ในเครื่องนี้แล้ว<br><code style="word-break:break-all;">${htmlEscape(normalizeQmsApiUrl(QMS_API_URL))}</code>`,
      confirmButtonColor: '#002169',
    })
  }
}
