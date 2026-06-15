import validateNpmName from 'validate-npm-package-name';

/** 校验项目名称是否合法（npm 包名规范）*/
export function validateProjectName(name: string | undefined): string | undefined {
  if (!name || name.trim() === '') return '项目名称不能为空';

  const { validForNewPackages, errors, warnings } = validateNpmName(name);
  if (!validForNewPackages) {
    const msg = [...(errors ?? []), ...(warnings ?? [])].join('; ');
    return `项目名称不合法: ${msg}`;
  }
  return undefined;
}
