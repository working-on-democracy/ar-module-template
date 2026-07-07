<script setup lang="ts">
import {computed} from 'vue';

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

const label = computed(
    () => `${props.arModule.author}: ${props.arModule.text}`
);


</script>

<template>

  <!-- Assets are declared in the manifest (derived from src/assets/) and injected
       into the scene's <a-assets> by the host before this module mounts. Reference
       them here by id (file name without extension): `jellyfish-video.mp4` → id
       "jellyfish-video". Do NOT declare your own <a-assets> here.

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


    <!-- The whole glowstick field. glowstick-field auto-discovers every glowstick
         from <a-assets> (by the PREFIX_01 / PREFIX_LICHT / PREFIX_PNG convention)
         and builds one lod-object instance per stick — the same structure the two
         hand-written AESPA examples used, so all existing LOD/billboard/decal
         behaviour is reused unchanged. Parameters:
           areaWidth                  FIXED width (X), centred on the viewer (equal left/right)
           elevation / elevationVariation   base Y height + random ± offset
           minDistance / maxDistance  spacing between sticks, both honoured exactly
           tiltMin / tiltMax          random X/Z tilt magnitude range in degrees (± each, Y is always fully random)
           copies                     1 = 25 sticks, 2 = 50, 3 = 75, …
           scale                      per-stick scale
           lodNear / lodFar           global LOD group fade thresholds
           lichtNear / lichtFar       global custom near/far for the LICHT glow parts
         There is no depth setting — depth grows automatically in front of the viewer to fit every stick. -->
    <a-entity glowstick-field="
        areaWidth: 6;
        elevation: 0;
        elevationVariation: 0.3;
        minDistance: 0.8;
        maxDistance: 3;
        tiltMin: 0;
        tiltMax: 15;
        copies: 2;
        scale: 1;
        lodNear: 8;
        lodFar: 10;
        lichtNear: 1;
        lichtFar: 4"></a-entity>


    <!-- Anchor the key light aims at / attaches to. -->
    <a-entity id="group" position="3 12 -10"></a-entity>


  </a-entity>
</template>
