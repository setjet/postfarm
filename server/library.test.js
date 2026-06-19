import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const testDir = mkdtempSync(join(tmpdir(), 'slidesmith-library-'))
process.env.SLIDESMITH_DIR = testDir

const library = await import(`./library.js?test=${Date.now()}`)
const folders = await import('./folders.js')
const store = await import('./store.js')

after(() => rmSync(testDir, { recursive: true, force: true }))

const pixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function image(name) {
  return { name, type: 'image/png', data: pixel }
}

test('pack list combines empty Library folders and backwards-compatible bundled packs', () => {
  const packs = library.listPacks()
  const uncategorized = packs.find((pack) => pack.id === folders.UNCATEGORIZED_FOLDER_ID)
  assert.deepEqual(
    { name: uncategorized.name, source: uncategorized.source, count: uncategorized.count },
    { name: 'Uncategorized', source: 'library', count: 0 },
  )
  const bundled = packs.find((pack) => pack.source === 'bundled')
  assert.equal(bundled.id, bundled.name)
  assert.ok(bundled.count > 0)
})

test('folder ids resolve one or many images, and mixed media cannot enter the image pool', () => {
  const one = folders.createFolder({ name: 'One image', type: 'image' })
  const mixed = folders.createFolder({ name: 'Mixed media', type: 'mixed' })
  library.importImages({ images: [image('one.png')], folderId: one.id })
  library.importImages({ images: [image('a.png'), image('b.png')], folderId: mixed.id })

  const onePool = library.resolveBackgroundSelection([one.id])
  assert.equal(onePool.length, 1)
  assert.match(onePool[0].url, /^\/api\/library\/img\//)

  const mixedPool = library.resolveBackgroundSelection([mixed.id])
  assert.equal(mixedPool.length, 2)
  assert.ok(mixedPool.every((asset) => asset.source !== 'bundled' && asset.url.includes('/img/')))
})

test('only explicitly selected folders contribute stable asset ids', () => {
  const selected = folders.createFolder({ name: 'Selected only', type: 'image' })
  const unselected = folders.createFolder({ name: 'Never selected', type: 'image' })
  const selectedAsset = library.importImages({ images: [image('selected.png')], folderId: selected.id }).images[0]
  const unselectedAsset = library.importImages({ images: [image('unselected.png')], folderId: unselected.id }).images[0]

  const pool = library.resolveBackgroundSelection([selected.id])
  assert.deepEqual(pool.map((asset) => asset.id), [selectedAsset.id])
  assert.ok(!pool.some((asset) => asset.id === unselectedAsset.id))
  assert.deepEqual(library.resolveBackgroundSelection([]), [])
  assert.throws(() => library.resolveBackgroundSelection(['Imported']), /no longer available/)

  const shows = [{ format: 'standard', slides: [{}, {}] }]
  library.assignBackgrounds(shows, pool, () => 0)
  assert.ok(shows[0].slides.every((slide) => slide.imageAssetId === selectedAsset.id))
  assert.ok(shows[0].slides.every((slide) => slide.imageFolderId === selected.id))
})

test('Uncategorized is selectable and folder renames preserve the stable selection', () => {
  library.importImages({ images: [image('loose.png')], folderId: folders.UNCATEGORIZED_FOLDER_ID })
  assert.equal(library.resolveBackgroundSelection([folders.UNCATEGORIZED_FOLDER_ID]).length, 1)

  const renamed = folders.createFolder({ name: 'Before', type: 'image' })
  library.importImages({ images: [image('rename.png')], folderId: renamed.id })
  folders.renameFolder(renamed.id, { name: 'After', type: 'image' })
  const pack = library.listPacks().find((item) => item.id === renamed.id)
  assert.equal(pack.name, 'After')
  assert.equal(library.resolveBackgroundSelection([renamed.id]).length, 1)
})

test('moving and deleting assets immediately changes folder resolution', () => {
  const from = folders.createFolder({ name: 'From', type: 'image' })
  const to = folders.createFolder({ name: 'To', type: 'image' })
  const imported = library.importImages({ images: [image('move.png')], folderId: from.id })
  const assetId = imported.images[0].id
  library.moveImageToFolder(assetId, to.id)
  assert.throws(() => library.resolveBackgroundSelection([from.id]), /no usable images/)
  assert.equal(library.resolveBackgroundSelection([to.id]).length, 1)

  library.removeScraped(assetId)
  assert.throws(() => library.resolveBackgroundSelection([to.id]), /no usable images/)
  assert.throws(() => library.getLibraryAsset(assetId), /not found/)

  folders.deleteFolder(from.id)
  assert.throws(() => library.resolveBackgroundSelection([from.id]), /no longer exists/)
})

test('deletion removes the physical file and cleans already-missing metadata', () => {
  const folder = folders.createFolder({ name: 'Deletion lifecycle', type: 'image' })
  const first = library.importImages({ images: [image('physical.png')], folderId: folder.id }).images[0]
  const indexPath = join(testDir, 'library.json')
  const firstRecord = JSON.parse(readFileSync(indexPath, 'utf8')).find((item) => item.id === first.id)
  const firstPath = join(testDir, 'library', firstRecord.file)
  assert.ok(existsSync(firstPath))
  library.removeScraped(first.id)
  assert.equal(existsSync(firstPath), false)
  assert.ok(!JSON.parse(readFileSync(indexPath, 'utf8')).some((item) => item.id === first.id))

  const stale = library.importImages({ images: [image('missing.png')], folderId: folder.id }).images[0]
  const staleRecord = JSON.parse(readFileSync(indexPath, 'utf8')).find((item) => item.id === stale.id)
  rmSync(join(testDir, 'library', staleRecord.file))
  assert.doesNotThrow(() => library.removeScraped(stale.id))
  assert.ok(!JSON.parse(readFileSync(indexPath, 'utf8')).some((item) => item.id === stale.id))
})

test('filesystem deletion failures are reported without removing metadata', () => {
  const folder = folders.createFolder({ name: 'Delete failure', type: 'image' })
  const asset = library.importImages({ images: [image('blocked.png')], folderId: folder.id }).images[0]
  const indexPath = join(testDir, 'library.json')
  const record = JSON.parse(readFileSync(indexPath, 'utf8')).find((item) => item.id === asset.id)
  const path = join(testDir, 'library', record.file)
  rmSync(path)
  mkdirSync(path)
  writeFileSync(join(path, 'child.txt'), 'blocked')

  assert.throws(() => library.removeScraped(asset.id))
  assert.ok(JSON.parse(readFileSync(indexPath, 'utf8')).some((item) => item.id === asset.id))

  rmSync(path, { recursive: true, force: true })
  library.removeScraped(asset.id)
})

test('indexed traversal paths are cleaned without touching files outside the Library', () => {
  const folder = folders.createFolder({ name: 'Traversal', type: 'image' })
  const asset = library.importImages({ images: [image('safe.png')], folderId: folder.id }).images[0]
  const indexPath = join(testDir, 'library.json')
  const records = JSON.parse(readFileSync(indexPath, 'utf8'))
  const record = records.find((item) => item.id === asset.id)
  rmSync(join(testDir, 'library', record.file))
  const outside = join(testDir, 'outside.png')
  writeFileSync(outside, 'do not delete')
  record.file = '../outside.png'
  writeFileSync(indexPath, JSON.stringify(records, null, 2))

  library.removeScraped(asset.id)
  assert.ok(existsSync(outside))
  assert.ok(!JSON.parse(readFileSync(indexPath, 'utf8')).some((item) => item.id === asset.id))
})

test('background selection cycles without repeats and preserves Notes behavior', () => {
  const pool = [{ url: 'a' }, { url: 'b' }, { url: 'c' }]
  const pick = library.createBackgroundPicker(pool, () => 0.4)
  const firstCycle = [pick().url, pick().url, pick().url]
  const secondCycle = [pick().url, pick().url, pick().url]
  assert.equal(new Set(firstCycle).size, 3)
  assert.equal(new Set(secondCycle).size, 3)
  assert.notEqual(firstCycle[2], secondCycle[0])

  const shows = [
    { format: 'standard', slides: [{}, {}, {}] },
    { format: 'notes', slides: [{}, {}] },
  ]
  library.assignBackgrounds(shows, pool, () => 0.4)
  assert.ok(shows[0].slides.every((slide) => pool.some((asset) => asset.url === slide.imageUrl)))
  assert.ok(shows[1].slides[0].imageUrl)
  assert.equal(shows[1].slides[1].imageUrl, undefined)
})

test('bundled selections still resolve and empty or deleted folders fail clearly', () => {
  const bundled = library.listPacks().find((pack) => pack.source === 'bundled')
  assert.equal(library.resolveBackgroundSelection([bundled.name]).length, bundled.count)

  const empty = folders.createFolder({ name: 'Empty', type: 'image' })
  assert.throws(() => library.resolveBackgroundSelection([empty.id]), /“Empty” has no usable images/)
  folders.deleteFolder(empty.id)
  assert.throws(() => library.resolveBackgroundSelection([empty.id]), /no longer exists/)
})

test('project settings persist stable folder ids alongside legacy bundled names', () => {
  const persistent = folders.createFolder({ name: 'Persistent', type: 'image' })
  const config = store.getConfig()
  store.updateProject(config.activeProjectId, { imagePacks: [persistent.id, 'Anime Aesthetic'] })
  const saved = store.getActiveProject()
  assert.deepEqual(saved.imagePacks, [persistent.id, 'Anime Aesthetic'])

  folders.deleteFolder(persistent.id)
  store.removeImagePackFromProjects(persistent.id)
  assert.deepEqual(store.getActiveProject().imagePacks, ['Anime Aesthetic'])
})
