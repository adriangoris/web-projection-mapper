const canvas = document.getElementById('gl')
const wrap = document.getElementById('canvas-wrap')
const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true })
gl.enable(gl.BLEND)
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

const vsSource = `
attribute vec2 a_pos;
varying vec2 v_pos;
void main() {
  v_pos = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const fsSource = `
precision highp float;
varying vec2 v_pos;
uniform sampler2D u_tex;
uniform vec2 u_corners[4];
uniform float u_alpha;
uniform vec2 u_mask[32]; // optional cut-out polygon, in the layer's uv space
uniform int u_maskN;

vec2 getUV(vec2 p, vec2 c0, vec2 c1, vec2 c2, vec2 c3) {
  vec2 e = c1 - c0, f = c3 - c0, g = c0 - c1 + c2 - c3, h = p - c0;
  float k2 = g.x * f.y - g.y * f.x;
  float k1 = e.x * f.y - e.y * f.x + h.x * g.y - h.y * g.x;
  float k0 = h.x * e.y - h.y * e.x;
  float v, u;
  if (abs(k2) < 0.0001) { v = -k0 / k1; }
  else {
    float disc = k1 * k1 - 4.0 * k0 * k2;
    if (disc < 0.0) return vec2(-1.0);
    disc = sqrt(disc);
    float v1 = (-k1 - disc) / (2.0 * k2);
    float v2 = (-k1 + disc) / (2.0 * k2);
    v = (v1 >= 0.0 && v1 <= 1.0) ? v1 : v2;
  }
  float denom = e.x + g.x * v;
  u = (abs(denom) < 0.0001) ? (h.y - f.y * v) / (e.y + g.y * v) : (h.x - f.x * v) / denom;
  return vec2(u, v);
}

// Even-odd point-in-polygon test against the mask (no mask = whole quad)
bool crosses(vec2 p, vec2 a, vec2 b) {
  return ((a.y > p.y) != (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x);
}
bool inMask(vec2 p) {
  if (u_maskN < 3) return true;
  bool inside = false;
  vec2 a = u_mask[0];
  for (int i = 1; i < 32; i++) {
    if (i >= u_maskN) break;
    vec2 b = u_mask[i];
    if (crosses(p, a, b)) inside = !inside;
    a = b;
  }
  if (crosses(p, a, u_mask[0])) inside = !inside;
  return inside;
}

void main() {
  vec2 uv = getUV(v_pos, u_corners[0], u_corners[1], u_corners[2], u_corners[3]);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  if (!inMask(uv)) discard;
  vec4 c = texture2D(u_tex, uv);
  gl_FragColor = vec4(c.rgb, c.a * u_alpha);
}`

function createShader(type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  return s
}

const prog = gl.createProgram()
gl.attachShader(prog, createShader(gl.VERTEX_SHADER, vsSource))
gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, fsSource))
gl.linkProgram(prog)
gl.useProgram(prog)

const aPos = gl.getAttribLocation(prog, 'a_pos')
const uCorners = gl.getUniformLocation(prog, 'u_corners')
const uAlpha = gl.getUniformLocation(prog, 'u_alpha')
const uMask = gl.getUniformLocation(prog, 'u_mask')
const uMaskN = gl.getUniformLocation(prog, 'u_maskN')
const MAX_MASK_POINTS = 32
const maskBuf = new Float32Array(MAX_MASK_POINTS * 2)

const quadBuf = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW)
gl.enableVertexAttribArray(aPos)
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

// Layer system
const COLORS = ['#0f9', '#f90', '#90f', '#0ff', '#f09', '#9f0', '#09f', '#ff0']
let layers = []
let activeLayerId = null
let layerCounter = 0

function randomColor() {
  return (
    '#' +
    Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, '0')
  )
}

function esc(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  )
}

const defaultCorners = () => [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
]

// `empty` skips the starter color clip (used when opening a saved mapping)
function createLayer({ empty = false } = {}) {
  const id = ++layerCounter
  const color = COLORS[(id - 1) % COLORS.length]
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  const layer = {
    id,
    name: `Layer ${id}`,
    color,
    visible: true,
    corners: defaultCorners(),
    mask: null, // cut-out polygon in uv space, or null for the whole quad
    clips: [], // timeline clips on this layer's track
    texture: tex,
    uploaded: null, // media last uploaded to texture (skip re-uploading stills)
  }

  layers.push(layer)
  setActiveLayer(id)
  if (!empty) setClipSource({ layer, clip: null }, colorSource())
  return layer
}

function deleteLayer(id) {
  const idx = layers.findIndex((l) => l.id === id)
  if (idx === -1) return
  const layer = layers[idx]
  layer.clips.forEach((c) => {
    disposeClipMedia(c)
    if (c.id === tl.sel) tl.sel = null
  })
  gl.deleteTexture(layer.texture)
  layers.splice(idx, 1)
  if (activeLayerId === id) activeLayerId = layers[0]?.id || null
  renderLayersList()
  updateCornerPositions()
}

function setActiveLayer(id) {
  activeLayerId = id
  renderLayersList()
  updateCornerPositions()
}

function getActiveLayer() {
  return layers.find((l) => l.id === activeLayerId)
}

function toggleLayerVisible(id) {
  const layer = layers.find((l) => l.id === id)
  if (layer) {
    layer.visible = !layer.visible
    renderLayersList()
  }
}

function renderLayersList() {
  const list = document.getElementById('layers-list')
  list.innerHTML = layers
    .map(
      (l) => `
    <div class="layer-item ${l.id === activeLayerId ? 'active' : ''}" data-id="${l.id}">
      <div class="layer-color" style="background:${l.color}"></div>
      <span class="layer-name">${esc(l.name)}</span>
      <button class="layer-btn vis ${l.visible ? '' : 'off'}" data-id="${l.id}">${l.visible ? '👁' : '👁‍🗨'}</button>
      <button class="layer-btn del" data-id="${l.id}">×</button>
    </div>
  `
    )
    .join('')

  list.querySelectorAll('.layer-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('layer-btn')) return
      setActiveLayer(+el.dataset.id)
    })
  })

  list.querySelectorAll('.layer-btn.del').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      deleteLayer(+el.dataset.id)
    })
  })

  list.querySelectorAll('.layer-btn.vis').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleLayerVisible(+el.dataset.id)
    })
  })

  renderTimeline()
}

function colorSource(color = randomColor()) {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 64, 64)
  return { kind: 'color', media: c, name: color, url: null, stream: null, srcDur: Infinity }
}

// ================= Shape editing =================
// Each layer is warped by 4 corners (screen space, 0..1 of the canvas).
// An optional mask polygon crops it. Mask points live in the layer's uv
// space (0..1 across the quad), so they follow the corners when the layer
// is warped or moved. Mask points with `c` set are pinned to that corner.
const cornerEls = document.querySelectorAll('.corner')
const overlay = document.getElementById('shape-overlay')
const maskEls = [] // pool of handles for free mask points
let dragging = null // corner index being dragged
let maskDrag = null // { layer, index } mask point being dragged
let layerDrag = null // { layer, x, y, corners } whole layer being moved
let cornersVisible = true

const CORNER_UV = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]
const EDGE_STEPS = 16 // edges are curves on screen, so draw/test them in pieces
const HIT_PX = 10

const wrapRect = () => wrap.getBoundingClientRect()

// uv -> screen (normalized). Matches the shader's bilinear mapping.
function uvToScreen(corners, u, v) {
  const [c0, c1, c2, c3] = corners
  return {
    x: c0.x + u * (c1.x - c0.x) + v * (c3.x - c0.x) + u * v * (c0.x - c1.x + c2.x - c3.x),
    y: c0.y + u * (c1.y - c0.y) + v * (c3.y - c0.y) + u * v * (c0.y - c1.y + c2.y - c3.y),
  }
}

// screen (normalized) -> uv. Port of getUV() in the fragment shader.
function screenToUV(corners, px, py) {
  const [c0, c1, c2, c3] = corners
  const e = { x: c1.x - c0.x, y: c1.y - c0.y }
  const f = { x: c3.x - c0.x, y: c3.y - c0.y }
  const g = { x: c0.x - c1.x + c2.x - c3.x, y: c0.y - c1.y + c2.y - c3.y }
  const h = { x: px - c0.x, y: py - c0.y }
  const k2 = g.x * f.y - g.y * f.x
  const k1 = e.x * f.y - e.y * f.x + h.x * g.y - h.y * g.x
  const k0 = h.x * e.y - h.y * e.x
  let v
  if (Math.abs(k2) < 1e-6) v = -k0 / k1
  else {
    let disc = k1 * k1 - 4 * k0 * k2
    if (disc < 0) return null
    disc = Math.sqrt(disc)
    const v1 = (-k1 - disc) / (2 * k2)
    const v2 = (-k1 + disc) / (2 * k2)
    v = v1 >= 0 && v1 <= 1 ? v1 : v2
  }
  const dx = e.x + g.x * v
  const u = Math.abs(dx) < 1e-6 ? (h.y - f.y * v) / (e.y + g.y * v) : (h.x - f.x * v) / dx
  return Number.isFinite(u) && Number.isFinite(v) ? { x: u, y: v } : null
}

function pointInPoly(p, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j],
      b = poly[i]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

// The outline in uv space: the mask, or the 4 corners
function shapeUV(layer) {
  return layer.mask || CORNER_UV.map((p, c) => ({ ...p, c }))
}

function layerContains(layer, nx, ny) {
  const uv = screenToUV(layer.corners, nx, ny)
  if (!uv || uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) return false
  return !layer.mask || pointInPoly(uv, layer.mask)
}

// Points along each outline edge, in pixels: [{ edge, x, y }]
function outlinePixels(layer, rect) {
  const pts = shapeUV(layer)
  const out = []
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]
    for (let s = 0; s < EDGE_STEPS; s++) {
      const t = s / EDGE_STEPS
      const p = uvToScreen(layer.corners, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
      out.push({ edge: i, x: p.x * rect.width, y: p.y * rect.height })
    }
  })
  return out
}

function quadPath(layer, rect) {
  const sample = []
  CORNER_UV.forEach((a, i) => {
    const b = CORNER_UV[(i + 1) % 4]
    for (let s = 0; s < EDGE_STEPS; s++) {
      const t = s / EDGE_STEPS
      const p = uvToScreen(layer.corners, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
      sample.push(`${(p.x * rect.width).toFixed(1)},${(p.y * rect.height).toFixed(1)}`)
    }
  })
  return 'M' + sample.join('L') + 'Z'
}

function updateCornerPositions() {
  const layer = getActiveLayer()
  const rect = wrapRect()
  const show = !!(layer && cornersVisible)

  cornerEls.forEach((el, i) => {
    el.classList.toggle('visible', show)
    if (!show) return
    el.style.left = layer.corners[i].x * rect.width + 'px'
    el.style.top = layer.corners[i].y * rect.height + 'px'
    el.style.background = layer.color
    el.style.color = layer.color
    // A corner removed from the mask still warps, so show it hollow
    const inShape = !layer.mask || layer.mask.some((p) => p.c === i)
    el.classList.toggle('cut', !inShape)
  })

  // Free mask point handles
  const free =
    show && layer.mask ? layer.mask.map((p, i) => ({ p, i })).filter((m) => m.p.c == null) : []
  while (maskEls.length < free.length) {
    const el = document.createElement('div')
    el.className = 'mask-pt'
    el.title = 'Drag to move · double-click or Alt+click to remove'
    wrap.appendChild(el)
    maskEls.push(el)
  }
  maskEls.forEach((el, k) => {
    const m = free[k]
    el.hidden = !m
    if (!m) return
    const s = uvToScreen(layer.corners, m.p.x, m.p.y)
    el.dataset.index = m.i
    el.style.left = s.x * rect.width + 'px'
    el.style.top = s.y * rect.height + 'px'
    el.style.borderColor = layer.color
  })

  // Outline
  overlay.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`)
  if (!show) {
    overlay.innerHTML = ''
    return
  }
  const pts = outlinePixels(layer, rect)
  const d = 'M' + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L') + 'Z'
  overlay.innerHTML =
    (layer.mask ? `<path class="quad" d="${quadPath(layer, rect)}" />` : '') +
    `<path class="outline" d="${d}" style="stroke:${layer.color}" />`
}

function toNormalized(clientX, clientY) {
  const rect = wrapRect()
  return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height }
}

function handleDrag(clientX, clientY) {
  const n = toNormalized(clientX, clientY)

  if (dragging !== null) {
    const layer = getActiveLayer()
    if (!layer) return
    layer.corners[dragging].x = clamp(n.x, 0, 1)
    layer.corners[dragging].y = clamp(n.y, 0, 1)
  } else if (maskDrag) {
    const uv = screenToUV(maskDrag.layer.corners, n.x, n.y)
    if (!uv) return
    const p = maskDrag.layer.mask[maskDrag.index]
    p.x = clamp(uv.x, 0, 1)
    p.y = clamp(uv.y, 0, 1)
  } else if (layerDrag) {
    // Move every corner by the same amount, keeping the layer on screen
    const o = layerDrag.corners
    const dx = clamp(
      n.x - layerDrag.x,
      -Math.min(...o.map((c) => c.x)),
      1 - Math.max(...o.map((c) => c.x))
    )
    const dy = clamp(
      n.y - layerDrag.y,
      -Math.min(...o.map((c) => c.y)),
      1 - Math.max(...o.map((c) => c.y))
    )
    layerDrag.layer.corners = o.map((c) => ({ x: c.x + dx, y: c.y + dy }))
  } else return
  updateCornerPositions()
}

function endDrag() {
  dragging = null
  if (maskDrag) tidyMask(maskDrag.layer)
  maskDrag = null
  if (layerDrag) wrap.classList.remove('moving')
  layerDrag = null
}

// Remove a point from the mask. `cornerIdx` removes a pinned corner instead.
function removeMaskPoint(layer, { index = -1, cornerIdx = -1 } = {}) {
  const pts = shapeUV(layer)
  const i = cornerIdx >= 0 ? pts.findIndex((p) => p.c === cornerIdx) : index
  if (i < 0) return
  if (pts.length <= 3) {
    setStatus('A shape needs at least 3 points')
    return
  }
  pts.splice(i, 1)
  layer.mask = pts
  tidyMask(layer)
  updateCornerPositions()
}

// Back to "no mask" when the shape is just the 4 corners again
function tidyMask(layer) {
  const m = layer.mask
  if (m && m.length === 4 && m.every((p, i) => p.c === i)) layer.mask = null
}

function resetActiveShape() {
  const layer = getActiveLayer()
  if (!layer) return
  layer.mask = null
  updateCornerPositions()
}

function onPointRemoveGesture(e, fn) {
  if (e.altKey) {
    e.preventDefault()
    e.stopPropagation()
    fn()
    return true
  }
  return false
}

cornerEls.forEach((el) => {
  const idx = +el.dataset.idx
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const layer = getActiveLayer()
    if (layer && onPointRemoveGesture(e, () => removeMaskPoint(layer, { cornerIdx: idx }))) return
    dragging = idx
  })
  el.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    const layer = getActiveLayer()
    if (layer) removeMaskPoint(layer, { cornerIdx: idx })
  })
})

wrap.addEventListener('pointerdown', (e) => {
  if (!cornersVisible || e.button !== 0) return
  const handle = e.target.closest('.mask-pt')
  if (handle) {
    e.preventDefault()
    const layer = getActiveLayer()
    const index = +handle.dataset.index
    if (onPointRemoveGesture(e, () => removeMaskPoint(layer, { index }))) return
    maskDrag = { layer, index }
    return
  }
  if (e.target !== canvas) return

  // Grab the top-most visible layer under the pointer (the active one wins ties)
  const n = toNormalized(e.clientX, e.clientY)
  const active = getActiveLayer()
  let hit = active && active.visible && layerContains(active, n.x, n.y) ? active : null
  for (let i = layers.length - 1; !hit && i >= 0; i--) {
    if (layers[i].visible && layerContains(layers[i], n.x, n.y)) hit = layers[i]
  }
  if (!hit) return
  e.preventDefault()
  if (hit !== active) setActiveLayer(hit.id)
  layerDrag = { layer: hit, x: n.x, y: n.y, corners: hit.corners.map((c) => ({ ...c })) }
  wrap.classList.add('moving')
})

wrap.addEventListener('dblclick', (e) => {
  if (!cornersVisible) return
  const layer = getActiveLayer()
  if (!layer) return
  if (e.target.closest('.mask-pt')) {
    removeMaskPoint(layer, { index: +e.target.closest('.mask-pt').dataset.index })
    return
  }
  if (e.target !== canvas) return

  // Add a point on the nearest outline edge
  const rect = wrapRect()
  const px = e.clientX - rect.left,
    py = e.clientY - rect.top
  const line = outlinePixels(layer, rect)
  let best = null
  line.forEach((a, k) => {
    const b = line[(k + 1) % line.length]
    const vx = b.x - a.x,
      vy = b.y - a.y
    const t = clamp(((px - a.x) * vx + (py - a.y) * vy) / (vx * vx + vy * vy || 1), 0, 1)
    const x = a.x + vx * t,
      y = a.y + vy * t
    const d = Math.hypot(px - x, py - y)
    if (d <= HIT_PX && (!best || d < best.d)) best = { d, x, y, edge: a.edge }
  })
  if (!best) {
    setStatus('Double-click on the edge of the selected layer to add a point')
    return
  }
  const pts = shapeUV(layer)
  if (pts.length >= MAX_MASK_POINTS) {
    setStatus(`A shape can have up to ${MAX_MASK_POINTS} points`)
    return
  }
  const uv = screenToUV(layer.corners, best.x / rect.width, best.y / rect.height)
  if (!uv) return
  pts.splice(best.edge + 1, 0, { x: clamp(uv.x, 0, 1), y: clamp(uv.y, 0, 1) })
  layer.mask = pts
  updateCornerPositions()
})

// Hover cursor: show "move" over layers you can grab
wrap.addEventListener('pointermove', (e) => {
  if (layerDrag || dragging !== null || maskDrag || e.target !== canvas) return
  const n = toNormalized(e.clientX, e.clientY)
  const over = cornersVisible && layers.some((l) => l.visible && layerContains(l, n.x, n.y))
  wrap.classList.toggle('grab', over)
})

document.addEventListener('pointermove', (e) => handleDrag(e.clientX, e.clientY))
document.addEventListener('pointerup', endDrag)
document.addEventListener('pointercancel', endDrag)

// Render (called every frame from the playback loop)
function render() {
  const w = wrap.clientWidth,
    h = wrap.clientHeight
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
    gl.viewport(0, 0, w, h)
  }

  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)

  layers.forEach((layer) => {
    if (!layer.visible) return
    const clip = clipAt(layer, tl.t)
    if (!clip) return
    const m = clip.media
    const isVideo = m.tagName === 'VIDEO'
    const ready = !isVideo || m.readyState >= 2
    if (!ready && layer.uploaded !== m) return

    gl.bindTexture(gl.TEXTURE_2D, layer.texture)
    if (ready && (isVideo || layer.uploaded !== m)) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, m)
      layer.uploaded = m
    }

    const data = new Float32Array([
      layer.corners[0].x,
      1 - layer.corners[0].y,
      layer.corners[1].x,
      1 - layer.corners[1].y,
      layer.corners[2].x,
      1 - layer.corners[2].y,
      layer.corners[3].x,
      1 - layer.corners[3].y,
    ])
    gl.uniform2fv(uCorners, data)
    gl.uniform1f(uAlpha, 1.0)
    const mask = layer.mask || []
    mask.forEach((p, i) => {
      maskBuf[i * 2] = p.x
      maskBuf[i * 2 + 1] = p.y
    })
    gl.uniform2fv(uMask, maskBuf)
    gl.uniform1i(uMaskN, mask.length)
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)
  })
}

// ================= Timeline =================
const HEAD_W = 120 // track header width (matches --tl-head)
const STILL_DUR = 10 // default duration for images / colors / camera
const MIN_DUR = 0.1
const SNAP_PX = 8
const FRAME = 1 / 30

const tl = {
  t: 0,
  playing: false,
  loop: true,
  pps: 20,
  sel: null,
  clipCounter: 0,
  startT: 0,
  startPerf: 0,
}
let tlDrag = null

const tlScroll = document.getElementById('tl-scroll')
const tlContent = document.getElementById('tl-content')
const tlRuler = document.getElementById('tl-ruler')
const tlTracks = document.getElementById('tl-tracks')
const tlPlayhead = document.getElementById('tl-playhead')
const tlTime = document.getElementById('tl-time')
const tlDur = document.getElementById('tl-dur')
const tlPlayBtn = document.getElementById('tl-play')
const tlLoopBtn = document.getElementById('tl-loop')
const tlZoom = document.getElementById('tl-zoom')
let tlCap = null

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function fmt(t) {
  const cs = Math.floor(Math.max(0, t) * 100 + 1e-6)
  const m = Math.floor(cs / 6000),
    s = Math.floor(cs / 100) % 60,
    c = cs % 100
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}

function seqEnd() {
  let e = 0
  layers.forEach((l) =>
    l.clips.forEach((c) => {
      e = Math.max(e, c.start + c.dur)
    })
  )
  return e
}

// Clip visible on a track at time t (a later-starting clip overrides an earlier overlapping one)
function clipAt(layer, t) {
  let best = null
  for (const c of layer.clips) {
    if (t >= c.start && t < c.start + c.dur && (!best || c.start >= best.start)) best = c
  }
  return best
}

function findClip(id) {
  for (const layer of layers) {
    const clip = layer.clips.find((c) => c.id === id)
    if (clip) return { layer, clip }
  }
  return null
}

function disposeClipMedia(c) {
  if (c.stream) c.stream.getTracks().forEach((t) => t.stop())
  if (c.media && c.media.tagName === 'VIDEO') c.media.pause()
  if (c.url) URL.revokeObjectURL(c.url)
  c.stream = null
  c.url = null
}

function deleteClip(id) {
  const found = findClip(id)
  if (!found) return
  disposeClipMedia(found.clip)
  found.layer.clips.splice(found.layer.clips.indexOf(found.clip), 1)
  if (tl.sel === id) tl.sel = null
  renderTimeline()
}

// Where a source button should put its media: the selected clip (if on the active layer) or a new clip
function sourceTarget() {
  const layer = getActiveLayer()
  if (!layer) return null
  const found = tl.sel != null ? findClip(tl.sel) : null
  return { layer, clip: found && found.layer === layer ? found.clip : null }
}

function setClipSource(target, src) {
  let clip = target.clip && findClip(target.clip.id) ? target.clip : null
  const videoDur = src.kind === 'video' && isFinite(src.srcDur) ? src.srcDur : null
  if (clip) {
    disposeClipMedia(clip)
    Object.assign(clip, { ref: null }, src, { in: 0 })
    if (videoDur) clip.dur = videoDur
  } else {
    const layer = target.layer
    if (!layers.includes(layer)) {
      disposeClipMedia(src)
      return
    }
    clip = { id: ++tl.clipCounter, in: 0, dur: videoDur || STILL_DUR, ref: null, ...src }
    // Drop at the playhead if that spot is free, otherwise after the track's last clip
    clip.start = clipAt(layer, tl.t)
      ? Math.max(0, ...layer.clips.map((c) => c.start + c.dur))
      : tl.t
    layer.clips.push(clip)
  }
  tl.sel = clip.id
  renderTimeline()
}

// ---- Playback ----
function setPlaying(p) {
  if (p && tl.t >= seqEnd()) tl.t = 0
  tl.playing = p
  tl.startT = tl.t
  tl.startPerf = performance.now()
  tlPlayBtn.textContent = p ? '❚❚' : '▶'
}

function setTime(t) {
  tl.t = Math.max(0, t)
  tl.startT = tl.t
  tl.startPerf = performance.now()
  updatePlayhead()
}

// Keep each video element in step with the playhead
function syncMedia() {
  layers.forEach((layer) => {
    const active = clipAt(layer, tl.t)
    layer.clips.forEach((c) => {
      const v = c.media
      if (c.kind !== 'video' || !v || v.tagName !== 'VIDEO') return
      if (c !== active) {
        if (!v.paused) v.pause()
        return
      }
      let local = tl.t - c.start + c.in
      if (isFinite(v.duration)) local = clamp(local, 0, v.duration - 0.001)
      const drift = Math.abs(v.currentTime - local)
      if (tl.playing) {
        if (v.paused) {
          v.currentTime = local
          v.play().catch(() => {})
        } else if (drift > 0.3) v.currentTime = local
      } else {
        if (!v.paused) v.pause()
        if (drift > 0.02 && !v.seeking) v.currentTime = local
      }
    })
  })
}

function frame(now) {
  if (tl.playing) {
    tl.t = tl.startT + (now - tl.startPerf) / 1000
    const end = seqEnd()
    if (tl.t >= end) {
      if (tl.loop && end > 0) {
        tl.t = 0
        tl.startT = 0
        tl.startPerf = now
      } else {
        tl.t = end
        setPlaying(false)
      }
    }
  }
  syncMedia()
  render()
  updatePlayhead()
  requestAnimationFrame(frame)
}

// ---- Timeline drawing ----
function laneWidth() {
  const visible = (tlScroll.clientWidth - HEAD_W) / tl.pps
  return Math.ceil(Math.max((seqEnd() + 30) * tl.pps, tl.t * tl.pps + 300, visible * tl.pps))
}

function renderRuler(w) {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
  const major = steps.find((s) => s * tl.pps >= 70) || 600
  const minor = major / 5
  const n = Math.ceil(w / (minor * tl.pps))
  let html = ''
  for (let i = 0; i <= n; i++) {
    const v = i * minor
    const isMajor = i % 5 === 0
    html += `<div class="tl-tick${isMajor ? ' major' : ''}" style="left:${v * tl.pps}px">${isMajor ? `<label>${+v.toFixed(2)}s</label>` : ''}</div>`
  }
  tlRuler.innerHTML = html + '<div id="tl-cap"></div>'
  tlCap = document.getElementById('tl-cap')
}

function renderTimeline() {
  const w = laneWidth()
  tlContent.style.width = HEAD_W + w + 'px'
  tlRuler.style.width = w + 'px'
  renderRuler(w)
  tlTracks.innerHTML = layers
    .map(
      (l) => `
    <div class="tl-row ${l.id === activeLayerId ? 'active' : ''}" data-layer="${l.id}">
      <div class="tl-head">
        <div class="layer-color" style="background:${l.color}"></div>
        <span class="name">${esc(l.name)}</span>
        <button class="layer-btn vis ${l.visible ? '' : 'off'}" data-id="${l.id}">${l.visible ? '👁' : '👁‍🗨'}</button>
      </div>
      <div class="tl-lane" style="width:${w}px">${l.clips
        .map(
          (c) => `
        <div class="tl-clip${c.id === tl.sel ? ' sel' : ''}" data-clip="${c.id}" title="${esc(c.name)}"
             style="left:${c.start * tl.pps}px;width:${Math.max(4, c.dur * tl.pps)}px;--c:${l.color}">
          <div class="tl-trim l"></div><span>${esc(c.name)}</span><div class="tl-trim r"></div>
        </div>`
        )
        .join('')}
      </div>
    </div>`
    )
    .join('')
  tlDur.textContent = '/ ' + fmt(seqEnd())
  updatePlayhead()
}

function updatePlayhead() {
  const x = tl.t * tl.pps
  tlPlayhead.style.transform = `translateX(${HEAD_W + x}px)`
  if (tlCap) tlCap.style.transform = `translateX(${x}px)`
  tlTime.textContent = fmt(tl.t)
  if (x > parseFloat(tlRuler.style.width) - 50) renderTimeline()
  // Follow the playhead while playing
  if (tl.playing && !tlDrag) {
    const vw = tlScroll.clientWidth - HEAD_W
    if (x < tlScroll.scrollLeft || x > tlScroll.scrollLeft + vw - 20) tlScroll.scrollLeft = x - 20
  }
}

function setZoom(pps, anchorT, anchorPx) {
  tl.pps = clamp(pps, 2, 400)
  tlZoom.value = Math.log(tl.pps)
  renderTimeline()
  tlScroll.scrollLeft = anchorT * tl.pps - anchorPx
}

function zoomAroundPlayhead(pps) {
  setZoom(pps, tl.t, tl.t * tl.pps - tlScroll.scrollLeft)
}

// ---- Timeline interaction ----
function timeFromX(clientX) {
  const r = tlScroll.getBoundingClientRect()
  return (clientX - r.left + tlScroll.scrollLeft - HEAD_W) / tl.pps
}

// Snap a time to 0, the playhead, or any other clip edge; returns null if nothing is close
function snapTarget(t, exclude) {
  const thresh = SNAP_PX / tl.pps
  let best = null,
    bestD = thresh
  const consider = (v) => {
    const d = Math.abs(v - t)
    if (d < bestD) {
      bestD = d
      best = v
    }
  }
  consider(0)
  consider(tl.t)
  layers.forEach((l) =>
    l.clips.forEach((c) => {
      if (c !== exclude) {
        consider(c.start)
        consider(c.start + c.dur)
      }
    })
  )
  return best
}

tlScroll.addEventListener('click', (e) => {
  const vis = e.target.closest('.layer-btn.vis')
  if (vis) toggleLayerVisible(+vis.dataset.id)
})

tlScroll.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || e.target.closest('.layer-btn')) return
  if (e.target.closest('#tl-ruler')) {
    e.preventDefault()
    tlDrag = { mode: 'scrub' }
    setTime(timeFromX(e.clientX))
    return
  }
  const row = e.target.closest('.tl-row[data-layer]')
  if (!row) return
  const layer = layers.find((l) => l.id === +row.dataset.layer)
  if (!layer) return
  e.preventDefault()
  if (e.target.closest('.tl-head')) {
    setActiveLayer(layer.id)
    return
  }
  const clipEl = e.target.closest('.tl-clip')
  if (clipEl) {
    const clip = layer.clips.find((c) => c.id === +clipEl.dataset.clip)
    const trim = e.target.closest('.tl-trim')
    tl.sel = clip.id
    tlDrag = {
      mode: trim ? (trim.classList.contains('l') ? 'trimL' : 'trimR') : 'move',
      clip,
      layer,
      x0: e.clientX,
      start: clip.start,
      in: clip.in,
      dur: clip.dur,
    }
    setActiveLayer(layer.id)
  } else {
    // Empty lane: select track, deselect clip, scrub
    tl.sel = null
    setActiveLayer(layer.id)
    tlDrag = { mode: 'scrub' }
    setTime(timeFromX(e.clientX))
  }
})

document.addEventListener('mousemove', (e) => {
  if (!tlDrag) return
  if (tlDrag.mode === 'scrub') {
    setTime(timeFromX(e.clientX))
    return
  }
  const c = tlDrag.clip
  const dt = (e.clientX - tlDrag.x0) / tl.pps

  if (tlDrag.mode === 'move') {
    let s = Math.max(0, tlDrag.start + dt)
    const a = snapTarget(s, c),
      b = snapTarget(s + c.dur, c)
    const da = a === null ? Infinity : Math.abs(a - s)
    const db = b === null ? Infinity : Math.abs(b - c.dur - s)
    if (da <= db && a !== null) s = a
    else if (b !== null) s = Math.max(0, b - c.dur)
    c.start = s
    // Drag onto another track
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tl-row[data-layer]')
    const target = row && layers.find((l) => l.id === +row.dataset.layer)
    if (target && target !== tlDrag.layer) {
      tlDrag.layer.clips.splice(tlDrag.layer.clips.indexOf(c), 1)
      target.clips.push(c)
      tlDrag.layer = target
      setActiveLayer(target.id)
      return
    }
  } else if (tlDrag.mode === 'trimL') {
    const end = tlDrag.start + tlDrag.dur
    const minStart = c.kind === 'video' ? Math.max(0, tlDrag.start - tlDrag.in) : 0
    let s = tlDrag.start + dt
    s = clamp(snapTarget(s, c) ?? s, minStart, end - MIN_DUR)
    c.start = s
    c.dur = end - s
    if (c.kind === 'video') c.in = tlDrag.in + (s - tlDrag.start)
  } else if (tlDrag.mode === 'trimR') {
    let end = tlDrag.start + tlDrag.dur + dt
    const maxEnd = c.kind === 'video' && isFinite(c.srcDur) ? c.start + c.srcDur - c.in : Infinity
    end = clamp(snapTarget(end, c) ?? end, c.start + MIN_DUR, maxEnd)
    c.dur = end - c.start
  }
  renderTimeline()
})

document.addEventListener('mouseup', () => {
  if (tlDrag) {
    tlDrag = null
    renderTimeline()
  }
})

tlScroll.addEventListener(
  'wheel',
  (e) => {
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const r = tlScroll.getBoundingClientRect()
    const px = e.clientX - r.left - HEAD_W
    const anchorT = (tlScroll.scrollLeft + px) / tl.pps
    setZoom(tl.pps * Math.exp(-clamp(e.deltaY, -50, 50) * 0.01), anchorT, px)
  },
  { passive: false }
)

tlZoom.addEventListener('input', () => zoomAroundPlayhead(Math.exp(+tlZoom.value)))
document
  .getElementById('tl-zoom-in')
  .addEventListener('click', () => zoomAroundPlayhead(tl.pps * 1.5))
document
  .getElementById('tl-zoom-out')
  .addEventListener('click', () => zoomAroundPlayhead(tl.pps / 1.5))
tlPlayBtn.addEventListener('click', () => setPlaying(!tl.playing))
document.getElementById('tl-start').addEventListener('click', () => setTime(0))
document.getElementById('tl-end').addEventListener('click', () => setTime(seqEnd()))
tlLoopBtn.addEventListener('click', () => {
  tl.loop = !tl.loop
  tlLoopBtn.classList.toggle('on', tl.loop)
})

// Buttons shouldn't keep focus (Space would re-trigger them instead of play/pause)
document.addEventListener('click', (e) => {
  const b = e.target.closest('button')
  if (b) b.blur()
})

// Source buttons
let fileTarget = null
document.getElementById('src-file').addEventListener('click', () => {
  fileTarget = sourceTarget()
  document.getElementById('file-input').click()
})

document.getElementById('file-input').addEventListener('change', (e) => {
  const target = fileTarget
  const file = e.target.files[0]
  e.target.value = ''
  if (!target || !file) return

  const url = URL.createObjectURL(file)
  const name = file.name

  if (file.type.startsWith('video')) {
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.onloadeddata = () => {
      video.onloadeddata = null
      setClipSource(target, {
        kind: 'video',
        media: video,
        name,
        url,
        stream: null,
        srcDur: video.duration,
      })
    }
  } else {
    const img = new Image()
    img.onload = () =>
      setClipSource(target, {
        kind: 'image',
        media: img,
        name,
        url,
        stream: null,
        srcDur: Infinity,
      })
    img.src = url
  }
})

// Camera
document.getElementById('src-camera').addEventListener('click', async () => {
  const target = sourceTarget()
  if (!target) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
    })
    const video = document.createElement('video')
    video.srcObject = stream
    video.playsInline = true
    video.onloadedmetadata = () => {
      video.play()
      setClipSource(target, {
        kind: 'camera',
        media: video,
        name: 'Camera',
        url: null,
        stream,
        srcDur: Infinity,
      })
    }
  } catch (err) {
    console.error(err)
  }
})

// Color
document.getElementById('src-color').addEventListener('click', () => {
  const target = sourceTarget()
  if (target) setClipSource(target, colorSource())
})

// Reset
function resetActiveCorners() {
  const layer = getActiveLayer()
  if (!layer) return
  layer.corners = defaultCorners()
  updateCornerPositions()
}
document.getElementById('reset-btn').addEventListener('click', resetActiveCorners)
document.getElementById('reset-shape-btn').addEventListener('click', resetActiveShape)

// UI toggle
const controls = document.getElementById('controls')

function toggleUI() {
  controls.classList.toggle('hidden')
}

function toggleTimeline() {
  document.body.classList.toggle('tl-hidden')
}

function toggleCorners() {
  cornersVisible = !cornersVisible
  updateCornerPositions()
}

function toggleFullscreen() {
  document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen()
}

document.getElementById('toggle-ui').addEventListener('click', toggleUI)
document.getElementById('toggle-tl').addEventListener('click', toggleTimeline)
document.getElementById('toggle-corners').addEventListener('click', toggleCorners)
document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen)
document.getElementById('add-layer-btn').addEventListener('click', () => createLayer())

// ================= Saved mappings =================
// A mapping is the whole scene: layers, corners, clips and timeline settings.
// It's saved on the server (see /mappings). Media files are uploaded once
// and referenced by checksum, so re-saving doesn't upload them again.
const appEl = document.getElementById('app')
const nameInput = document.getElementById('mapping-name')
const dirtyDot = document.getElementById('mapping-dirty')
const statusEl = document.getElementById('mapping-status')
const importInput = document.getElementById('import-input')

const current = { id: appEl.dataset.mappingId || null }
let savedSnapshot = ''
let busy = false
let statusTimer = null

function setStatus(msg, { error = false, sticky = false } = {}) {
  clearTimeout(statusTimer)
  statusEl.textContent = msg
  statusEl.classList.toggle('error', error)
  if (msg && !error && !sticky) statusTimer = setTimeout(() => setStatus(''), 2500)
}

function serializeMapping() {
  return {
    version: 1,
    timeline: { loop: tl.loop, pps: Math.round(tl.pps * 100) / 100 },
    layers: layers.map((l) => ({
      name: l.name,
      color: l.color,
      visible: l.visible,
      corners: l.corners.map((c) => ({ x: c.x, y: c.y })),
      mask: l.mask
        ? l.mask.map((p) => (p.c == null ? { x: p.x, y: p.y } : { x: p.x, y: p.y, c: p.c }))
        : null,
      clips: l.clips.map((c) => {
        const out = { kind: c.kind, name: c.name, start: c.start, dur: c.dur, in: c.in }
        if (c.kind === 'color') out.color = c.name
        if (c.kind === 'video' || c.kind === 'image') out.media = c.ref || `unsaved:${c.id}`
        return out
      }),
    })),
  }
}

// What counts as an unsaved change (zoom level alone doesn't)
function snapshot() {
  const data = serializeMapping()
  delete data.timeline.pps
  return JSON.stringify([nameInput.value.trim(), data])
}

function isDirty() {
  return snapshot() !== savedSnapshot
}

function updateDirty() {
  const dirty = isDirty()
  dirtyDot.hidden = !dirty
  const name = nameInput.value.trim() || 'Untitled mapping'
  document.title = `${dirty ? '• ' : ''}${name} · Projection Mapping`
}

function markSaved() {
  savedSnapshot = snapshot()
  updateDirty()
}
setInterval(updateDirty, 500)

window.addEventListener('beforeunload', (e) => {
  if (isDirty() || busy) e.preventDefault()
})

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'Escape') nameInput.blur()
})

function fileExt(name, type) {
  const m = /\.([a-z0-9]{1,10})$/i.exec(name || '')
  if (m) return m[1].toLowerCase()
  return (
    (type || '')
      .split('/')[1]
      ?.replace(/[^a-z0-9]/gi, '')
      .slice(0, 10) || 'bin'
  )
}

// Upload any video/image clips the server doesn't have yet
async function uploadClipMedia() {
  const pending = []
  layers.forEach((l) =>
    l.clips.forEach((c) => {
      if ((c.kind === 'video' || c.kind === 'image') && !c.ref) pending.push(c)
    })
  )
  const byUrl = new Map()
  for (let i = 0; i < pending.length; i++) {
    const c = pending[i]
    if (byUrl.has(c.url)) {
      c.ref = byUrl.get(c.url)
      continue
    }
    setStatus(`Uploading media ${i + 1} of ${pending.length}…`, { sticky: true })
    const blob = await fetch(c.url).then((r) => r.blob())
    const res = await fetch(`/api/media?ext=${encodeURIComponent(fileExt(c.name, blob.type))}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob,
    })
    if (!res.ok) throw new Error(`Couldn't upload ${c.name}`)
    c.ref = (await res.json()).media
    byUrl.set(c.url, c.ref)
  }
}

function thumbnail() {
  const w = 320
  const h = Math.max(1, Math.round((canvas.height / Math.max(1, canvas.width)) * w))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d').drawImage(canvas, 0, 0, w, h)
  return c.toDataURL('image/jpeg', 0.8)
}

async function saveMapping({ asNew = false } = {}) {
  if (busy) return false
  let name = nameInput.value.trim()
  if (asNew) {
    name = prompt('Save a copy as', name ? `${name} copy` : 'Untitled mapping')?.trim()
    if (!name) return false
  } else if (!name) {
    name = prompt('Name this mapping', 'Untitled mapping')?.trim()
    if (!name) return false
  }

  busy = true
  try {
    await uploadClipMedia()
    setStatus('Saving…', { sticky: true })
    const update = current.id && !asNew
    const res = await fetch(update ? `/api/mappings/${current.id}` : '/api/mappings', {
      method: update ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ name, data: serializeMapping(), thumbnail: thumbnail() }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `Save failed (${res.status})`)

    current.id = body.mapping.id
    nameInput.value = body.mapping.name
    appEl.dataset.mappingId = current.id
    if (location.pathname !== `/app/${current.id}`) {
      history.replaceState(null, '', `/app/${current.id}`)
    }
    markSaved()
    setStatus(asNew ? `Saved a copy as "${body.mapping.name}"` : 'Saved')
    return true
  } catch (err) {
    console.error(err)
    setStatus(err.message || "Couldn't save. Try again.", { error: true })
    return false
  } finally {
    busy = false
  }
}

// ---- Opening a saved mapping ----
function placeholderSource(kind, name, label) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 144
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#222'
  ctx.fillRect(0, 0, 256, 144)
  ctx.fillStyle = '#f66'
  ctx.font = '16px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, 128, 78)
  return { kind, media: c, name, url: null, stream: null, srcDur: Infinity, missing: true }
}

function waitFor(el, event) {
  return new Promise((resolve, reject) => {
    el.addEventListener(event, resolve, { once: true })
    el.addEventListener('error', () => reject(new Error('Media failed to load')), { once: true })
  })
}

async function loadClipSource(c) {
  if (c.kind === 'color') return colorSource(c.color)

  if (c.kind === 'camera') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      const video = document.createElement('video')
      video.srcObject = stream
      video.playsInline = true
      video.muted = true
      await waitFor(video, 'loadedmetadata')
      video.play().catch(() => {})
      return { kind: 'camera', media: video, name: c.name, url: null, stream, srcDur: Infinity }
    } catch {
      return placeholderSource('camera', c.name, 'Camera unavailable')
    }
  }

  // Video or image stored on the server
  let url = null
  try {
    const res = await fetch(`/media/${c.media}`)
    if (!res.ok) throw new Error('Media missing')
    url = URL.createObjectURL(await res.blob())
    if (c.kind === 'video') {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      const ready = waitFor(video, 'loadeddata')
      video.src = url
      await ready
      return {
        kind: 'video',
        media: video,
        name: c.name,
        url,
        stream: null,
        srcDur: video.duration,
      }
    }
    const img = new Image()
    const ready = waitFor(img, 'load')
    img.src = url
    await ready
    return { kind: 'image', media: img, name: c.name, url, stream: null, srcDur: Infinity }
  } catch {
    if (url) URL.revokeObjectURL(url)
    return placeholderSource(c.kind, c.name, 'Media missing')
  }
}

function clearMapping() {
  setPlaying(false)
  layers.slice().forEach((l) => deleteLayer(l.id))
  layerCounter = 0
  tl.clipCounter = 0
  tl.sel = null
  setTime(0)
}

async function openMapping(id) {
  busy = true
  setStatus('Opening…', { sticky: true })
  try {
    const res = await fetch(`/api/mappings/${id}`, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error("Couldn't open this mapping")
    const { mapping } = await res.json()
    const data = mapping.data

    const total = data.layers.reduce((n, l) => n + l.clips.length, 0)
    let loaded = 0
    const sources = await Promise.all(
      data.layers.map((l) =>
        Promise.all(
          l.clips.map(async (c) => {
            const src = await loadClipSource(c)
            setStatus(`Loading media ${++loaded} of ${total}…`, { sticky: true })
            return src
          })
        )
      )
    )

    clearMapping()
    tl.loop = data.timeline.loop
    tlLoopBtn.classList.toggle('on', tl.loop)
    tl.pps = data.timeline.pps
    tlZoom.value = Math.log(tl.pps)

    data.layers.forEach((l, i) => {
      const layer = createLayer({ empty: true })
      Object.assign(layer, {
        name: l.name,
        color: l.color,
        visible: l.visible,
        corners: l.corners.map((c) => ({ x: c.x, y: c.y })),
        mask: l.mask ? l.mask.map((p) => ({ ...p })) : null,
      })
      layer.clips = l.clips.map((c, j) => {
        const { missing, ...src } = sources[i][j]
        return {
          id: ++tl.clipCounter,
          start: c.start,
          dur: c.dur,
          in: c.in,
          ref: c.media || null,
          ...src,
        }
      })
    })
    tl.sel = null
    if (layers[0]) setActiveLayer(layers[0].id)
    else renderLayersList()

    current.id = mapping.id
    nameInput.value = mapping.name
    markSaved()
    const missing = sources.flat().filter((s) => s.missing).length
    if (missing) {
      setStatus(`${missing} clip(s) couldn't load their media or camera`, { error: true })
    } else setStatus('')
  } catch (err) {
    console.error(err)
    setStatus(err.message, { error: true })
  } finally {
    busy = false
  }
}

// ---- Save buttons, export and import ----
document.getElementById('save-btn').addEventListener('click', () => saveMapping())
document.getElementById('save-as-btn').addEventListener('click', () => saveMapping({ asNew: true }))

document.getElementById('export-btn').addEventListener('click', async () => {
  if (busy) return
  // Export what's on screen, so save any changes first
  if (!current.id || isDirty()) {
    if (!(await saveMapping())) return
  }
  const a = document.createElement('a')
  a.href = `/api/mappings/${current.id}/export`
  a.download = ''
  document.body.appendChild(a)
  a.click()
  a.remove()
  setStatus('Downloading projection file…')
})

document.getElementById('import-btn').addEventListener('click', () => {
  if (!busy) importInput.click()
})

importInput.addEventListener('change', async () => {
  const file = importInput.files[0]
  importInput.value = ''
  if (!file) return
  if (isDirty() && !confirm('Discard unsaved changes and open the imported mapping?')) return
  busy = true
  setStatus(`Importing ${file.name}…`, { sticky: true })
  let imported = null
  try {
    const res = await fetch('/api/mappings/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Accept': 'application/json' },
      body: file,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `Import failed (${res.status})`)
    imported = body.mapping
  } catch (err) {
    setStatus(err.message, { error: true })
  } finally {
    busy = false
  }
  if (!imported) return
  history.pushState(null, '', `/app/${imported.id}`)
  await openMapping(imported.id)
  setStatus(`Imported "${imported.name}"`)
})

window.addEventListener('popstate', () => {
  const m = /^\/app\/([\w-]+)$/.exec(location.pathname)
  if (m && m[1] !== current.id) openMapping(m[1])
})

async function startMapping() {
  if (current.id) await openMapping(current.id)
  else {
    createLayer()
    markSaved()
  }
}

// Keyboard
document.addEventListener('keydown', (e) => {
  // Ctrl/⌘+S saves, Ctrl/⌘+Shift+S saves a copy (works while typing too)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveMapping({ asNew: e.shiftKey })
    return
  }
  if (e.target.tagName === 'INPUT') return
  const key = e.key.toLowerCase()
  if (key === 'h') toggleUI()
  if (key === 'f') toggleFullscreen()
  if (key === 'p') toggleCorners()
  if (key === 't') toggleTimeline()
  if (key === 'r') e.shiftKey ? resetActiveShape() : resetActiveCorners()
  if (key === ' ') {
    e.preventDefault()
    setPlaying(!tl.playing)
  }
  if (key === 'home') {
    e.preventDefault()
    setTime(0)
  }
  if (key === 'end') {
    e.preventDefault()
    setTime(seqEnd())
  }
  if (key === 'arrowleft' || key === 'arrowright') {
    e.preventDefault()
    const step = e.shiftKey ? 1 : FRAME
    setTime(tl.t + (key === 'arrowright' ? step : -step))
  }
  if (key === 'delete' || key === 'backspace') {
    if (tl.sel != null) deleteClip(tl.sel)
    else if (activeLayerId && layers.length > 1) deleteLayer(activeLayerId)
  }
  if (key >= '1' && key <= '9') {
    const idx = +key - 1
    if (layers[idx]) setActiveLayer(layers[idx].id)
  }
})

window.addEventListener('resize', () => {
  updateCornerPositions()
  renderTimeline()
})

tlZoom.value = Math.log(tl.pps)
requestAnimationFrame(frame)
startMapping()
