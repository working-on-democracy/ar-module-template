const path = require('path')

const toUnixPath = process.platform === 'win32'
  ? p => p.replace(/\\/g, '/').replace(/\/+/g, '/')
  : p => p

const makeExport = srcPath => `module.exports = ${JSON.stringify(toUnixPath(srcPath))};`

function assetLoader() {
  const srcPath = path.relative(this.rootContext, this.resourcePath)
  return makeExport(srcPath)
}

module.exports = assetLoader
