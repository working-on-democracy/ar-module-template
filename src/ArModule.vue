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
      no-frustum-cull
  >
    <a-text
        :value="label"
        position="0 5 0"
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

    <!-- Placeholder: a spinning glossy purple "diamond" — glossy (low roughness)
         and clearly purple under the scene lights, rotating on Y. A simple stand-in
         so the preview shows something without depending on the bundled glTF. -->
    <a-octahedron
        radius="1"
        scale="2 2 2"
        position="2 4 -4"
        material="metalness: 0.3; roughness: 0.1; color: #7c3aed"
        animation="property: rotation; to: 0 360 0; loop: true; dur: 4000; easing: linear">
    </a-octahedron>

    <!-- example 3D model (fish) — id "fish1" comes from src/assets/fish1.glb.
         The no-frustum-cull component on the root entity keeps this animated
         skinned mesh from being culled once animation-mixer moves it. -->
    <a-entity
        gltf-model="#fish1"
        scale="14 14 -14"
        rotation="0 90 0"
        position="0 8 -12"
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
      <a-entity scale="3 3 3" xrextras-play-video="video: #jellyfish-video; thumb: #video-target; canstop: true"
                geometry="primitive: plane; height: 1; width: 0.79;"></a-entity>
    </xrextras-named-image-target>

  </a-entity>
</template>
