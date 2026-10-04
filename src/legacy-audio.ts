// Sound handling of the old 8th Wall projects (enable-audio.js / ui.js),
// scoped to one module instead of the whole document.
import { unlockAudio } from "./a-frame-components/sound-unlock-audio";

// A-Frame's component-level `isPlaying` is the component's lifecycle state
// (entity playing/paused), not audio playback — whether a sound is audible
// is on its pooled THREE.Audio objects.
function isAudible(sound: any): boolean {
  return (sound.pool?.children ?? []).some((audio: any) => audio.isPlaying);
}

function soundComponents(root: Element): any[] {
  return Array.from(root.querySelectorAll("[sound]"))
    .map((el) => (el as any).components?.sound)
    .filter(Boolean);
}

/**
 * Starts every `sound` entity under `root` — what the old "play audio"
 * button did. Call from inside the tap handler: unlockAudio() needs the user
 * gesture (iOS autoplay policy and Ring/Silent switch, see
 * sound-unlock-audio.ts).
 */
export function playLegacySounds(root: Element): void {
  unlockAudio();
  soundComponents(root).forEach((sound) => sound.playSound());
}

/**
 * Pauses this module's sounds while the page is hidden and resumes them when
 * it's visible again, like the original's visibilitychange handler. Unlike
 * the original (which called playSound() on every sound in the document on
 * return — starting sounds that had never been started), only sounds that
 * were actually playing are resumed. Returns a teardown.
 */
export function pauseSoundsWhileHidden(root: Element): () => void {
  let paused: any[] = [];
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      paused = soundComponents(root).filter(isAudible);
      paused.forEach((sound) => sound.pauseSound());
    } else {
      paused.forEach((sound) => sound.playSound());
      paused = [];
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => document.removeEventListener("visibilitychange", onVisibility);
}
