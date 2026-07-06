AFRAME.registerComponent('mesh-render-order', {
  init: function () {
    this.el.addEventListener('model-loaded', (e) => {
      const model = e.detail.model; // the loaded Three.js Object3D

      model.traverse((node) => {
        if (node.isMesh) {
          console.log('Found mesh:', node.name);

          if (node.name === 'Mesh_1') {
            node.renderOrder = 1;
          }
          if (node.name === 'Mesh_2') {
            node.renderOrder = 2;
          }
          if (node.name === 'Mesh_3') {
            node.renderOrder = 3;
          }
          if (node.name === 'Mesh_4') {
            node.renderOrder = 4;
          }
          if (node.name === 'Mesh_5') {
            node.renderOrder = 5;
          }
          if (node.name === 'Mesh_6') {
            node.renderOrder = 6;
          }
          if (node.name === 'Mesh_7') {
            node.renderOrder = 7;
          }
          if (node.name === 'Mesh_8') {
            node.renderOrder = 8;
          }
        }
      });
    });
  }
});
