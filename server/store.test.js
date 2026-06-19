import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('published Schedule dismissals persist, restore, and discard stale remote IDs', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'slidesmith-dismissals-'))
  const previous = process.env.SLIDESMITH_DIR
  process.env.SLIDESMITH_DIR = directory
  try {
    const first = await import(`./store.js?dismissals=${Date.now()}`)
    assert.deepEqual(first.dismissPublishedPost('project-one', 'remote-1'), ['remote-1'])
    assert.deepEqual(first.dismissPublishedPost('project-one', 'remote-2'), ['remote-1', 'remote-2'])

    const reloaded = await import(`./store.js?dismissals-reload=${Date.now()}`)
    assert.deepEqual(reloaded.getDismissedPublishedPostIds('project-one'), ['remote-1', 'remote-2'])
    assert.deepEqual(reloaded.reconcileDismissedPublishedPosts('project-one', ['remote-2']), ['remote-2'])
    assert.deepEqual(reloaded.restorePublishedPost('project-one', 'remote-2'), [])
    assert.deepEqual(reloaded.getDismissedPublishedPostIds('project-one'), [])
  } finally {
    if (previous === undefined) delete process.env.SLIDESMITH_DIR
    else process.env.SLIDESMITH_DIR = previous
    rmSync(directory, { recursive: true, force: true })
  }
})

test('deleted media references are replaced only from the same folder or marked unavailable', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'slidesmith-asset-refs-'))
  const previous = process.env.SLIDESMITH_DIR
  process.env.SLIDESMITH_DIR = directory
  try {
    const store = await import(`./store.js?asset-refs=${Date.now()}`)
    const projectId = store.getActiveProject().id
    const deleted = { id: 'imported:old', url: '/api/library/img/imported%3Aold', folderId: 'folder:selected', type: 'image' }
    const sameFolder = { id: 'imported:new', url: '/api/library/img/imported%3Anew', folderId: 'folder:selected' }
    const draft = { id: 'draft', slides: [{ id: 'slide', imageAssetId: deleted.id, imageUrl: deleted.url }] }
    store.setQueue(projectId, [draft])
    store.savePlan(projectId, {
      id: 'plan', config: { videoId: null }, updatedAt: '',
      slots: [
        { id: 'unfinished', status: 'approved', format: 'standard', post: draft },
        { id: 'scheduled', status: 'scheduled', format: 'standard', post: draft },
      ],
    })

    store.invalidateLibraryAssetReferences(deleted, sameFolder)
    const queueSlide = store.getQueue(projectId)[0].slides[0]
    assert.equal(queueSlide.imageAssetId, sameFolder.id)
    assert.equal(queueSlide.imageFolderId, deleted.folderId)
    const replacedPlan = store.getPlan(projectId, 'plan')
    assert.equal(replacedPlan.slots[0].post.slides[0].imageAssetId, sameFolder.id)
    assert.equal(replacedPlan.slots[0].status, 'needs_attention')
    assert.equal(replacedPlan.slots[1].post.slides[0].imageAssetId, deleted.id)

    store.invalidateLibraryAssetReferences({ ...sameFolder, type: 'image' }, null)
    const unavailable = store.getQueue(projectId)[0]
    assert.equal(unavailable.slides[0].imageUrl, undefined)
    assert.equal(unavailable.slides[0].imageUnavailable, true)
    assert.equal(unavailable.mediaUnavailable, true)
  } finally {
    if (previous === undefined) delete process.env.SLIDESMITH_DIR
    else process.env.SLIDESMITH_DIR = previous
    rmSync(directory, { recursive: true, force: true })
  }
})
