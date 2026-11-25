/** 글자 ↔ 머리글 HTML (목업 esc·htmlToText·textToHtml). DOM 없이 동작한다. */

export const esc = (s: unknown) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

/** 양식 머리 칸에 나오는 이름 있는 문자 참조. 그 밖은 숫자 참조로 푼다. */
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  sup2: "²",
  sup3: "³",
  iacute: "í",
  oacute: "ó",
  aacute: "á",
  eacute: "é",
  uacute: "ú",
  ntilde: "ñ",
  deg: "°",
  plusmn: "±",
  middot: "·",
  times: "×",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED[e] ?? m;
  });
}

export const htmlToText = (h: string) =>
  decodeEntities(String(h).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\r\n?/g, "\n");

export const textToHtml = (t: string) => esc(t).replace(/\n/g, "<br/>");

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
