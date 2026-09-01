/**
 * JSX 文本节点的 HTML 实体解码。
 *
 * TypeScript 的 JsxText.text 是未解码原文，而 JSX 语义要求实体在渲染前解码。提取端若原样
 * 入库，locale 值就是字面 `&copy;` 六个字符，替换成 t()/<Trans> 后按纯文本渲染，用户看到
 * 的不再是 ©。故 locale 值 / ID 走解码后的文本（源码匹配仍用原文，见调用点）。
 *
 * 命名实体只认白名单：HTML5 命名实体两千余项且带历史无分号形态，猜错等于把文案改成别的
 * 字符；白名单外的一律回报为 unknown，由调用方整段跳过提取并告警，绝不静默放行。
 */

/** 白名单：排版符号与转义必需项。扩充时只加语义确定、无歧义的条目。 */
const NAMED_ENTITIES = new Map<string, string>([
  ['nbsp', '\u00A0'],
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['copy', '©'],
  ['reg', '®'],
  ['trade', '™'],
  ['hellip', '…'],
  ['mdash', '—'],
  ['ndash', '–'],
  ['middot', '·'],
  ['times', '×'],
  ['laquo', '«'],
  ['raquo', '»'],
  ['ldquo', '“'],
  ['rdquo', '”'],
  ['lsquo', '‘'],
  ['rsquo', '’'],
  ['deg', '°'],
  ['plusmn', '±'],
  ['bull', '•'],
  ['yen', '¥'],
  ['euro', '€'],
  ['pound', '£'],
  ['cent', '¢'],
]);

/** 带分号的实体引用；无分号形态（`&copy` 裸写）不认，避免把普通的 `&` 文本当实体。 */
const ENTITY_PATTERN = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

const MAX_CODE_POINT = 0x10ffff;
const SURROGATE_START = 0xd800;
const SURROGATE_END = 0xdfff;

/**
 * 解码文本中的 HTML 实体。
 *
 * @returns text 为解码结果（未识别的实体原样保留）；unknownEntities 为白名单外的命名实体与
 *          码点非法的数字实体，非空即表示该段文本不可安全提取。
 */
export function decodeJsxEntities(text: string): { text: string; unknownEntities: string[] } {
  const unknownEntities: string[] = [];
  const decoded = text.replace(ENTITY_PATTERN, (match: string, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const codePoint = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      // 越界码点与代理区码点构不成合法字符（String.fromCodePoint 抛错 / 产出孤立代理项）。
      if (
        !Number.isInteger(codePoint) ||
        codePoint > MAX_CODE_POINT ||
        (codePoint >= SURROGATE_START && codePoint <= SURROGATE_END)
      ) {
        unknownEntities.push(match);
        return match;
      }
      return String.fromCodePoint(codePoint);
    }
    // Map 查表而非对象字面量：`&constructor;` 这类名字在对象上会命中原型链成员。
    const named = NAMED_ENTITIES.get(body);
    if (named === undefined) {
      unknownEntities.push(match);
      return match;
    }
    return named;
  });
  return { text: decoded, unknownEntities };
}
