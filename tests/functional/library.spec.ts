import { test } from '@japa/runner'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mappingStore from '#services/mapping_store'

const THUMB =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

async function expectStatus(request: PromiseLike<any>, status: number) {
  const response = await request
  response.assertStatus(status)
  return response
}

async function upload(client: any, bytes: string, ext: string) {
  const res = await client
    .post('/api/media')
    .qs({ ext })
    .unsafeJson(Buffer.from(bytes))
    .type('application/octet-stream')
  return res.body().media as string
}

function mappingUsing(media: string) {
  return {
    version: 1,
    timeline: { loop: true, pps: 20 },
    layers: [
      {
        name: 'Wall',
        color: '#00ff99',
        visible: true,
        corners: [
          { x: 0.3, y: 0.3 },
          { x: 0.7, y: 0.3 },
          { x: 0.7, y: 0.7 },
          { x: 0.3, y: 0.7 },
        ],
        clips: [{ kind: 'video', name: 'from-mapping.mp4', start: 0, dur: 5, in: 0, media }],
      },
    ],
  }
}

test.group('Media library API', (group) => {
  let originalRoot: string
  group.each.setup(async () => {
    originalRoot = mappingStore.root
    mappingStore.root = await mkdtemp(join(tmpdir(), 'pm-lib-'))
    return async () => {
      await rm(mappingStore.root, { recursive: true, force: true })
      mappingStore.root = originalRoot
    }
  })

  test('adds uploaded files with a name, duration and thumbnail', async ({ client, assert }) => {
    const media = await upload(client, 'video bytes', 'mp4')
    const res = await expectStatus(
      client.post('/api/library').json({
        media,
        name: 'Intro loop.mp4',
        kind: 'video',
        duration: 12.5,
        thumbnail: THUMB,
      }),
      201
    )
    assert.containSubset(res.body().item, {
      media,
      name: 'Intro loop.mp4',
      kind: 'video',
      duration: 12.5,
      size: 11,
    })

    const list = await expectStatus(client.get('/api/library'), 200)
    assert.lengthOf(list.body().items, 1)
    await expectStatus(client.get(list.body().items[0].thumbnail), 200)

    const renamed = await expectStatus(
      client.put(`/api/library/${media}`).json({ name: 'Intro' }),
      200
    )
    assert.equal(renamed.body().item.name, 'Intro')
    assert.equal(renamed.body().item.duration, 12.5)
  })

  test('only accepts files that were uploaded', async ({ client }) => {
    await expectStatus(
      client.post('/api/library').json({ media: `${'a'.repeat(64)}.mp4`, name: 'x' }),
      422
    )
    const odd = await upload(client, 'mystery', 'xyz')
    await expectStatus(client.post('/api/library').json({ media: odd, name: 'x' }), 422)
  })

  test('lists media that came in through a mapping', async ({ client, assert }) => {
    const media = await upload(client, 'mapping video', 'mp4')
    await client.post('/api/mappings').json({ name: 'Show', data: mappingUsing(media) })
    const list = await client.get('/api/library')
    assert.containSubset(list.body().items, [
      { media, name: 'from-mapping.mp4', kind: 'video', thumbnail: null },
    ])
  })

  test('removing deletes unused files but keeps ones mappings need', async ({ client, assert }) => {
    const unused = await upload(client, 'unused', 'png')
    await client.post('/api/library').json({ media: unused, name: 'unused.png', kind: 'image' })
    const res = await expectStatus(client.delete(`/api/library/${unused}`), 200)
    assert.isTrue(res.body().fileDeleted)
    await expectStatus(client.get(`/media/${unused}`), 404)

    const used = await upload(client, 'used', 'mp4')
    await client.post('/api/library').json({ media: used, name: 'used.mp4', kind: 'video' })
    await client.post('/api/mappings').json({ name: 'Show', data: mappingUsing(used) })
    const kept = await expectStatus(client.delete(`/api/library/${used}`), 200)
    assert.isFalse(kept.body().fileDeleted)
    await expectStatus(client.get(`/media/${used}`), 200)

    // It stays out of the list until it's added again
    const list = await client.get('/api/library')
    assert.isFalse(list.body().items.some((i: any) => i.media === used))
    await client.post('/api/library').json({ media: used, name: 'used.mp4', kind: 'video' })
    const again = await client.get('/api/library')
    assert.isTrue(again.body().items.some((i: any) => i.media === used))

    // keepFile=1 keeps a file the open (unsaved) mapping still uses
    const open = await upload(client, 'open', 'mp4')
    await client.post('/api/library').json({ media: open, name: 'open.mp4', kind: 'video' })
    const keep = await client.delete(`/api/library/${open}`).qs({ keepFile: '1' })
    assert.isFalse(keep.body().fileDeleted)
    await expectStatus(client.get(`/media/${open}`), 200)
  })
})
