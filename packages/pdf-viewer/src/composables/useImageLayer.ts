/**
 * useImageLayer - PDF 图片层 Composable
 * @description 从 PDF 页面中提取图片信息并创建可交互的图片层
 *
 * 实现原理:
 * 1. 使用 getOperatorList 获取 PDF 渲染操作列表
 * 2. 解析 transform 和 paintImageXObject 操作获取图片位置
 * 3. 创建 DOM 覆盖层实现 hover/click 交互
 */
import { OPS } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import { ref, shallowRef, type Ref, type ShallowRef } from 'vue';
import { DEFAULT_IMAGE_LAYER_CONFIG } from '../constants';
import type {
  PdfImageInfo,
  ImageLayerConfig,
  ImageLayerEvents,
} from '../types';

export interface UseImageLayerReturn {
  /** 当前页面的图片列表（单页模式用，连续模式请用 getAllImages） */
  images: ShallowRef<PdfImageInfo[]>;
  /** 选中的图片 ID 集合 */
  selectedImages: Ref<Set<string>>;
  /** 当前 hover 的图片 ID */
  hoveredImageId: Ref<string | null>;
  /** 从 PDF 页面提取图片 */
  extractImages: (
    page: PDFPageProxy,
    viewport: { width: number; height: number; transform: number[] },
    pageNumber: number,
  ) => Promise<PdfImageInfo[]>;
  /** 渲染图片层 DOM（传入 pageImages 避免并行渲染竞态） */
  renderImageLayer: (
    container: HTMLElement,
    pageImages?: PdfImageInfo[],
  ) => void;
  /** 刷新覆盖层样式 */
  refreshStyles: (container: HTMLElement) => void;
  /** 清除选中 */
  clearSelection: () => void;
  /** 选中指定图片 */
  selectImage: (imageId: string) => void;
  /** 获取选中的图片 */
  getSelectedImages: () => PdfImageInfo[];
  /** 移除指定页面的图片数据（页面卸载时调用） */
  removePageImages: (pageNumber: number) => void;
  /** 清理资源 */
  cleanup: () => void;
}

/** 6 元素变换矩阵 */
type Matrix6 = [number, number, number, number, number, number];

/**
 * 图片层 Composable
 */
export function useImageLayer(
  getConfig: () => Partial<ImageLayerConfig>,
  events: ImageLayerEvents = {},
): UseImageLayerReturn {
  /** 获取合并后的配置 */
  function getMergedConfig(): ImageLayerConfig {
    return { ...DEFAULT_IMAGE_LAYER_CONFIG, ...getConfig() };
  }

  // 状态
  const images = shallowRef<PdfImageInfo[]>([]);
  const selectedImages = ref<Set<string>>(new Set());
  const hoveredImageId = ref<string | null>(null);
  /** 按页存储图片，支持连续模式多页并存 */
  const pageImagesMap = new Map<number, PdfImageInfo[]>();

  /** 获取所有页面的图片（跨页查询） */
  function getAllImages(): PdfImageInfo[] {
    const all: PdfImageInfo[] = [];
    for (const imgs of pageImagesMap.values()) {
      all.push(...imgs);
    }
    return all;
  }

  /**
   * 从 PDF 页面提取图片信息
   */
  async function extractImages(
    page: PDFPageProxy,
    viewport: { width: number; height: number; transform: number[] },
    pageNumber: number,
  ): Promise<PdfImageInfo[]> {
    const operatorList = await page.getOperatorList();
    const { fnArray, argsArray } = operatorList;

    const extractedImages: PdfImageInfo[] = [];
    const initialMatrix: Matrix6 = [1, 0, 0, 1, 0, 0];
    const transformStack: Matrix6[] = [initialMatrix];
    let currentTransform: Matrix6 = [...initialMatrix];

    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args = argsArray[i];

      if (fn === OPS.save) {
        transformStack.push([...currentTransform]);
      } else if (fn === OPS.restore) {
        if (transformStack.length > 1) {
          transformStack.pop();
          const last = transformStack[transformStack.length - 1];
          currentTransform = last ? [...last] : [...initialMatrix];
        }
      } else if (fn === OPS.transform) {
        const m = args as number[];
        if (m.length >= 6) {
          const m0 = m[0] ?? 1,
            m1 = m[1] ?? 0,
            m2 = m[2] ?? 0,
            m3 = m[3] ?? 1,
            m4 = m[4] ?? 0,
            m5 = m[5] ?? 0;
          currentTransform = multiplyMatrix(currentTransform, [
            m0,
            m1,
            m2,
            m3,
            m4,
            m5,
          ]);
        }
      } else if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintImageMaskXObject ||
        fn === OPS.paintInlineImageXObject
      ) {
        const objId = args[0] as string;
        const imageInfo = extractImageFromTransform(
          objId,
          currentTransform,
          viewport,
          pageNumber,
          extractedImages.length,
        );
        if (imageInfo) {
          extractedImages.push(imageInfo);
        }
      } else if (fn === OPS.paintImageXObjectRepeat) {
        const objId = args[0] as string;
        // args 格式: [objId, width, height, x1, y1, x2, y2, ...]
        const imgWidth = (args[1] as number) ?? 1;
        const imgHeight = (args[2] as number) ?? 1;
        const positions = args.slice(3) as number[];
        for (let j = 0; j < positions.length; j += 2) {
          const posTransform: Matrix6 = [
            imgWidth,
            0,
            0,
            imgHeight,
            positions[j] ?? 0,
            positions[j + 1] ?? 0,
          ];
          const repeatTransform = multiplyMatrix(
            currentTransform,
            posTransform,
          );
          const imageInfo = extractImageFromTransform(
            objId,
            repeatTransform,
            viewport,
            pageNumber,
            extractedImages.length,
          );
          if (imageInfo) {
            extractedImages.push(imageInfo);
          }
        }
      }
    }

    // 按页存储，同时更新 images（单页模式向后兼容）
    pageImagesMap.set(pageNumber, extractedImages);
    images.value = extractedImages;
    return extractedImages;
  }

  /**
   * 从变换矩阵提取图片信息
   */
  function extractImageFromTransform(
    objId: string,
    transform: Matrix6,
    viewport: { width: number; height: number; transform: number[] },
    pageNumber: number,
    index: number,
  ): PdfImageInfo | null {
    // PDF 坐标系: 原点在左下角, y 轴向上
    // 变换矩阵: [a, b, c, d, e, f]
    // x' = a*x + c*y + e
    // y' = b*x + d*y + f
    const [a, b, c, d, e, f] = transform;

    // 计算图片在 PDF 坐标系中的尺寸
    // 图片原始坐标是 (0,0) 到 (1,1) 的单位正方形
    // 使用 sqrt(a²+b²) / sqrt(c²+d²) 以正确处理旋转/倾斜
    const pdfWidth = Math.sqrt(a * a + b * b);
    const pdfHeight = Math.sqrt(c * c + d * d);
    const pdfX = e;
    const pdfY = f;

    // 转换到视口坐标系
    const vt = viewport.transform;
    if (vt.length < 6) return null;
    const vt0 = vt[0] ?? 1,
      vt1 = vt[1] ?? 0,
      vt2 = vt[2] ?? 0,
      vt3 = vt[3] ?? 1,
      vt4 = vt[4] ?? 0,
      vt5 = vt[5] ?? 0;
    const viewportMatrix: Matrix6 = [vt0, vt1, vt2, vt3, vt4, vt5];

    const p1 = applyTransform([pdfX, pdfY], viewportMatrix);
    const p2 = applyTransform(
      [pdfX + pdfWidth, pdfY + pdfHeight],
      viewportMatrix,
    );

    const vx = p1[0];
    const vy = p1[1];
    const vx2 = p2[0];
    const vy2 = p2[1];

    const x = Math.min(vx, vx2);
    const y = Math.min(vy, vy2);
    const width = Math.abs(vx2 - vx);
    const height = Math.abs(vy2 - vy);

    // 过滤太小的图片
    if (
      width < getMergedConfig().minImageSize ||
      height < getMergedConfig().minImageSize
    ) {
      return null;
    }

    // 过滤覆盖整页的大图片 (可能是背景图)
    const pageArea = viewport.width * viewport.height;
    const imageArea = width * height;
    if (imageArea > pageArea * getMergedConfig().maxPageRatio) {
      return null;
    }

    return {
      id: `img-${pageNumber}-${index}`,
      objId,
      x,
      y,
      width,
      height,
      pdfRect: { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight },
      transform: [...transform],
      pageNumber,
    };
  }

  /**
   * 渲染图片层 DOM
   * 每个 overlay 直接绑定事件监听器
   * @param pageImages 指定渲染的图片列表（连续模式必传，避免并行渲染竞态）
   */
  function renderImageLayer(
    container: HTMLElement,
    pageImages?: PdfImageInfo[],
  ): void {
    container.innerHTML = '';

    for (const image of pageImages ?? images.value) {
      const div = createImageOverlay(image);
      container.appendChild(div);
    }
  }

  /**
   * 创建单个图片的覆盖层元素
   * 直接在元素上绑定事件监听器
   */
  function createImageOverlay(image: PdfImageInfo): HTMLElement {
    const div = document.createElement('div');
    div.className = 'aix-pdf-image-overlay';
    div.dataset.imageId = image.id;

    // 始终保持 2px 透明边框，状态变化时只改颜色，避免 border-width 瞬变导致闪烁
    div.style.cssText = `
      position: absolute;
      left: ${image.x}px;
      top: ${image.y}px;
      width: ${image.width}px;
      height: ${image.height}px;
      cursor: pointer;
      box-sizing: border-box;
      pointer-events: auto;
      border: 2px solid transparent;
      transition: background-color 0.2s, border-color 0.2s;
    `;

    // 直接绑定事件
    if (getMergedConfig().enableHover) {
      div.addEventListener('mouseenter', (e) => handleMouseEnter(image, e));
      div.addEventListener('mouseleave', (e) => handleMouseLeave(image, e));
    }

    if (getMergedConfig().enableSelection) {
      div.addEventListener('click', (e) => handleClick(image, e));
      div.addEventListener('dblclick', (e) => handleDblClick(image, e));
    }

    updateOverlayStyle(div, image);
    return div;
  }

  /**
   * 更新覆盖层样式
   */
  function updateOverlayStyle(element: HTMLElement, image: PdfImageInfo): void {
    const isSelected = selectedImages.value.has(image.id);
    const isHovered = hoveredImageId.value === image.id;

    if (isSelected) {
      const { borderColor, backgroundColor } = getMergedConfig().selectedStyle;
      element.style.borderColor = borderColor;
      element.style.backgroundColor = backgroundColor ?? 'transparent';
    } else if (isHovered) {
      const { borderColor, backgroundColor } = getMergedConfig().hoverStyle;
      element.style.borderColor = borderColor;
      element.style.backgroundColor = backgroundColor ?? 'transparent';
    } else {
      element.style.borderColor = 'transparent';
      element.style.backgroundColor = 'transparent';
    }
  }

  /**
   * 刷新所有覆盖层样式
   */
  function refreshStyles(container: HTMLElement): void {
    const imageMap = new Map(getAllImages().map((img) => [img.id, img]));
    const overlays = container.querySelectorAll('.aix-pdf-image-overlay');

    overlays.forEach((overlay) => {
      const imageId = (overlay as HTMLElement).dataset.imageId;
      if (imageId) {
        const image = imageMap.get(imageId);
        if (image) {
          updateOverlayStyle(overlay as HTMLElement, image);
        }
      }
    });
  }

  function handleMouseEnter(image: PdfImageInfo, event: MouseEvent): void {
    hoveredImageId.value = image.id;
    const target = event.currentTarget as HTMLElement;
    updateOverlayStyle(target, image);
    events.onImageHover?.(image, event);
  }

  function handleMouseLeave(image: PdfImageInfo, event: MouseEvent): void {
    hoveredImageId.value = null;
    const target = event.currentTarget as HTMLElement;
    updateOverlayStyle(target, image);
    events.onImageHover?.(null, event);
  }

  function handleClick(image: PdfImageInfo, event: MouseEvent): void {
    event.stopPropagation();

    if (getMergedConfig().multiSelect && event.ctrlKey) {
      if (selectedImages.value.has(image.id)) {
        selectedImages.value.delete(image.id);
      } else {
        selectedImages.value.add(image.id);
      }
    } else {
      selectedImages.value.clear();
      selectedImages.value.add(image.id);
    }

    const selected = getAllImages().filter((img) =>
      selectedImages.value.has(img.id),
    );
    events.onSelectionChange?.(selected);
    events.onImageClick?.(image, event);

    // 通过 parentElement 获取容器并刷新样式
    const container = (event.currentTarget as HTMLElement).parentElement;
    if (container) {
      refreshStyles(container);
    }
  }

  function handleDblClick(image: PdfImageInfo, event: MouseEvent): void {
    event.stopPropagation();
    events.onImageDblClick?.(image, event);
  }

  function clearSelection(): void {
    selectedImages.value.clear();
    events.onSelectionChange?.([]);
  }

  function selectImage(imageId: string): void {
    if (!getMergedConfig().multiSelect) {
      selectedImages.value.clear();
    }
    selectedImages.value.add(imageId);
    const selected = getAllImages().filter((img) =>
      selectedImages.value.has(img.id),
    );
    events.onSelectionChange?.(selected);
  }

  function getSelectedImages(): PdfImageInfo[] {
    return getAllImages().filter((img) => selectedImages.value.has(img.id));
  }

  function removePageImages(pageNumber: number): void {
    pageImagesMap.delete(pageNumber);
  }

  function cleanup(): void {
    images.value = [];
    pageImagesMap.clear();
    selectedImages.value.clear();
    hoveredImageId.value = null;
  }

  return {
    images,
    selectedImages,
    hoveredImageId,
    extractImages,
    renderImageLayer,
    refreshStyles,
    clearSelection,
    selectImage,
    getSelectedImages,
    removePageImages,
    cleanup,
  };
}

// 工具函数
function multiplyMatrix(m1: Matrix6, m2: Matrix6): Matrix6 {
  const a1 = m1[0],
    b1 = m1[1],
    c1 = m1[2],
    d1 = m1[3],
    e1 = m1[4],
    f1 = m1[5];
  const a2 = m2[0],
    b2 = m2[1],
    c2 = m2[2],
    d2 = m2[3],
    e2 = m2[4],
    f2 = m2[5];
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function applyTransform(
  point: [number, number],
  transform: Matrix6,
): [number, number] {
  const x = point[0],
    y = point[1];
  const a = transform[0],
    b = transform[1],
    c = transform[2],
    d = transform[3],
    e = transform[4],
    f = transform[5];
  return [a * x + c * y + e, b * x + d * y + f];
}
