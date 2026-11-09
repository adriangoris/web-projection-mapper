import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import mappingStore, {
  type MappingStore,
  ValidationError,
  cleanName,
  isMediaRef,
} from '#services/mapping_store'

/*
|--------------------------------------------------------------------------
| Media library
|--------------------------------------------------------------------------
|
| The videos and images you can pick from in the File sidebar. The files
| themselves live in <storage>/media (shared with saved mappings); the
| library adds a name, type, duration and thumbnail for each:
|
|   <storage>/library/<ref>.json   { media, name, kind, duration, ... }
|   <storage>/library/<ref>.jpg    thumbnail
|
| Media that only arrived through a saved or imported mapping is listed
| too, named after the clip that uses it.
|
*/

export type MediaKind = 'video' | 'image'

export interface LibraryItem {
  media: string
  name: string
  kind: MediaKind
  size: number
  duration: number | null
  createdAt: string
  thumbnail: string | null
}

interface Entry {
  media: string
  name: string
  kind: MediaKind
  duration: number | null
  createdAt: string
  hasThumbnail: boolean
  /** Removed from the library, but the file is kept for mappings that use it */
  hidden?: boolean
}

const VIDEO_EXTS = ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'mkv', 'avi']
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']

export function kindFromRef(ref: string): MediaKind | null {
  const ext = ref.split('.').pop() || ''
  if (VIDEO_EXTS.includes(ext)) return 'video'
  if (IMAGE_EXTS.includes(ext)) return 'image'
  return null
}

async function writeAtomic(path: string, data: string | Buffer) {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, path)
}

export class MediaLibrary {
  constructor(private store: MappingStore) {}

  get dir() {
    return join(this.store.root, 'library')
  }

  #json(ref: string) {
    return join(this.dir, `${ref}.json`)
  }

  thumbnailPath(ref: string) {
    return join(this.dir, `${ref}.jpg`)
  }

  async #entry(ref: string): Promise<Entry | null> {
    if (!isMediaRef(ref)) return null
    try {
      return JSON.parse(await readFile(this.#json(ref), 'utf8'))
    } catch {
      return null
    }
  }

  async #size(ref: string) {
    try {
      const info = await stat(this.store.mediaPath(ref))
      return info.size
    } catch {
      return null
    }
  }

  #item(entry: Entry, size: number): LibraryItem {
    return {
      media: entry.media,
      name: entry.name,
      kind: entry.kind,
      size,
      duration: entry.duration,
      createdAt: entry.createdAt,
      thumbnail: entry.hasThumbnail
        ? `/api/library/${entry.media}/thumbnail?v=${Date.parse(entry.createdAt)}`
        : null,
    }
  }

  /** Newest first: library entries plus media used by saved mappings */
  async list(): Promise<LibraryItem[]> {
    let media: string[] = []
    try {
      const files = await readdir(this.store.mediaDir)
      media = files.filter(isMediaRef)
    } catch {
      return []
    }

    // Names for media that never went through the library
    const clipNames = new Map<string, { name: string; at: string }>()
    for (const mapping of await this.store.all()) {
      mapping.data.layers.forEach((l) =>
        l.clips.forEach((c) => {
          if (c.media && !clipNames.has(c.media)) {
            clipNames.set(c.media, { name: c.name, at: mapping.createdAt })
          }
        })
      )
    }

    const items: LibraryItem[] = []
    for (const ref of media) {
      const size = await this.#size(ref)
      if (size === null) continue
      let entry = await this.#entry(ref)
      if (!entry) {
        const kind = kindFromRef(ref)
        const from = clipNames.get(ref)
        if (!kind || !from) continue
        entry = {
          media: ref,
          name: from.name,
          kind,
          duration: null,
          createdAt: from.at,
          hasThumbnail: false,
        }
      }
      if (!entry.hidden) items.push(this.#item(entry, size))
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async find(ref: string): Promise<LibraryItem | null> {
    const items = await this.list()
    return items.find((i) => i.media === ref) ?? null
  }

  /** Adds an uploaded file to the library, or updates its details */
  async save(input: {
    media: unknown
    name?: unknown
    kind?: unknown
    duration?: unknown
    thumbnail?: Buffer | null
  }): Promise<LibraryItem> {
    const ref = input.media
    if (!isMediaRef(ref) || !(await this.store.hasMedia(ref))) {
      throw new ValidationError("That file hasn't been uploaded")
    }
    const existing = await this.#entry(ref)
    const kind =
      input.kind === 'video' || input.kind === 'image'
        ? input.kind
        : (existing?.kind ?? kindFromRef(ref))
    if (!kind) throw new ValidationError('Only videos and images can go in the library')
    const duration =
      typeof input.duration === 'number' && Number.isFinite(input.duration) && input.duration > 0
        ? input.duration
        : (existing?.duration ?? null)

    const entry: Entry = {
      media: ref,
      name: input.name !== undefined ? cleanName(input.name) : (existing?.name ?? cleanName(ref)),
      kind,
      duration,
      // Adding a removed file again puts it back at the top
      createdAt: existing && !existing.hidden ? existing.createdAt : new Date().toISOString(),
      hasThumbnail: existing?.hasThumbnail ?? false,
      hidden: false,
    }
    await mkdir(this.dir, { recursive: true })
    if (input.thumbnail) {
      await writeAtomic(this.thumbnailPath(ref), input.thumbnail)
      entry.hasThumbnail = true
    }
    await writeAtomic(this.#json(ref), JSON.stringify(entry))
    return this.#item(entry, (await this.#size(ref)) ?? 0)
  }

  /** Is the file used by a saved mapping? */
  async inUse(ref: string) {
    const mappings = await this.store.all()
    return mappings.some((m) => m.data.layers.some((l) => l.clips.some((c) => c.media === ref)))
  }

  /**
   * Removes a file from the library. The file itself is only deleted when
   * no saved mapping uses it (and the caller didn't ask to keep it).
   */
  async remove(ref: string, { keepFile = false } = {}) {
    if (!isMediaRef(ref) || !(await this.store.hasMedia(ref))) return null
    const fileDeleted = !keepFile && !(await this.inUse(ref))
    if (fileDeleted) {
      await rm(this.#json(ref), { force: true })
      await rm(this.thumbnailPath(ref), { force: true })
      await rm(this.store.mediaPath(ref), { force: true })
    } else {
      // Keep a hidden entry so the file doesn't reappear in the list
      const entry = (await this.#entry(ref)) ?? {
        media: ref,
        name: ref,
        kind: kindFromRef(ref) ?? 'video',
        duration: null,
        createdAt: new Date().toISOString(),
        hasThumbnail: false,
      }
      await mkdir(this.dir, { recursive: true })
      await writeAtomic(this.#json(ref), JSON.stringify({ ...entry, hidden: true }))
    }
    return { fileDeleted }
  }
}

const mediaLibrary = new MediaLibrary(mappingStore)
export default mediaLibrary
