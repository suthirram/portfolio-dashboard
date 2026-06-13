// Pure routing decisions for the admin act-as flow.
//
// When an admin acts on another user's portfolio, every "personal"
// portfolio endpoint maps to its /admin/users/:id/... counterpart.
// Keeping the mapping here (instead of inline ternaries in the api
// client) makes the rule trivially testable and impossible to drift.

/** Treats an empty/whitespace userId the same as undefined. */
function actingAs(userId?: string): string | null {
  if (!userId) return null
  const trimmed = userId.trim()
  return trimmed === '' ? null : trimmed
}

export function holdingsPath(userId?: string): string {
  const id = actingAs(userId)
  return id ? `/admin/users/${id}/holdings` : '/holdings'
}

export function holdingPath(holdingId: string, userId?: string): string {
  const id = actingAs(userId)
  return id ? `/admin/users/${id}/holdings/${holdingId}` : `/holdings/${holdingId}`
}

export function pricesPath(userId?: string): string {
  const id = actingAs(userId)
  return id ? `/admin/users/${id}/prices` : '/prices'
}

export function summaryPath(userId?: string): string {
  const id = actingAs(userId)
  return id ? `/admin/users/${id}/summary` : '/summary'
}

/** True when the caller is currently acting as another user. */
export function isActingAs(userId?: string): boolean {
  return actingAs(userId) !== null
}
