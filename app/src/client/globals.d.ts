/* globals.d.ts — ambient types for the UMD vendor libs loaded via <script defer>. */

interface ApexInstance {
  render(): Promise<void>;
  destroy(): void;
  updateSeries(series: unknown, animate?: boolean): Promise<void>;
  updateOptions(options: unknown, redraw?: boolean, animate?: boolean): Promise<void>;
}
interface ApexChartsCtor {
  new (el: Element, options: unknown): ApexInstance;
}
declare const ApexCharts: ApexChartsCtor | undefined;

interface GridStackNode { el?: HTMLElement; id?: string; x?: number; y?: number; w?: number; h?: number; }
interface GridStackInstance {
  destroy(removeDOM?: boolean): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  save(saveContent?: boolean): GridStackNode[];
  removeAll(removeDOM?: boolean): void;
  makeWidget(el: HTMLElement): void;
}
interface GridStackStatic {
  init(opts?: Record<string, unknown>, el?: HTMLElement): GridStackInstance;
}
declare const GridStack: GridStackStatic | undefined;
