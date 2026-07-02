import {ComponentDefinition, Entity} from 'aframe'

export default {
    init() {
        const models = this.el.querySelectorAll('[gltf-model]') as NodeListOf<Entity>;
        models.forEach((el) => {
            el.addEventListener('model-loaded', () => {
                el.object3D.traverse((object) => {
                    object.frustumCulled = false
                })
            })
        })
    },
} as ComponentDefinition

