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
import {
  computed,
  ref,
  toValue,
  type CSSProperties,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';

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

/**
 * clip-path 映射：根据箭头所在边，裁切旋转后的正方形为三角形
 * 坐标基于旋转前的正方形，rotate(45deg) 后映射为菱形的对应半区
 */
const ARROW_CLIP_PATH: Record<string, string> = {
  bottom: 'polygon(0 100%, 100% 100%, 100% 0)', // 箭头朝下 (placement=top)
  top: 'polygon(0 0, 0 100%, 100% 0)', // 箭头朝上 (placement=bottom)
  right: 'polygon(0 0, 100% 0, 100% 100%)', // 箭头朝右 (placement=left)
  left: 'polygon(0 0, 0 100%, 100% 100%)', // 箭头朝左 (placement=right)
};

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

  const { floatingStyles, placement, isPositioned, update, middlewareData } =
    useFloating(referenceRef, floatingRef, {
      placement: computed(() => toValue(placementOption)),
      strategy: computed(() => toValue(strategyOption)),
      middleware,
      whileElementsMounted: autoUpdate,
    });

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
      clipPath: ARROW_CLIP_PATH[staticSide] ?? '',
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
