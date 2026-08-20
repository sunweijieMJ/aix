/**
 * 样式类副作用导入（import './x.scss' / import '@aix/xxx/style' / 第三方 css）的
 * 空通配声明，让开启 noUncheckedSideEffectImports（TS 5.6+）的项目也能完成模块解析。
 *
 * 通过 base.json 的 "files" 挂载：extends 场景下 files 相对本配置包目录解析且不会被
 * 子配置的 include 覆盖，因此所有继承方（子包 dev/build 口径）零配置自动生效。
 *
 * 刻意声明为空模块体（不带 export default 等成员）：仓库根 typings/suffix.d.ts 对同名
 * 通配模块有带类型的声明，二者在根 program 中会做声明合并，空体不会产生重复成员冲突。
 */
declare module '*.css';
declare module '*.scss';
declare module '*.sass';
declare module '*.less';
