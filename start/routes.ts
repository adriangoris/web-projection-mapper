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
const MaterialsController = () => import('#controllers/materials_controller')
const LibraryController = () => import('#controllers/library_controller')

/**
 * The mappings library is the homepage; the old landing page lives at /about
 */
router.on('/').redirectToPath('/mappings').as('home')
router.on('/about').render('pages/home').as('about')

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

    router.get('/library', [LibraryController, 'index'])
    router.post('/library', [LibraryController, 'store'])
    router.put('/library/:media', [LibraryController, 'update'])
    router.delete('/library/:media', [LibraryController, 'destroy'])
    router.get('/library/:media/thumbnail', [LibraryController, 'thumbnail'])

    router.get('/materials', [MaterialsController, 'index'])
    router.post('/materials', [MaterialsController, 'store'])
    router.get('/materials/:id', [MaterialsController, 'show'])
    router.put('/materials/:id', [MaterialsController, 'update'])
    router.delete('/materials/:id', [MaterialsController, 'destroy'])
  })
  .prefix('/api')

router.get('/media/:ref', [MappingsController, 'media'])

/**
 * Keep links to the old static-site URLs working
 */
router.on('/index.html').redirectToPath('/')
router.on('/app.html').redirectToPath('/app')
