/**
 * DB 뷰어 — LOB 상세 창에서 쓰는 순수 함수 모음 (화면·React 의존 없음).
 * 크기 표기, 창 제목, JSON 판별, 16진수 덤프를 만든다.
 */

import type { DbLobResult } from "./types";

const TEXT_TYPES = new Set(["CLOB", "NCLOB"]);

/** 천 단위 쉼표 — 실행 환경 로캘과 무관하게 고정한다. */
export function formatInt(n: number): string {
  return Math.trunc(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 바이트 수 → "512B" · "48KB" · "1.5MB" · "2GB" (1024 단위, KB 부터 소수 1자리, 끝의 ".0" 은 뺀다).
 * 서버 DbViewerLobSupport.formatSize 와 같은 규칙 — 반올림이 1024.0 에 닿으면 다음 단위로 올린다(1023.96KB → "1MB").
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes}B`; // 서버 formatSize 와 같게 쉼표 없이
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (unit < units.length - 1 && Math.round(value * 10) >= 10240);
  let number = value.toFixed(1);
  if (number.endsWith(".0")) number = number.slice(0, -2);
  return `${number}${units[unit]}`;
}

/**
 * 길이 표기 — 글자 형식(CLOB·NCLOB)은 "12,345자", 그 밖은 바이트 크기.
 * 전체 길이를 모르면(`lengthKnown` false, 읽은 만큼이 length) 뒤에 " 이상" 을 붙인다.
 */
export function lobLengthText(
  dataType: string,
  length: number,
  lengthKnown = true,
): string {
  if (!Number.isFinite(length) || length < 0) return "-";
  const text = TEXT_TYPES.has(dataType.toUpperCase())
    ? `${formatInt(length)}자`
    : formatBytes(length);
  return lengthKnown ? text : `${text} 이상`;
}

/** 상세 창 제목 — `칸 이름 · 데이터 형식 · 길이`. 길이를 아직 모르면(불러오는 중) 앞의 둘만. */
export function lobModalTitle(
  column: string,
  dataType: string,
  length?: number,
  lengthKnown = true,
): string {
  const head = `${column} · ${dataType}`;
  return length === undefined
    ? head
    : `${head} · ${lobLengthText(dataType, length, lengthKnown)}`;
}

/** 화면에 보이는 것이 전체가 아닐 때의 안내문. 전체가 보이면 null. */
export function truncationNotice(lob: DbLobResult): string | null {
  const total = lobLengthText(lob.dataType, lob.length, lob.lengthKnown);
  if (lob.truncated) return `앞부분만 보입니다(전체 ${total})`;
  // 이진 값은 서버가 앞 일부만 16진수로 보낸다 — 보낸 바이트가 전체보다 적으면 잘린 것이다.
  if (lob.kind === "binary" && lob.hex != null) {
    const shown = Math.floor(lob.hex.length / 2);
    if (shown < lob.length) return `앞부분만 보입니다(전체 ${total})`;
  }
  return null;
}

/** JsonView 로 그리는 글자 수 상한 — shared JsonView 는 가상화가 없어 이보다 크면 노드가 너무 많아 멈춘다. */
export const JSON_VIEW_MAX_CHARS = 200_000;

/** 글이 JSON 객체·배열이면 파싱한 값을 `{ value }` 로, 아니면(숫자·글자·깨진 JSON 포함) null. */
export function parseJsonContainer(text: string): { value: object } | null {
  const trimmed = text.trim();
  const first = trimmed.charAt(0);
  if (first !== "{" && first !== "[") return null;
  try {
    const value: unknown = JSON.parse(trimmed);
    return typeof value === "object" && value !== null ? { value } : null;
  } catch {
    return null;
  }
}

const HEX_PAIR = /^[0-9a-fA-F]{2}$/;

/** 16진수 문자열 → 바이트 값 배열. 공백은 무시하고, 홀수 끝 글자는 버린다. 16진수가 아닌 글자를 만나면 거기서 멈춘다. */
export function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/\s+/g, "");
  const bytes: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const pair = clean.slice(i, i + 2);
    if (!HEX_PAIR.test(pair)) break;
    bytes.push(parseInt(pair, 16));
  }
  return bytes;
}

/**
 * 16진수 덤프 — 한 줄 16바이트, `오프셋  hex …  |ASCII|`.
 * 오프셋은 8자리 소문자 16진수, hex 는 8바이트마다 한 칸 더 띄우고, 마지막 줄은 빈칸으로 맞춘다.
 * ASCII 는 0x20~0x7e 만 그대로, 나머지는 `.`.
 */
export function hexDump(hex: string, bytesPerLine = 16): string {
  const bytes = hexToBytes(hex);
  const half = bytesPerLine / 2;
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += bytesPerLine) {
    const chunk = bytes.slice(offset, offset + bytesPerLine);
    let hexPart = "";
    for (let i = 0; i < bytesPerLine; i += 1) {
      const sep = i === 0 ? "" : i === half ? "  " : " ";
      hexPart +=
        sep +
        (i < chunk.length ? chunk[i].toString(16).padStart(2, "0") : "  ");
    }
    const ascii = chunk
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "."))
      .join("");
    lines.push(
      `${offset.toString(16).padStart(8, "0")}  ${hexPart}  |${ascii}|`,
    );
  }
  return lines.join("\n");
}

/** 이미지 mime 만 `<img>` 에 싣는다(`image/png` 꼴). */
export function isImageMime(mime: string | null): mime is string {
  return mime != null && /^image\/[a-z0-9.+-]+$/i.test(mime);
}
