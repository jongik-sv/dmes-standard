/**
 * 미디어 올리기(스펙 2026-10-02-widget-admin-generic §4.3·§5.2) — 편집기 [파일 올리기]가 쓴다.
 * 멀티파트라 shared `apiRequest`(본문이 늘 JSON 이라 Content-Type 을 application/json 으로 박는다)를 쓰지 않고 fetch 를 직접 부른다.
 * 시험이 `@dk-oasis/shared` 를 런타임 import 하지 않으므로 여기도 shared 를 import 하지 않는다.
 */
import { isRecord, type MediaItem, type MediaKind } from "./media";

/** BFF 신경로 규약 `/api/{module}/rest/{objId}/{action}/{backendPath}` — 업로드는 위젯관리 RBAC(`commWidgetMng/upload`). */
export const MEDIA_UPLOAD_URL = "/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload";

/** input accept — `image/*` 로 두면 SVG 도 고르게 되므로 허용 형식을 하나씩 적는다. */
export const UPLOAD_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm";
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

/** 서버(WidgetMediaStorage)와 같은 문구 — 올리기 전에 같은 안내를 먼저 보인다. */
const BAD_TYPE_MESSAGE = "올릴 수 없는 파일 형식입니다(png·jpg·gif·webp·mp4·webm)";
const TOO_BIG_MESSAGE = "이미지는 10MB, 동영상은 100MB 까지 올릴 수 있습니다";
const NETWORK_MESSAGE = "서버와 연결할 수 없습니다. 네트워크 또는 서버 상태를 확인한 뒤 다시 시도해 주세요.";
const BAD_RESPONSE_MESSAGE = "업로드 응답이 올바르지 않습니다";

const FILE_ID_RE = /^[0-9a-f]{32}$/;
const EXT_KIND: Record<string, MediaKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  mp4: "video",
  webm: "video",
};

export interface UploadedMedia {
  fileId: string;
  origNm: string;
  contentType: string;
  size: number;
}

function extKind(name: string): MediaKind | null {
  const ext = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return ext ? (EXT_KIND[ext] ?? null) : null;
}

/** 올리기 전 검사 — 확장자와 크기(이미지 10MB·동영상 100MB). 문제가 없으면 null. 형식 위조는 서버가 매직 넘버로 다시 본다. */
export function checkUploadFile(file: { name: string; size: number }): string | null {
  const kind = extKind(file.name);
  if (!kind) return BAD_TYPE_MESSAGE;
  const max = kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
  return file.size > max ? TOO_BIG_MESSAGE : null;
}

/** 서버가 매직 넘버로 정한 contentType 으로 종류를 정한다. 모르는 값이면 이름의 확장자를 본다(SVG 는 어느 쪽으로도 null). */
export function uploadKindOf(contentType: string, fileName: string): MediaKind | null {
  if (/^image\/(png|jpeg|gif|webp)$/i.test(contentType)) return "image";
  if (/^video\/(mp4|webm)$/i.test(contentType)) return "video";
  return extKind(fileName);
}

export function mediaItemFromUpload(up: UploadedMedia): MediaItem {
  const kind = uploadKindOf(up.contentType, up.origNm);
  if (!kind) throw new Error(BAD_TYPE_MESSAGE);
  return { kind, src: `media:${up.fileId}` };
}

function firstMessage(...values: unknown[]): string | undefined {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

/** 서버 오류 본문에서 사용자에게 보일 문구를 꺼낸다(REST ApiResponse·OASIS CactusResponse·레거시 error 봉투). */
function errorMessageOf(body: Record<string, unknown> | null): string | undefined {
  if (!body) return undefined;
  const errors = Array.isArray(body.errors) ? body.errors : [];
  return firstMessage(
    isRecord(body.error) ? body.error.message : undefined,
    body.message,
    isRecord(body.meta) ? body.meta.message : undefined,
    isRecord(errors[0]) ? errors[0].message : undefined,
  );
}

function statusMessage(status: number): string {
  if (status === 401) return "인증이 만료되었습니다. 다시 로그인하세요.";
  if (status === 403) return "요청 권한이 없습니다. 권한을 확인해 주세요. (HTTP 403)";
  if (status === 413) return TOO_BIG_MESSAGE;
  if (status >= 500) return `서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. (HTTP ${status})`;
  return `업로드에 실패했습니다. (HTTP ${status})`;
}

/**
 * 업로드 응답 해석 — 성공이면 `{ fileId, origNm, contentType, size }`(평평한 JSON, `data`·`data.result` 봉투도 허용), 아니면 Error(문구).
 * OASIS 는 거부도 HTTP 200 + `meta.success=false` 로 돌려주므로 함께 본다.
 */
export function parseUploadResponse(status: number, body: unknown): UploadedMedia {
  const rec = isRecord(body) ? body : null;
  const rejected = rec !== null && ((isRecord(rec.meta) && rec.meta.success === false) || rec.success === false);
  if (status < 200 || status >= 300 || rejected) {
    throw new Error(errorMessageOf(rec) ?? statusMessage(status));
  }
  const data = rec && isRecord(rec.data) ? rec.data : null;
  const payload = [rec, data, data && isRecord(data.result) ? data.result : null].find(
    (c): c is Record<string, unknown> => c !== null && typeof c.fileId === "string",
  );
  if (!payload || !FILE_ID_RE.test(payload.fileId as string)) throw new Error(BAD_RESPONSE_MESSAGE);
  return {
    fileId: payload.fileId as string,
    origNm: typeof payload.origNm === "string" ? payload.origNm : "",
    contentType: typeof payload.contentType === "string" ? payload.contentType : "",
    size: typeof payload.size === "number" ? payload.size : 0,
  };
}

/** 파일 하나를 올린다 — 멀티파트 POST(필드 `file`). Content-Type 은 브라우저가 경계값과 함께 정하도록 헤더를 주지 않는다. */
export async function uploadMedia(file: File, fetchImpl: typeof fetch = fetch): Promise<UploadedMedia> {
  const form = new FormData();
  form.append("file", file, file.name);
  let res: Response;
  try {
    res = await fetchImpl(MEDIA_UPLOAD_URL, { method: "POST", body: form, credentials: "same-origin" });
  } catch {
    throw new Error(NETWORK_MESSAGE);
  }
  const body: unknown = await res.json().catch(() => null);
  return parseUploadResponse(res.status, body);
}
