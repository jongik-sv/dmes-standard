/**
 * 긴 마크다운 문서를 제목(#·##·###) 단위 절로 나눈다 — MarkdownDocViewer 의 목차·절 이동이 쓰는 순수 함수.
 * 코드 블록(```·~~~) 안의 `#` 줄은 제목으로 보지 않는다. 첫 제목 앞의 글은 제목 없는 첫 절(level 0)이 된다.
 */
export interface DocSection {
  /** 절 번호 기반 식별자(`doc-sec-N`) — 같은 제목이 겹쳐도 유일하다. */
  id: string;
  /** 0 = 첫 제목 앞의 글, 1~3 = #·##·###. */
  level: 0 | 1 | 2 | 3;
  /** 제목 글자(level 0 이면 빈 문자열). */
  title: string;
  /** 제목 줄을 포함한 절 본문(마크다운). */
  markdown: string;
}

const HEADING = /^(#{1,3})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCE = /^[ \t]{0,3}(```|~~~)/;

export function splitMarkdownSections(markdown: string): DocSection[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const sections: DocSection[] = [];
  let current: { level: DocSection["level"]; title: string; lines: string[] } | null = null;
  let fence: string | null = null;

  const flush = () => {
    if (!current) return;
    const body = current.lines.join("\n").replace(/\s+$/, "");
    if (body.trim().length > 0) {
      sections.push({ id: `doc-sec-${sections.length}`, level: current.level, title: current.title, markdown: body });
    }
    current = null;
  };

  for (const line of lines) {
    const f = FENCE.exec(line);
    if (f) {
      if (fence === null) fence = f[1];
      else if (f[1] === fence) fence = null;
    }
    const h = fence === null && !f ? HEADING.exec(line) : null;
    if (h) {
      flush();
      current = { level: h[1].length as 1 | 2 | 3, title: h[2].trim(), lines: [line] };
    } else {
      if (!current) current = { level: 0, title: "", lines: [] };
      current.lines.push(line);
    }
  }
  flush();
  return sections;
}

/** 목차에 올릴 절(## · ###). 문서 제목(#)과 제목 앞 글은 뺀다. */
export function tocOf(sections: readonly DocSection[]): DocSection[] {
  return sections.filter((s) => s.level === 2 || s.level === 3);
}
