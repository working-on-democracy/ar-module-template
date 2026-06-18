<script setup lang="ts">
import { computed } from "vue";

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
       them here by id: `fish1.glb` → id "fish1". -->
  <a-entity>
    <a-entity
        gltf-model="#fish1"
        scale="14 14 -14"
        rotation="0 90 0"
        position="-4 18 -12"
        animation-mixer="timeScale: 1.1"
        shadow>
    </a-entity>
    <a-box
      position="0 0 0"
      width="0.5"
      height="0.5"
      depth="0.5"
      color="#22c55e"
      animation="property: rotation; to: 0 360 0; loop: true; dur: 4000; easing: linear"
    />
    <a-text
      :value="label"
      position="0 0.7 0"
      align="center"
      color="#ffffff"
      width="4"
    />
  </a-entity>
</template>
