import type { Session, AuthResult } from '../types'
import { authenticateBranch } from './supabase'

const KEY = 'cod_session'

export async function login(postalCode: string, password: string): Promise<AuthResult> {
  return authenticateBranch(postalCode.trim(), password.trim())
}

export function saveSession(session: Session): void {
  localStorage.setItem(KEY, JSON.stringify(session))
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function clearSession(): void {
  localStorage.removeItem(KEY)
}

// Redirect to login if not authenticated; optionally require admin role
export function requireSession(role?: 'admin' | 'employee'): Session {
  const s = getSession()
  if (!s) {
    redirectTo('index.html')
    throw new Error('Not authenticated')
  }
  if (role === 'admin' && s.role !== 'admin') {
    redirectTo('index.html')
    throw new Error('Admin required')
  }
  return s
}

function redirectTo(page: string) {
  window.location.href = import.meta.env.BASE_URL + page
}

export function navigateTo(page: string) {
  redirectTo(page)
}
