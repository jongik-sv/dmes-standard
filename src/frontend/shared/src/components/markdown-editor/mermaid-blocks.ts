/**
 * 절 마크다운에서 ```mermaid 펜스 블록을 갈라낸다 — MarkdownView 가 쓰는 순수 함수(독립 모듈).
 * 펜스 판정은 doc-sections.ts 와 같다(``` 또는 ~~~, 들여쓰기 3칸 이하). 닫는 펜스는 같은 글자를 같거나 더 길게 쓴 줄이다.
 * mermaid 가 아닌 코드 블록 안의 ```mermaid 글자는 도식으로 보지 않고, 닫히지 않은 mermaid 블록은 일반 글로 남긴다.
 */
export type DocPiece = { kind: "md"; text: string } | { kind: "mermaid"; code: string };

const OPEN = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)/;
const CLOSE = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/;

export function splitMermaidBlocks(markdown: string): DocPiece[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const pieces: DocPiece[] = [];
  let text: string[] = [];
  let i = 0;

  const flushText = () => {
    const joined = text.join("\n");
    if (joined.trim().length > 0) pieces.push({ kind: "md", text: joined });
    text = [];
  };
  // from 번째 줄(여는 펜스 다음)부터 닫는 펜스 줄의 위치를 찾는다. 없으면 -1.
  const findClose = (from: number, marker: string): number => {
    for (let j = from; j < lines.length; j++) {
      const c = CLOSE.exec(lines[j]);
      if (c && c[1][0] === marker[0] && c[1].length >= marker.length) return j;
    }
    return -1;
  };

  while (i < lines.length) {
    const open = OPEN.exec(lines[i]);
    if (!open) {
      text.push(lines[i]);
      i += 1;
      continue;
    }
    const end = findClose(i + 1, open[1]);
    const last = end === -1 ? lines.length - 1 : end;
    if (open[2].toLowerCase() === "mermaid" && end !== -1) {
      flushText();
      pieces.push({ kind: "mermaid", code: lines.slice(i + 1, end).join("\n") });
    } else {
      // 일반 코드 블록(또는 닫히지 않은 블록)은 통째로 글 조각에 둔다 — 안쪽 줄은 다시 훑지 않는다.
      text.push(...lines.slice(i, last + 1));
    }
    i = last + 1;
  }
  flushText();
  return pieces;
}
