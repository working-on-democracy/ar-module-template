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
    <a-text
        :value="label"
        position="0 5 0"
        align="center"
        color="#ffffff"
        width="8"
    />
    <a-entity
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
                    target: #group;
                    shadowRadius: 12"
        xrextras-attach="target: group; offset: 1 50 15;"
        shadow>
    </a-entity>

    <a-light type="ambient" intensity="0.7"></a-light>

    <!-- Placeholder: a spinning mirror "diamond". The camera-reflection component
         (registered via the manifest) reflects the live 8th Wall camera feed off
         the surface, so the chrome material (full metalness, zero roughness)
         mirrors the real world instead of the empty AR scene. Rotates on Y. -->
    <a-octahedron
        camera-reflection
        radius="1"
        scale="2 2 2"
        position="0 1.5 0"
        material="metalness: 1; roughness: 0; color: #ffffff"
        animation="property: rotation; to: 0 360 0; loop: true; dur: 4000; easing: linear">
    </a-octahedron>

    <!-- example 3D model (fish) — id "fish1" comes from src/assets/fish1.glb.
         The no-frustrum-cull component on the root entity keeps this animated
         skinned mesh from being culled once animation-mixer moves it. -->
    <a-entity
        gltf-model="#fish1"
        scale="14 14 -14"
        rotation="0 90 0"
        position="-4 18 -12"
        animation-mixer="timeScale: 1.1"
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


    <!-- example Image Tracking. The target ("video-target") is declared in the
         manifest's imageTargets and configured by the host before mount; the
         #jellyfish-video / #video-target assets are auto-injected from
         src/assets/ (ids are the file names without extension). -->
    <xrextras-named-image-target name="video-target">
      <a-entity xrextras-play-video="video: #jellyfish-video; thumb: #video-target; canstop: true"
                geometry="primitive: plane; height: 1; width: 0.79;"></a-entity>
    </xrextras-named-image-target>

  </a-entity>
</template>
