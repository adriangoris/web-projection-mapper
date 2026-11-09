import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import app from '@adonisjs/core/services/app'
import mappingStore, { ValidationError, cleanName } from '#services/mapping_store'

/*
|--------------------------------------------------------------------------
| Material library
|--------------------------------------------------------------------------
|
| Materials are generative GLSL shaders written in the ISF format
| (https://isf.video), the format used by MadMapper, VDMX and others: a
| JSON header comment describing the settings, followed by a fragment
| shader.
|
|   resources/materials/<name>.fs        built-in materials (read only)
|   <storage>/materials/<id>.json        materials people add
|
*/

export interface Material {
  id: string
  name: string
  builtin: boolean
  source: string
  updatedAt: string
}

const BUILTIN_PREFIX = 'builtin-'
const MATERIAL_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const MAX_SOURCE = 200_000
const SUPPORTED_INPUTS = ['float', 'bool', 'long', 'color', 'point2D', 'event']

export const isMaterialId = (id: unknown): id is string =>
  typeof id === 'string' && MATERIAL_ID_RE.test(id)

/**
 * Checks the ISF header and that the shader only uses features the
 * mapper supports (single pass, no image or audio inputs).
 */
export function validateSource(source: unknown): string {
  if (typeof source !== 'string' || !source.trim()) {
    throw new ValidationError('The material has no shader code')
  }
  if (source.length > MAX_SOURCE) throw new ValidationError('The shader code is too long')

  const header = /^\s*\/\*([\s\S]*?)\*\//.exec(source)
  if (header) {
    let meta: any
    try {
      meta = JSON.parse(header[1])
    } catch {
      throw new ValidationError("The JSON header at the top of the shader isn't valid")
    }
    if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
      throw new ValidationError('The shader header must be a JSON object')
    }
    const inputs = meta.INPUTS ?? []
    if (!Array.isArray(inputs)) throw new ValidationError('INPUTS must be a list')
    for (const input of inputs) {
      if (!input || typeof input.NAME !== 'string' || !/^[A-Za-z_]\w*$/.test(input.NAME)) {
        throw new ValidationError('Every input needs a NAME that is a valid GLSL name')
      }
      if (!SUPPORTED_INPUTS.includes(input.TYPE)) {
        throw new ValidationError(
          `Input "${input.NAME}" has type "${input.TYPE}", which isn't supported yet`
        )
      }
    }
    if (Array.isArray(meta.PASSES) && meta.PASSES.length > 1) {
      throw new ValidationError("Multi-pass shaders aren't supported yet")
    }
  }
  if (!/void\s+main\s*\(/.test(source)) {
    throw new ValidationError('The shader needs a main() function')
  }
  return source
}

// "line-patterns.fs" -> "Line Patterns"
function titleFromFile(file: string) {
  return basename(file, '.fs')
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

async function writeAtomic(path: string, data: string) {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, path)
}

export class MaterialLibrary {
  #builtins: Material[] | null = null

  constructor(
    public builtinDir: string,
    public userRoot: () => string
  ) {}

  get userDir() {
    return join(this.userRoot(), 'materials')
  }

  #path(id: string) {
    return join(this.userDir, `${id}.json`)
  }

  isBuiltin(id: string) {
    return id.startsWith(BUILTIN_PREFIX)
  }

  async builtins(): Promise<Material[]> {
    if (this.#builtins) return this.#builtins
    let files: string[] = []
    try {
      const all = await readdir(this.builtinDir)
      files = all.filter((f) => f.endsWith('.fs')).sort()
    } catch {
      return []
    }
    const builtins = await Promise.all(
      files.map(async (file) => ({
        id: BUILTIN_PREFIX + basename(file, '.fs'),
        name: titleFromFile(file),
        builtin: true,
        source: await readFile(join(this.builtinDir, file), 'utf8'),
        updatedAt: '1970-01-01T00:00:00.000Z',
      }))
    )
    // Cache in production; re-read during development so edits show up
    if (app.inProduction) this.#builtins = builtins
    return builtins
  }

  async userMaterials(): Promise<Material[]> {
    let files: string[] = []
    try {
      files = await readdir(this.userDir)
    } catch {
      return []
    }
    const all = await Promise.all(
      files.filter((f) => f.endsWith('.json')).map((f) => this.find(f.slice(0, -5)))
    )
    return all.filter((m): m is Material => m !== null).sort((a, b) => a.name.localeCompare(b.name))
  }

  async list() {
    return [...(await this.builtins()), ...(await this.userMaterials())]
  }

  async find(id: string): Promise<Material | null> {
    if (!isMaterialId(id)) return null
    if (this.isBuiltin(id)) {
      const builtins = await this.builtins()
      return builtins.find((m) => m.id === id) ?? null
    }
    try {
      return { ...JSON.parse(await readFile(this.#path(id), 'utf8')), builtin: false }
    } catch {
      return null
    }
  }

  async create(input: { name: unknown; source: unknown }, id?: string): Promise<Material> {
    const material: Material = {
      id: id && isMaterialId(id) && !this.isBuiltin(id) ? id : randomBytes(9).toString('base64url'),
      name: cleanName(input.name),
      builtin: false,
      source: validateSource(input.source),
      updatedAt: new Date().toISOString(),
    }
    await mkdir(this.userDir, { recursive: true })
    await writeAtomic(this.#path(material.id), JSON.stringify(material))
    return material
  }

  async update(id: string, input: { name?: unknown; source?: unknown }) {
    if (this.isBuiltin(id)) throw new ValidationError("Built-in materials can't be changed")
    const material = await this.find(id)
    if (!material) return null
    if (input.name !== undefined) material.name = cleanName(input.name)
    if (input.source !== undefined) material.source = validateSource(input.source)
    material.updatedAt = new Date().toISOString()
    await writeAtomic(this.#path(id), JSON.stringify(material))
    return material
  }

  async delete(id: string) {
    if (this.isBuiltin(id)) throw new ValidationError("Built-in materials can't be deleted")
    if (!(await this.find(id))) return false
    await rm(this.#path(id), { force: true })
    return true
  }
}

const materialLibrary = new MaterialLibrary(
  app.makePath('resources/materials'),
  () => mappingStore.root
)
export default materialLibrary
