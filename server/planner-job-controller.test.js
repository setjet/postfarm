import test from 'node:test'
import assert from 'node:assert/strict'
import { PlannerJobController } from '../src/lib/plannerJobController.ts'

function planWith(statuses) {
  return {
    id: 'plan-1',
    name: 'Background plan',
    slots: statuses.map((status, index) => ({ id: `slot-${index + 1}`, status, qualityReport: null })),
  }
}

test('planner generation survives subscriber removal and does not start a duplicate job', async () => {
  let current = planWith(['planned', 'planned'])
  let calls = 0
  let releaseFirst
  const firstGate = new Promise((resolve) => { releaseFirst = resolve })
  const controller = new PlannerJobController({
    generateSlot: async (_planId, slotId) => {
      calls++
      if (slotId === 'slot-1') await firstGate
      current = { ...current, slots: current.slots.map((slot) => slot.id === slotId ? { ...slot, status: 'ready_for_review' } : slot) }
      return current
    },
    getPlan: async () => current,
    renderSlot: async () => undefined,
    scheduleSlot: async () => current,
  })
  const unsubscribe = controller.subscribe(() => {})
  const firstRun = controller.startGeneration(current, current.slots)
  unsubscribe()
  const duplicateRun = controller.startGeneration(current, current.slots)
  assert.strictEqual(duplicateRun, firstRun)
  releaseFirst()
  const completed = await firstRun
  assert.equal(calls, 2)
  assert.deepEqual(completed.slots.map((slot) => slot.status), ['ready_for_review', 'ready_for_review'])
  assert.equal(controller.getSnapshot().status, 'complete')
  assert.deepEqual(controller.getSnapshot().activeSlotIds, [])
  assert.deepEqual(controller.getSnapshot().summary, { ready: 2, warnings: 0, failed: 0 })
})

test('a failed planner slot does not stop later slots', async () => {
  let current = planWith(['planned', 'planned'])
  const calls = []
  const controller = new PlannerJobController({
    generateSlot: async (_planId, slotId) => {
      calls.push(slotId)
      if (slotId === 'slot-1') throw new Error('provider failed')
      current = { ...current, slots: current.slots.map((slot) => slot.id === slotId ? { ...slot, status: 'ready_for_review' } : slot) }
      return current
    },
    getPlan: async () => current,
    renderSlot: async () => undefined,
    scheduleSlot: async () => current,
  })
  await controller.startGeneration(current, current.slots)
  assert.deepEqual(calls, ['slot-1', 'slot-2'])
  assert.equal(controller.getSnapshot().failed, 1)
  assert.equal(controller.getSnapshot().done, 2)
})
