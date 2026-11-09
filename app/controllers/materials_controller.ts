import type { HttpContext } from '@adonisjs/core/http'
import { ValidationError } from '#services/mapping_store'
import materialLibrary from '#services/material_library'

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

export default class MaterialsController {
  /** GET /api/materials — built-in materials first, then the ones people added */
  async index() {
    return { materials: await materialLibrary.list() }
  }

  /** GET /api/materials/:id */
  async show({ params, response }: HttpContext) {
    const material = await materialLibrary.find(params.id)
    if (!material) return response.notFound({ error: 'Material not found' })
    return { material }
  }

  /** POST /api/materials { name, source } */
  async store({ request, response }: HttpContext) {
    return guard(response, async () => {
      const material = await materialLibrary.create({
        name: request.input('name'),
        source: request.input('source'),
      })
      return response.created({ material })
    })
  }

  /** PUT /api/materials/:id { name?, source? } */
  async update({ params, request, response }: HttpContext) {
    return guard(response, async () => {
      const body = request.body()
      const material = await materialLibrary.update(params.id, {
        name: body.name,
        source: body.source,
      })
      if (!material) return response.notFound({ error: 'Material not found' })
      return { material }
    })
  }

  /** DELETE /api/materials/:id */
  async destroy({ params, response }: HttpContext) {
    return guard(response, async () => {
      if (!(await materialLibrary.delete(params.id))) {
        return response.notFound({ error: 'Material not found' })
      }
      return response.noContent()
    })
  }
}
