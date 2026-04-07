import {
  useFloating,
  autoUpdate,
  offset as offsetMiddleware,
  flip as flipMiddleware,
  shift as shiftMiddleware,
  arrow as arrowMiddleware,
  type Placement,
  type Strategy,
  type Middleware,
} from '@floating-ui/vue';
import { computed, ref, toValue, type CSSProperties, type MaybeRefOrGetter, type Ref } from 'vue';

export interface UsePopperOptions {
  placement?: MaybeRefOrGetter<Placement>;
  strategy?: MaybeRefOrGetter<Strategy>;
  offset?: MaybeRefOrGetter<number>;
  arrow?: MaybeRefOrGetter<boolean>;
  arrowSize?: MaybeRefOrGetter<number>;
  /** 容器边框宽度 (px)，用于箭头外推补偿，无边框时为 0 */
  borderWidth?: MaybeRefOrGetter<number>;
  flip?: MaybeRefOrGetter<boolean>;
  shift?: MaybeRefOrGetter<boolean>;
  additionalMiddleware?: MaybeRefOrGetter<Middleware[]>;
}

export interface UsePopperReturn {
  referenceRef: Ref<HTMLElement | null>;
  floatingRef: Ref<HTMLElement | null>;
  arrowRef: Ref<HTMLElement | null>;
  floatingStyles: Readonly<Ref<CSSProperties>>;
  arrowStyles: Ref<CSSProperties>;
  placement: Readonly<Ref<Placement>>;
  isPositioned: Readonly<Ref<boolean>>;
  update: () => void;
}

const ARROW_SIDE_MAP: Record<string, string> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
};

/** 箭头尖端圆角半径 (px) */
const ARROW_TIP_RADIUS = 2;

/**
 * 生成带圆角尖端的箭头 clip-path
 *
 * 使用 SVG path() 替代 polygon()，在箭头尖端（旋转后的朝外顶点）
 * 添加二次贝塞尔曲线圆角，使箭头与圆角容器视觉协调。
 */
function getArrowClipPath(staticSide: string, size: number): string {
  const r = Math.min(ARROW_TIP_RADIUS, size / 4);
  const s = size;

  // 每个 case 对应旋转前正方形的一个三角半区，尖端顶点用 Q 曲线替代直角
  switch (staticSide) {
    case 'bottom': // placement=top, 尖端 (s,s) 旋转后朝下
      return `path('M 0 ${s} L ${s - r} ${s} Q ${s} ${s} ${s} ${s - r} L ${s} 0 Z')`;
    case 'top': // placement=bottom, 尖端 (0,0) 旋转后朝上
      return `path('M ${r} 0 Q 0 0 0 ${r} L 0 ${s} L ${s} 0 Z')`;
    case 'right': // placement=left, 尖端 (s,0) 旋转后朝右
      return `path('M 0 0 L ${s - r} 0 Q ${s} 0 ${s} ${r} L ${s} ${s} Z')`;
    case 'left': // placement=right, 尖端 (0,s) 旋转后朝左
      return `path('M 0 0 L 0 ${s - r} Q 0 ${s} ${r} ${s} L ${s} ${s} Z')`;
    default:
      return '';
  }
}

/**
 * 核心定位 composable，封装 @floating-ui/vue 的 useFloating
 */
export function usePopper(options: UsePopperOptions = {}): UsePopperReturn {
  const {
    placement: placementOption = 'bottom',
    strategy: strategyOption = 'absolute',
    offset: offsetOption = 8,
    arrow: arrowOption = false,
    arrowSize: arrowSizeOption = 8,
    borderWidth: borderWidthOption = 0,
    flip: flipOption = true,
    shift: shiftOption = true,
    additionalMiddleware = [],
  } = options;

  const referenceRef = ref<HTMLElement | null>(null);
  const floatingRef = ref<HTMLElement | null>(null);
  const arrowRef = ref<HTMLElement | null>(null);

  const middleware = computed<Middleware[]>(() => {
    const list: Middleware[] = [];

    // offset 必须在最前
    list.push(offsetMiddleware(toValue(offsetOption)));

    if (toValue(flipOption)) {
      list.push(flipMiddleware());
    }

    if (toValue(shiftOption)) {
      list.push(shiftMiddleware({ padding: 5 }));
    }

    if (toValue(arrowOption)) {
      list.push(
        arrowMiddleware({
          element: arrowRef,
          padding: 5,
        }),
      );
    }

    // 额外 middleware 放最后
    const additional = toValue(additionalMiddleware);
    if (additional.length > 0) {
      list.push(...additional);
    }

    return list;
  });

  const { floatingStyles, placement, isPositioned, update, middlewareData } = useFloating(
    referenceRef,
    floatingRef,
    {
      placement: computed(() => toValue(placementOption)),
      strategy: computed(() => toValue(strategyOption)),
      middleware,
      whileElementsMounted: autoUpdate,
    },
  );

  const arrowStyles = computed<CSSProperties>(() => {
    const data = middlewareData.value.arrow;
    if (!data) return {};

    const side = placement.value.split('-')[0] as string;
    const staticSide = ARROW_SIDE_MAP[side] ?? 'top';
    const size = toValue(arrowSizeOption);

    const bw = toValue(borderWidthOption);

    return {
      position: 'absolute',
      left: data.x != null ? `${data.x}px` : '',
      top: data.y != null ? `${data.y}px` : '',
      [staticSide]: `${-size / 2 - bw}px`,
      width: `${size}px`,
      height: `${size}px`,
      clipPath: getArrowClipPath(staticSide, size),
    };
  });

  return {
    referenceRef,
    floatingRef,
    arrowRef,
    floatingStyles,
    arrowStyles,
    placement,
    isPositioned,
    update,
  };
}
