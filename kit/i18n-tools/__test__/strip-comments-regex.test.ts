import { describe, it, expect } from 'vitest';
import { stripComments } from '../src/utils/import-surgery';
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
  const usedKeys = (code: string): string[] => scanKeyReferencesInContent(stripComments(code));

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

/**
 * 回归（关键字后正则字面量）：旧启发式仅看前一个非空白字符是否「表达式结束字符」，
 * `return /"/.test(url)` 中 `/` 前是 `n`（return 末字符，标识符字符）→ 误判除号 →
 * `"` 进入字符串态、URL 里的 `//` 被当行注释 → 同行 t('key') 整段被剥除 →
 * source-key-scanner 漏采 → prune 误删在用 key（破坏用户数据）。
 *
 * 修复：前一字符是标识符字符时，向前扫出完整标识符，若属于 {return,case,typeof,...}
 * 等「后接表达式」的关键字，则判为正则起点而非除号。
 */
describe('stripComments — 关键字后的正则字面量（Bug1）', () => {
  const usedKeys = (code: string): string[] => scanKeyReferencesInContent(stripComments(code));

  it('return 后含引号的正则不吞掉同行 t()（实证复现用例）', () => {
    const code = `function f(url) {\n  return /"/.test(url) ? "https://a.com" : t('key1');\n}`;
    expect(usedKeys(code)).toEqual(['key1']);
  });

  it('case 后的正则被正确识别、其后注释被剥离', () => {
    const code = `switch (x) {\n  case /'/.test(y):\n    // t('fakeInComment')\n    t('caseKey');\n}`;
    expect(usedKeys(code)).toEqual(['caseKey']);
  });

  it('typeof 后的正则被正确识别、其后注释被剥离', () => {
    const code = `const y = typeof /'/;\n// t('fakeInComment')\nt('typeofKey');`;
    expect(usedKeys(code)).toEqual(['typeofKey']);
  });

  it('真实除法不受关键字回看影响（回归）', () => {
    // `c / d` 前一标识符是 `c`（非关键字）→ 除号；即使同行更早处出现过 return 关键字
    const code = `const x = a / b; return c / d;\n// t('divComment')\nt('divKey');`;
    expect(usedKeys(code)).toEqual(['divKey']);
  });

  it('标识符恰以关键字为后缀仍判除号（如 noreturn / 2）（回归）', () => {
    const code = `const noreturn = 1; const z = noreturn / 2;\n// t('nrComment')\nt('nrKey');`;
    expect(usedKeys(code)).toEqual(['nrKey']);
  });
});
