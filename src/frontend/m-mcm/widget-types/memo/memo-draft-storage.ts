/**
 * 개인 메모 임시 저장(쓰다 만 글) — 이 브라우저(localStorage)에만 둔다. 사용자·칸마다 하나(키는 memo-model 의 memoDraftKey).
 * 읽기·쓰기·지우기 모두 `window.localStorage` 접근 자체를 try/catch 로 감싼다(시크릿 창·저장소 차단·용량 초과·서버 렌더에서도 던질 수 있다).
 * 저장소가 없거나 막혀 있어도 메모는 정상 동작하고 임시 저장만 못 한다. 키가 null(사용자를 모름·미리보기)이면 아무것도 하지 않는다.
 */
import { isDraftWritable, parseDraft, serializeDraft, type MemoDraft } from "./memo-model";

export function readDraft(key: string | null): MemoDraft | null {
  if (!key) return null;
  try {
    return parseDraft(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

/** 20,000자를 넘는 글은 쓰지 않는다(임시본도 같은 상한). */
export function writeDraft(key: string | null, draft: MemoDraft): void {
  if (!key || !isDraftWritable(draft.content)) return;
  try {
    window.localStorage.setItem(key, serializeDraft(draft));
  } catch {
    // 저장소가 막혔거나 가득 찼다 — 임시 저장만 못 한다.
  }
}

export function removeDraft(key: string | null): void {
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 저장소가 막혔다 — 지울 것도 없다.
  }
}
