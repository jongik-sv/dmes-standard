/**
 * @file broadcastChannel.ts
 * @description BroadcastChannel API + window CustomEvent 를 결합한 창·SPA 간 통신 유틸.
 *
 * 두 채널 동시 dispatch:
 *  - BroadcastChannel: same-origin 의 **다른** 탭/창 간 통신 (자기 인스턴스 송신은 자기가 못 받음)
 *  - window CustomEvent: 같은 탭 내 SPA 의 다른 컴포넌트 간 동기화
 *
 * 다중 리스너 지원 — 여러 컴포넌트가 동시에 onMessage 등록 가능.
 * onMessage 는 unsubscribe 함수를 반환하므로 useEffect cleanup 에서 호출.
 *
 * @example
 * import { sendMessage, onMessage } from '@dk-oasis/shared/lib';
 *
 * const unsubscribe = onMessage((msg) => {
 *   if (msg.type === "SEC_OBJ_CHANGED") refetch();
 * });
 * // cleanup: unsubscribe();
 *
 * sendMessage("SEC_OBJ_CHANGED", { objId: "..." });
 * @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다.
 */

export interface BroadcastMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

type Listener = (message: BroadcastMessage) => void;

const CHANNEL_NAME = "oasis_app_channel";
const WINDOW_EVENT_NAME = "oasis_app_broadcast";

let channel: BroadcastChannel | null = null;
let initialized = false;
const listeners = new Set<Listener>();

function ensureChannel(): void {
  if (typeof window === "undefined") return;
  if (!channel && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  if (initialized) return;

  if (channel) {
    channel.addEventListener("message", (event: MessageEvent<BroadcastMessage>) => {
      dispatchToListeners(event.data);
    });
  }
  // 같은 SPA 내 컴포넌트 간 동기화 (BroadcastChannel 은 자기 송신을 자기 채널에 안 보내므로)
  window.addEventListener(WINDOW_EVENT_NAME, (event: Event) => {
    const ce = event as CustomEvent<BroadcastMessage>;
    if (ce.detail) dispatchToListeners(ce.detail);
  });
  initialized = true;
}

function dispatchToListeners(msg: BroadcastMessage): void {
  for (const cb of [...listeners]) {
    try {
      cb(msg);
    } catch (e) {
      console.warn("[broadcastChannel] listener error:", e);
    }
  }
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function initBroadcastChannel(): BroadcastChannel | null {
  ensureChannel();
  return channel;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function sendMessage(type: string, payload?: unknown): void {
  ensureChannel();
  const msg: BroadcastMessage = { type, payload, timestamp: Date.now() };
  if (channel) {
    channel.postMessage(msg);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WINDOW_EVENT_NAME, { detail: msg }));
  }
}

/**
 * 메시지 리스너를 등록한다. 반환된 함수를 호출하면 등록 해제된다.
 *
 * 이전 버전은 `channel.onmessage = ...` 로 단일 리스너만 지원했다. 이제는 Set 기반으로
 * 다중 리스너를 지원하며 BroadcastChannel + window CustomEvent 모두를 listen 한다.
 * @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다.
 */
export function onMessage(callback: Listener): () => void {
  ensureChannel();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function notifyDataUpdate(dataType: string, data?: unknown): void {
  sendMessage(MESSAGE_TYPES.DATA_UPDATE, { dataType, data });
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function closeChannel(): void {
  if (channel) {
    channel.close();
    channel = null;
  }
  listeners.clear();
  initialized = false;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const MESSAGE_TYPES = {
  DATA_UPDATE: "DATA_UPDATE",
  MENU_RELOAD: "MENU_RELOAD",
  SESSION_EXPIRED: "SESSION_EXPIRED",
} as const;
