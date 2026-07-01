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
       them here by id (file name without extension): `jellyfish-video.mp4` → id
       "jellyfish-video". Do NOT declare your own <a-assets> here. -->
  <a-entity
      no-frustrum-cull
  >

    <a-entity light="type: ambient; intensity: 1"></a-entity>

    <a-entity
                    light="
                        type: directional;
                        intensity: 1;
                        castShadow: true;
                        shadowMapHeight:4096;
                        shadowMapWidth:4096;
                        shadowCameraTop: 80;
                        shadowCameraBottom: -80;
                        shadowCameraRight: 80;
                        shadowCameraLeft: -80;
                        target: #group;
                        shadowRadius: 80"
                    xrextras-attach="target: group; offset: 0 50 1;"
                    shadow>
    </a-entity>

            <a-entity
                    gltf-model="#Rosa"
                    unlit-materials
                    scale="12 12 12"
                    rotation="0 0 0"
                    position="0 0 -30"
                    shadow>
                <a-entity id="group" position="0 0 0"></a-entity>
            </a-entity>

        <!-- example primitive (plane) as ground -->

            <a-plane
                    id="ground"
                    rotation="-90 0 0"
                    position="-50 0 -50"
                    width="500"
                    height="500"
                    material="shader: shadow; opacity: 0.3; transparent: true"
                    shadow
            ></a-plane>

  </a-entity>
</template>
