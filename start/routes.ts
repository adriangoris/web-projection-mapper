/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

router.on('/').render('pages/home').as('home')
router.on('/app').render('pages/mapper').as('mapper')

/**
 * Keep links to the old static-site URLs working
 */
router.on('/index.html').redirectToPath('/')
router.on('/app.html').redirectToPath('/app')
