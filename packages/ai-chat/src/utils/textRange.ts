/**
 * 富文本 DOM 的「文本偏移 ↔ Range」换算与文本搜索定位。
 * markdown 渲染后的内容含 <strong>/<code>/<a> 等内联节点，任何偏移都要用
 * TreeWalker 跨文本节点累加换算——不能对 textContent「按偏移切一刀」。
 */

/** 折叠空白 + 去首尾：选区文本与搜索文本统一口径 */
export const normalizeText = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * 归一化 prefix/suffix：内部连续空白折叠为单个空格，但只去掉「远离 exact 一侧」的边界空白，
 * 保留「贴着 exact 一侧」的边界空白。
 * W3C TextQuoteSelector 的不变式是 prefix + exact + suffix 为原文直接拼接；exact 已两端 trim，
 * 故 prefix 与 exact、exact 与 suffix 之间的分隔空白落在 prefix 尾部 / suffix 头部。若像
 * normalizeText 那样把它一并 trim 掉，而折叠后的 haystack 里这枚空格仍在，拼出的 pattern 就缺一格，
 * indexOf 必然落空并逐级降级到纯 exact，导致重复文本命中错误位置。保留该边界空格可让各降级层
 * （prefix+exact+suffix / prefix+exact / exact+suffix）都在正确位置命中。
 */
const normalizeContext = (s: string, side: 'prefix' | 'suffix'): string => {
  const collapsed = s.replace(/\s+/g, ' ');
  // 折叠后首尾至多各剩一个空格：prefix 去头部（保尾部与 exact 相邻的空格），suffix 去尾部（保头部）
  return side === 'prefix' ? collapsed.replace(/^ /, '') : collapsed.replace(/ $/, '');
};

const textNodesOf = (container: Element): Text[] => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n = walker.nextNode();
  while (n) {
    nodes.push(n as Text);
    n = walker.nextNode();
  }
  return nodes;
};

/** Range 端点 →（container 文本流内的）字符偏移；端点不在 container 内返回 null */
export const rangeToOffsets = (
  container: Element,
  range: Range,
): { start: number; end: number } | null => {
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null;
  }
  const measure = (node: Node, offset: number): number => {
    const probe = document.createRange();
    probe.selectNodeContents(container);
    probe.setEnd(node, offset);
    return probe.toString().length;
  };
  return {
    start: measure(range.startContainer, range.startOffset),
    end: measure(range.endContainer, range.endOffset),
  };
};

/** 字符偏移 → Range（跨文本节点累加定位端点）；越界返回 null */
export const offsetsToRange = (container: Element, start: number, end: number): Range | null => {
  if (start < 0 || end < start) return null;
  const nodes = textNodesOf(container);
  const range = document.createRange();
  let acc = 0;
  let startSet = false;
  for (const node of nodes) {
    const len = node.data.length;
    if (!startSet && start <= acc + len) {
      range.setStart(node, start - acc);
      startSet = true;
    }
    if (startSet && end <= acc + len) {
      range.setEnd(node, end - acc);
      return range;
    }
    acc += len;
  }
  return null;
};

/**
 * 把原始文本折叠为「归一化文本」，并记录归一化文本每个字符到原始偏移的映射。
 * 连续空白（含换行/缩进等排版空白）折叠为一个空格，取该段空白的首个原始下标；
 * 首尾空白直接丢弃，不进入 norm / map。
 */
const buildNormalizedIndex = (full: string): { norm: string; map: number[] } => {
  const normChars: string[] = [];
  const map: number[] = [];
  let inWhitespace = false;
  for (let i = 0; i < full.length; i += 1) {
    const ch = full.charAt(i);
    if (/\s/.test(ch)) {
      if (normChars.length === 0) continue; // 丢弃开头空白
      if (!inWhitespace) {
        normChars.push(' ');
        map.push(i);
        inWhitespace = true;
      }
      continue;
    }
    inWhitespace = false;
    normChars.push(ch);
    map.push(i);
  }
  // 丢弃折叠后的尾部空白（对应原始文本的尾部空白）
  while (normChars.length > 0 && normChars[normChars.length - 1] === ' ') {
    normChars.pop();
    map.pop();
  }
  return { norm: normChars.join(''), map };
};

/**
 * 文本搜索定位（W3C TextQuoteSelector 思路）：优先 prefix+exact+suffix 全串匹配，
 * 逐级降级 prefix+exact → exact+suffix → exact。对内联结构不敏感、抗重渲染漂移。
 *
 * exact/prefix/suffix 均按调用方约定传入「已用 normalizeText 归一化」的选中文本，
 * 而 container.textContent 是未加工的原始排版文本（内联元素间常见换行/连续空白）。
 * 两者口径不一致会导致 indexOf 直接落空，因此这里先对 DOM 原始文本构建一份
 * 「归一化文本 + 偏移映射」，在归一化文本上做匹配，命中后再把归一化区间映射回原始偏移。
 */
export const findTextRange = (
  container: Element,
  exact: string,
  prefix?: string,
  suffix?: string,
): Range | null => {
  const normExact = normalizeText(exact);
  if (!normExact) return null;
  const normPrefix = prefix ? normalizeContext(prefix, 'prefix') : undefined;
  const normSuffix = suffix ? normalizeContext(suffix, 'suffix') : undefined;

  const full = container.textContent ?? '';
  const { norm, map } = buildNormalizedIndex(full);

  const attempts: { pattern: string; offsetInPattern: number }[] = [];
  if (normPrefix && normSuffix) {
    attempts.push({
      pattern: normPrefix + normExact + normSuffix,
      offsetInPattern: normPrefix.length,
    });
  }
  if (normPrefix)
    attempts.push({ pattern: normPrefix + normExact, offsetInPattern: normPrefix.length });
  if (normSuffix) attempts.push({ pattern: normExact + normSuffix, offsetInPattern: 0 });
  attempts.push({ pattern: normExact, offsetInPattern: 0 });

  for (const { pattern, offsetInPattern } of attempts) {
    const at = norm.indexOf(pattern);
    if (at < 0) continue;
    const normStart = at + offsetInPattern;
    const normEnd = normStart + normExact.length;
    if (normEnd > map.length) continue;
    const rawStart = map[normStart];
    const rawEndChar = map[normEnd - 1];
    if (rawStart === undefined || rawEndChar === undefined) continue;
    return offsetsToRange(container, rawStart, rawEndChar + 1);
  }
  return null;
};

/** 取选中前后各 chars 字符作为消歧上下文 */
export const getContext = (
  container: Element,
  start: number,
  end: number,
  chars: number,
): { prefix: string; suffix: string } => {
  const full = container.textContent ?? '';
  return {
    prefix: full.slice(Math.max(0, start - chars), start),
    suffix: full.slice(end, end + chars),
  };
};
