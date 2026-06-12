import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getAccountNavigationItems,
  resolveDashboardActingUser,
  shouldShowActingBanner,
} from '../../../../backend/tmp/frontend-test-dist/features/auth/dashboardRouting.js'
import {
  planProfileUpdates,
  securityAnswerInputType,
} from '../../../../backend/tmp/frontend-test-dist/features/auth/profileUpdates.js'

test('routes the current user back to their own dashboard instead of acting as themselves', () => {
  const currentUser = { id: 'user-1', username: 'owner' }

  assert.equal(resolveDashboardActingUser(currentUser, currentUser), null)
})

test('keeps act-as dashboard routing for a different user', () => {
  const currentUser = { id: 'admin-1', username: 'admin' }
  const targetUser = { id: 'user-2', username: 'target' }

  assert.equal(resolveDashboardActingUser(currentUser, targetUser), targetUser)
})

test('shows the acting banner only for another user portfolio', () => {
  const currentUser = { id: 'admin-1', username: 'admin' }
  const targetUser = { id: 'user-2', username: 'target' }

  assert.equal(shouldShowActingBanner(currentUser, null), false)
  assert.equal(shouldShowActingBanner(currentUser, currentUser), false)
  assert.equal(shouldShowActingBanner(currentUser, targetUser), true)
})

test('uses a single Users navigation entry for admin accounts', () => {
  const adminLabels = getAccountNavigationItems({ role: 'admin' }).map(item => item.label)
  const superAdminLabels = getAccountNavigationItems({ role: 'superadmin' }).map(item => item.label)

  assert.deepEqual(adminLabels, ['Dashboard', 'Users', 'Profile', 'Logout'])
  assert.deepEqual(superAdminLabels, ['Dashboard', 'Users', 'Profile', 'Logout'])
  assert.equal(superAdminLabels.includes('Admin'), false)
  assert.equal(superAdminLabels.includes('Admins'), false)
})

test('plans a profile-only change without requiring security question answers', () => {
  const plan = planProfileUpdates({
    user: { name: 'Old Name', username: 'oldname' },
    currentPassword: 'current-password',
    name: 'New Name',
    username: 'oldname',
    newPassword: '',
    answers: [
      { question_id: 'q1', answer: '' },
      { question_id: 'q2', answer: '' },
      { question_id: 'q3', answer: '' },
    ],
    forced: false,
  })

  assert.equal(plan.error, '')
  assert.deepEqual(plan.profile, {
    current_password: 'current-password',
    name: 'New Name',
    username: 'oldname',
  })
  assert.equal(plan.password, null)
  assert.equal(plan.securityQuestions, null)
})

test('plans a password-only change without submitting profile or security questions', () => {
  const plan = planProfileUpdates({
    user: { name: 'Owner', username: 'owner' },
    currentPassword: 'current-password',
    name: 'Owner',
    username: 'owner',
    newPassword: 'new-password',
    answers: [
      { question_id: 'q1', answer: '' },
      { question_id: 'q2', answer: '' },
      { question_id: 'q3', answer: '' },
    ],
    forced: false,
  })

  assert.equal(plan.error, '')
  assert.equal(plan.profile, null)
  assert.deepEqual(plan.password, {
    current_password: 'current-password',
    new_password: 'new-password',
  })
  assert.equal(plan.securityQuestions, null)
})

test('requires complete security answers only when security questions are being updated', () => {
  const plan = planProfileUpdates({
    user: { name: 'Owner', username: 'owner' },
    currentPassword: 'current-password',
    name: 'Owner',
    username: 'owner',
    newPassword: '',
    answers: [
      { question_id: 'q1', answer: 'blue' },
      { question_id: 'q2', answer: '' },
      { question_id: 'q3', answer: 'pizza' },
    ],
    forced: false,
  })

  assert.equal(plan.error, 'Choose three security questions and answer each one.')
  assert.equal(plan.securityQuestions, null)
})

test('security question answers use visible text inputs while editing', () => {
  assert.equal(securityAnswerInputType, 'text')
})
