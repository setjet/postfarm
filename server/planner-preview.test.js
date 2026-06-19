import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampPreviewIndex,
  latestPlannerSnapshot,
  latestPreviewSlot,
  navigatePreview,
  plannerPreviewAvailability,
} from '../src/lib/postPreview.ts'

function slot(patch = {}) {
  return {
    id: 'slot-1',
    status: 'ready_for_review',
    format: 'standard',
    qualityReport: { status: 'warnings' },
    post: {
      id: 'post-1',
      caption: 'Complete caption',
      hashtags: ['one', 'two'],
      slides: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }],
    },
    ...patch,
  }
}

test('generated planner posts can open without changing warning or quality state', () => {
  const generated = slot()
  const before = structuredClone(generated)
  assert.deepEqual(plannerPreviewAvailability(generated), { enabled: true, reason: null })
  assert.deepEqual(generated, before)
  assert.equal(plannerPreviewAvailability(slot({ status: 'quality_check' })).enabled, true)
})

test('incomplete, failed, unavailable-image, and missing-video posts cannot open', () => {
  assert.match(plannerPreviewAvailability(slot({ post: null, status: 'generating' })).reason, /after generation finishes/)
  assert.match(plannerPreviewAvailability(slot({ status: 'generating' })).reason, /after generation finishes/)
  assert.match(plannerPreviewAvailability(slot({ status: 'failed' })).reason, /failed posts/)
  assert.match(plannerPreviewAvailability(slot({ post: { slides: [] } })).reason, /rendering is complete/)
  assert.match(plannerPreviewAvailability(slot({ post: { slides: [{ id: 'a', imageUnavailable: true }] } })).reason, /Library asset/)
  assert.match(plannerPreviewAvailability(slot({ format: 'video' }), false).reason, /video is unavailable/)
})

test('slide navigation clamps at both ends and preserves slide order', () => {
  assert.equal(navigatePreview(0, -1, 3), 0)
  assert.equal(navigatePreview(0, 1, 3), 1)
  assert.equal(navigatePreview(1, 1, 3), 2)
  assert.equal(navigatePreview(2, 1, 3), 2)
  assert.equal(clampPreviewIndex(4, 2), 1)
})

test('open previews resolve the latest slot data and closing clears the selection', () => {
  const original = slot()
  const regenerated = slot({ post: { ...original.post, caption: 'Regenerated caption', slides: [{ id: 'new', text: 'New' }] } })
  assert.equal(latestPreviewSlot(original.id, [regenerated])?.post?.caption, 'Regenerated caption')
  assert.equal(latestPreviewSlot(original.id, [{ ...regenerated, status: 'removed' }]), null)
  assert.equal(latestPreviewSlot(null, [regenerated]), null)
})

test('the newest completed-job or edited plan snapshot wins stale-data races', () => {
  const stored = { id: 'plan-1', updatedAt: '2026-06-19T10:00:00.000Z', slots: [slot()] }
  const regenerated = { id: 'plan-1', updatedAt: '2026-06-19T10:01:00.000Z', slots: [slot({ post: { slides: [{ id: 'new', text: 'New' }] } })] }
  const edited = { ...stored, updatedAt: '2026-06-19T10:02:00.000Z', slots: [slot({ post: { slides: [{ id: 'edited', text: 'Edited' }] } })] }
  assert.equal(latestPlannerSnapshot(stored, regenerated)?.slots[0].post.slides[0].id, 'new')
  assert.equal(latestPlannerSnapshot(edited, regenerated)?.slots[0].post.slides[0].id, 'edited')
  assert.equal(latestPlannerSnapshot(stored, { ...regenerated, id: 'other-plan' }), stored)
})
