import { describe, it, expect } from 'vitest';
import { CommonASTUtils } from '../src/utils/common-ast-utils';
import { scanKeyReferencesInContent } from '../src/utils/source-key-scanner';

/**
 * 回归（Bug7）：stripComments 状态机原本只识别 " ' ` 三类定界与注释，不识别正则字面量。
 * 含奇数引号的正则（如 /'/ 或 /['"]/）会让其中的引号被误当字符串起始 → 状态机进入字符串态，
 * 后续真实注释无法被剥离 → 注释里的 t('key') 被 scanKeyReferencesInContent 误计入 used-key，
 * 导致 prune 漏清孤儿 key、doctor 漏报 orphan（方向保守但精度受损）。
 *
 * 修复：状态机增加正则字面量 frame（按前一有效 token 区分除号 / 正则起始，处理字符类 [...] 与转义）。
 */
describe('stripComments — 正则字面量盲区（Bug7）', () => {
  const usedKeys = (code: string): string[] =>
    scanKeyReferencesInContent(CommonASTUtils.stripComments(code));

  it('含引号的正则字面量后的行注释被正确剥离', () => {
    const code = `const re = /'/;\n// t('fakeKeyInComment')\nt('realKey');`;
    expect(usedKeys(code)).toEqual(['realKey']);
  });

  it('含字符类引号的正则后块注释被剥离', () => {
    const code = `const re = /['"]/;\n/* t('blockComment') */\nt('real2');`;
    expect(usedKeys(code)).toEqual(['real2']);
  });

  it('除法运算不被误判为正则（回归保护）', () => {
    const code = `const x = a / b; // t('afterDivision')\nt('real3');`;
    expect(usedKeys(code)).toEqual(['real3']);
  });

  it('正则内的双斜杠不被当行注释、其后代码保留', () => {
    // /a\/\// 是匹配 a// 的正则；其后同行的 t('keep') 不应被吞
    const code = `const re = /a\\/\\//; t('keep');`;
    expect(usedKeys(code)).toEqual(['keep']);
  });
});
