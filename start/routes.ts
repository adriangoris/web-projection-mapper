/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

const MappingsController = () => import('#controllers/mappings_controller')

router.on('/').render('pages/home').as('home')

/**
 * Pages
 */
router.get('/mappings', [MappingsController, 'library']).as('mappings')
router.get('/app', [MappingsController, 'editor']).as('mapper')
router.get('/app/:id', [MappingsController, 'editor']).as('mapper.show')

/**
 * Mappings API
 */
router
  .group(() => {
    router.get('/mappings', [MappingsController, 'index'])
    router.post('/mappings', [MappingsController, 'store'])
    router.post('/mappings/import', [MappingsController, 'import'])
    router.get('/mappings/:id', [MappingsController, 'show'])
    router.put('/mappings/:id', [MappingsController, 'update'])
    router.delete('/mappings/:id', [MappingsController, 'destroy'])
    router.get('/mappings/:id/thumbnail', [MappingsController, 'thumbnail'])
    router.get('/mappings/:id/export', [MappingsController, 'export'])
    router.post('/media', [MappingsController, 'mediaUpload'])
  })
  .prefix('/api')

router.get('/media/:ref', [MappingsController, 'media'])

/**
 * Keep links to the old static-site URLs working
 */
router.on('/index.html').redirectToPath('/')
router.on('/app.html').redirectToPath('/app')
