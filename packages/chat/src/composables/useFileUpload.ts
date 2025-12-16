/**
 * @fileoverview useFileUpload - 文件上传功能
 * 支持图片、文件上传、预览、删除等
 */

import { ref, computed, onScopeDispose, type Ref } from 'vue';

/**
 * 文件类型
 */
export enum FileType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  OTHER = 'other',
}

/**
 * 上传的文件信息
 */
export interface UploadedFile {
  /** 文件ID */
  id: string;
  /** 文件名 */
  name: string;
  /** 文件类型 */
  type: FileType;
  /** 文件大小(bytes) */
  size: number;
  /** MIME类型 */
  mimeType: string;
  /** 文件URL（本地或远程） */
  url: string;
  /** 缩略图URL */
  thumbnailUrl?: string;
  /** Base64数据 */
  base64?: string;
  /** 上传状态 */
  status: 'uploading' | 'success' | 'error';
  /** 上传进度(0-100) */
  progress: number;
  /** 错误信息 */
  error?: string;
  /** 原始File对象 */
  file?: File;
}

/**
 * 上传配置
 */
export interface UploadConfig {
  /** 最大文件大小(MB) */
  maxSize?: number;
  /** 允许的文件类型 */
  accept?: string;
  /** 是否允许多选 */
  multiple?: boolean;
  /** 是否自动上传 */
  autoUpload?: boolean;
  /** 自定义上传函数 */
  uploadFn?: (file: File) => Promise<string>;
  /** 是否转换为Base64 */
  useBase64?: boolean;
  /** 图片压缩质量(0-1) */
  compressQuality?: number;
  /** 最大图片宽度 */
  maxImageWidth?: number;
  /** 最大图片高度 */
  maxImageHeight?: number;
}

/**
 * 上传结果
 */
export interface UseFileUploadReturn {
  /** 已上传的文件列表 */
  files: Ref<UploadedFile[]>;
  /** 是否正在上传 */
  isUploading: Ref<boolean>;
  /** 上传文件 */
  upload: (fileList: FileList | File[]) => Promise<void>;
  /** 打开文件选择器 */
  openFileDialog: () => void;
  /** 删除文件 */
  remove: (id: string) => void;
  /** 清空所有文件 */
  clear: () => void;
  /** 获取所有文件URL */
  getFileUrls: () => string[];
}

/**
 * 生成唯一ID
 */
const generateId = (): string => {
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

/**
 * 检测文件类型
 */
const detectFileType = (mimeType: string): FileType => {
  if (mimeType.startsWith('image/')) return FileType.IMAGE;
  if (mimeType.startsWith('video/')) return FileType.VIDEO;
  if (mimeType.startsWith('audio/')) return FileType.AUDIO;
  if (
    mimeType.includes('pdf') ||
    mimeType.includes('word') ||
    mimeType.includes('document') ||
    mimeType.includes('text/')
  ) {
    return FileType.DOCUMENT;
  }
  return FileType.OTHER;
};

/**
 * 转换文件为Base64
 */
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * 压缩图片
 */
const compressImage = (
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number,
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      // 计算新的宽高
      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (maxHeight / height) * width;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        file.type,
        quality,
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    reader.readAsDataURL(file);
  });
};

/**
 * useFileUpload - 文件上传 Composable
 *
 * @example
 * ```vue
 * <script setup>
 * const { files, upload, remove, openFileDialog } = useFileUpload({
 *   maxSize: 10,
 *   accept: 'image/*',
 *   multiple: true,
 *   uploadFn: async (file) => {
 *     const formData = new FormData();
 *     formData.append('file', file);
 *     const response = await fetch('/api/upload', {
 *       method: 'POST',
 *       body: formData
 *     });
 *     const data = await response.json();
 *     return data.url;
 *   }
 * });
 * </script>
 *
 * <template>
 *   <button @click="openFileDialog">上传文件</button>
 *   <div v-for="file in files" :key="file.id">
 *     <img v-if="file.type === 'image'" :src="file.url" />
 *     <button @click="remove(file.id)">删除</button>
 *   </div>
 * </template>
 * ```
 */
export function useFileUpload(config: UploadConfig = {}): UseFileUploadReturn {
  const {
    maxSize = 10, // 10MB
    accept = '*',
    multiple = true,
    autoUpload = true,
    uploadFn,
    useBase64 = false,
    compressQuality = 0.8,
    maxImageWidth = 1920,
    maxImageHeight = 1080,
  } = config;

  const files = ref<UploadedFile[]>([]);
  const isUploading = computed(() =>
    files.value.some((f) => f.status === 'uploading'),
  );

  // 创建隐藏的file input元素
  let fileInput: HTMLInputElement | null = null;
  let fileInputChangeHandler: ((e: Event) => void) | null = null;

  /**
   * 验证文件大小
   */
  const validateFileSize = (file: File): boolean => {
    const sizeMB = file.size / 1024 / 1024;
    if (sizeMB > maxSize) {
      console.error(
        `[useFileUpload] 文件 ${file.name} 超过大小限制 ${maxSize}MB`,
      );
      return false;
    }
    return true;
  };

  /**
   * 处理单个文件上传
   */
  const processFile = async (file: File): Promise<UploadedFile> => {
    const id = generateId();
    const fileType = detectFileType(file.type);

    const uploadedFile: UploadedFile = {
      id,
      name: file.name,
      type: fileType,
      size: file.size,
      mimeType: file.type,
      url: '',
      status: 'uploading',
      progress: 0,
      file,
    };

    files.value.push(uploadedFile);

    try {
      // 图片压缩
      let fileToUpload: File | Blob = file;
      if (fileType === FileType.IMAGE && compressQuality < 1) {
        try {
          const compressed = await compressImage(
            file,
            maxImageWidth,
            maxImageHeight,
            compressQuality,
          );
          fileToUpload = new File([compressed], file.name, { type: file.type });
        } catch (error) {
          console.warn('[useFileUpload] 图片压缩失败，使用原图:', error);
        }
      }

      // 使用Base64
      if (useBase64) {
        uploadedFile.base64 = await fileToBase64(fileToUpload as File);
        uploadedFile.url = uploadedFile.base64;
        uploadedFile.status = 'success';
        uploadedFile.progress = 100;
        return uploadedFile;
      }

      // 自定义上传函数
      if (uploadFn) {
        uploadedFile.url = await uploadFn(fileToUpload as File);
        uploadedFile.status = 'success';
        uploadedFile.progress = 100;
        return uploadedFile;
      }

      // 默认使用createObjectURL（本地预览）
      uploadedFile.url = URL.createObjectURL(fileToUpload);
      uploadedFile.status = 'success';
      uploadedFile.progress = 100;

      return uploadedFile;
    } catch (error) {
      uploadedFile.status = 'error';
      uploadedFile.error = (error as Error).message;
      throw error;
    }
  };

  /**
   * 上传文件
   */
  const upload = async (fileList: FileList | File[]): Promise<void> => {
    const fileArray = Array.from(fileList);

    // 验证文件大小
    const validFiles = fileArray.filter(validateFileSize);

    if (validFiles.length === 0) {
      console.warn('[useFileUpload] 没有有效的文件');
      return;
    }

    // 上传文件
    await Promise.all(validFiles.map(processFile));
  };

  /**
   * 打开文件选择器
   */
  const openFileDialog = (): void => {
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = accept;
      fileInput.multiple = multiple;
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

      // 保存事件处理器引用以便清理
      fileInputChangeHandler = async (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files.length > 0 && autoUpload) {
          await upload(target.files);
          target.value = ''; // 重置input，允许重复选择同一文件
        }
      };
      fileInput.addEventListener('change', fileInputChangeHandler);
    }

    fileInput.click();
  };

  /**
   * 清理 fileInput 元素和事件监听器
   */
  const cleanupFileInput = (): void => {
    if (fileInput) {
      if (fileInputChangeHandler) {
        fileInput.removeEventListener('change', fileInputChangeHandler);
        fileInputChangeHandler = null;
      }
      if (fileInput.parentNode) {
        fileInput.parentNode.removeChild(fileInput);
      }
      fileInput = null;
    }
  };

  // 在作用域销毁时自动清理
  onScopeDispose(() => {
    cleanupFileInput();
    // 同时清理所有文件的 Object URLs
    files.value.forEach((file) => {
      if (file.url && file.url.startsWith('blob:')) {
        URL.revokeObjectURL(file.url);
      }
    });
  });

  /**
   * 删除文件
   */
  const remove = (id: string): void => {
    const index = files.value.findIndex((f) => f.id === id);
    if (index !== -1) {
      const file = files.value[index];
      // 释放Object URL
      if (file?.url && file.url.startsWith('blob:')) {
        URL.revokeObjectURL(file.url);
      }
      files.value.splice(index, 1);
    }
  };

  /**
   * 清空所有文件
   */
  const clear = (): void => {
    // 释放所有Object URLs
    files.value.forEach((file) => {
      if (file.url && file.url.startsWith('blob:')) {
        URL.revokeObjectURL(file.url);
      }
    });
    files.value = [];
  };

  /**
   * 获取所有文件URL
   */
  const getFileUrls = (): string[] => {
    return files.value.filter((f) => f.status === 'success').map((f) => f.url);
  };

  return {
    files,
    isUploading,
    upload,
    openFileDialog,
    remove,
    clear,
    getFileUrls,
  };
}
