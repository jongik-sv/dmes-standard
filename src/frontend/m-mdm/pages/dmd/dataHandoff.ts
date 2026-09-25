/**
 * dataMng 등록 → dataEdit 탭 인계(TSK-07-02 design.md D7).
 *
 * 포털 탭 열기(`portal-open-tab`)는 `{pageId}` 만 받는다 — 임의 파라미터(방금 등록한 maruDataId)를 실어 보낼 수단이
 * 없다. 게다가 같은 pageId 탭이 이미 열려 있으면 `openPageTab` 이 그 탭을 재마운트하지 않고 활성화만 한다(마운트 시점에
 * 한 번 읽기만으로는 이미 열려 있던 dataEdit 탭에 새 ID 를 전달할 수 없다).
 *
 * 그래서 `sessionStorage`(탭이 새로 만들어지는 경우 — 마운트가 비동기라 그 사이에 값이 살아 있다)와 `window` 커스텀
 * 이벤트(탭이 이미 열려 있어 재마운트되지 않는 경우 — 마운트된 리스너가 살아서 받는다)를 함께 쓴다. 공유 셸
 * (`shared/src/portal-shell`)은 고치지 않는다 — m-mdm 자체 모듈이다(D7, 공유 셸 계약을 넓히면 다른 모듈까지 영향을
 * 받는다). `sessionStorage` 접근은 실패(사생활 보호 모드 등)해도 화면이 깨지지 않게 try/catch 로 감싼다 — 실패하면
 * 사용자가 상단 select 로 수동 선택한다(완전한 열화, 기능 자체가 없어지지 않는다).
 */

const STORAGE_KEY = "dmd:dataEdit:openId";

export const DATA_EDIT_SELECT_EVENT = "mdm-dmd-data-edit-select";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** 등록 직후 그 ID 를 남겨 둔다(탭이 새로 열리는 경우, dataEdit 의 마운트 시점 읽기가 소비한다). */
export function stashDataEditTarget(maruDataId: string): void {
  try {
    storage()?.setItem(STORAGE_KEY, maruDataId);
  } catch {
    // 저장소를 못 쓰면 이벤트만으로 이미 열린 탭에 전한다.
  }
}

/** 남겨 둔 ID 를 한 번 읽고 지운다. 없거나 저장소를 못 쓰면 null. */
export function consumeDataEditTarget(): string | null {
  const s = storage();
  if (!s) return null;
  try {
    const id = s.getItem(STORAGE_KEY);
    if (id) s.removeItem(STORAGE_KEY);
    return id && id.trim() !== "" ? id : null;
  } catch {
    return null;
  }
}

/** 이미 열려 있는 dataEdit 탭에 새 ID 를 알린다(탭이 재마운트되지 않는 경우). */
export function broadcastDataEditTarget(maruDataId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DATA_EDIT_SELECT_EVENT, { detail: { maruDataId } }));
}
