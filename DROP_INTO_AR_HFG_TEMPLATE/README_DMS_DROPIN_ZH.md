# Liquid Civic Mirror Drop-in 说明

这个目录可以直接作为干净 8th Wall + A-Frame 模板的项目根目录，也可以把下面列出的文件合并进已有模板。

当前版本：`20260702-white-balance-glass-v20`

对外项目名：**Liquid Civic Mirror / 流动的公共之镜**

内部代码命名空间：`dms`

## 常用命令

```bash
npm install
npm run build
```

可选预览：

```bash
npm run build:preview
npm run serve
```

`npm run build` 会在 `dist/` 里生成正式 AR 构建。

## 主要对接文件

```text
src/index.html
src/app.js
src/index.css
src/integrations/dms/mirror-shards.js
src/assets/dms/
config/webpack.config.js
external/
_headers
wrangler.toml
```

## 运行组件

- `dms-mirror-shards`：玻璃碎片装置、液体海报 shader、共享 render target、GPU 震荡、颜色状态变化、原位律动和按钮控制
- `dms-world-room-anchor`：8th Wall world tracking 空间放置

## 当前视觉默认值

```text
quality: auto
panelLimit: 1
enableFracture: false
enableGpuMotion: true
displayScale: 2.05
layoutScale: 1.55
```

v20 的视觉平衡保留手机端更浓的颜料感，同时压低过亮白膜，让碎片看起来更像玻璃，而不是白色板面。

调试参数：

```text
?quality=high
?quality=balanced
?quality=low
?colorBoost=0.35
?alphaBoost=1.18
?liquidHighlightLimit=0.76
```

## 生产部署注意

正式版本请部署 `npm run build` 的输出，并通过 HTTPS 访问。8th Wall 手机相机 AR 不能直接从本地文件路径或不安全 HTTP 正常运行。

这次源码交付只保留正式 AR 页面和 PC preview 页面。anchor test、image-target test、USDZ、旧视频和之前六张海报图组已经有意省略。

对外项目名可以自由修改，但如果要改内部 `dms` 命名空间，需要同时修改路径、组件名、HTML 属性、CSS/debug ID 和文档。
