/**
 * 개인 메모 임시 저장(쓰다 만 글) — 이 브라우저(localStorage)에만 둔다. 사용자·칸마다 하나(키는 memo-model 의 memoDraftKey).
 * 읽기·쓰기·지우기·훑기 모두 `window.localStorage` 접근 자체를 try/catch 로 감싼다(시크릿 창·저장소 차단·용량 초과·서버 렌더에서도 던질 수 있다).
 * 저장소가 없거나 막혀 있어도 메모는 정상 동작하고 임시 저장만 못 한다. 키가 null(사용자를 모름·미리보기)이면 아무것도 하지 않는다.
 * 임시본은 savedAt 으로부터 7일(MEMO_DRAFT_TTL_MS)만 둔다 — 읽을 때 지난 것은 없는 것으로 보고 지우고, 사용자가 확인되면 sweepDrafts 가 한 번 훑어 정리한다.
 */
import {
  isDraftExpired,
  isDraftWritable,
  isStaleDraftEntry,
  memoDraftUserPrefix,
  parseDraft,
  serializeDraft,
  MEMO_DRAFT_KEY_PREFIX,
  type MemoDraft,
} from "./memo-model";

/** 만료된 임시본은 없는 것으로 보고 그 자리에서 지운다. */
export function readDraft(key: string | null, now: number = Date.now()): MemoDraft | null {
  if (!key) return null;
  try {
    const draft = parseDraft(window.localStorage.getItem(key));
    if (!draft) return null;
    if (isDraftExpired(draft, now)) {
      window.localStorage.removeItem(key);
      return null;
    }
    return draft;
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

/**
 * 사용자가 확인됐을 때 한 번 임시본 키를 훑어 7일 지난 것과 다른 사용자의 것을 지운다 — 공용 PC 에서 앞 사용자의 평문 임시본이
 * 남지 않게 하고, 위젯을 빼서 고아가 된 임시본도 결국 사라지게 한다(shared 로그아웃은 이 키를 모른다). 사용자를 모르면 아무것도 하지 않는다.
 * 키를 먼저 모은 뒤 지운다(지우면 번호가 밀린다). 저장소 접근 어디서든 던져도 삼킨다.
 */
export function sweepDrafts(userId: string, now: number = Date.now()): void {
  const ownPrefix = memoDraftUserPrefix(userId);
  if (!ownPrefix) return;
  try {
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(MEMO_DRAFT_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      if (isStaleDraftEntry(key, storage.getItem(key), ownPrefix, now)) storage.removeItem(key);
    }
  } catch {
    // 저장소가 막혔다 — 정리만 못 한다.
  }
}
