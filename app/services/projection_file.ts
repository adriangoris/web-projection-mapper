import { readFile } from 'node:fs/promises'
import {
  type Mapping,
  type MappingData,
  type MappingStore,
  ValidationError,
  cleanMappingData,
  cleanName,
  materialRefs,
  mediaRefs,
} from '#services/mapping_store'
import materialLibrary from '#services/material_library'
import { ZipError, createZip, readZip } from '#services/zip'

/*
|--------------------------------------------------------------------------
| Projection files (.pmap)
|--------------------------------------------------------------------------
|
| A .pmap file is a zip archive holding everything needed to rebuild a
| mapping on another machine:
|
|   mapping.json      { format, version, name, data }
|   thumbnail.jpg     optional preview
|   media/<ref>       every video / image the clips use
|   materials/<id>.json  materials the clips use that aren't built in
|
*/

export const PROJECTION_FORMAT = 'projection-mapping'
export const PROJECTION_EXT = 'pmap'

export function projectionFileName(name: string) {
  const base = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
  return `${base || 'mapping'}.${PROJECTION_EXT}`
}

export async function exportProjection(store: MappingStore, mapping: Mapping) {
  const manifest = {
    format: PROJECTION_FORMAT,
    version: mapping.data.version,
    name: mapping.name,
    exportedAt: new Date().toISOString(),
    data: mapping.data,
  }
  const entries = [
    { name: 'mapping.json', data: Buffer.from(JSON.stringify(manifest, null, 2)), compress: true },
  ]
  if (mapping.hasThumbnail) {
    try {
      entries.push({
        name: 'thumbnail.jpg',
        data: await readFile(store.thumbnailPath(mapping.id)),
        compress: false,
      })
    } catch {
      // A missing thumbnail shouldn't block the export
    }
  }
  for (const ref of mediaRefs(mapping.data)) {
    entries.push({
      name: `media/${ref}`,
      data: await readFile(store.mediaPath(ref)),
      compress: false,
    })
  }
  for (const id of materialRefs(mapping.data)) {
    const material = materialLibrary.isBuiltin(id) ? null : await materialLibrary.find(id)
    if (!material) continue
    const { name, source } = material
    entries.push({
      name: `materials/${id}.json`,
      data: Buffer.from(JSON.stringify({ id, name, source }, null, 2)),
      compress: true,
    })
  }
  return createZip(entries)
}

/**
 * Adds the archive's materials to the library. A material that already
 * exists with different code is added as a copy and the clips are pointed
 * at the copy, so importing never changes someone's existing material.
 */
async function importMaterials(data: MappingData, files: Map<string, Buffer>) {
  const remap = new Map<string, string>()
  for (const id of materialRefs(data)) {
    const entry = files.get(`materials/${id}.json`)
    if (!entry || materialLibrary.isBuiltin(id)) continue
    let incoming: any
    try {
      incoming = JSON.parse(entry.toString('utf8'))
    } catch {
      throw new ValidationError(`Material ${id} in the projection file is corrupt`)
    }
    const existing = await materialLibrary.find(id)
    if (existing?.source === incoming.source) continue
    const created = await materialLibrary.create(
      { name: incoming.name, source: incoming.source },
      existing ? undefined : id
    )
    if (created.id !== id) remap.set(id, created.id)
  }
  data.layers.forEach((l) =>
    l.clips.forEach((c) => {
      if (c.material && remap.has(c.material)) c.material = remap.get(c.material)
    })
  )
}

export async function importProjection(store: MappingStore, file: Buffer, name?: string) {
  let entries
  try {
    entries = readZip(file)
  } catch (error) {
    if (error instanceof ZipError) throw new ValidationError(error.message)
    throw new ValidationError('Not a valid projection file')
  }

  const manifestEntry = entries.find((e) => e.name === 'mapping.json')
  if (!manifestEntry) throw new ValidationError('Projection file has no mapping.json')

  let manifest: any
  try {
    manifest = JSON.parse(manifestEntry.data.toString('utf8'))
  } catch {
    throw new ValidationError('mapping.json is not valid JSON')
  }
  if (manifest?.format !== PROJECTION_FORMAT) {
    throw new ValidationError('This file is not a projection mapping export')
  }

  const data = cleanMappingData(manifest.data)
  const files = new Map(entries.map((e) => [e.name, e.data]))

  for (const ref of mediaRefs(data)) {
    const media = files.get(`media/${ref}`)
    if (media) await store.putMediaBuffer(ref, media)
    else if (!(await store.hasMedia(ref))) {
      throw new ValidationError(`Projection file is missing media ${ref}`)
    }
  }
  await importMaterials(data, files)
  const thumb = files.get('thumbnail.jpg') ?? null
  return store.create(cleanName(name || manifest.name), data, thumb)
}
