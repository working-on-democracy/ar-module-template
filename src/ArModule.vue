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
       "jellyfish-video". Do NOT declare your own <a-assets> here. -->
  <a-entity
      position="0 -2 0"
      no-frustum-cull
  >
    <a-text
        :value="label"
        position="0 2.5 -4"
        align="center"
        color="#ffffff"
        width="8"
    />
    <!-- Directional light that casts shadows onto the ground plane. Positioned
         above the scene; with no explicit `target` it points at the origin, so
         the fish and octahedron below cast shadows. -->
    <a-entity
        position="1 50 15"
        light="
                    type: directional;
                    intensity: 2;
                    castShadow: true;
                    shadowMapHeight:2048;
                    shadowMapWidth:2048;
                    shadowCameraTop: 80;
                    shadowCameraBottom: -80;
                    shadowCameraRight: 80;
                    shadowCameraLeft: -80;
                    shadowRadius: 12"
        shadow>
    </a-entity>

    <a-light type="ambient" intensity="0.7"></a-light>


    <a-entity
        gltf-model="#MainCharacter_optimized"
        scale="5 5 5"
        rotation="20 90 0"
        position="0 4 -2"
        animation-mixer="timeScale: 0.4"
        shadow>
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
