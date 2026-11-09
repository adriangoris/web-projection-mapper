import { test } from '@japa/runner'

test.group('Pages', () => {
  test('renders the landing page', async ({ client }) => {
    const response = await client.get('/')

    response.assertStatus(200)
    response.assertTextIncludes('Projection Mapping Web')
    response.assertTextIncludes('href="/app"')
  })

  test('renders the mapper app', async ({ client }) => {
    const response = await client.get('/app')

    response.assertStatus(200)
    response.assertTextIncludes('<canvas id="gl"></canvas>')
    response.assertTextIncludes('id="timeline"')
  })

  test('redirects legacy {url} to {target}')
    .with([
      { url: '/index.html', target: '/' },
      { url: '/app.html', target: '/app' },
    ])
    .run(async ({ client }, { url, target }) => {
      const response = await client.get(url).redirects(0)

      response.assertStatus(302)
      response.assertHeader('location', target)
    })

  test('serves the demo gif', async ({ client }) => {
    const response = await client.get('/demo.gif')

    response.assertStatus(200)
    response.assertHeader('content-type', 'image/gif')
  })

  test('returns 404 for unknown routes', async ({ client }) => {
    const response = await client.get('/does-not-exist')

    response.assertStatus(404)
  })
})
