import type { HttpContext } from '@adonisjs/core/http'
import { ValidationError, decodeThumbnail } from '#services/mapping_store'
import mediaLibrary from '#services/media_library'

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

export default class LibraryController {
  /** GET /api/library — videos and images, newest first */
  async index() {
    return { items: await mediaLibrary.list() }
  }

  /** POST /api/library { media, name, kind, duration?, thumbnail? } — file from POST /api/media */
  async store({ request, response }: HttpContext) {
    return guard(response, async () => {
      const item = await mediaLibrary.save({
        media: request.input('media'),
        name: request.input('name'),
        kind: request.input('kind'),
        duration: request.input('duration'),
        thumbnail: decodeThumbnail(request.input('thumbnail')),
      })
      return response.created({ item })
    })
  }

  /** PUT /api/library/:media { name?, duration?, thumbnail? } */
  async update({ params, request, response }: HttpContext) {
    return guard(response, async () => {
      if (!(await mediaLibrary.find(params.media))) {
        return response.notFound({ error: 'Not in the library' })
      }
      const body = request.body()
      const item = await mediaLibrary.save({
        media: params.media,
        name: body.name,
        duration: body.duration,
        thumbnail: decodeThumbnail(body.thumbnail),
      })
      return { item }
    })
  }

  /** DELETE /api/library/:media?keepFile=1 */
  async destroy({ params, request, response }: HttpContext) {
    const result = await mediaLibrary.remove(params.media, {
      keepFile: request.qs().keepFile === '1',
    })
    if (!result) return response.notFound({ error: 'Not in the library' })
    return result
  }

  /** GET /api/library/:media/thumbnail */
  async thumbnail({ params, response }: HttpContext) {
    const item = await mediaLibrary.find(params.media)
    if (!item?.thumbnail) return response.notFound()
    response.header('Cache-Control', 'public, max-age=31536000, immutable')
    return response.download(mediaLibrary.thumbnailPath(item.media))
  }
}
