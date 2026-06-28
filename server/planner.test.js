import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPlanSlots, createPlan, movePlanSlot, plannerStatusForQualityReport, recommendedPostingTimes, scheduleFingerprint, zonedDateTimeToUtc } from './planner.js'

const base = {
  name: 'Launch month', goal: 'education', rangePreset: '7', startDate: '2026-06-15',
  timezone: 'Europe/London', postingDays: [1, 2, 3, 4, 5], postsPerDay: 2,
  preferredTimes: ['09:00', '17:00'], socialAccountIds: [1], topicMode: 'custom',
  topics: ['Alpha', 'Beta', 'Gamma'], contentPillars: [{ name: 'Teach', percentage: 70 }, { name: 'Proof', percentage: 30 }],
  formats: ['standard', 'notes', 'video'], backgroundSelections: ['folder-a', 'folder-b'],
  postStyle: '2-slide lowercase explainer',
}

test('plan creation stores stable ids and distributes multiple daily slots', () => {
  const plan = createPlan(base, { projectId: 'project-1', now: new Date('2026-06-01T00:00:00Z') })
  assert.match(plan.id, /^plan-/)
  assert.equal(plan.slots.length, 10)
  assert.equal(new Set(plan.slots.map((slot) => slot.id)).size, 10)
  assert.deepEqual(plan.slots.slice(0, 3).map((slot) => slot.topic), ['Alpha', 'Beta', 'Gamma'])
  assert.notEqual(plan.slots[0].format, plan.slots[1].format)
  assert.notEqual(plan.slots[0].backgroundSelection, plan.slots[1].backgroundSelection)
  assert.equal(plan.config.postStyle, '2-slide lowercase explainer')
  assert.equal(plan.slots[0].postStyleOverride, null)
})

test('AI timing mode creates valid, distinct engagement windows for every daily post', () => {
  assert.deepEqual(recommendedPostingTimes(1, 'engagement'), ['16:00'])
  const { config, slots } = buildPlanSlots({ ...base, preferredTimeMode: 'ai', preferredTimes: [], postsPerDay: 3 })
  assert.equal(config.preferredTimes.length, 3)
  assert.equal(new Set(config.preferredTimes).size, 3)
  assert.deepEqual(slots.slice(0, 3).map((slot) => slot.localTime), config.preferredTimes)
})

test('timezone conversion preserves the requested wall clock across DST', () => {
  assert.equal(zonedDateTimeToUtc('2026-06-15', '09:00', 'Europe/London'), '2026-06-15T08:00:00.000Z')
  assert.equal(zonedDateTimeToUtc('2026-12-15', '09:00', 'Europe/London'), '2026-12-15T09:00:00.000Z')
  assert.throws(() => zonedDateTimeToUtc('2026-03-29', '01:30', 'Europe/London'), /does not exist/)
})

test('schedule fingerprints are stable and change with duplicate-sensitive inputs', () => {
  const plan = createPlan(base, { projectId: 'project-1' })
  const slot = { ...plan.slots[0], qualityReport: { contentVersion: 'quality-a' } }
  const first = scheduleFingerprint(plan.id, slot)
  assert.equal(first, scheduleFingerprint(plan.id, { ...slot, socialAccountIds: [...slot.socialAccountIds].reverse() }))
  assert.notEqual(first, scheduleFingerprint(plan.id, { ...slot, scheduledAt: plan.slots[1].scheduledAt }))
  assert.notEqual(first, scheduleFingerprint(plan.id, { ...slot, qualityReport: { contentVersion: 'quality-b' } }))
})

test('slot distribution respects pillar percentages and avoids consecutive custom topics', () => {
  const { slots } = buildPlanSlots(base)
  const teach = slots.filter((slot) => slot.pillar === 'Teach').length
  assert.equal(teach, 7)
  assert.ok(slots.every((slot, index) => index === 0 || slot.topic !== slots[index - 1].topic))
})

test('existing and in-plan account/time conflicts are visible and moving invalidates approval', () => {
  const at = zonedDateTimeToUtc('2026-06-15', '09:00', 'Europe/London')
  const plan = createPlan(base, { existingPosts: [{ id: 'remote', status: 'scheduled', scheduledAt: at, socialAccounts: [1] }] })
  assert.equal(plan.slots[0].conflicts.length, 1)
  plan.slots[0].post = { id: 'generated' }
  plan.slots[0].status = 'approved'
  const moved = movePlanSlot(plan, plan.slots[0].id, { localDate: '2026-06-16', localTime: '11:00' })
  assert.equal(moved.slots[0].status, 'needs_attention')
  assert.equal(moved.slots[0].approvedAt, null)
})

test('planner state depends on blockers, not warnings or numeric score', () => {
  assert.equal(plannerStatusForQualityReport({ status: 'warnings', score: 12, summary: { blocking: 0 } }), 'ready_for_review')
  assert.equal(plannerStatusForQualityReport({ status: 'passed', score: 100, summary: { blocking: 0 } }), 'ready_for_review')
  assert.equal(plannerStatusForQualityReport({ status: 'blocked', score: 90, summary: { blocking: 1 } }), 'needs_attention')
})
