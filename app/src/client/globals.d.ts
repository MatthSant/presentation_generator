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

interface GridStackNode { el?: HTMLElement; id?: string; x?: number; y?: number; w?: number; h?: number; minW?: number; minH?: number; }
interface GridStackInstance {
  destroy(removeDOM?: boolean): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  save(saveContent?: boolean): GridStackNode[];
  removeAll(removeDOM?: boolean): void;
  makeWidget(el: HTMLElement): void;
}
/* Gridstack attaches the live node (full x/y/w/h, never stripped) to each item
 * element. save()'s output omits any field equal to a default/min, so coords are
 * read from here instead. */
interface HTMLElement { gridstackNode?: GridStackNode; }
interface GridStackStatic {
  init(opts?: Record<string, unknown>, el?: HTMLElement): GridStackInstance;
}
declare const GridStack: GridStackStatic | undefined;
