// ── ปุ่มดู/ซ่อนรหัสผ่าน (eye toggle) ───────────────────────────────
//  เรียกครั้งเดียวต่อหน้า — จะเติมปุ่ม 👁 ให้ทุก input[type=password] อัตโนมัติ
export function initPasswordToggles(root: ParentNode = document): void {
  const inputs = root.querySelectorAll<HTMLInputElement>('input[type="password"]')
  inputs.forEach(input => {
    if (input.dataset.pwToggled) return
    input.dataset.pwToggled = '1'

    const wrap = document.createElement('span')
    wrap.className = 'pw-field'
    input.parentNode?.insertBefore(wrap, input)
    wrap.appendChild(input)

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'pw-eye'
    btn.setAttribute('aria-label', 'แสดง/ซ่อนรหัสผ่าน')
    btn.innerHTML = '<i class="fas fa-eye"></i>'
    btn.addEventListener('click', () => {
      const reveal = input.type === 'password'
      input.type = reveal ? 'text' : 'password'
      btn.innerHTML = reveal ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>'
      input.focus()
    })
    wrap.appendChild(btn)
  })
}
