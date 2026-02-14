export interface ButtonProps {
  /**
   * 按钮类型
   * @default 'default'
   */
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';

  /**
   * 按钮尺寸
   * @default 'medium'
   */
  size?: 'small' | 'medium' | 'large';

  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;

  /**
   * 是否加载中，加载中时按钮不可点击并显示加载动画
   * @default false
   */
  loading?: boolean;
}

export interface ButtonEmits {
  /** 点击按钮时触发 */
  (e: 'click', event: MouseEvent): void;
}
