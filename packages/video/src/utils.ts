/**
 * 设备检测工具函数
 */

interface WindowWithMSStream extends Window {
  MSStream?: unknown;
}

/**
 * 检测是否为移动设备
 */
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

/**
 * 检测是否为 iOS 设备
 */
export function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as WindowWithMSStream).MSStream
  );
}

/**
 * 检测是否为 Android 设备
 */
export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}
