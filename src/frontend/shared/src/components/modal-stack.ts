/**
 * 열린 모달 순서표(React 무관). 맨 뒤 id 가 맨 위 모달이다.
 * shared 가 진입마다 따로 묶여 페이지에 여러 벌 실릴 수 있으므로(hover-tip-escape-guard 와 같은 이유) globalThis 에 둔다.
 */
interface ModalStackState {
  ids: string[];
  listeners: Set<() => void>;
}

type StackHost = typeof globalThis & { __dkOasisModalStack?: ModalStackState };

function state(): ModalStackState {
  const host = globalThis as StackHost;
  return (host.__dkOasisModalStack ??= { ids: [], listeners: new Set() });
}

function emit(): void {
  for (const listener of [...state().listeners]) listener();
}

/** 모달을 맨 위로 올린다. 이미 있으면 무시한다. */
export function pushModal(id: string): void {
  const s = state();
  if (s.ids.includes(id)) return;
  s.ids = [...s.ids, id];
  emit();
}

/** 모달을 순서표에서 뺀다. */
export function removeModal(id: string): void {
  const s = state();
  if (!s.ids.includes(id)) return;
  s.ids = s.ids.filter((x) => x !== id);
  emit();
}

export function subscribeModalStack(listener: () => void): () => void {
  const s = state();
  s.listeners.add(listener);
  return () => {
    s.listeners.delete(listener);
  };
}

/** 지금 맨 위 모달인지. 순서표에 없으면 false 다. */
export function isTopModal(id: string): boolean {
  return state().ids.at(-1) === id;
}

/** 시험용: 순서표를 비운다. */
export function resetModalStack(): void {
  const s = state();
  s.ids = [];
  emit();
}

/**
 * Esc 한 번에 모달 하나만 닫기 위한 이벤트 시작 시점 기록.
 * 브라우저는 리스너 사이에 React 갱신을 처리하므로, 위 모달이 먼저 닫히면 아래 모달이 뒤이은 리스너에서 맨 위로 보인다.
 * 그래서 이벤트가 시작될 때(모듈을 읽을 때 먼저 등록한 window 캡처 리스너) 맨 위 id 를 이벤트별로 적어 두고 그 id 의 모달만 닫는다.
 */
type SnapshotHost = typeof globalThis & { __dkOasisModalEscMap?: WeakMap<Event, string | undefined> };
// 번들이 여러 벌 실려도 리스너를 설치한 쪽과 읽는 쪽이 같은 표를 보도록 globalThis 에 둔다.
const topAtEvent = ((globalThis as SnapshotHost).__dkOasisModalEscMap ??= new WeakMap<Event, string | undefined>());
let snapshotInstalled = false;

export function installEscapeSnapshot(): void {
  if (snapshotInstalled || typeof window === "undefined") return;
  const host = globalThis as typeof globalThis & { __dkOasisModalEscSnapshot?: boolean };
  if (host.__dkOasisModalEscSnapshot) {
    snapshotInstalled = true;
    return;
  }
  host.__dkOasisModalEscSnapshot = true;
  snapshotInstalled = true;
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") topAtEvent.set(event, state().ids.at(-1));
    },
    true,
  );
}

/** 이 keydown 이 시작될 때 맨 위였던 모달 id. 기록이 없으면(스냅샷 미설치) 지금 맨 위를 쓴다. */
export function topModalAtEvent(event: Event): string | undefined {
  return topAtEvent.has(event) ? topAtEvent.get(event) : state().ids.at(-1);
}
