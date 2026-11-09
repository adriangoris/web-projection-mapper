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

void main() {
  vec2 uv = getUV(v_pos, u_corners[0], u_corners[1], u_corners[2], u_corners[3]);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
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

function createLayer() {
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
    clips: [], // timeline clips on this layer's track
    texture: tex,
    uploaded: null, // media last uploaded to texture (skip re-uploading stills)
  }

  layers.push(layer)
  setActiveLayer(id)
  setClipSource({ layer, clip: null }, colorSource())
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

function colorSource() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')
  const color = randomColor()
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 64, 64)
  return { kind: 'color', media: c, name: color, url: null, stream: null, srcDur: Infinity }
}

// Corner handling
const cornerEls = document.querySelectorAll('.corner')
let dragging = null
let cornersVisible = true

function updateCornerPositions() {
  const layer = getActiveLayer()
  const rect = wrap.getBoundingClientRect()

  cornerEls.forEach((el, i) => {
    if (layer && cornersVisible) {
      el.classList.add('visible')
      el.style.left = layer.corners[i].x * rect.width + 'px'
      el.style.top = layer.corners[i].y * rect.height + 'px'
      el.style.background = layer.color
      el.style.color = layer.color
    } else {
      el.classList.remove('visible')
    }
  })
}

function handleDrag(clientX, clientY) {
  if (dragging === null) return
  const layer = getActiveLayer()
  if (!layer) return
  const rect = wrap.getBoundingClientRect()
  layer.corners[dragging].x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  layer.corners[dragging].y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
  updateCornerPositions()
}

cornerEls.forEach((el) => {
  el.addEventListener('mousedown', (e) => {
    e.preventDefault()
    dragging = +el.dataset.idx
  })
  el.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault()
      dragging = +el.dataset.idx
    },
    { passive: false }
  )
})

document.addEventListener('mousemove', (e) => handleDrag(e.clientX, e.clientY))
document.addEventListener(
  'touchmove',
  (e) => {
    if (dragging !== null) {
      e.preventDefault()
      handleDrag(e.touches[0].clientX, e.touches[0].clientY)
    }
  },
  { passive: false }
)
document.addEventListener('mouseup', () => (dragging = null))
document.addEventListener('touchend', () => (dragging = null))

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
    Object.assign(clip, src, { in: 0 })
    if (videoDur) clip.dur = videoDur
  } else {
    const layer = target.layer
    if (!layers.includes(layer)) {
      disposeClipMedia(src)
      return
    }
    clip = { id: ++tl.clipCounter, in: 0, dur: videoDur || STILL_DUR, ...src }
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
      if (c.kind !== 'video' || !v) return
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
document.getElementById('add-layer-btn').addEventListener('click', createLayer)

// Keyboard
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return
  const key = e.key.toLowerCase()
  if (key === 'h') toggleUI()
  if (key === 'f') toggleFullscreen()
  if (key === 'p') toggleCorners()
  if (key === 't') toggleTimeline()
  if (key === 'r') resetActiveCorners()
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
createLayer()
requestAnimationFrame(frame)
