import { test } from '@japa/runner'
import { createZip, readZip } from '#services/zip'

test.group('Zip', () => {
  test('round-trips stored and deflated entries', ({ assert }) => {
    const media = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251))
    const zip = createZip([
      { name: 'mapping.json', data: Buffer.from('{"hello":"wörld"}'), compress: true },
      { name: 'media/clip.bin', data: media },
      { name: 'empty.txt', data: Buffer.alloc(0), compress: true },
    ])

    const entries = readZip(zip)
    assert.deepEqual(
      entries.map((e) => e.name),
      ['mapping.json', 'media/clip.bin', 'empty.txt']
    )
    assert.equal(entries[0].data.toString(), '{"hello":"wörld"}')
    assert.isTrue(entries[1].data.equals(media))
    assert.equal(entries[2].data.length, 0)
  })

  test('rejects data that is not a zip', ({ assert }) => {
    assert.throws(
      () => readZip(Buffer.from('definitely not a zip file')),
      'Not a valid projection file'
    )
  })

  test('detects corrupted entries', ({ assert }) => {
    const zip = createZip([{ name: 'a.txt', data: Buffer.from('hello world') }])
    zip[30 + 'a.txt'.length] ^= 0xff // flip a byte in the stored data
    assert.throws(() => readZip(zip), '"a.txt" failed its integrity check')
  })
})
