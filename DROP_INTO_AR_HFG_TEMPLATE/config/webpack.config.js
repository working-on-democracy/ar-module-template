const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')

const rootPath = process.cwd()
const distPath = path.join(rootPath, 'dist')
const srcPath = path.join(rootPath, 'src')
const enginePath = path.join(rootPath, 'node_modules', '@8thwall', 'engine-binary', 'dist')

const PRODUCTION_DMS_ASSETS = [
  'dms/app-icon.svg',
  'dms/assets/single-liquid-series.json',
  'dms/assets/shards-data.json',
  'dms/assets/shards-impact-star.json',
  'dms/assets/illustrations/single-liquid-final-target.png',
  'dms/assets/illustrations/authoritarian-orange-final-target-v1.png',
]

const ATTRIBUTES_TO_EXPAND = [
  'src', 'href', 'gltf-model', 'cover-image-url', 'footer-image-url', 'watermark-image-url',
]

const NON_BUNDLED_HTML_ASSET = /\.(?:svg|usdz|usda)(?:[?#].*)?$/i
const EXTERNAL_OR_INLINE_URL = /^(?:https?:|data:|blob:|#)/i

const shouldExpandHtmlAttribute = (tag, attribute, attributes = {}) => {
  const value = attributes[attribute]
  if (!value || typeof value !== 'string') return false
  if (tag === 'script' && attribute === 'src') return false
  if (attribute === 'href' && String(attributes.rel || '').toLowerCase().split(/\s+/).includes('ar')) {
    return false
  }
  if (NON_BUNDLED_HTML_ASSET.test(value)) return false
  if (EXTERNAL_OR_INLINE_URL.test(value)) return false
  return true
}

const makeJsLoader = () => ({
  test: /\.js$/,
  use: {
    loader: 'babel-loader',
    options: {
      presets: ['@babel/preset-env'],
      plugins: ['@babel/plugin-transform-runtime'],
    },
  },
  exclude: /node_modules/,
})

const makeCssLoader = () => ({
  test: /\.css$/,
  exclude: /\/assets\//,
  use: ['style-loader', 'css-loader'],
})

const makeAssetLoader = () => ({
  test: /\..*$/,
  include: [path.join(srcPath, 'assets')],
  loader: path.join(__dirname, 'asset-loader.js'),
})

const makeDefaultHtmlLoader = () => ({
  test: /\.html$/,
  use: {
    loader: 'html-loader',
    options: {
      esModule: false,
      sources: {
        list: [
          '...',
          {
            tag: 'script',
            attribute: 'src',
            type: 'src',
            filter: () => false,
          },
          ...ATTRIBUTES_TO_EXPAND.map(attr => ({
            tag: '*',
            attribute: attr,
            type: 'src',
            filter: shouldExpandHtmlAttribute,
          })),
        ],
      },
    },
  },
})

const makeHtmlPlugins = (target) => {
  const pages = target === 'prod'
    ? ['index.html']
    : target === 'preview'
      ? ['preview.html']
      : ['index.html', 'preview.html', 'anchor-test.html', 'image-target-test.html']

  return pages.map(filename => new HtmlWebpackPlugin({
    template: path.join(srcPath, filename),
    filename,
    inject: false,
  }))
}

const copyFile = (from, to) => ({
  from,
  to,
  toType: 'file',
  noErrorOnMissing: true,
})

const makeCopyPatterns = (target) => {
  if (target === 'full') {
    return [
      {
        from: path.join(rootPath, 'external'),
        to: path.join(distPath, 'external'),
        noErrorOnMissing: true,
      },
      {
        from: enginePath,
        to: path.join(distPath, 'external', 'xr'),
        noErrorOnMissing: true,
      },
      {
        from: path.join(srcPath, 'assets'),
        to: path.join(distPath, 'assets'),
        noErrorOnMissing: true,
      },
      {
        from: path.join(srcPath, 'image-targets'),
        to: path.join(distPath, 'image-targets'),
        noErrorOnMissing: true,
      },
      copyFile(path.join(rootPath, '_headers'), path.join(distPath, '_headers')),
    ]
  }

  return [
    copyFile(
      path.join(rootPath, 'external', 'scripts', '8frame-1.3.0.min.js'),
      path.join(distPath, 'external', 'scripts', '8frame-1.3.0.min.js'),
    ),
    {
      from: path.join(rootPath, 'external', 'xrextras'),
      to: path.join(distPath, 'external', 'xrextras'),
      noErrorOnMissing: true,
    },
    {
      from: path.join(rootPath, 'external', 'xrextras-shared-resources'),
      to: path.join(distPath, 'external', 'xrextras-shared-resources'),
      noErrorOnMissing: true,
    },
    {
      from: path.join(rootPath, 'external', 'landing-page'),
      to: path.join(distPath, 'external', 'landing-page'),
      noErrorOnMissing: true,
    },
    copyFile(path.join(enginePath, 'xr.js'), path.join(distPath, 'external', 'xr', 'xr.js')),
    copyFile(path.join(enginePath, 'xr-slam.js'), path.join(distPath, 'external', 'xr', 'xr-slam.js')),
    copyFile(path.join(enginePath, 'LICENSE'), path.join(distPath, 'external', 'xr', 'LICENSE')),
    copyFile(
      path.join(enginePath, 'resources', 'powered-by.svg'),
      path.join(distPath, 'external', 'xr', 'resources', 'powered-by.svg'),
    ),
    ...PRODUCTION_DMS_ASSETS.map(assetPath => copyFile(
      path.join(srcPath, 'assets', assetPath),
      path.join(distPath, 'assets', assetPath),
    )),
    copyFile(path.join(rootPath, '_headers'), path.join(distPath, '_headers')),
  ]
}

module.exports = (env = {}) => {
  const target = ['prod', 'preview', 'full'].includes(env.target) ? env.target : 'prod'

  return {
  entry: path.join(srcPath, 'app.js'),
  output: {
    filename: 'bundle.js',
    path: distPath,
    publicPath: '/',
    clean: true,
  },
  plugins: [
    ...makeHtmlPlugins(target),
    new CopyWebpackPlugin({
      patterns: makeCopyPatterns(target),
    }),
  ],
  resolve: { extensions: ['.ts', '.js'] },
  module: {
    rules: [
      makeJsLoader(),
      makeCssLoader(),
      makeAssetLoader(),
      makeDefaultHtmlLoader(),
    ],
  },
  mode: 'production',
  context: srcPath,
  devServer: {
    open: false,
    compress: true,
    hot: true,
    liveReload: false,
    allowedHosts: 'all',
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
    },
    client: {
      overlay: {
        warnings: false,
        errors: true,
      },
    },
  },
  }
}
