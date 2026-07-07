import type { components } from './schema.gen'
import type {
  ForexRate,
  Holding,
  HoldingInput,
  HoldingWithPrice,
  MarketPrice,
  PricesResponse,
  Summary,
  Transaction,
  TransactionInput,
} from '../../types'
import {
  holdingPath,
  holdingsPath,
  pricesPath,
  summaryPath,
} from '../../features/admin/actAsRouting'

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
export type GoldToggleRequest = Schemas['GoldToggleRequest']
export type GoldTransaction = Schemas['GoldTransaction']
export type GoldTransactionInput = Schemas['GoldTransactionInput']

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
  // Path mapping lives in features/admin/actAsRouting.ts.
  listHoldings:   (userId?: string) =>
    request<Holding[]>('GET', holdingsPath(userId)),
  createHolding:  (body: HoldingInput, userId?: string) =>
    request<Holding>('POST', holdingsPath(userId), body),
  updateHolding:  (id: string, body: HoldingInput, userId?: string) =>
    request<Holding>('PUT', holdingPath(id, userId), body),
  deleteHolding:  (id: string, userId?: string) =>
    request<DeleteResponse>('DELETE', holdingPath(id, userId)),
  getPrices:      (userId?: string) =>
    request<PricesResponse>('GET', pricesPath(userId)),
  getSummary:     (userId?: string) =>
    request<Summary>('GET', summaryPath(userId)),

  // Transactions — per-holding ledger. The holding's position is recomputed
  // server-side after every write, so callers should refresh holdings/prices.
  listTransactions:   (holdingId: string) =>
    request<Transaction[]>('GET', `/holdings/${holdingId}/transactions`),
  createTransaction:  (holdingId: string, body: TransactionInput) =>
    request<Transaction>('POST', `/holdings/${holdingId}/transactions`, body),
  updateTransaction:  (id: string, body: TransactionInput) =>
    request<Transaction>('PUT', `/transactions/${id}`, body),
  deleteTransaction:  (id: string) =>
    request<DeleteResponse>('DELETE', `/transactions/${id}`),

  // Market.
  getMarketPrice: (symbol: string) => request<MarketPrice>('GET', `/market/price?symbol=${encodeURIComponent(symbol)}`),
  getForexRate:   (from = 'INR', to = 'EUR') => request<ForexRate>('GET', `/market/forex?from=${from}&to=${to}`),

  // History (PR6 — plain Echo routes, not yet in OpenAPI; types inlined below).
  listHistory:        (from: string, to: string) => request<HistoryList>('GET', `/history?from=${from}&to=${to}`),
  addHistoryRow:      (body: AddHistoryRowInput) => request<HistoryRow>('POST', '/history', body),
  patchHistoryRegions:(date: string, body: PatchHistoryRegionsInput) => request<HistoryRow>('PUT', `/history/${date}/regions`, body),
  deleteHistoryRow:   (date: string) => request<void>('DELETE', `/history/${date}`),
  pasteHistory:       (body: PasteHistoryInput) => request<PasteHistoryReport>('POST', '/history/paste', body),

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
  adminSetUserGold:     (id: string, body: GoldToggleRequest) => request<void>('PUT', `/admin/users/${id}/gold`, body),

  listGoldTransactions:  () => request<GoldTransaction[]>('GET', '/gold/transactions'),
  createGoldTransaction: (body: GoldTransactionInput) => request<GoldTransaction>('POST', '/gold/transactions', body),
  updateGoldTransaction: (id: number, body: GoldTransactionInput) => request<GoldTransaction>('PUT', `/gold/transactions/${id}`, body),
  deleteGoldTransaction: (id: number) => request<void>('DELETE', `/gold/transactions/${id}`),
  adminListAdmins:      () => request<User[]>('GET', '/admin/admins'),
}

// ---- History types ----
// Shape mirrors backend/internal/services/history.go. When the strict-
// server migration in PD-042 §3.6 happens, replace these with
// Schemas['HistoryRow'] etc.

export type SnapshotSource = 'cron' | 'manual'

export interface RegionSnapshot {
  invested: number
  current: number
  source: SnapshotSource
}

export interface HistoryTotals {
  invested_total: number
  current_total: number
  pnl_pct: number | null
}

export interface HistoryHolding {
  symbol: string
  script: string
  currency: string
  quantity: number
  close_price: number
  price_date?: string
  current?: number
}

// Physical-gold overlay on a history row (PRD-003 §8); present only for
// gold-enabled users on dates on/after their first purchase with a price.
export interface GoldHistoryOverlay {
  invested: number
  current: number
  volatility_pct: number
  pnl_pct: number | null
}

export interface HistoryRow {
  date: string
  regions: Record<string, RegionSnapshot>
  totals: HistoryTotals
  // Per-stock breakdown for cron rows; absent on manual-only rows.
  holdings?: HistoryHolding[]
  // Gold position as-of the row date; absent for non-gold users / pre-purchase rows.
  gold?: GoldHistoryOverlay
}

export interface HistoryList {
  currency: string
  rows: HistoryRow[]
}

export interface AddHistoryRowInput {
  date: string
  regions: Record<string, Omit<RegionSnapshot, 'source'>>
}

export interface PatchHistoryRegionsInput {
  regions: Record<string, Omit<RegionSnapshot, 'source'>>
}

export interface PasteHistoryInput {
  month: string
  rows: AddHistoryRowInput[]
}

export interface DateConflict {
  date: string
  existing: Record<string, RegionSnapshot>
  incoming: Record<string, Omit<RegionSnapshot, 'source'>>
}

export interface RejectedPasteRow {
  date: string
  reason: string
}

export interface PasteHistoryReport {
  applied: string[]
  conflicts: DateConflict[]
  rejected: RejectedPasteRow[]
}

// Helper re-exports for callers that want price-enriched holdings.
export type { HoldingWithPrice }
