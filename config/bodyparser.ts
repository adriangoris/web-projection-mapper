import { defineConfig } from '@adonisjs/core/bodyparser'

/**
 * JSON bodies carry mapping data and a small JPEG thumbnail. Media and
 * projection files are sent as raw binary bodies, which the bodyparser
 * leaves untouched so the controllers can stream them.
 */
const bodyParserConfig = defineConfig({
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  json: {
    limit: '5mb',
    convertEmptyStringsToNull: false,
    trimWhitespaces: false,
  },
})

export default bodyParserConfig
