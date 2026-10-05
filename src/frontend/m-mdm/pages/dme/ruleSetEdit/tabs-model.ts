/**
 * 룰 세트 편집 화면 안 세트 탭(하위 세트 spec §10.3, C-D13) — 탭 목록 순수 함수. React 의존이 없다.
 * 탭은 열 세트를 요청(`request`)으로 받고, 편집기가 세트를 불러온 뒤 알린 상태(`setId`·`setName`·`ver`·`dirty`·`draft`)를 갖는다.
 * 요청한 세트를 못 불러온 탭(`settledSeq` 가 마지막 요청 번호와 같고 불러온 세트가 없다)은 그 세트를 연 탭으로 세지 않고 빈 탭으로 다시 쓴다.
 * 같은 세트를 두 탭이 편집하지 않는다 — 고르기·링크·포털 파라미터 모두 그 세트가 이미 열린 탭이 있으면 그 탭으로 간다(ui:7 조정).
 */
import { sameVer } from "@/shell/version-format";

export const MAX_SET_TABS = 8;
export const TAB_LIMIT_MESSAGE = "세트 탭은 8개까지 연다. 다른 탭을 닫고 다시 연다";
export const CLOSE_CONFIRM = "저장하지 않은 변경이 있다. 닫으면 변경을 버린다.";

export interface OpenRequest {
  setId: string;
  /** 열 버전 — null 이면 서버가 고른다(내 DRAFT → 지금 적용 중인 RELEASED → VER 최대). */
  ver: string | null;
  seq: number;
}

export interface SetTab {
  key: string;
  /** 편집기가 불러온 세트(알림 전이면 null). */
  setId: string | null;
  setName: string | null;
  /** 편집기가 불러온 버전(버전 없는 세트·알림 전이면 null). */
  ver: string | null;
  dirty: boolean;
  /** 지금 DRAFT 버전을 열고 있다(하위 세트 spec §10.4 — 확정하지 않은 변경). */
  draft: boolean;
  /** 마지막으로 보낸 열기 요청. seq 가 바뀔 때만 편집기가 연다. */
  request: OpenRequest | null;
  /** 편집기가 끝까지 처리한(불러왔거나 실패했거나 확인에서 물린) 마지막 요청 번호. request.seq 와 같으면 그 요청은 더 이상 불러오는 중이 아니다. */
  settledSeq: number | null;
}

export interface TabsState {
  tabs: SetTab[];
  active: string;
  /** 요청 번호·새 탭 key 의 바탕. 늘 커진다. */
  seq: number;
}

export interface TabStatus {
  setId: string | null;
  setName: string | null;
  /** 불러온 버전 — 포털 파라미터가 다른 버전을 넘겼을 때 그 탭에 다시 열기를 줄지 가린다. */
  ver: string | null;
  dirty: boolean;
  draft: boolean;
  /** 편집기가 처리를 끝낸 마지막 요청 번호(없으면 null·생략). 불러오기 실패를 탭 틀에 알리는 길이다. */
  settledSeq?: number | null;
}

export interface TabsResult {
  state: TabsState;
  message: string | null;
}

const emptyTab = (key: string, request: OpenRequest | null): SetTab => ({
  key, setId: null, setName: null, ver: null, dirty: false, draft: false, request, settledSeq: null,
});

export function initialTabs(): TabsState {
  return { tabs: [emptyTab("t1", null)], active: "t1", seq: 1 };
}

/**
 * 탭의 세트 — 불러온 세트가 먼저, 없으면 아직 불러오는 중인 요청의 세트, 둘 다 없으면 null.
 * 요청이 처리를 끝났는데(`settledSeq`) 불러온 세트가 없으면 실패한 탭이다 — 세트를 못 열었으니 빈 탭이다.
 */
export const currentOf = (t: SetTab): string | null =>
  t.setId ?? (t.request && t.request.seq !== t.settledSeq ? t.request.setId : null);

const done = (state: TabsState): TabsResult => ({ state, message: null });

/** key 탭에 새 열기 요청을 주고 그 탭을 고른다. */
function requestIn(s: TabsState, key: string, setId: string, ver: string | null): TabsState {
  const seq = s.seq + 1;
  return { ...s, seq, active: key, tabs: s.tabs.map((t) => (t.key === key ? { ...t, request: { setId, ver, seq } } : t)) };
}

/** 그 세트가 열린 탭(불러온 세트 또는 불러오는 중인 요청의 세트). except 탭은 빼고 찾는다. */
const openTabOf = (s: TabsState, setId: string, except?: string) => s.tabs.find((t) => t.key !== except && currentOf(t) === setId);

/** 지금 탭에서 연다(저장 안 한 변경 확인은 편집기의 open 이 한다). 같은 세트여도 새 요청 번호를 준다(다시 불러오기). */
export function openInActive(s: TabsState, setId: string, ver: string | null = null): TabsState {
  return requestIn(s, s.active, setId, ver);
}

/**
 * 탭 안 세트 고르기(편집기 툴바의 `IdPicker`) — 그 세트가 다른 탭에 이미 열려 있으면 그 탭을 고르고(새 요청 없음),
 * 아니면 tabKey 탭에 새 요청을 준다(같은 세트를 두 탭이 편집하지 않게).
 */
export function pickInTab(s: TabsState, tabKey: string, setId: string, ver: string | null = null): TabsResult {
  if (!s.tabs.some((t) => t.key === tabKey)) return done(s);
  const other = openTabOf(s, setId, tabKey);
  if (other) return done(selectTab(s, other.key));
  return done(requestIn(s, tabKey, setId, ver));
}

/**
 * 이미 열린 탭으로 간다. ver 가 주어졌는데 그 탭이 다른 버전이면 그 탭에 새 요청(ver)을 준다. 열린 탭이 없으면 null.
 * 아직 불러오지 않은 탭(알림 전)은 마지막 요청의 버전과 견준다.
 */
function goToOpen(s: TabsState, setId: string, ver: string | null): TabsState | null {
  const open = openTabOf(s, setId);
  if (!open) return null;
  const loadedVer = open.setId === setId ? open.ver : (open.request?.ver ?? null); // 불러온 세트가 없으면 불러오는 중인 요청
  if (ver != null && !sameVer(ver, loadedVer)) return requestIn(s, open.key, setId, ver);
  return selectTab(s, open.key);
}

/** SET 노드 링크·속성 패널 링크 — 그 세트가 열린 탭이 있으면 그 탭으로, 없으면 지금 탭 오른쪽에 새 탭(상한 8). */
export function openLinked(s: TabsState, setId: string): TabsResult {
  return openNew(s, setId, null);
}

function openNew(s: TabsState, setId: string, ver: string | null): TabsResult {
  const open = goToOpen(s, setId, ver);
  if (open) return done(open);
  if (s.tabs.length >= MAX_SET_TABS) return { state: s, message: TAB_LIMIT_MESSAGE };
  const seq = s.seq + 1;
  const tab = emptyTab(`t${seq}`, { setId, ver, seq });
  const at = s.tabs.findIndex((t) => t.key === s.active);
  return done({ tabs: [...s.tabs.slice(0, at + 1), tab, ...s.tabs.slice(at + 1)], active: tab.key, seq });
}

/** 포털 파라미터(setId·ver) — 세트를 아직 안 연 탭 하나뿐이면 그 탭에서, 아니면 링크와 같다(이미 열린 탭이면 그리로, 다른 버전이면 그 탭에서 다시 연다). */
export function openFromParams(s: TabsState, setId: string, ver: string | null = null): TabsResult {
  if (s.tabs.length === 1 && currentOf(s.tabs[0]) == null) return done(requestIn(s, s.tabs[0].key, setId, ver));
  return openNew(s, setId, ver);
}

export function selectTab(s: TabsState, key: string): TabsState {
  return s.active !== key && s.tabs.some((t) => t.key === key) ? { ...s, active: key } : s;
}

/** 닫기 — 마지막 탭은 닫지 않는다. 지금 탭을 닫으면 오른쪽(없으면 왼쪽) 탭으로 간다. 확인은 호출자가 한다. */
export function closeTab(s: TabsState, key: string): TabsState {
  if (s.tabs.length <= 1) return s;
  const i = s.tabs.findIndex((t) => t.key === key);
  if (i < 0) return s;
  const tabs = s.tabs.filter((t) => t.key !== key);
  const active = s.active !== key ? s.active : (tabs[i] ?? tabs[i - 1]).key;
  return { ...s, tabs, active };
}

/** 편집기 알림 — 값이 같으면 같은 객체(다시 그리기 고리를 막는다). */
export function withStatus(s: TabsState, key: string, st: TabStatus): TabsState {
  const t = s.tabs.find((x) => x.key === key);
  if (!t) return s;
  const settled = st.settledSeq ?? null;
  if (t.setId === st.setId && t.setName === st.setName && t.ver === st.ver && t.dirty === st.dirty && t.draft === st.draft && t.settledSeq === settled) return s;
  return {
    ...s,
    tabs: s.tabs.map((x) => (x.key === key ? { ...x, setId: st.setId, setName: st.setName, ver: st.ver, dirty: st.dirty, draft: st.draft, settledSeq: settled } : x)),
  };
}

const setIdsOf = (s: TabsState, pick: (t: SetTab) => boolean): ReadonlySet<string> =>
  new Set(s.tabs.filter((t) => pick(t) && t.setId).map((t) => t.setId as string));

/** 저장하지 않은 변경이 있는 탭의 세트 ID. */
export function dirtySetIds(s: TabsState): ReadonlySet<string> {
  return setIdsOf(s, (t) => t.dirty);
}

/** 확정하지 않은 변경이 있는 탭의 세트 ID — 저장하지 않았거나 DRAFT 버전을 열고 있다(하위 세트 spec §10.4 디버거 경고, C-D18). */
export function unconfirmedSetIds(s: TabsState): ReadonlySet<string> {
  return setIdsOf(s, (t) => t.dirty || t.draft);
}
