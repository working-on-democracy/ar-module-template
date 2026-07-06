<script setup lang="ts">
interface ArModuleData {
  id: string;
  text: string;
  url: string;
  author: string;
  location: { lat: number; lng: number };
  assets: { id: string; src: string }[];
  components: { name: string; url: string }[];
  createdAt: string;
}

defineProps<{ arModule: ArModuleData }>();
</script>

<template>

  <!-- Assets are declared in the manifest (derived from src/assets/) and injected
       into the scene's <a-assets> by the host before this module mounts. Reference
       them here by id (file name without extension): `AESPA1_01.glb` → id
       "AESPA1_01". Do NOT declare your own <a-assets> here.

       The custom components used below (lod-manager, lod-object, render-order,
       unlit-material, billboard, ground-decal, no-frustum-cull) are registered
       from the manifest (src/a-frame-components/*) before this template mounts. -->
  <a-entity no-frustum-cull lod-manager="chunksPerCycle: 6">

    <!-- Key light, attached to the #group anchor and aimed at it. Dynamic shadows
         are disabled (castShadow: false) — we rely on the ground decals instead. -->
    <a-entity
        light="
                    type: directional;
                    intensity: 0.5;
                    castShadow: false;
                    target: #group"
        attach-to="target: #group; offset: 0 2 10">
    </a-entity>

    <!-- Fill light that follows the camera (in the original this was a child of
         the <a-camera>; here it tracks the camera via our attach-to component,
         since the camera is provided by the host, not this module). -->
    <a-entity
        light="type: point; distance: 12; intensity: 4; color: #ffffff;"
        attach-to="target: #camera; offset: 0 0 0">
    </a-entity>


    <!-- Lightstick instance 1 (AESPA1) -->
    <a-entity class="lightstick-instance"
              lod-object="nearDistance: 25; farDistance: 30"
              position="3 5 -15"
              scale="5 5 5"
              rotation="6 0 -30">

      <a-entity class="lod-mesh-group" visible="true">
        <a-entity class="lod-mesh" gltf-model="#HaloSphere" scale="1 1 1" material="opacity:0.1" render-order="0" unlit-material data-lod-near="7" data-lod-far="10" billboard></a-entity>
        <a-entity class="lod-mesh" gltf-model="#AESPA1_01" render-order="1"></a-entity>
        <a-entity class="lod-mesh" gltf-model="#AESPA1_02" render-order="2"></a-entity>
        <a-entity class="lod-mesh" gltf-model="#AESPA1_03" render-order="3"></a-entity>
        <a-entity class="lod-mesh" gltf-model="#AESPA1_LICHT" render-order="4" unlit-material data-lod-near="7" data-lod-far="10"></a-entity>
      </a-entity>

      <a-entity class="lod-billboard" gltf-model="#AESPA1_PNG" render-order="5" billboard unlit-material></a-entity>

      <a-entity geometry="primitive: plane; width: 0.8; height: 0.8" material="src: #Halo; opacity: 0.5; transparent: true" data-lod-near="6" data-lod-far="11" render-order="0" ground-decal="groundY: 0"></a-entity>

    </a-entity>


    <!-- Lightstick instance 2 (AESPA2) -->
    <a-entity class="lightstick-instance"
              lod-object="nearDistance: 25; farDistance: 30"
              position="-3 5 -15"
              scale="5 5 5"
              rotation="20 0 12">

      <a-entity class="lod-mesh-group" visible="true">
        <a-entity class="lod-mesh" gltf-model="#HaloSphere" scale="1 1 1" material="opacity:0.1" render-order="0" unlit-material data-lod-near="7" data-lod-far="10" billboard></a-entity>
        <a-entity class="lod-mesh" gltf-model="#AESPA2" render-order="1"></a-entity>
        <a-entity class="lod-mesh" gltf-model="#AESPA2_LICHT" render-order="2" unlit-material data-lod-near="7" data-lod-far="10"></a-entity>
      </a-entity>

      <a-entity class="lod-billboard" gltf-model="#AESPA2_PNG" render-order="0" billboard unlit-material></a-entity>

      <a-entity geometry="primitive: plane; width: 0.8; height: 0.8" material="src: #Halo; opacity: 0.5; transparent: true" data-lod-near="6" data-lod-far="11" render-order="0" ground-decal="groundY: 0"></a-entity>

    </a-entity>


    <!-- Anchor the key light aims at / attaches to. -->
    <a-entity id="group" position="3 12 -10"></a-entity>

  </a-entity>
</template>
