// The ground under the plant in AR (the AR test scene and the replay): one
// surface that only shows the objects' shadows, and an invisible one that hides
// what is below the ground (growing out of it, sinking after death).
import type * as T from "three";

export function addGround(THREE: typeof T, parent: T.Object3D) {
  // ground that only shows shadows, so the objects stand on something
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.3 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  parent.add(ground);
  // writes depth only, so the camera image stays; drawn before the plant's opaque objects so they fail the depth test below y = 0
  const hider = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ colorWrite: false }));
  hider.rotation.x = -Math.PI / 2;
  hider.renderOrder = -1;
  parent.add(hider);
}
