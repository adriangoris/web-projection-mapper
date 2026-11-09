import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

/**
 * Minimal ZIP writer/reader used for projection (.pmap) export and import.
 *
 * - Writes deflated entries for small text files and stored (uncompressed)
 *   entries for media, which is already compressed.
 * - Reads stored and deflated entries, which covers files written here and
 *   most zip tools. ZIP64 and encryption are not supported.
 */

export interface ZipEntryInput {
  name: string
  data: Buffer
  compress?: boolean
}

export interface ZipEntry {
  name: string
  data: Buffer
}

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const END_SIG = 0x06054b50
const MAX_32 = 0xffffffff
const UTF8_FLAG = 0x0800

// MS-DOS date/time for the archive entries
function dosDateTime(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day =
    ((Math.max(date.getFullYear(), 1980) - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate()
  return { time, day }
}

export function createZip(entries: ZipEntryInput[], date = new Date()): Buffer {
  const { time, day } = dosDateTime(date)
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)
    const method = entry.compress ? 8 : 0
    const body = entry.compress ? deflateRawSync(entry.data) : entry.data

    if (entry.data.length >= MAX_32 || body.length >= MAX_32 || offset >= MAX_32) {
      throw new Error(`"${entry.name}" is too large to export (4 GB limit)`)
    }

    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL_SIG, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(UTF8_FLAG, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)

    const head = Buffer.alloc(46)
    head.writeUInt32LE(CENTRAL_SIG, 0)
    head.writeUInt16LE(20, 4) // version made by
    head.writeUInt16LE(20, 6) // version needed
    head.writeUInt16LE(UTF8_FLAG, 8)
    head.writeUInt16LE(method, 10)
    head.writeUInt16LE(time, 12)
    head.writeUInt16LE(day, 14)
    head.writeUInt32LE(crc, 16)
    head.writeUInt32LE(body.length, 20)
    head.writeUInt32LE(entry.data.length, 24)
    head.writeUInt16LE(name.length, 28)
    head.writeUInt32LE(offset, 42)

    chunks.push(local, name, body)
    central.push(head, name)
    offset += local.length + name.length + body.length
  }

  const centralSize = central.reduce((n, b) => n + b.length, 0)
  if (entries.length > 0xffff || offset >= MAX_32) {
    throw new Error('Projection is too large to export (4 GB limit)')
  }
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_SIG, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...chunks, ...central, end])
}

export class ZipError extends Error {}

export function readZip(buf: Buffer, maxEntries = 10_000): ZipEntry[] {
  // The end-of-central-directory record sits in the last 22 + 65535 bytes
  let endAt = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === END_SIG) {
      endAt = i
      break
    }
  }
  if (endAt === -1) throw new ZipError('Not a valid projection file')

  const count = buf.readUInt16LE(endAt + 10)
  const centralOffset = buf.readUInt32LE(endAt + 16)
  if (count > maxEntries) throw new ZipError('Projection file has too many entries')

  const entries: ZipEntry[] = []
  let p = centralOffset
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIG) {
      throw new ZipError('Projection file is corrupt')
    }
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const crc = buf.readUInt32LE(p + 16)
    const compSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localAt = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen

    if (flags & 0x1) throw new ZipError('Encrypted projection files are not supported')
    if (name.endsWith('/')) continue // directory entry

    if (localAt + 30 > buf.length || buf.readUInt32LE(localAt) !== LOCAL_SIG) {
      throw new ZipError('Projection file is corrupt')
    }
    const start = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28)
    if (start + compSize > buf.length) throw new ZipError('Projection file is truncated')
    const raw = buf.subarray(start, start + compSize)

    let data: Buffer
    if (method === 0) data = raw
    else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: size || undefined })
    else throw new ZipError(`Unsupported compression in "${name}"`)

    if (data.length !== size || crc32(data) !== crc) {
      throw new ZipError(`"${name}" failed its integrity check`)
    }
    entries.push({ name, data })
  }
  return entries
}
