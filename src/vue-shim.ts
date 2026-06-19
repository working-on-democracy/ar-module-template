// NB: must NOT be window.__VUE__ — Vue's dev runtime overwrites that global
// with `true` (devtools detection), which would shadow the host's namespace
// and make every re-export below undefined. Use a dedicated, collision-free key.
const V: any =
  (typeof globalThis !== "undefined" && (globalThis as any).__AR_VUE__) ||
  (typeof window !== "undefined" && (window as any).__AR_VUE__);

if (!V) {
  throw new Error(
    "ArModule template: host Vue runtime not exposed at window.__AR_VUE__"
  );
}

export default V;

// Reactivity
export const ref = V.ref;
export const computed = V.computed;
export const reactive = V.reactive;
export const readonly = V.readonly;
export const watch = V.watch;
export const watchEffect = V.watchEffect;
export const watchPostEffect = V.watchPostEffect;
export const watchSyncEffect = V.watchSyncEffect;
export const isRef = V.isRef;
export const unref = V.unref;
export const toRef = V.toRef;
export const toRefs = V.toRefs;
export const isProxy = V.isProxy;
export const isReactive = V.isReactive;
export const isReadonly = V.isReadonly;
export const shallowRef = V.shallowRef;
export const shallowReactive = V.shallowReactive;
export const shallowReadonly = V.shallowReadonly;
export const triggerRef = V.triggerRef;
export const customRef = V.customRef;
export const markRaw = V.markRaw;
export const toRaw = V.toRaw;
export const effectScope = V.effectScope;
export const getCurrentScope = V.getCurrentScope;
export const onScopeDispose = V.onScopeDispose;

// Lifecycle
export const onBeforeMount = V.onBeforeMount;
export const onMounted = V.onMounted;
export const onBeforeUpdate = V.onBeforeUpdate;
export const onUpdated = V.onUpdated;
export const onBeforeUnmount = V.onBeforeUnmount;
export const onUnmounted = V.onUnmounted;
export const onErrorCaptured = V.onErrorCaptured;
export const onRenderTracked = V.onRenderTracked;
export const onRenderTriggered = V.onRenderTriggered;
export const onActivated = V.onActivated;
export const onDeactivated = V.onDeactivated;

// Dependency Injection
export const provide = V.provide;
export const inject = V.inject;
export const hasInjectionContext = V.hasInjectionContext;

// Component / setup
export const defineComponent = V.defineComponent;
export const defineAsyncComponent = V.defineAsyncComponent;
export const getCurrentInstance = V.getCurrentInstance;
export const useSlots = V.useSlots;
export const useAttrs = V.useAttrs;

// App / utilities
export const createApp = V.createApp;
export const nextTick = V.nextTick;
export const version = V.version;

// Built-in components
export const Transition = V.Transition;
export const TransitionGroup = V.TransitionGroup;
export const KeepAlive = V.KeepAlive;
export const Teleport = V.Teleport;
export const Suspense = V.Suspense;

// Render-function helpers
export const h = V.h;
export const mergeProps = V.mergeProps;
export const cloneVNode = V.cloneVNode;
export const isVNode = V.isVNode;
export const resolveComponent = V.resolveComponent;
export const resolveDirective = V.resolveDirective;
export const resolveDynamicComponent = V.resolveDynamicComponent;
export const withDirectives = V.withDirectives;
export const withModifiers = V.withModifiers;
export const withKeys = V.withKeys;
export const Fragment = V.Fragment;
export const Comment = V.Comment;
export const Text = V.Text;
export const Static = V.Static;
export const vModelText = V.vModelText;
export const vModelCheckbox = V.vModelCheckbox;
export const vModelRadio = V.vModelRadio;
export const vModelSelect = V.vModelSelect;
export const vModelDynamic = V.vModelDynamic;
export const vShow = V.vShow;

// Compiler-emitted helpers (required by SFC-compiled output)
export const createBlock = V.createBlock;
export const createElementBlock = V.createElementBlock;
export const openBlock = V.openBlock;
export const createVNode = V.createVNode;
export const createElementVNode = V.createElementVNode;
export const createCommentVNode = V.createCommentVNode;
export const createTextVNode = V.createTextVNode;
export const createStaticVNode = V.createStaticVNode;
export const toDisplayString = V.toDisplayString;
export const normalizeProps = V.normalizeProps;
export const normalizeClass = V.normalizeClass;
export const normalizeStyle = V.normalizeStyle;
export const guardReactiveProps = V.guardReactiveProps;
export const renderList = V.renderList;
export const renderSlot = V.renderSlot;
export const withCtx = V.withCtx;
export const pushScopeId = V.pushScopeId;
export const popScopeId = V.popScopeId;
export const withScopeId = V.withScopeId;
