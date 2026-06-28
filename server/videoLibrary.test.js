import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const testDir = mkdtempSync(join(tmpdir(), 'postfarm-videos-'))
process.env.POSTFARM_DIR = testDir
const videos = await import(`./videoLibrary.js?test=${Date.now()}`)

after(() => rmSync(testDir, { recursive: true, force: true }))

function seed(id, file, folderId = 'folder:videos') {
  const mediaDir = join(testDir, 'videos')
  mkdirSync(mediaDir, { recursive: true })
  writeFileSync(join(mediaDir, file), 'video bytes')
  const indexPath = join(testDir, 'videos.json')
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : []
  index.push({ id, file, folderId, source: 'imported' })
  writeFileSync(indexPath, JSON.stringify(index, null, 2))
  return join(mediaDir, file)
}

function fakeMp4(size = 2048) {
  const buffer = Buffer.alloc(size)
  buffer.write('ftyp', 4, 'ascii')
  return buffer
}

test('device video imports store local metadata in the selected folder', async () => {
  const result = await videos.importVideoFiles({
    folderId: 'folder:uncategorized',
    videos: [{ name: 'Launch Clip.mp4', type: 'video/mp4', buffer: fakeMp4() }],
  })
  assert.equal(result.added, 1)
  assert.equal(result.failed.length, 0)
  const imported = result.imported[0]
  assert.equal(imported.originalName, 'Launch Clip.mp4')
  assert.equal(imported.mimeType, 'video/mp4')
  assert.equal(imported.size, 2048)
  assert.equal(imported.folderId, 'folder:uncategorized')
  assert.equal(existsSync(videos.getVideoFile(imported.id)), true)
})

test('device video imports report unsupported files without dropping valid ones', async () => {
  const result = await videos.importVideoFiles({
    videos: [
      { name: 'good.webm', type: 'video/webm', buffer: fakeMp4() },
      { name: '../bad.txt', type: 'text/plain', buffer: Buffer.from('not a video') },
    ],
  })
  assert.equal(result.added, 1)
  assert.equal(result.failed.length, 1)
  assert.equal(result.failed[0].name, 'bad.txt')
})

test('video deletion removes its managed file and metadata', () => {
  const path = seed('video:one', 'one.mp4')
  videos.removeVideo('video:one')
  assert.equal(existsSync(path), false)
  assert.ok(!videos.listVideos().some((video) => video.id === 'video:one'))
})

test('already-missing videos clean safely while filesystem failures preserve metadata', () => {
  const missing = seed('video:missing', 'missing.mp4')
  rmSync(missing)
  assert.doesNotThrow(() => videos.removeVideo('video:missing'))

  const blocked = seed('video:blocked', 'blocked.mp4')
  rmSync(blocked)
  mkdirSync(blocked)
  writeFileSync(join(blocked, 'child.txt'), 'blocked')
  assert.throws(() => videos.removeVideo('video:blocked'))
  assert.ok(videos.getVideoAsset('video:blocked'))
  rmSync(blocked, { recursive: true, force: true })
  videos.removeVideo('video:blocked')
})
