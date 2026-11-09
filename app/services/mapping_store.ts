import { createHash, randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import app from '@adonisjs/core/services/app'
import env from '#start/env'

/*
|--------------------------------------------------------------------------
| Mapping store
|--------------------------------------------------------------------------
|
| Mappings are saved as JSON files and media as content-addressed files:
|
|   <root>/mappings/<id>.json   mapping document (name, layers, timeline)
|   <root>/mappings/<id>.jpg    thumbnail grabbed from the canvas
|   <root>/media/<sha256>.<ext> video / image files used by clips
|
| Media is shared between mappings, so saving the same video twice
| stores it once.
|
*/

export const FORMAT_VERSION = 1
export const CLIP_KINDS = ['video', 'image', 'color', 'camera', 'material'] as const

export type ClipKind = (typeof CLIP_KINDS)[number]

export interface ClipData {
  kind: ClipKind
  name: string
  start: number
  dur: number
  in: number
  media?: string
  color?: string
  /** Material library id, for material clips */
  material?: string
  /** Material settings (ISF input values) */
  params?: Record<string, MaterialParam>
}

export type MaterialParam = number | boolean | number[]

export interface MaskPoint {
  x: number
  y: number
  /** Set when the point is pinned to warp corner 0-3 */
  c?: number
}

export interface LayerData {
  name: string
  /** Free-text notes about the layer */
  description: string
  color: string
  visible: boolean
  corners: { x: number; y: number }[]
  /** Cut-out polygon in the layer's uv space (0..1), or null for the whole quad */
  mask: MaskPoint[] | null
  clips: ClipData[]
}

export interface MappingData {
  version: number
  timeline: { loop: boolean; pps: number }
  layers: LayerData[]
}

export interface Mapping {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  hasThumbnail: boolean
  data: MappingData
}

export interface MappingSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  layers: number
  clips: number
  duration: number
  thumbnail: string | null
}

const ID_RE = /^[A-Za-z0-9_-]{6,32}$/
const MEDIA_RE = /^[a-f0-9]{64}\.[a-z0-9]{1,10}$/
const HEX_RE = /^#(?:[0-9a-fA-F]{3}){1,2}$/
const EXT_RE = /^[a-z0-9]{1,10}$/
const MAX_LAYERS = 64
const MAX_CLIPS = 1000
const MAX_NAME = 120
const MAX_MASK_POINTS = 32
const MATERIAL_RE = /^[A-Za-z0-9_-]{1,64}$/
const PARAM_RE = /^[A-Za-z_]\w{0,63}$/
const MAX_PARAMS = 64

export class ValidationError extends Error {}

export const isMappingId = (id: unknown): id is string => typeof id === 'string' && ID_RE.test(id)
export const isMediaRef = (ref: unknown): ref is string =>
  typeof ref === 'string' && MEDIA_RE.test(ref)

/** File extension used in a media ref, e.g. "mp4" (falls back to "bin") */
export function mediaExt(ext: unknown) {
  const clean = typeof ext === 'string' ? ext.toLowerCase().replace(/^\./, '') : ''
  return EXT_RE.test(clean) ? clean : 'bin'
}

function num(v: unknown, fallback: number, min: number, max: number) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.min(max, Math.max(min, n))
}

function str(v: unknown, fallback: string, max = MAX_NAME) {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback
}

export function cleanName(v: unknown) {
  const name = str(v, '')
  if (!name) throw new ValidationError('Give the mapping a name')
  return name
}

function cleanParams(input: unknown): Record<string, MaterialParam> {
  const out: Record<string, MaterialParam> = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out
  for (const [key, value] of Object.entries(input).slice(0, MAX_PARAMS)) {
    if (!PARAM_RE.test(key)) continue
    if (typeof value === 'boolean') out[key] = value
    else if (typeof value === 'number' && Number.isFinite(value))
      out[key] = num(value, 0, -1e6, 1e6)
    else if (
      Array.isArray(value) &&
      value.length >= 2 &&
      value.length <= 4 &&
      value.every((v) => typeof v === 'number' && Number.isFinite(v))
    ) {
      out[key] = value.map((v) => num(v, 0, -1e6, 1e6))
    }
  }
  return out
}

function cleanMask(input: unknown, layerIndex: number): MaskPoint[] | null {
  if (input === null || input === undefined) return null
  if (!Array.isArray(input) || input.length < 3 || input.length > MAX_MASK_POINTS) {
    throw new ValidationError(
      `Layer ${layerIndex + 1}'s shape needs 3 to ${MAX_MASK_POINTS} points`
    )
  }
  return input.map((p: any) => {
    const point: MaskPoint = { x: num(p?.x, 0, 0, 1), y: num(p?.y, 0, 0, 1) }
    if (Number.isInteger(p?.c) && p.c >= 0 && p.c <= 3) point.c = p.c
    return point
  })
}

/**
 * Validates mapping data coming from the browser or an imported file, and
 * returns a copy with only known fields and values in range.
 */
export function cleanMappingData(input: unknown): MappingData {
  if (!input || typeof input !== 'object') throw new ValidationError('Mapping data is missing')
  const raw = input as Record<string, any>
  if (!Array.isArray(raw.layers)) throw new ValidationError('Mapping data has no layers')
  if (raw.layers.length > MAX_LAYERS) throw new ValidationError(`At most ${MAX_LAYERS} layers`)

  let clipCount = 0
  const layers = raw.layers.map((l: any, i: number): LayerData => {
    if (!l || typeof l !== 'object') throw new ValidationError(`Layer ${i + 1} is invalid`)
    const corners = Array.isArray(l.corners) ? l.corners : []
    if (corners.length !== 4) throw new ValidationError(`Layer ${i + 1} needs 4 corners`)
    const clips = Array.isArray(l.clips) ? l.clips : []
    clipCount += clips.length
    if (clipCount > MAX_CLIPS) throw new ValidationError(`At most ${MAX_CLIPS} clips`)

    return {
      name: str(l.name, `Layer ${i + 1}`),
      description: typeof l.description === 'string' ? l.description.trim().slice(0, 1000) : '',
      color: typeof l.color === 'string' && HEX_RE.test(l.color) ? l.color : '#00ff99',
      visible: l.visible !== false,
      corners: corners.map((c: any) => ({
        x: num(c?.x, 0.5, -10, 11),
        y: num(c?.y, 0.5, -10, 11),
      })),
      mask: cleanMask(l.mask, i),
      clips: clips.map((c: any, j: number): ClipData => {
        if (!c || !CLIP_KINDS.includes(c.kind)) {
          throw new ValidationError(`Clip ${j + 1} on layer ${i + 1} has an unknown type`)
        }
        const clip: ClipData = {
          kind: c.kind,
          name: str(c.name, c.kind, 255),
          start: num(c.start, 0, 0, 86_400),
          dur: num(c.dur, 10, 0.01, 86_400),
          in: num(c.in, 0, 0, 86_400),
        }
        if (c.kind === 'video' || c.kind === 'image') {
          if (!isMediaRef(c.media)) {
            throw new ValidationError(`"${clip.name}" is missing its media file`)
          }
          clip.media = c.media
        }
        if (c.kind === 'color') {
          clip.color = typeof c.color === 'string' && HEX_RE.test(c.color) ? c.color : '#ffffff'
        }
        if (c.kind === 'material') {
          if (typeof c.material !== 'string' || !MATERIAL_RE.test(c.material)) {
            throw new ValidationError(`"${clip.name}" doesn't say which material it uses`)
          }
          clip.material = c.material
          clip.params = cleanParams(c.params)
        }
        return clip
      }),
    }
  })

  return {
    version: FORMAT_VERSION,
    timeline: {
      loop: raw.timeline?.loop !== false,
      pps: num(raw.timeline?.pps, 20, 1, 1000),
    },
    layers,
  }
}

export function materialRefs(data: MappingData) {
  const ids = new Set<string>()
  data.layers.forEach((l) => l.clips.forEach((c) => c.material && ids.add(c.material)))
  return [...ids]
}

export function mediaRefs(data: MappingData) {
  const refs = new Set<string>()
  data.layers.forEach((l) => l.clips.forEach((c) => c.media && refs.add(c.media)))
  return [...refs]
}

export function decodeThumbnail(v: unknown): Buffer | null {
  if (typeof v !== 'string') return null
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(v)
  if (!m) throw new ValidationError('Thumbnail must be a JPEG data URL')
  return Buffer.from(m[1], 'base64')
}

/** Write via a temp file so readers never see a half-written file */
async function writeAtomic(path: string, data: string | Buffer) {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, path)
}

async function exists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export class MappingStore {
  constructor(public root: string) {}

  get mappingsDir() {
    return join(this.root, 'mappings')
  }

  get mediaDir() {
    return join(this.root, 'media')
  }

  #jsonPath(id: string) {
    return join(this.mappingsDir, `${id}.json`)
  }

  thumbnailPath(id: string) {
    return join(this.mappingsDir, `${id}.jpg`)
  }

  mediaPath(ref: string) {
    return join(this.mediaDir, ref)
  }

  async #ensureDirs() {
    await mkdir(this.mappingsDir, { recursive: true })
    await mkdir(this.mediaDir, { recursive: true })
  }

  summarize(m: Mapping): MappingSummary {
    let clips = 0
    let duration = 0
    m.data.layers.forEach((l) =>
      l.clips.forEach((c) => {
        clips++
        duration = Math.max(duration, c.start + c.dur)
      })
    )
    return {
      id: m.id,
      name: m.name,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      layers: m.data.layers.length,
      clips,
      duration,
      thumbnail: m.hasThumbnail
        ? `/api/mappings/${m.id}/thumbnail?v=${Date.parse(m.updatedAt)}`
        : null,
    }
  }

  async list(): Promise<MappingSummary[]> {
    let files: string[] = []
    try {
      files = await readdir(this.mappingsDir)
    } catch {
      return []
    }
    const mappings = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map((f) => this.find(f.slice(0, -5)).catch(() => null))
    )
    return mappings
      .filter((m): m is Mapping => m !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((m) => this.summarize(m))
  }

  async find(id: string): Promise<Mapping | null> {
    if (!isMappingId(id)) return null
    try {
      return JSON.parse(await readFile(this.#jsonPath(id), 'utf8'))
    } catch {
      return null
    }
  }

  async #assertMedia(data: MappingData) {
    for (const ref of mediaRefs(data)) {
      if (!(await this.hasMedia(ref))) {
        throw new ValidationError(`Media file ${ref} hasn't been uploaded`)
      }
    }
  }

  async create(name: string, data: MappingData, thumbnail: Buffer | null = null) {
    await this.#ensureDirs()
    await this.#assertMedia(data)
    const now = new Date().toISOString()
    let id = randomBytes(9).toString('base64url')
    while (await exists(this.#jsonPath(id))) id = randomBytes(9).toString('base64url')

    const mapping: Mapping = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      hasThumbnail: !!thumbnail,
      data,
    }
    if (thumbnail) await writeAtomic(this.thumbnailPath(id), thumbnail)
    await writeAtomic(this.#jsonPath(id), JSON.stringify(mapping))
    return mapping
  }

  async update(
    id: string,
    changes: { name?: string; data?: MappingData; thumbnail?: Buffer | null }
  ): Promise<Mapping | null> {
    const mapping = await this.find(id)
    if (!mapping) return null
    if (changes.data) {
      await this.#assertMedia(changes.data)
      mapping.data = changes.data
    }
    if (changes.name) mapping.name = changes.name
    if (changes.thumbnail) {
      await writeAtomic(this.thumbnailPath(id), changes.thumbnail)
      mapping.hasThumbnail = true
    }
    mapping.updatedAt = new Date().toISOString()
    await writeAtomic(this.#jsonPath(id), JSON.stringify(mapping))
    return mapping
  }

  async delete(id: string) {
    if (!(await this.find(id))) return false
    await rm(this.#jsonPath(id), { force: true })
    await rm(this.thumbnailPath(id), { force: true })
    return true
  }

  async hasMedia(ref: string) {
    return isMediaRef(ref) && exists(this.mediaPath(ref))
  }

  /**
   * Streams an upload into the media folder and returns its ref,
   * "<sha256>.<ext>". Identical files share one ref, so a video used by
   * several mappings is only stored once.
   */
  async putMedia(ext: string, source: Readable) {
    await this.#ensureDirs()
    const hash = createHash('sha256')
    const tmp = join(this.mediaDir, `.${randomBytes(6).toString('hex')}.upload`)
    const hasher = new Transform({
      transform(chunk, _enc, cb) {
        hash.update(chunk)
        cb(null, chunk)
      },
    })
    try {
      await pipeline(source, hasher, createWriteStream(tmp))
      const ref = `${hash.digest('hex')}.${mediaExt(ext)}`
      if (!(await this.hasMedia(ref))) await rename(tmp, this.mediaPath(ref))
      return ref
    } finally {
      await rm(tmp, { force: true })
    }
  }

  async putMediaBuffer(ref: string, data: Buffer) {
    await this.#ensureDirs()
    if (createHash('sha256').update(data).digest('hex') !== ref.split('.')[0]) {
      throw new ValidationError(`${ref} doesn't match its checksum`)
    }
    if (!(await this.hasMedia(ref))) await writeAtomic(this.mediaPath(ref), data)
  }
}

const storagePath = env.get('STORAGE_PATH') || 'storage'
const mappingStore = new MappingStore(
  isAbsolute(storagePath) ? storagePath : app.makePath(storagePath)
)
export default mappingStore
