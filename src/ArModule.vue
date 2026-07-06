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

<<<<<<< HEAD
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
=======
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

    <a-light type="ambient" intensity="2"></a-light>


    <a-entity
        gltf-model="#Stick1"
        scale="10 10 10"
        rotation="0 0 0"
        position="-5 5 -5"
        shadow>
    </a-entity>

    <a-entity
        gltf-model="#Stick2"
        scale="10 10 10"
        rotation="0 0 0"
        position="0 5 -5"
        shadow>
    </a-entity>

    <a-entity
        gltf-model="#Stick3"
        scale="10 10 10"
        rotation="0 0 0"
        position="5 5 5"
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


    <!-- example Image Tracking. The target ("video-target") is declared in the
         manifest's imageTargets and configured by the host before mount; the
         #jellyfish-video / #video-target assets are auto-injected from
         src/assets/ (ids are the file names without extension). -->
         <!--
    <xrextras-named-image-target name="video-target">
      <a-entity xrextras-play-video="video: #jellyfish-video; thumb: #video-target; canstop: true"
                geometry="primitive: plane; height: 1; width: 0.79;"></a-entity>
    </xrextras-named-image-target>
    -->
>>>>>>> parent of 4a901b3 (Claude imported the prototype that I built in the old system and rewrote it to fit to the new module system.)

  </a-entity>
</template>
