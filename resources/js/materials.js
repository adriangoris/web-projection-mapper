// ================= Materials (ISF shaders) =================
// Materials are generative fragment shaders in the ISF format
// (https://isf.video): a JSON header comment listing the settings
// ("INPUTS"), then GLSL. This module parses them, compiles them for
// WebGL 1 and draws them, either into a texture (for layers) or straight
// onto a canvas (for thumbnails and the editor preview).

const VERTEX = `
attribute vec2 a_pos;
varying vec2 isf_FragNormCoord;
void main() {
  isf_FragNormCoord = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const UNIFORM_TYPES = {
  float: 'float',
  bool: 'bool',
  event: 'bool',
  long: 'int',
  color: 'vec4',
  point2D: 'vec2',
}

export class MaterialError extends Error {}

function input(raw) {
  const type = raw.TYPE
  const base = { name: raw.NAME, label: raw.LABEL || raw.NAME, type }
  switch (type) {
    case 'float': {
      const min = typeof raw.MIN === 'number' ? raw.MIN : 0
      const max = typeof raw.MAX === 'number' ? raw.MAX : 1
      return { ...base, min, max, default: typeof raw.DEFAULT === 'number' ? raw.DEFAULT : min }
    }
    case 'bool':
    case 'event':
      return { ...base, default: !!raw.DEFAULT }
    case 'long': {
      const values = Array.isArray(raw.VALUES) ? raw.VALUES : null
      const min = typeof raw.MIN === 'number' ? raw.MIN : values ? Math.min(...values) : 0
      const max = typeof raw.MAX === 'number' ? raw.MAX : values ? Math.max(...values) : 10
      const labels = Array.isArray(raw.LABELS) ? raw.LABELS : values
      const def = typeof raw.DEFAULT === 'number' ? raw.DEFAULT : values ? values[0] : min
      return { ...base, min, max, values, labels, default: def }
    }
    case 'color':
      return {
        ...base,
        default: Array.isArray(raw.DEFAULT)
          ? [0, 1, 2, 3].map((i) => raw.DEFAULT[i] ?? 1)
          : [1, 1, 1, 1],
      }
    case 'point2D': {
      const min = Array.isArray(raw.MIN) ? raw.MIN : [0, 0]
      const max = Array.isArray(raw.MAX) ? raw.MAX : [1, 1]
      const def = Array.isArray(raw.DEFAULT)
        ? raw.DEFAULT
        : [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2]
      return { ...base, min, max, default: def }
    }
    default:
      throw new MaterialError(`Input "${raw.NAME}" has type "${type}", which isn't supported yet`)
  }
}

/** Splits an ISF file into its settings and GLSL body */
export function parseISF(source) {
  const m = /^\s*\/\*([\s\S]*?)\*\//.exec(source)
  let meta = {}
  let body = source
  let bodyLine = 1
  if (m) {
    try {
      meta = JSON.parse(m[1])
    } catch (err) {
      throw new MaterialError(`The JSON header isn't valid: ${err.message}`)
    }
    body = source.slice(m.index + m[0].length)
    bodyLine = 1 + (source.slice(0, m.index + m[0].length).match(/\n/g) || []).length
  }
  if (Array.isArray(meta.PASSES) && meta.PASSES.length > 1) {
    throw new MaterialError("Multi-pass shaders aren't supported yet")
  }
  const inputs = (Array.isArray(meta.INPUTS) ? meta.INPUTS : []).map(input)
  return { meta, inputs, body, bodyLine }
}

/** Default settings for a material */
export function defaultParams(inputs) {
  const out = {}
  inputs.forEach((i) => {
    out[i.name] = Array.isArray(i.default) ? [...i.default] : i.default
  })
  return out
}

function fragmentSource(parsed) {
  // #extension lines must come first; #version doesn't apply to WebGL 1
  const extensions = []
  const body = parsed.body
    .split('\n')
    .map((line) => {
      if (/^\s*#\s*extension\b/.test(line)) {
        extensions.push(line.trim())
        return ''
      }
      return /^\s*#\s*version\b/.test(line) ? '' : line
    })
    .join('\n')
  const uniforms = parsed.inputs
    .map((i) => `uniform ${UNIFORM_TYPES[i.type]} ${i.name};`)
    .join('\n')
  return `${extensions.join('\n')}
precision highp float;
precision highp int;
uniform vec2 RENDERSIZE;
uniform float TIME;
uniform float TIMEDELTA;
uniform int FRAMEINDEX;
uniform int PASSINDEX;
uniform vec4 DATE;
varying vec2 isf_FragNormCoord;
${uniforms}
#line ${parsed.bodyLine}
${body}`
}

function shaderLog(gl, shader) {
  return (gl.getShaderInfoLog(shader) || 'Unknown error')
    .split('\n')
    .map((l) => l.replace(/^ERROR:\s*\d+:(\d+):\s*/, 'Line $1: ').trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * Compiles and draws materials for one WebGL context. Programs are cached
 * by material id + version, so editing a material recompiles it once.
 */
export class MaterialRenderer {
  constructor(gl) {
    this.gl = gl
    this.cache = new Map()
    this.buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW)
  }

  /** Returns { program, inputs, uniforms } or { error } */
  compile(material) {
    const key = `${material.id}@${material.updatedAt}`
    if (this.cache.has(key)) return this.cache.get(key)
    // Forget older versions of this material
    for (const [k, v] of this.cache) {
      if (k.startsWith(material.id + '@')) {
        if (v.program) this.gl.deleteProgram(v.program)
        this.cache.delete(k)
      }
    }
    const entry = this.#build(material.source)
    this.cache.set(key, entry)
    return entry
  }

  /** Compile without caching (editor preview) */
  build(source) {
    return this.#build(source)
  }

  #build(source) {
    const gl = this.gl
    let parsed
    try {
      parsed = parseISF(source)
    } catch (err) {
      return { error: err.message }
    }
    const vs = gl.createShader(gl.VERTEX_SHADER)
    gl.shaderSource(vs, VERTEX)
    gl.compileShader(vs)
    const fs = gl.createShader(gl.FRAGMENT_SHADER)
    gl.shaderSource(fs, fragmentSource(parsed))
    gl.compileShader(fs)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const error = shaderLog(gl, fs)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      return { error }
    }
    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.bindAttribLocation(program, 0, 'a_pos')
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program) || 'The shader failed to link'
      gl.deleteProgram(program)
      return { error }
    }
    const loc = (n) => gl.getUniformLocation(program, n)
    const uniforms = {
      RENDERSIZE: loc('RENDERSIZE'),
      TIME: loc('TIME'),
      TIMEDELTA: loc('TIMEDELTA'),
      FRAMEINDEX: loc('FRAMEINDEX'),
      PASSINDEX: loc('PASSINDEX'),
      DATE: loc('DATE'),
    }
    parsed.inputs.forEach((i) => (uniforms[i.name] = loc(i.name)))
    return { program, inputs: parsed.inputs, uniforms, meta: parsed.meta }
  }

  /**
   * Draws a compiled material into whatever framebuffer is bound.
   * `state` is { time, delta, frame, width, height, params }.
   */
  draw(entry, state) {
    const gl = this.gl
    const u = entry.uniforms
    gl.useProgram(entry.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.viewport(0, 0, state.width, state.height)

    const now = new Date()
    gl.uniform2f(u.RENDERSIZE, state.width, state.height)
    gl.uniform1f(u.TIME, state.time)
    gl.uniform1f(u.TIMEDELTA, state.delta || 1 / 60)
    gl.uniform1i(u.FRAMEINDEX, state.frame || 0)
    gl.uniform1i(u.PASSINDEX, 0)
    gl.uniform4f(
      u.DATE,
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
      now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
    )
    const params = state.params || {}
    entry.inputs.forEach((i) => {
      const loc = u[i.name]
      if (!loc) return
      const v = params[i.name] ?? i.default
      if (i.type === 'float') gl.uniform1f(loc, +v)
      else if (i.type === 'bool' || i.type === 'event') gl.uniform1i(loc, v ? 1 : 0)
      else if (i.type === 'long') gl.uniform1i(loc, Math.round(+v))
      else if (i.type === 'color') gl.uniform4f(loc, v[0], v[1], v[2], v[3] ?? 1)
      else if (i.type === 'point2D') gl.uniform2f(loc, v[0], v[1])
    })
    gl.disable(gl.BLEND)
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)
  }
}

/** A texture + framebuffer a layer's material clip renders into */
export class MaterialTarget {
  constructor(gl) {
    this.gl = gl
    this.width = 0
    this.height = 0
    this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    this.fbo = gl.createFramebuffer()
  }

  bind(width, height) {
    const gl = this.gl
    if (width !== this.width || height !== this.height) {
      this.width = width
      this.height = height
      gl.bindTexture(gl.TEXTURE_2D, this.texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
  }

  dispose() {
    this.gl.deleteFramebuffer(this.fbo)
    this.gl.deleteTexture(this.texture)
  }
}

// ---- Thumbnails ----
let thumbGL = null
let thumbRenderer = null
const THUMB_W = 160
const THUMB_H = 100

/** Draws a still of the material onto a 2D canvas. Returns an error or null. */
export function drawThumbnail(material, canvas, time = 1.5) {
  if (!thumbGL) {
    const c = document.createElement('canvas')
    c.width = THUMB_W
    c.height = THUMB_H
    thumbGL = c.getContext('webgl', { preserveDrawingBuffer: true })
    if (!thumbGL) return 'WebGL unavailable'
    thumbRenderer = new MaterialRenderer(thumbGL)
  }
  const entry = thumbRenderer.compile(material)
  const ctx = canvas.getContext('2d')
  canvas.width = THUMB_W
  canvas.height = THUMB_H
  if (entry.error) {
    ctx.fillStyle = '#300'
    ctx.fillRect(0, 0, THUMB_W, THUMB_H)
    ctx.fillStyle = '#f66'
    ctx.font = '13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Shader error', THUMB_W / 2, THUMB_H / 2 + 4)
    return entry.error
  }
  thumbGL.bindFramebuffer(thumbGL.FRAMEBUFFER, null)
  thumbRenderer.draw(entry, { time, width: THUMB_W, height: THUMB_H })
  ctx.drawImage(thumbGL.canvas, 0, 0)
  return null
}
