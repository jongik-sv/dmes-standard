/**
 * 미디어 위젯 유형 순수 로직(스펙 2026-10-02-widget-admin-generic §6 media · §4.3) — renderer·editor 가 쓰는 판단을 모았다.
 * 시험(media.test.ts)이 `@dk-oasis/shared` 를 런타임 import 하지 않으므로 여기도 shared 를 import 하지 않는다.
 */

export type MediaKind = "image" | "video" | "youtube";
export type MediaFit = "contain" | "cover";

export interface MediaItem {
  kind: MediaKind;
  /** `media:{fileId}`(업로드) 또는 http(s) 주소. YouTube 는 사용자가 붙여 넣은 주소 그대로. */
  src: string;
  caption?: string;
}

export interface MediaConfig {
  items: MediaItem[];
  /** 자동 넘김 간격(초). 없으면 기본 8초, 3초 미만이면 3초로 읽는다. */
  intervalSec?: number;
  fit: MediaFit;
}

/** BFF 신경로 규약 `/api/{module}/rest/{objId}/{action}/{backendPath}` — 다운로드는 AUTH_ONLY(`widgetMedia/file`). */
export const MEDIA_FILE_URL_PREFIX = "/api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/";

export const DEFAULT_INTERVAL_SEC = 8;
export const MIN_INTERVAL_SEC = 3;
/** 한 시간. 브라우저 타이머는 2^31ms(약 24일)를 넘으면 곧바로 터지므로 상한을 둔다. */
export const MAX_INTERVAL_SEC = 3600;

/** 서버 fileId — UUID 하이픈 제거 32자(스펙 §4.3). 이 모양이 아니면 경로 조작으로 보고 거절한다. */
const FILE_ID_RE = /^[0-9a-f]{32}$/;
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const VIDEO_EXTS = new Set(["mp4", "webm"]);
const KINDS: readonly MediaKind[] = ["image", "video", "youtube"];

const ADDRESS_ERROR = "http:// 또는 https:// 로 시작하는 주소를 입력하세요";
const UNKNOWN_KIND_ERROR = "종류를 알 수 없는 주소입니다. 종류를 이미지나 동영상으로 직접 고르세요";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** http(s) 주소만 URL 로 읽는다(스킴 뒤 `//` 가 있어야 하고 호스트가 있어야 한다). 그 밖은 null. */
function parseHttpUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname ? u : null;
  } catch {
    return null;
  }
}

export function isHttpUrl(value: unknown): boolean {
  return parseHttpUrl(value) !== null;
}

/**
 * 항목 `src` → 브라우저가 불러올 주소.
 * `media:{fileId}` 는 BFF 다운로드 경로, http(s) 는 그대로, 그 밖(javascript:·data:·상대 경로 등)은 null.
 */
export function mediaSrc(src: string | null | undefined): string | null {
  if (typeof src !== "string") return null;
  const s = src.trim();
  if (s.startsWith("media:")) {
    const id = s.slice("media:".length);
    return FILE_ID_RE.test(id) ? `${MEDIA_FILE_URL_PREFIX}${id}` : null;
  }
  return parseHttpUrl(s) ? s : null;
}

/** YouTube 주소(watch·youtu.be·shorts·embed·live) → `https://www.youtube-nocookie.com/embed/{id}`. 아니면 null. */
export function youtubeEmbed(url: string | null | undefined): string | null {
  const u = parseHttpUrl(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  const segments = u.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be") {
    id = segments[0] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (segments[0] === "watch") id = u.searchParams.get("v");
    else if (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live") id = segments[1] ?? null;
  }
  return id !== null && YOUTUBE_ID_RE.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

/** 주소로 종류 자동 판정 — YouTube 주소 모양이면 youtube, 아니면 확장자(png·jpg·jpeg·gif·webp / mp4·webm). 모르면 null. */
export function guessKind(url: string | null | undefined): MediaKind | null {
  if (youtubeEmbed(url)) return "youtube";
  const u = parseHttpUrl(url);
  if (!u) return null;
  const ext = u.pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (!ext) return null;
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  return null;
}

/** 넘김 간격(초) — 없거나 숫자가 아니면 8, 3 미만이면 3, 상한 3600, 정수로 반올림. */
export function clampIntervalSec(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_INTERVAL_SEC;
  return Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(v)));
}

function normalizeItem(raw: unknown): MediaItem[] {
  if (!isRecord(raw)) return [];
  const kind = raw.kind;
  if (typeof kind !== "string" || !KINDS.includes(kind as MediaKind)) return [];
  const item: MediaItem = { kind: kind as MediaKind, src: typeof raw.src === "string" ? raw.src : "" };
  if (typeof raw.caption === "string" && raw.caption !== "") item.caption = raw.caption;
  return [item];
}

/** 서버에서 받은 정의 설정(unknown)을 안전한 모양으로 읽는다. 간격은 입력 중인 값을 지우지 않도록 그대로 둔다(읽을 때 clampIntervalSec). */
export function normalizeMediaConfig(raw: unknown): MediaConfig {
  const o = isRecord(raw) ? raw : {};
  const items = Array.isArray(o.items) ? o.items.flatMap(normalizeItem) : [];
  const cfg: MediaConfig = { items, fit: o.fit === "cover" ? "cover" : "contain" };
  if (typeof o.intervalSec === "number" && Number.isFinite(o.intervalSec)) cfg.intervalSec = o.intervalSec;
  return cfg;
}

function isValidSource(item: MediaItem): boolean {
  return item.kind === "youtube" ? youtubeEmbed(item.src) !== null : mediaSrc(item.src) !== null;
}

/** 편집기 검사 — 빈 배열이면 저장할 수 있다. */
export function validateMediaConfig(raw: unknown): string[] {
  const cfg = normalizeMediaConfig(raw);
  const errors: string[] = [];
  if (cfg.items.length === 0) errors.push("미디어를 하나 이상 넣으세요");
  cfg.items.forEach((item, i) => {
    if (!isValidSource(item)) errors.push(`${i + 1}번째 항목의 주소가 올바르지 않습니다`);
  });
  if (cfg.intervalSec !== undefined && cfg.intervalSec < MIN_INTERVAL_SEC) {
    errors.push(`넘김 간격은 ${MIN_INTERVAL_SEC}초 이상이어야 합니다`);
  }
  return errors;
}

export type AddKindChoice = "auto" | "image" | "video";

/**
 * [주소로 추가] — 입력한 주소로 항목을 만든다. YouTube 주소는 종류 선택과 상관없이 youtube 로 두고 입력한 주소를 그대로 보관한다
 * (iframe 주소는 그릴 때 만든다). 확장자가 없는 이미지·동영상 주소는 종류를 직접 고르게 한다.
 */
export function buildItemFromUrl(url: string, choice: AddKindChoice = "auto"): { item: MediaItem } | { error: string } {
  const s = url.trim();
  if (!s) return { error: "주소를 입력하세요" };
  if (!isHttpUrl(s)) return { error: ADDRESS_ERROR };
  if (youtubeEmbed(s)) return { item: { kind: "youtube", src: s } };
  const kind: MediaKind | null = choice === "auto" ? guessKind(s) : choice;
  return kind ? { item: { kind, src: s } } : { error: UNKNOWN_KIND_ERROR };
}

export function nextIndex(index: number, count: number): number {
  return count <= 1 ? 0 : (index + 1) % count;
}

export function prevIndex(index: number, count: number): number {
  return count <= 1 ? 0 : (index - 1 + count) % count;
}

/** 항목이 줄어도 현재 위치가 범위 안에 있게 한다. */
export function clampIndex(index: number, count: number): number {
  return count <= 0 ? 0 : Math.min(Math.max(index, 0), count - 1);
}

/**
 * 자동 넘김 방식 — none: 넘기지 않음(항목 하나), timer: 간격이 지나면, ended: 동영상 재생이 끝나면.
 * 불러오기에 실패한 동영상은 끝나는 일이 없으므로 timer 로 넘긴다. YouTube 는 재생 끝을 알 수 없어 timer.
 */
export function slideAdvance(item: MediaItem | undefined, failed: boolean, count: number): "none" | "timer" | "ended" {
  if (count <= 1 || !item) return "none";
  return item.kind === "video" && !failed ? "ended" : "timer";
}

/** 항목을 한 칸 위(-1)·아래(1)로 옮긴 새 배열. 범위를 벗어나면 같은 배열을 돌려준다. */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
