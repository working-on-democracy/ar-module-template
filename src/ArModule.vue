<script setup lang="ts">

interface ArModuleData {
  id: string;
  text: string;
  url: string;
  author: string;
  location: { lat: number; lng: number };
  assets?: { id: string; src: string }[];
  components?: { name: string; url: string }[];
  createdAt: string;
}

const props = defineProps<{ arModule: ArModuleData }>();
</script>

<template>

  <!-- Assets are declared in the manifest (derived from src/assets/) and injected
       into the scene's <a-assets> by the host before this module mounts. Reference
       them here by id (file name without extension): `Aussen1.glb` → id
       "Aussen1". Do NOT declare your own <a-assets> here. -->
  <a-entity
      position="0 -2 0"
      no-frustum-cull
  >
    <!-- Lighting, ported from ar-hfg-template's src/app.js scene (replaces the
         single directional + ambient light that was here before). The key
         directional light follows #scene-content around via xrextras-attach, at
         a fixed offset, and points at it via `target` — same behaviour as the
         original, which followed its (now removed) demo model the same way.
         Unlike the original (castShadow: false), this casts shadows onto the
         ground plane's shadow-catcher material. -->
    <a-entity
        light="
                    type: directional;
                    intensity: 0.9 ;
                    castShadow: true;
                    target: #scene-content;
                    shadowRadius: 5;
                    shadowBias: -0.001;
                    shadowMapHeight:2048;
                    shadowMapWidth:2048;
                    shadowCameraTop: 80;
                    shadowCameraBottom: -80;
                    shadowCameraRight: 80;
                    shadowCameraLeft: -80;"
        xrextras-attach="target: scene-content; offset: -5 10 4;"
        shadow>
    </a-entity>

    <a-entity
        light="type: ambient; intensity: 0.5;">
    </a-entity>


    <!-- Uber parent for all 3 object groups — a single point to move/animate
         the whole placed scene from. The groups below now sit at 0 0 0 within
         it (they used to each carry the -10 z offset individually) and don't
         need their own scale value (they default to 1 1 1). Rotation matches
         "test"/"test2" in ar-hfg-template's scene — the object nearest its
         camera (position "-10 8 -40" vs. the camera at "0 8 8"). -->
    <a-entity id="scene-content" position="0 0.5 -15" rotation="0 135 0" scale="3.5 3.5 3.5">

      <!-- Aussen: 5 glbs sharing one origin, wrapped in a transform entity. The
           dithered camera-proximity cutout (see proximity-cutout.ts) is attached
           once here — `model-loaded` bubbles up from each child model, so this
           single component patches all 5 as they load. Values match the original
           ar-hfg-template scene (radius: 12; feather: 5). -->
      <a-entity
          id="aussen"
          position="0 0 0"
          proximity-cutout="radius: 2.5; feather: 0.3">

        <a-entity gltf-model="#Aussen1" position="0 0 0" shadow></a-entity>
        <a-entity gltf-model="#Aussen5" position="0 0 0" shadow></a-entity>
      </a-entity>

      <!-- Uses the real alpha-transparency variant (see proximity-fade.ts) —
           these fragments don't overlap other transparent objects, so plain
           blending is fine here. -->
      <a-entity
          id="aussen_fragments"
          position="0 0 0"
          proximity-fade="fadeOutStart: 14; fadeOutEnd: 11; target: 0 0 0">
      


        <a-entity gltf-model="#Aussen2" position="0 0 0" shadow></a-entity>
        <a-entity gltf-model="#Aussen3" position="0 0 0" shadow></a-entity>
        <a-entity gltf-model="#Aussen4" position="0 0 0" shadow></a-entity>


      </a-entity>

      <a-entity
          id="aussen_fragments_innen"
          position="0 0 0"
          proximity-fade="fadeInStart: 6; fadeInEnd: 4; target: 0 0 0">

        <a-entity gltf-model="#Aussen3" position="0 0 0" shadow></a-entity>
        <a-entity gltf-model="#Aussen4" position="0 0 0" shadow></a-entity>
        <a-entity gltf-model="#Aussen5" position="0 0 0" shadow></a-entity>
        <a-entity gltf-model="#Aussen2" position="0 0 0" shadow></a-entity>

      </a-entity>

      <a-entity
          id="aussen_fragments_door"
          position="0 0 0"
          proximity-fade-dither="fadeInStart: 4; fadeInEnd: 2; target: 0 0 0">

        <a-entity gltf-model="#Aussen2" position="0 0 0" shadow></a-entity>


      </a-entity>

      <!-- Gitter: 5 glbs sharing one origin. The camera-distance opacity fade
           is attached once here for the same bubbling reason, using the
           dithered variant (see proximity-fade-dither.ts) since Gitter
           overlaps other transparent objects in the scene — real alpha
           blending there would glitch. `target: 1.8 0 0.3` is a local offset
           from this entity (converted to world space every frame) — a debug
           marker placed as a child at the same local coordinates would mark
           exactly the point being measured from. Window as the camera
           approaches that point: transparent beyond 3, fades in 3→2, stays
           opaque 2→1, fades out 1→0, transparent at the point itself. -->
      <a-entity
          id="gitter"
          position="0 0 0"
          proximity-fade-dither="fadeInStart: 12; fadeInEnd: 9; fadeOutStart: 7; fadeOutEnd: 4; target: -1 0 -0.3"
          >
        <a-entity gltf-model="#Gitter2" position="0 0 0" shadow></a-entity>

      </a-entity>

      <a-entity
          id="gitter_fragments"
          position="0 0 0"
          proximity-fade-dither="fadeInStart: 18; fadeInEnd: 14; target: -1.7 0 -0.3">

        <a-entity gltf-model="#Gitter3" position="0 0 0" shadow></a-entity>
        <a-entity gltf-model="#Gitter4" position="0 0 0" shadow></a-entity>
        <a-entity gltf-model="#Gitter5" position="0 0 0" shadow></a-entity>
      </a-entity>



      <!-- Innen_ganz: single glb, same transform-entity structure as the other two
           (no proximity functionality applied). -->
      <a-entity id="innen-ganz" position="0 0 0">
        <a-entity gltf-model="#Innen_ganz" position="0 0 0" proximity-fade="fadeInStart: 11; fadeInEnd:6; target: 0 0 0" shadow></a-entity>
      </a-entity>

     <a-entity gltf-model="#Kueche_packed" rotation="-0.04 -2 0" position="0.05 0 -0.02" shadow></a-entity>

    </a-entity>

    <!-- example primitive (plane) as ground -->
    <a-plane
        id="ground"
        rotation="-90 0 0"
        position="-50 0 -50"
        width="500"
        height="500"
        material="shader: shadow"
        shadow
    ></a-plane>

  </a-entity>


</template>
