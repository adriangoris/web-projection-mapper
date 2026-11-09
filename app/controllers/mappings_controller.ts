import type { HttpContext } from '@adonisjs/core/http'
import type { Readable } from 'node:stream'
import mappingStore, {
  ValidationError,
  cleanMappingData,
  cleanName,
  decodeThumbnail,
} from '#services/mapping_store'
import { exportProjection, importProjection, projectionFileName } from '#services/projection_file'

const MAX_IMPORT_BYTES = 2 * 1024 ** 3 // 2 GB

async function readBody(stream: Readable, limit: number) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    size += chunk.length
    if (size > limit) throw new ValidationError('Projection file is too large to import')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function guard<T>(response: HttpContext['response'], fn: () => Promise<T>) {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ValidationError) {
      return response.unprocessableEntity({ error: error.message })
    }
    throw error
  }
}

export default class MappingsController {
  /** GET /mappings — the library page */
  async library({ view }: HttpContext) {
    return view.render('pages/mappings', { mappings: await mappingStore.list() })
  }

  /** GET /app and /app/:id — the mapper, optionally opening a saved mapping */
  async editor({ params, view, response }: HttpContext) {
    if (params.id) {
      const mapping = await mappingStore.find(params.id)
      if (!mapping) return response.notFound('Mapping not found')
      return view.render('pages/mapper', { mapping: mappingStore.summarize(mapping) })
    }
    return view.render('pages/mapper', { mapping: null })
  }

  /** GET /api/mappings */
  async index() {
    return { mappings: await mappingStore.list() }
  }

  /** GET /api/mappings/:id */
  async show({ params, response }: HttpContext) {
    const mapping = await mappingStore.find(params.id)
    if (!mapping) return response.notFound({ error: 'Mapping not found' })
    return { mapping }
  }

  /** POST /api/mappings { name, data, thumbnail? } */
  async store({ request, response }: HttpContext) {
    return guard(response, async () => {
      const name = cleanName(request.input('name'))
      const data = cleanMappingData(request.input('data'))
      const thumb = decodeThumbnail(request.input('thumbnail'))
      const mapping = await mappingStore.create(name, data, thumb)
      return response.created({ mapping })
    })
  }

  /** PUT /api/mappings/:id { name?, data?, thumbnail? } */
  async update({ params, request, response }: HttpContext) {
    return guard(response, async () => {
      const body = request.body()
      const mapping = await mappingStore.update(params.id, {
        name: 'name' in body ? cleanName(body.name) : undefined,
        data: 'data' in body ? cleanMappingData(body.data) : undefined,
        thumbnail: decodeThumbnail(body.thumbnail),
      })
      if (!mapping) return response.notFound({ error: 'Mapping not found' })
      return { mapping }
    })
  }

  /** DELETE /api/mappings/:id */
  async destroy({ params, response }: HttpContext) {
    if (!(await mappingStore.delete(params.id))) {
      return response.notFound({ error: 'Mapping not found' })
    }
    return response.noContent()
  }

  /** GET /api/mappings/:id/thumbnail */
  async thumbnail({ params, response }: HttpContext) {
    const mapping = await mappingStore.find(params.id)
    if (!mapping?.hasThumbnail) return response.notFound()
    response.header('Cache-Control', 'public, max-age=31536000, immutable')
    return response.download(mappingStore.thumbnailPath(mapping.id))
  }

  /** GET /api/mappings/:id/export — download a .pmap projection file */
  async export({ params, response }: HttpContext) {
    const mapping = await mappingStore.find(params.id)
    if (!mapping) return response.notFound({ error: 'Mapping not found' })
    const zip = await exportProjection(mappingStore, mapping)
    const filename = projectionFileName(mapping.name)
    response.header('Content-Type', 'application/zip')
    response.header(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    )
    return response.send(zip)
  }

  /** POST /api/mappings/import — body is the raw .pmap file */
  async import({ request, response }: HttpContext) {
    return guard(response, async () => {
      const file = await readBody(request.request, MAX_IMPORT_BYTES)
      if (!file.length) throw new ValidationError('Choose a projection file to import')
      const mapping = await importProjection(mappingStore, file, request.qs().name)
      return response.created({ mapping: mappingStore.summarize(mapping) })
    })
  }

  /** POST /api/media?ext=mp4 — body is the raw file; responds with its ref */
  async mediaUpload({ request, response }: HttpContext) {
    const media = await mappingStore.putMedia(request.qs().ext, request.request)
    return response.created({ media })
  }

  /** GET /media/:ref */
  async media({ params, response }: HttpContext) {
    if (!(await mappingStore.hasMedia(params.ref))) return response.notFound()
    response.header('Cache-Control', 'public, max-age=31536000, immutable')
    return response.download(mappingStore.mediaPath(params.ref))
  }
}
