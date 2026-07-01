import css from './index.css'
AFRAME.registerComponent('unlit-materials', {
  init: function () {
    this.el.addEventListener('model-loaded', () => {
      const mesh = this.el.getObject3D('mesh');
      mesh.traverse((node) => {
        if (node.isMesh) {
          const oldMat = node.material;
          const newMat = new THREE.MeshBasicMaterial({
            map: oldMat.map,
            transparent: true,
            alphaTest: 0.6,
            side: oldMat.side,
            vertexColors: oldMat.vertexColors
          });
          // KEINE manuelle colorSpace-Zuweisung mehr
          node.material = newMat;
        }
      });
    });
  }
});
AFRAME.registerComponent('unlit-materials', {
  init: function () {
    this.el.addEventListener('model-loaded', () => {
      const mesh = this.el.getObject3D('mesh');
      mesh.traverse((node) => {
        if (node.isMesh) {
          const oldMat = node.material;
          const newMat = new THREE.MeshBasicMaterial({
            map: oldMat.map,
            transparent: true,
            alphaTest: 0.5,
            side: oldMat.side
          });

          if (newMat.map) {
            newMat.map.colorSpace = THREE.SRGBColorSpace;
          }
          newMat.toneMapped = false;

          node.material = newMat;
        }
      });
    });
  }
});

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
AFRAME.registerComponent('no-frustrum-cull', {
  init() {
    const models = this.el.querySelectorAll('[gltf-model]')
    models.forEach((el) => {
      el.addEventListener('model-loaded', () => {
        el.object3D.traverse((object) => {
          object.frustumCulled = false
        })
      })
    })
  },
})

