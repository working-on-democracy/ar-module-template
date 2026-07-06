<script setup lang="ts">
import {computed} from 'vue';

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

const props = defineProps<{ arModule: ArModuleData }>();

const label = computed(
    () => `${props.arModule.author}: ${props.arModule.text}`
);


</script>

<template>

  <!-- Assets are declared in the manifest (derived from src/assets/) and injected
       into the scene's <a-assets> by the host before this module mounts. Reference
       them here by id (file name without extension): `Wand1.glb` → id "Wand1".
       Do NOT declare your own <a-assets> here. -->
  <a-entity no-frustrum-cull>

   <a-entity
        light="
                    type: directional;
                    intensity: 0.1;
                    castShadow: true;
                    shadowMapHeight:2048;
                    shadowMapWidth:2048;
                    shadowCameraTop: 80;
                    shadowCameraBottom: -80;
                    shadowCameraRight: 80;
                    shadowCameraLeft: -80;
                    target: #group;
                    shadowRadius: 12"
        xrextras-attach="target: group; offset: 1 50 15;"
        shadow>
    </a-entity>



     <a-light type="ambient" intensity="0.1"></a-light>


    <!-- Wand models — ids come from the file names in src/assets/ (Wand1.glb →
         "Wand1"). The no-frustrum-cull component on the root entity keeps any
         animated skinned meshes from being culled once they move. -->
    <a-entity
        gltf-model="#Wand1"
        scale="4 4 4"
        rotation="0 30 0"
        position="-17 0 -15"
        shadow>
    </a-entity>

    <a-entity
        gltf-model="#WandChurch"
        scale="4 4 4"
        rotation="0 5 0"
        position="0 0 -20"
        shadow>
    </a-entity>

    <a-entity
        gltf-model="#Wand2"
        scale="4 4 4"
        rotation="0 -30 0"
        position="17 0 -17"
        shadow>
    </a-entity>


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
