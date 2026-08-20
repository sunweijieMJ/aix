/**
 * Canvas 2D 上下文桩
 *
 * jsdom 不实现 getContext('2d')（返回 null 并打印 Not implemented），
 * 导致 WaveformCanvas.draw() 直接早退——测试看似通过，实际从未执行绘制逻辑。
 * 这里提供一个记录型上下文，让绘制代码真正跑起来并可断言。
 */
import { vi } from 'vitest';

export interface DrawnRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fillStyle: string;
}

export interface CanvasRecorder {
  /** 每次 fill() 时记录的矩形（含当时的 fillStyle） */
  rects: DrawnRect[];
  /** clearRect 调用次数，等于 draw() 实际执行次数 */
  clearCount: number;
  /** getComputedStyle 调用次数，用于验证颜色解析没有下沉到绘制循环内 */
  computedStyleCount: number;
  reset(): void;
}

export function stubCanvas2D(): CanvasRecorder {
  const recorder: CanvasRecorder = {
    rects: [],
    clearCount: 0,
    computedStyleCount: 0,
    reset() {
      recorder.rects = [];
      recorder.clearCount = 0;
      recorder.computedStyleCount = 0;
    },
  };

  let pendingRect: Omit<DrawnRect, 'fillStyle'> | null = null;

  const context = {
    fillStyle: '#000000',
    globalAlpha: 1,
    setTransform: vi.fn(),
    scale: vi.fn(),
    clearRect: vi.fn(() => {
      recorder.clearCount++;
    }),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    roundRect: vi.fn((x: number, y: number, w: number, h: number) => {
      pendingRect = { x, y, w, h };
    }),
    fill: vi.fn(() => {
      if (!pendingRect) return;
      recorder.rects.push({ ...pendingRect, fillStyle: String(context.fillStyle) });
      pendingRect = null;
    }),
  };

  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => context,
  ) as unknown as HTMLCanvasElement['getContext'];

  // 包一层 getComputedStyle 以统计调用次数（用于性能回归断言）
  const originalGetComputedStyle = window.getComputedStyle.bind(window);
  vi.stubGlobal('getComputedStyle', (...args: Parameters<typeof originalGetComputedStyle>) => {
    recorder.computedStyleCount++;
    return originalGetComputedStyle(...args);
  });

  return recorder;
}
