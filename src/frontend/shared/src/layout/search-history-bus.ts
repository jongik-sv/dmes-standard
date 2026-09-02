/**
 * "실제 조회 발생" 이벤트 버스 (pageId 별 pub/sub).
 *
 * 검색 최근값은 사용자가 *실제로 조회한 순간*의 값만 저장한다. 그 신호를 한 곳으로 모으기 위해
 * 가벼운 이벤트 버스를 둔다.
 *  - 발행(emit): PageLayout 의 조회 버튼(action="search") onClick, SearchArea 의 form submit(Enter).
 *  - 구독(subscribe): 각 SearchHistoryInput 가 자기 pageId 채널을 구독, 발행 시 현재 입력값을 저장.
 *
 * React Context/state 가 아니라 모듈 레벨 버스를 쓰는 이유:
 *  - 검색 1회에만 콜백이 돌아 불필요한 리렌더가 없다.
 *  - useEffect deps 변화가 아니라 명시적 이벤트라 "마운트 시 오발" 같은 함정이 없다.
 *
 * shared 는 tsup 으로 entry 별 분할 빌드(splitting:false)되므로, 동일 모듈이 여러 entry 에
 * inline 되면 버스 인스턴스가 중복될 수 있다(tab-page-context.ts 와 동일한 함정). globalThis 에
 * 캐싱해 어느 entry 가 먼저 로드되든 같은 버스를 공유한다.
 */

type SearchListener = () => void;

const GLOBAL_KEY = "__dkOasisSearchHistoryBus__";

interface BusCache {
  [GLOBAL_KEY]?: Map<string, Set<SearchListener>>;
}

const cache = globalThis as unknown as BusCache;

const channels: Map<string, Set<SearchListener>> =
  cache[GLOBAL_KEY] ?? (cache[GLOBAL_KEY] = new Map());

/**
 * pageId 채널을 구독한다. 반환된 함수를 호출(또는 useEffect cleanup)하면 구독 해제.
 * pageId 가 비면 구독하지 않고 no-op 해제 함수를 돌려준다.
 */
export function subscribeSearch(pageId: string, listener: SearchListener): () => void {
  if (!pageId) return () => {};
  let set = channels.get(pageId);
  if (!set) {
    set = new Set();
    channels.set(pageId, set);
  }
  set.add(listener);
  return () => {
    const s = channels.get(pageId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) channels.delete(pageId);
  };
}

/** 해당 pageId 채널 구독자 전원에게 "조회 발생" 을 알린다. */
export function emitSearch(pageId: string): void {
  if (!pageId) return;
  const set = channels.get(pageId);
  if (!set) return;
  // 구독 콜백 중 하나가 throw 해도 나머지 구독자에게 전파되지 않게 격리한다.
  set.forEach((listener) => {
    try {
      listener();
    } catch {
      /* no-op */
    }
  });
}
