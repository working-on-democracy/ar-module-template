import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Tap-and-hold to pick a model up and drag it along the ground — a port of
// 8th Wall's `xrextras-hold-drag` that works inside transformed parents:
//
//   <a-entity gltf-model="#model" hold-drag="groundId: my-ground"></a-entity>
//
// Same schema and behaviour as the original: after holding for `dragDelay`
// ms the entity lifts to `riseHeight` and follows the finger across the
// entity `groundId`; on release it drops back to y = 0. Needs the host's
// cursor/raycaster to hit `.cantap` (it adds that class itself) and
// `xrextras-gesture-detector` on the scene for `onefingermove`/`onefingerend`.
//
// Why a port: the original writes the ground hit point (world space) and a
// world-space `riseHeight` straight into the entity's LOCAL position, and
// measures the drag distance between the entity's local position and the
// camera's position (verified in @8thwall/xrextras' source). That only works
// when the entity's parent sits untransformed at the scene origin — inside a
// module (host/preview wrapper) or a `legacy-space` hull it jumps to the
// wrong place. Here every point is converted into the parent's local space,
// so `riseHeight` and the drop height are in the parent's units (for old
// scenes: the old scene units, as authored).
export default {
  schema: {
    cameraId: { default: "camera" },
    groundId: { default: "ground" },
    dragDelay: { default: 300 },
    riseHeight: { default: 1 }
  },

  init() {
    const self = this as any;
    self.camera = document.getElementById(self.data.cameraId);
    if (!self.camera) throw new Error(`[hold-drag] Couldn't find camera with id '${self.data.cameraId}'`);
    self.ground = document.getElementById(self.data.groundId);
    if (!self.ground) throw new Error(`[hold-drag] Couldn't find ground with id '${self.data.groundId}'`);
    self.state = { fingerDown: false, dragging: false, distance: 0, startDragTimeout: null, positionRaw: null };
    self.raycaster = new THREE.Raycaster();

    self.fingerDown = (e: any) => {
      self.state.fingerDown = true;
      self.state.startDragTimeout = setTimeout(self.startDrag, self.data.dragDelay);
      self.state.positionRaw = e.detail?.positionRaw ?? null;
    };
    self.startDrag = () => {
      if (!self.state.fingerDown) return;
      self.state.dragging = true;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      self.el.object3D.getWorldPosition(a);
      self.camera.object3D.getWorldPosition(b);
      self.state.distance = a.distanceTo(b);
    };
    self.fingerMove = (e: any) => {
      self.state.positionRaw = e.detail?.positionRaw ?? null;
    };
    self.fingerUp = () => {
      self.state.fingerDown = false;
      clearTimeout(self.state.startDragTimeout);
      self.state.positionRaw = null;
      if (self.state.dragging) {
        const p = self.el.object3D.position;
        self.el.setAttribute("animation__drop", {
          property: "position",
          to: `${p.x} 0 ${p.z}`,
          dur: 300,
          easing: "easeOutQuad"
        });
      }
      self.state.dragging = false;
    };

    self.el.addEventListener("mousedown", self.fingerDown);
    self.el.sceneEl.addEventListener("onefingermove", self.fingerMove);
    self.el.sceneEl.addEventListener("onefingerend", self.fingerUp);
    self.el.classList.add("cantap");
  },

  tick() {
    const self = this as any;
    if (!self.state.dragging) return;
    const threeCamera = self.camera.getObject3D("camera");
    let worldPoint: any = null;
    if (self.state.positionRaw && threeCamera) {
      const x = (self.state.positionRaw.x / document.body.clientWidth) * 2 - 1;
      const y = (self.state.positionRaw.y / document.body.clientHeight) * 2 - 1;
      self.raycaster.setFromCamera(new THREE.Vector2(x, -y), threeCamera);
      const hits = self.raycaster.intersectObject(self.ground.object3D, true);
      if (hits.length > 0) {
        self.state.distance = hits[0].distance;
        worldPoint = hits[0].point.clone();
      }
    }
    if (!worldPoint) {
      worldPoint = self.camera.object3D.localToWorld(new THREE.Vector3(0, 0, -self.state.distance));
    }
    const parent = self.el.object3D.parent;
    const target = parent ? parent.worldToLocal(worldPoint) : worldPoint;
    target.y = self.data.riseHeight;
    self.el.object3D.position.lerp(target, 0.2);
  },

  remove() {
    const self = this as any;
    self.el.removeEventListener("mousedown", self.fingerDown);
    self.el.sceneEl.removeEventListener("onefingermove", self.fingerMove);
    self.el.sceneEl.removeEventListener("onefingerend", self.fingerUp);
    if (self.state.fingerDown) self.fingerUp();
  }
} as ComponentDefinition;
