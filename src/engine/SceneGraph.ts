/** Pure, DOM-free state for Program, Preview, overlay and PiP layout.
 * Capture, rendering and transition timing remain in WmixEngine.
 */
export type PipLayout = { x: number; y: number; width: number };
export type SceneState = { base: string | null; overlay: string | null; layout: PipLayout };

const DEFAULT_LAYOUT: PipLayout = { x: 0.685, y: 0.68, width: 0.29 };
const clone = (scene: SceneState): SceneState => ({ ...scene, layout: { ...scene.layout } });

export class SceneGraph {
  private program: SceneState = { base: null, overlay: null, layout: { ...DEFAULT_LAYOUT } };
  private preview: SceneState | null = null;

  currentProgram(): string | null { return this.program.base; }
  currentOverlay(): string | null { return this.program.overlay; }
  currentPipLayout(): PipLayout { return { ...this.program.layout }; }
  currentProgramScene(): SceneState { return clone(this.program); }
  currentPreviewScene(): SceneState | null { return this.preview ? clone(this.preview) : null; }

  setProgram(id: string | null): void { this.program.base = id; }
  setOverlay(id: string | null): void { this.program.overlay = id; }
  setPipLayout(layout: PipLayout, aspectRatio = 16 / 9): void {
    const width = Math.max(0.1, Math.min(0.8, Number.isFinite(layout.width) ? layout.width : DEFAULT_LAYOUT.width));
    const height = width * 9 / 16 * (Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9);
    this.program.layout = {
      width,
      x: Math.max(0, Math.min(1 - width, Number.isFinite(layout.x) ? layout.x : 0)),
      y: Math.max(0, Math.min(1 - height, Number.isFinite(layout.y) ? layout.y : 0)),
    };
  }
  prepareScene(base: string | null, overlay: string | null, layout: PipLayout): void {
    this.preview = { base, overlay, layout: { ...layout } };
  }
  clearPreview(): void { this.preview = null; }

  /** Removes a source reference without touching other scene state. */
  removeSource(id: string, fallbackProgram: string | null): { programChanged: boolean; overlayChanged: boolean } {
    const programChanged = this.program.base === id;
    const overlayChanged = this.program.overlay === id;
    if (programChanged) this.program.base = fallbackProgram === id ? null : fallbackProgram;
    if (overlayChanged) this.program.overlay = null;
    if (this.preview?.base === id) this.preview.base = null;
    if (this.preview?.overlay === id) this.preview.overlay = null;
    return { programChanged, overlayChanged };
  }
}
