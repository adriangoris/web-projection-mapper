import { test } from '@japa/runner'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mappingStore from '#services/mapping_store'
import { createZip, readZip } from '#services/zip'

const VIDEO = Buffer.from('not really a video, but bytes are bytes')
const VIDEO_REF = `${createHash('sha256').update(VIDEO).digest('hex')}.mp4`
// 1x1 white JPEG
const THUMB =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

async function expectStatus(request: PromiseLike<any>, status: number) {
  const response = await request
  response.assertStatus(status)
  return response
}

function sampleData(media = VIDEO_REF) {
  return {
    version: 1,
    timeline: { loop: false, pps: 40 },
    layers: [
      {
        name: 'Wall',
        color: '#00ff99',
        visible: true,
        corners: [
          { x: 0.1, y: 0.1 },
          { x: 0.9, y: 0.1 },
          { x: 0.9, y: 0.9 },
          { x: 0.1, y: 0.9 },
        ],
        mask: [
          { x: 0, y: 0, c: 0 },
          { x: 0.5, y: 0.2 },
          { x: 1, y: 0, c: 1 },
          { x: 1, y: 1, c: 2 },
          { x: 0, y: 1, c: 3 },
        ] as { x: number; y: number; c?: number }[] | null,
        clips: [
          { kind: 'video', name: 'intro.mp4', start: 0, dur: 4, in: 0.5, media },
          { kind: 'color', name: '#ff0000', start: 4, dur: 10, in: 0, color: '#ff0000' },
          { kind: 'camera', name: 'Camera', start: 14, dur: 10, in: 0 },
        ],
      },
    ],
  }
}

test.group('Mappings API', (group) => {
  let originalRoot: string
  group.each.setup(async () => {
    originalRoot = mappingStore.root
    mappingStore.root = await mkdtemp(join(tmpdir(), 'pm-test-'))
    return async () => {
      await rm(mappingStore.root, { recursive: true, force: true })
      mappingStore.root = originalRoot
    }
  })

  async function uploadVideo(client: any, ext = 'mp4') {
    return client.post('/api/media').qs({ ext }).unsafeJson(VIDEO).type('application/octet-stream')
  }

  test('stores uploaded media by checksum and serves it back', async ({ client, assert }) => {
    await expectStatus(client.get(`/media/${VIDEO_REF}`), 404)

    const first = await expectStatus(uploadVideo(client), 201)
    assert.equal(first.body().media, VIDEO_REF)
    const again = await expectStatus(uploadVideo(client, '.MP4'), 201)
    assert.equal(again.body().media, VIDEO_REF)

    const res = await expectStatus(client.get(`/media/${VIDEO_REF}`), 200)
    assert.include(res.header('content-type'), 'video/mp4')
  })

  test('falls back to a .bin extension for odd file types', async ({ client, assert }) => {
    const res = await expectStatus(uploadVideo(client, '../../etc'), 201)
    assert.match(res.body().media, /^[a-f0-9]{64}\.bin$/)
  })

  test('rejects media names that could escape the folder', async ({ client }) => {
    const res = await client.get('/media/..%2F..%2Fpackage.json')
    res.assertStatus(404)
  })

  test('creates, lists, updates and deletes a mapping', async ({ client, assert }) => {
    await uploadVideo(client)

    const created = await client
      .post('/api/mappings')
      .json({ name: '  Lobby wall ', data: sampleData(), thumbnail: THUMB })
    created.assertStatus(201)
    const { id } = created.body().mapping
    assert.equal(created.body().mapping.name, 'Lobby wall')

    const list = await client.get('/api/mappings')
    list.assertStatus(200)
    assert.lengthOf(list.body().mappings, 1)
    assert.containSubset(list.body().mappings[0], {
      id,
      name: 'Lobby wall',
      layers: 1,
      clips: 3,
      duration: 24,
    })

    const shown = await client.get(`/api/mappings/${id}`)
    assert.deepEqual(shown.body().mapping.data, sampleData())

    await expectStatus(client.get(`/api/mappings/${id}/thumbnail`), 200)

    const renamed = await client.put(`/api/mappings/${id}`).json({ name: 'Stage left' })
    renamed.assertStatus(200)
    assert.equal(renamed.body().mapping.name, 'Stage left')
    assert.deepEqual(renamed.body().mapping.data, sampleData())

    await expectStatus(client.delete(`/api/mappings/${id}`), 204)
    await expectStatus(client.get(`/api/mappings/${id}`), 404)
    await expectStatus(client.delete(`/api/mappings/${id}`), 404)
  })

  test('refuses to save a mapping whose media was never uploaded', async ({ client, assert }) => {
    const res = await client.post('/api/mappings').json({ name: 'Broken', data: sampleData() })
    res.assertStatus(422)
    assert.include(res.body().error, "hasn't been uploaded")
  })

  test('validates names and data', async ({ client }) => {
    await expectStatus(client.post('/api/mappings').json({ name: '   ', data: sampleData() }), 422)
    await expectStatus(
      client.post('/api/mappings').json({ name: 'x', data: { layers: 'nope' } }),
      422
    )
    const badKind = sampleData()
    ;(badKind.layers[0].clips[0] as any).kind = 'script'
    await expectStatus(client.post('/api/mappings').json({ name: 'x', data: badKind }), 422)
    const badMask = sampleData()
    badMask.layers[0].mask = [{ x: 0, y: 0 }]
    await expectStatus(client.post('/api/mappings').json({ name: 'x', data: badMask }), 422)
  })

  test('keeps shape masks and accepts layers saved before masks existed', async ({
    client,
    assert,
  }) => {
    await uploadVideo(client)
    const legacy = sampleData()
    delete (legacy.layers[0] as any).mask
    legacy.layers[0].clips = legacy.layers[0].clips.filter((c) => c.kind !== 'video')
    const res = await expectStatus(
      client.post('/api/mappings').json({ name: 'Old', data: legacy }),
      201
    )
    assert.isNull(res.body().mapping.data.layers[0].mask)

    const clamped = sampleData()
    clamped.layers[0].mask![1] = { x: 7, y: -2, c: 9 }
    const saved = await expectStatus(
      client.post('/api/mappings').json({ name: 'Clamped', data: clamped }),
      201
    )
    assert.deepEqual(saved.body().mapping.data.layers[0].mask[1], { x: 1, y: 0 })
  })

  test('renders the library and opens a saved mapping in the app', async ({ client }) => {
    await uploadVideo(client)
    const created = await client
      .post('/api/mappings')
      .json({ name: 'Shopfront <v2>', data: sampleData() })
    const { id } = created.body().mapping

    const library = await client.get('/mappings')
    library.assertStatus(200)
    library.assertTextIncludes('Shopfront &lt;v2&gt;')
    library.assertTextIncludes(`href="/app/${id}"`)

    const editor = await client.get(`/app/${id}`)
    editor.assertStatus(200)
    editor.assertTextIncludes(`data-mapping-id="${id}"`)

    await expectStatus(client.get('/app/doesnotexist'), 404)
  })

  test('exports a projection file and imports it as a new mapping', async ({ client, assert }) => {
    await uploadVideo(client)
    const created = await client
      .post('/api/mappings')
      .json({ name: 'Winter fair', data: sampleData(), thumbnail: THUMB })
    const { id } = created.body().mapping

    const exportReq = client.get(`/api/mappings/${id}/export`)
    ;(exportReq as any).request.buffer(true).parse((res: any, done: any) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => done(null, Buffer.concat(chunks)))
    })
    const exported = await exportReq
    exported.assertStatus(200)
    assert.include(exported.header('content-disposition'), 'winter-fair.pmap')
    const file: Buffer = exported.response.body
    assert.sameMembers(
      readZip(file).map((e) => e.name),
      ['mapping.json', 'thumbnail.jpg', `media/${VIDEO_REF}`]
    )

    // Import into an empty store, as if on another machine
    await rm(mappingStore.root, { recursive: true, force: true })

    const imported = await client
      .post('/api/mappings/import')
      .unsafeJson(file)
      .type('application/octet-stream')
    imported.assertStatus(201)
    const newId = imported.body().mapping.id
    assert.notEqual(newId, id)
    assert.equal(imported.body().mapping.name, 'Winter fair')

    const shown = await client.get(`/api/mappings/${newId}`)
    assert.deepEqual(shown.body().mapping.data, sampleData())
    await expectStatus(client.get(`/media/${VIDEO_REF}`), 200)
  })

  test('rejects invalid projection files', async ({ client, assert }) => {
    const notZip = await client
      .post('/api/mappings/import')
      .unsafeJson(Buffer.from('hello'))
      .type('application/octet-stream')
    notZip.assertStatus(422)

    const missingMedia = createZip([
      {
        name: 'mapping.json',
        data: Buffer.from(
          JSON.stringify({ format: 'projection-mapping', name: 'X', data: sampleData() })
        ),
      },
    ])
    const res = await client
      .post('/api/mappings/import')
      .unsafeJson(missingMedia)
      .type('application/octet-stream')
    res.assertStatus(422)
    assert.include(res.body().error, 'missing media')
  })
})
