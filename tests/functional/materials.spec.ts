import { test } from '@japa/runner'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mappingStore from '#services/mapping_store'
import materialLibrary from '#services/material_library'
import { readZip } from '#services/zip'

const SOURCE = `/*{
  "INPUTS": [{ "NAME": "speed", "TYPE": "float", "DEFAULT": 1, "MIN": 0, "MAX": 4 }]
}*/
void main() { gl_FragColor = vec4(vec3(fract(TIME * speed)), 1.0); }
`

async function expectStatus(request: PromiseLike<any>, status: number) {
  const response = await request
  response.assertStatus(status)
  return response
}

function mappingWith(material: string, params: Record<string, unknown> = {}) {
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
        mask: null,
        clips: [{ kind: 'material', name: 'Glow', start: 0, dur: 10, in: 0, material, params }],
      },
    ],
  }
}

function binary(request: any) {
  request.request.buffer(true).parse((res: any, done: any) => {
    const chunks: Buffer[] = []
    res.on('data', (c: Buffer) => chunks.push(c))
    res.on('end', () => done(null, Buffer.concat(chunks)))
  })
  return request
}

test.group('Materials API', (group) => {
  let originalRoot: string
  group.each.setup(async () => {
    originalRoot = mappingStore.root
    mappingStore.root = await mkdtemp(join(tmpdir(), 'pm-mat-'))
    return async () => {
      await rm(mappingStore.root, { recursive: true, force: true })
      mappingStore.root = originalRoot
    }
  })

  test('lists the built-in materials', async ({ client, assert }) => {
    const res = await expectStatus(client.get('/api/materials'), 200)
    const materials = res.body().materials
    assert.isAbove(materials.length, 15)
    const bricks = materials.find((m: any) => m.id === 'builtin-bricks')
    assert.containSubset(bricks, { name: 'Bricks', builtin: true })
    assert.include(bricks.source, 'void main()')
  })

  test('every built-in material has a valid header', async ({ assert }) => {
    for (const m of await materialLibrary.builtins()) {
      const header = /^\s*\/\*([\s\S]*?)\*\//.exec(m.source)
      assert.exists(header, m.id)
      const meta = JSON.parse(header![1])
      assert.isArray(meta.INPUTS, m.id)
    }
  })

  test('adds, edits and deletes a material', async ({ client, assert }) => {
    const created = await expectStatus(
      client.post('/api/materials').json({ name: 'Glow', source: SOURCE }),
      201
    )
    const { id } = created.body().material
    assert.isFalse(created.body().material.builtin)

    const list = await client.get('/api/materials')
    assert.isTrue(list.body().materials.some((m: any) => m.id === id))

    const renamed = await expectStatus(
      client.put(`/api/materials/${id}`).json({ name: 'Soft glow' }),
      200
    )
    assert.equal(renamed.body().material.name, 'Soft glow')
    assert.equal(renamed.body().material.source, SOURCE)

    await expectStatus(client.delete(`/api/materials/${id}`), 204)
    await expectStatus(client.get(`/api/materials/${id}`), 404)
  })

  test('rejects shaders it cannot run', async ({ client, assert }) => {
    const cases = [
      ['/*{ not json }*/ void main() {}', 'header'],
      ['/*{"INPUTS":[{"NAME":"img","TYPE":"image"}]}*/ void main() {}', 'image'],
      ['/*{"PASSES":[{},{}]}*/ void main() {}', 'Multi-pass'],
      ['/*{}*/ float x;', 'main()'],
    ]
    for (const [source, message] of cases) {
      const res = await expectStatus(
        client.post('/api/materials').json({ name: 'Bad', source }),
        422
      )
      assert.include(res.body().error, message)
    }
  })

  test('built-in materials are read only', async ({ client }) => {
    await expectStatus(client.put('/api/materials/builtin-bricks').json({ name: 'Mine' }), 422)
    await expectStatus(client.delete('/api/materials/builtin-bricks'), 422)
  })

  test('saves material clips with their settings', async ({ client, assert }) => {
    const data = mappingWith('builtin-bricks', {
      'columns': 12,
      'color1': [1, 0, 0, 1],
      'flag': true,
      'bad key': 3,
      'center': [0.2, 0.8],
    })
    const res = await expectStatus(client.post('/api/mappings').json({ name: 'M', data }), 201)
    const clip = res.body().mapping.data.layers[0].clips[0]
    assert.deepEqual(clip, {
      kind: 'material',
      name: 'Glow',
      start: 0,
      dur: 10,
      in: 0,
      material: 'builtin-bricks',
      params: { columns: 12, color1: [1, 0, 0, 1], flag: true, center: [0.2, 0.8] },
    })

    await expectStatus(
      client.post('/api/mappings').json({ name: 'M', data: mappingWith('../x') }),
      422
    )
  })

  test('projection files carry custom materials', async ({ client, assert }) => {
    const created = await client.post('/api/materials').json({ name: 'Glow', source: SOURCE })
    const materialId = created.body().material.id
    const mapping = await client
      .post('/api/mappings')
      .json({ name: 'Show', data: mappingWith(materialId, { speed: 2 }) })
    const exported = await binary(client.get(`/api/mappings/${mapping.body().mapping.id}/export`))
    const file: Buffer = exported.response.body
    assert.includeMembers(
      readZip(file).map((e) => e.name),
      [`materials/${materialId}.json`]
    )

    // On a fresh machine the material is recreated with the same id
    await rm(mappingStore.root, { recursive: true, force: true })
    const imported = await expectStatus(
      client.post('/api/mappings/import').unsafeJson(file).type('application/octet-stream'),
      201
    )
    const restored = await client.get(`/api/materials/${materialId}`)
    assert.equal(restored.body().material.source, SOURCE)
    const shown = await client.get(`/api/mappings/${imported.body().mapping.id}`)
    assert.equal(shown.body().mapping.data.layers[0].clips[0].material, materialId)

    // If that id now holds different code, the import gets its own copy
    await client.put(`/api/materials/${materialId}`).json({ source: SOURCE + '\n// edited' })
    const again = await expectStatus(
      client.post('/api/mappings/import').unsafeJson(file).type('application/octet-stream'),
      201
    )
    const copy = await client.get(`/api/mappings/${again.body().mapping.id}`)
    const copiedId = copy.body().mapping.data.layers[0].clips[0].material
    assert.notEqual(copiedId, materialId)
    const copied = await client.get(`/api/materials/${copiedId}`)
    assert.equal(copied.body().material.source, SOURCE)
  })
})
