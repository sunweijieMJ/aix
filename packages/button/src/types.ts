export interface ButtonProps {
  /**
   * 按钮类型
   * @default 'default'
   */
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';

  /**
   * 原生 button 元素的 type 属性（type 名称已被风格类型占用）
   *
   * 注意：默认值为 'button'，与原生默认的 'submit' 不同，
   * 避免按钮放入 form 后意外触发表单提交；需要提交表单时显式传入 'submit'
   * @default 'button'
   */
  htmlType?: 'button' | 'submit' | 'reset';

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
