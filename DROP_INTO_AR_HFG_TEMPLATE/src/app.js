import './index.css'
import {
  registerDmsMirrorShards,
  setupDmsPreviewScenePlayback,
  setupDmsWorldLifecycle,
  setupDmsXrLifecycle,
  showRuntimeWarning,
  wireDmsControls,
} from './integrations/dms/mirror-shards'

async function setupTrackingLifecycle() {
  if (document.body?.dataset.dmsTrackingMode !== 'image-target') {
    setupDmsWorldLifecycle()
    return
  }

  try {
    const response = await fetch('image-targets/video-target.json')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const videoTargetData = await response.json()
    setupDmsXrLifecycle({
      imageTargets: [videoTargetData],
      primaryTargetName: videoTargetData.name,
    })
  } catch (error) {
    console.error('DMS marker data could not be loaded', error)
    showRuntimeWarning(`Marker calibration test could not load: ${error.message}`)
  }
}

setupTrackingLifecycle()
setupDmsPreviewScenePlayback()

function boot() {
  if (window.AFRAME) {
    registerDmsMirrorShards()
  } else {
    console.warn('A-Frame runtime was not available when bundle.js ran')
    showRuntimeWarning('A-Frame runtime did not load. Run npm install, then npm run serve/build, and test over HTTPS for camera AR.')
  }
}

boot()

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireDmsControls, { once: true })
} else {
  wireDmsControls()
}
