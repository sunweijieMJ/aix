import * as p from '@clack/prompts';
import { CreateAppError } from './errors';

/** CLI 顶层统一错误处理，打印后退出 */
export function handleError(err: unknown): never {
  if (err instanceof CreateAppError) {
    p.log.error(`${err.message} [${err.code}]`);
    if (err.suggestion) p.log.info(err.suggestion);
    if (process.env['DEBUG']) console.error(err.cause);
  } else if (err instanceof Error) {
    p.log.error(err.message);
    if (process.env['DEBUG']) console.error(err);
  } else {
    p.log.error(String(err));
  }
  process.exit(1);
}
