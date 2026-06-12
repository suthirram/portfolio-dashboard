import type { components } from './schema.gen'
import type {
  ForexRate,
  Holding,
  HoldingInput,
  HoldingWithPrice,
  MarketPrice,
  PricesResponse,
  Summary,
} from '../../types'

type Schemas = components['schemas']
export type Region = Schemas['Region']
export type SecurityQuestion = Schemas['SecurityQuestion']
export type SecurityAnswerInput = Schemas['SecurityAnswerInput']
export type User = Schemas['User']
export type SignupRequest = Schemas['SignupRequest']
export type LoginRequest = Schemas['LoginRequest']
export type RecoverRequest = Schemas['RecoverRequest']
export type RecoverQuestionsRequest = Schemas['RecoverQuestionsRequest']
export type ChangePasswordRequest = Schemas['ChangePasswordRequest']
export type UpdateProfileRequest = Schemas['UpdateProfileRequest']
export type UpdateSecurityQuestionsRequest = Schemas['UpdateSecurityQuestionsRequest']
export type OnboardingRequest = Schemas['OnboardingRequest']
export type RegionUpdateRequest = Schemas['RegionUpdateRequest']

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

// CSRF: with SameSite=None cookies we require a custom header on every
// state-changing request. A cross-origin form can't add it without a
// preflight, which the explicit-origin CORS config denies (DD-001 §5).
const CSRF_HEADER = 'X-Requested-With'
const CSRF_VALUE = 'portfolio-dashboard'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (method !== 'GET' && method !== 'HEAD') headers[CSRF_HEADER] = CSRF_VALUE
  const opts: RequestInit = { method, headers, credentials: 'include' }
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
    throw new ApiError(res.status, msg)
  }

  return data as T
}

interface DeleteResponse {
  message?: string
}

export const api = {
  // Auth — public.
  getRegions:           () => request<Region[]>('GET', '/regions'),
  getQuestions:         () => request<SecurityQuestion[]>('GET', '/auth/security-questions'),
  signup:               (body: SignupRequest) => request<User>('POST', '/auth/signup', body),
  login:                (body: LoginRequest)  => request<User>('POST', '/auth/login', body),
  recoverQuestions:     (body: RecoverQuestionsRequest) => request<SecurityQuestion[]>('POST', '/auth/recover/questions', body),
  recoverPassword:      (body: RecoverRequest)  => request<void>('POST', '/auth/recover', body),

  // Auth — session.
  me:                   () => request<User>('GET', '/auth/me'),
  logout:               () => request<void>('POST', '/auth/logout'),
  updatePassword:       (body: ChangePasswordRequest) => request<void>('PUT', '/auth/password', body),
  updateProfile:        (body: UpdateProfileRequest)  => request<User>('PUT', '/auth/profile', body),
  updateSecurityQs:     (body: UpdateSecurityQuestionsRequest) => request<void>('PUT', '/auth/security-questions/answers', body),
  completeOnboarding:   (body: OnboardingRequest) => request<User>('POST', '/auth/onboarding', body),

  // Holdings CRUD (own portfolio when userId is undefined; act-as when set).
  listHoldings:   (userId?: string) =>
    request<Holding[]>('GET', userId ? `/admin/users/${userId}/holdings` : '/holdings'),
  createHolding:  (body: HoldingInput, userId?: string) =>
    request<Holding>('POST', userId ? `/admin/users/${userId}/holdings` : '/holdings', body),
  updateHolding:  (id: string, body: HoldingInput, userId?: string) =>
    request<Holding>('PUT', userId ? `/admin/users/${userId}/holdings/${id}` : `/holdings/${id}`, body),
  deleteHolding:  (id: string, userId?: string) =>
    request<DeleteResponse>('DELETE', userId ? `/admin/users/${userId}/holdings/${id}` : `/holdings/${id}`),
  getPrices:      (userId?: string) =>
    request<PricesResponse>('GET', userId ? `/admin/users/${userId}/prices` : '/prices'),
  getSummary:     (userId?: string) =>
    request<Summary>('GET', userId ? `/admin/users/${userId}/summary` : '/summary'),

  // Market.
  getMarketPrice: (symbol: string) => request<MarketPrice>('GET', `/market/price?symbol=${encodeURIComponent(symbol)}`),
  getForexRate:   (from = 'INR', to = 'EUR') => request<ForexRate>('GET', `/market/forex?from=${from}&to=${to}`),

  // Admin.
  adminListUsers:       (includeHidden = false) => request<User[]>('GET', `/admin/users${includeHidden ? '?include_hidden=1' : ''}`),
  adminGetUser:         (id: string) => request<User>('GET', `/admin/users/${id}`),
  adminDeleteUser:      (id: string) => request<DeleteResponse>('DELETE', `/admin/users/${id}`),
  adminResetLockout:    (id: string) => request<void>('POST', `/admin/users/${id}/reset-lockout`, {}),
  adminHideUser:        (id: string) => request<void>('POST', `/admin/users/${id}/hide`, {}),
  adminReactivateUser:  (id: string) => request<void>('POST', `/admin/users/${id}/reactivate`, {}),
  adminPromoteUser:     (id: string) => request<User>('POST', `/admin/users/${id}/promote`, {}),
  adminDemoteUser:      (id: string) => request<User>('POST', `/admin/users/${id}/demote`, {}),
  adminSetUserRegion:   (id: string, body: RegionUpdateRequest) => request<User>('PUT', `/admin/users/${id}/region`, body),
  adminListAdmins:      () => request<User[]>('GET', '/admin/admins'),
}

// Helper re-exports for callers that want price-enriched holdings.
export type { HoldingWithPrice }
