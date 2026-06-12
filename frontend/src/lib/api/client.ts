import type {
  AuthResponse,
  AuthUser,
  ChangePasswordRequest,
  ForexRate,
  Holding,
  HoldingInput,
  MarketPrice,
  MessageResponse,
  PricesResponse,
  RecoverRequest,
  RecoverResponse,
  Region,
  SecurityQuestion,
  SignupRequest,
  Summary,
  UpdateProfileRequest,
  UpdateSecurityQuestionsRequest,
  UpdateUserRegionRequest,
} from '../../types'

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'portfolio-dashboard',
    },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)

  const res = await fetch(`${BASE}${path}`, opts)
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      // Non-JSON body (e.g. an HTML error page from an upstream proxy);
      // fall through and surface the raw text via the HTTP status below.
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string')
        ? (data as { error: string }).error
        : text || `HTTP ${res.status}`
    throw new Error(msg)
  }

  return data as T
}

export const api = {
  // Auth
  listRegions:            ()                               => request<Region[]>('GET', '/regions'),
  listSecurityQuestions:  ()                               => request<SecurityQuestion[]>('GET', '/auth/security-questions'),
  signup:                 (body: SignupRequest)            => request<AuthResponse>('POST', '/auth/signup', body),
  login:                  (username: string, password: string) => request<AuthResponse>('POST', '/auth/login', { username, password }),
  recover:                (body: RecoverRequest)           => request<RecoverResponse>('POST', '/auth/recover', body),
  me:                     ()                               => request<AuthUser>('GET', '/auth/me'),
  logout:                 ()                               => request<MessageResponse>('POST', '/auth/logout'),
  changePassword:         (body: ChangePasswordRequest)    => request<AuthUser>('PUT', '/auth/password', body),
  updateProfile:          (body: UpdateProfileRequest)     => request<AuthUser>('PUT', '/auth/profile', body),
  updateSecurityQuestions:(body: UpdateSecurityQuestionsRequest) => request<AuthUser>('PUT', '/auth/security-questions', body),

  // Holdings CRUD
  listHoldings:   ()                               => request<Holding[]>('GET', '/holdings'),
  getHolding:     (id: string)                     => request<Holding>('GET', `/holdings/${id}`),
  createHolding:  (body: HoldingInput)             => request<Holding>('POST', '/holdings', body),
  updateHolding:  (id: string, body: HoldingInput) => request<Holding>('PUT', `/holdings/${id}`, body),
  deleteHolding:  (id: string)                     => request<MessageResponse>('DELETE', `/holdings/${id}`),

  // Market data
  getPrices:      ()                               => request<PricesResponse>('GET', '/prices'),
  getSummary:     ()                               => request<Summary>('GET', '/summary'),
  getMarketPrice: (symbol: string)                 => request<MarketPrice>('GET', `/market/price?symbol=${encodeURIComponent(symbol)}`),
  getForexRate:   (from = 'INR', to = 'EUR')       => request<ForexRate>('GET', `/market/forex?from=${from}&to=${to}`),

  // Admin
  listAdminUsers:          (includeHidden = false)  => request<AuthUser[]>('GET', `/admin/users?include_hidden=${includeHidden ? 'true' : 'false'}`),
  listAdmins:              ()                       => request<AuthUser[]>('GET', '/admin/admins'),
  getAdminUser:            (id: string)             => request<AuthUser>('GET', `/admin/users/${id}`),
  resetAdminUserLockout:   (id: string)             => request<AuthUser>('POST', `/admin/users/${id}/reset-lockout`),
  hideAdminUser:           (id: string)             => request<AuthUser>('POST', `/admin/users/${id}/hide`),
  reactivateAdminUser:     (id: string)             => request<AuthUser>('POST', `/admin/users/${id}/reactivate`),
  deleteAdminUser:         (id: string)             => request<MessageResponse>('DELETE', `/admin/users/${id}`),
  promoteAdminUser:        (id: string)             => request<AuthUser>('POST', `/admin/users/${id}/promote`),
  demoteAdminUser:         (id: string)             => request<AuthUser>('POST', `/admin/users/${id}/demote`),
  updateAdminUserRegion:   (id: string, body: UpdateUserRegionRequest) => request<AuthUser>('PUT', `/admin/users/${id}/region`, body),
  listAdminUserHoldings:   (id: string)                       => request<Holding[]>('GET', `/admin/users/${id}/holdings`),
  createAdminUserHolding:  (id: string, body: HoldingInput)    => request<Holding>('POST', `/admin/users/${id}/holdings`, body),
  getAdminUserHolding:     (id: string, holdingId: string)     => request<Holding>('GET', `/admin/users/${id}/holdings/${holdingId}`),
  updateAdminUserHolding:  (id: string, holdingId: string, body: HoldingInput) => request<Holding>('PUT', `/admin/users/${id}/holdings/${holdingId}`, body),
  deleteAdminUserHolding:  (id: string, holdingId: string)     => request<MessageResponse>('DELETE', `/admin/users/${id}/holdings/${holdingId}`),
  getAdminUserPrices:      (id: string)                       => request<PricesResponse>('GET', `/admin/users/${id}/prices`),
  getAdminUserSummary:     (id: string)                       => request<Summary>('GET', `/admin/users/${id}/summary`),
}
