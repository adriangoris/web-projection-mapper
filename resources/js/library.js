const statusEl = document.getElementById('lib-status')

function setStatus(msg, kind = '') {
  statusEl.textContent = msg
  statusEl.className = `lib-status ${kind}`
}

function fmtDuration(sec) {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
function fmtRelative(iso) {
  const diff = (Date.parse(iso) - Date.now()) / 1000
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(diff) >= size) return rtf.format(Math.round(diff / size), unit)
  }
  return 'just now'
}

document.querySelectorAll('[data-duration]').forEach((el) => {
  el.textContent = fmtDuration(+el.dataset.duration)
})
document.querySelectorAll('time[datetime]').forEach((el) => {
  el.textContent = fmtRelative(el.getAttribute('datetime'))
  el.title = new Date(el.getAttribute('datetime')).toLocaleString()
})

// Delete
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-delete]')
  if (!btn) return
  if (!confirm(`Delete "${btn.dataset.name}"? This can't be undone.`)) return
  btn.disabled = true
  const res = await fetch(`/api/mappings/${btn.dataset.delete}`, { method: 'DELETE' })
  if (res.ok || res.status === 404) {
    btn.closest('.lib-card').remove()
    setStatus(`Deleted "${btn.dataset.name}"`)
    if (!document.querySelector('.lib-card')) location.reload()
  } else {
    btn.disabled = false
    setStatus("Couldn't delete that mapping. Try again.", 'error')
  }
})

// Import
const importInput = document.getElementById('import-input')
document.getElementById('import-btn').addEventListener('click', () => importInput.click())
importInput.addEventListener('change', async () => {
  const file = importInput.files[0]
  importInput.value = ''
  if (!file) return
  setStatus(`Importing ${file.name}…`)
  try {
    const res = await fetch('/api/mappings/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `Import failed (${res.status})`)
    location.href = `/app/${body.mapping.id}`
  } catch (err) {
    setStatus(err.message, 'error')
  }
})
