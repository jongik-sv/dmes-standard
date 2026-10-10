"use client";

/**
 * ERD 실시간 채널(SSE) 구독(스펙 4.4, 단계 0 ErdStreamController).
 * 경로는 포털 rest 프록시 `/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/{modelId}`(권한키 mdm/erdEdit/view)다. OASIS 프록시는 응답을
 * 모아서 넘기므로 쓰지 않는다. 이벤트: hello{rev}(sinceRev 없이 처음 구독할 때만)·change(ErdDelta)·reload{rev}·presence·claim·ping.
 *
 * - 연결은 모델을 읽은 뒤 sinceRev=<읽은 rev> 로 연다. 서버는 그 rev 뒤의 change 를 순서대로 다시 보낸다.
 * - 끊기면(error) 브라우저 자동 재연결을 쓰지 않는다. 자동 재연결은 처음 URL(옛 sinceRev)로 붙고 간격을 고를 수 없다.
 *   곧바로 닫고 "lost" 로 알린 뒤 1·2·4·8·15·30초 간격으로 그때의 rev 를 sinceRev 로 붙여 다시 연다. 이벤트를 하나라도 받으면 "open".
 * - 문서가 숨었거나 포털 탭이 비활성이면 다시 연결을 미루고, 다시 보이면 곧바로 연다(Screen-Performance R10·R14).
 *   열린 연결은 닫지 않는다. 접속자·화면 상태(presence)가 연결에 묶여 있고 MCP getCurrentView 가 그것을 읽는다(스펙 D14).
 * - 상태가 바뀔 때만 onStatus 를 부른다. 그래서 15초마다 오는 ping 은 다시 그리기를 만들지 않는다(R7).
 */
import { useEffect, useRef, useState } from "react";

import { useTabPage } from "@dk-oasis/shared/portal-shell";

import type { ErdClaim, ErdDelta, ErdPresence } from "../types";

export const STREAM_PATH = "/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/";
export const BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000, 15000, 30000];

export type ErdStreamStatus = "idle" | "connecting" | "open" | "lost";

/** EventSource 가운데 이 모듈이 쓰는 부분. 시험은 가짜를 넣는다. */
export interface EventSourceLike {
  addEventListener(type: string, listener: (e: MessageEvent) => void): void;
  close(): void;
}
export type EventSourceFactory = (url: string) => EventSourceLike;

export interface ErdStreamHandlers {
  onHello(rev: number): void;
  onDelta(delta: ErdDelta): void;
  onReload(rev: number): void;
  onPresence(list: ErdPresence[]): void;
  onClaims(list: ErdClaim[]): void;
}

export function streamUrl(modelId: string, session: string, sinceRev: number | null): string {
  const q = new URLSearchParams({ session, source: "UI" });
  if (sinceRev !== null && sinceRev >= 0) q.set("sinceRev", String(sinceRev));
  return `${STREAM_PATH}${encodeURIComponent(modelId)}?${q.toString()}`;
}

export function backoffDelay(attempt: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempt, 0), BACKOFF_MS.length - 1)];
}

/** 탭마다 하나인 화면 세션 이름(≤ 100자). 같은 사용자의 두 탭도 다른 접속자로 보인다. SSE·SET_VIEW·save 가 같은 값을 쓴다. */
export function newSession(random: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += Math.floor(random() * 36).toString(36);
  return `ui-${s}`;
}

function readRev(e: MessageEvent): number {
  return Number((JSON.parse(String(e.data)) as { rev: number }).rev);
}

export interface ErdStreamClientOptions {
  modelId: string;
  session: string;
  factory: EventSourceFactory;
  handlers: ErdStreamHandlers;
  /** 다시 열 때 sinceRev 로 쓸 rev(화면이 마지막으로 반영한 rev). null 이면 hello 부터 받는다. */
  lastRev(): number | null;
  onStatus(status: ErdStreamStatus): void;
}

export class ErdStreamClient {
  private es: EventSourceLike | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private allowed = true;
  private waiting = false;
  private stopped = true;
  private status: ErdStreamStatus = "idle";

  constructor(private readonly o: ErdStreamClientOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
    this.es?.close();
    this.es = null;
    this.setStatus("idle");
  }

  /** 문서가 보이고 포털 탭이 활성인가. 거짓이면 다시 열기를 미루고, 거짓 → 참이면 끊긴 연결을 곧바로 다시 연다. 열린 연결은 그대로 둔다. */
  setAllowed(allowed: boolean): void {
    const was = this.allowed;
    this.allowed = allowed;
    if (!allowed) {
      this.clearTimer();
      return;
    }
    if (!was && this.waiting && !this.stopped) this.connect();
  }

  private connect(): void {
    this.clearTimer();
    if (!this.allowed) {
      this.waiting = true;
      return;
    }
    this.waiting = false;
    const es = this.o.factory(streamUrl(this.o.modelId, this.o.session, this.o.lastRev()));
    this.es = es;
    if (this.status !== "lost") this.setStatus("connecting");
    const on = (type: string, fn: (e: MessageEvent) => void) =>
      es.addEventListener(type, (e) => {
        if (this.es === es) fn(e); // 닫은 연결의 늦은 이벤트는 버린다
      });
    const h = this.o.handlers;
    // 간격(attempt)은 다시 보내기 뒤에 오는 이벤트(hello·change·reload·ping)에서만 처음으로 돌린다.
    // open·claim 은 구독 직후 다시 보내기 전에 오므로, 다시 보내기가 매번 실패하면 1초 간격 재연결이 끝없이 이어진다.
    on("open", () => this.opened(false));
    on("error", () => this.lost());
    on("ping", () => this.opened(true));
    on("hello", (e) => {
      this.opened(true);
      h.onHello(readRev(e));
    });
    on("change", (e) => {
      this.opened(true);
      h.onDelta(JSON.parse(String(e.data)) as ErdDelta);
    });
    on("reload", (e) => {
      this.opened(true);
      h.onReload(readRev(e));
    });
    on("presence", (e) => {
      this.opened(false);
      h.onPresence(JSON.parse(String(e.data)) as ErdPresence[]);
    });
    on("claim", (e) => {
      this.opened(false);
      h.onClaims(JSON.parse(String(e.data)) as ErdClaim[]);
    });
  }

  private opened(resetBackoff: boolean): void {
    if (resetBackoff) this.attempt = 0;
    this.setStatus("open");
  }

  private lost(): void {
    this.es?.close();
    this.es = null;
    this.setStatus("lost");
    if (this.stopped) return;
    this.waiting = true;
    if (!this.allowed) return;
    const delay = backoffDelay(this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }

  private setStatus(s: ErdStreamStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.o.onStatus(s);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

const defaultFactory: EventSourceFactory = (url) => new EventSource(url) as unknown as EventSourceLike;
const docVisible = (): boolean => typeof document === "undefined" || document.visibilityState !== "hidden";

/** 이 화면이 든 포털 탭이 활성인가 — `portal-tab-activated` 의 tabId 를 자기 tabId 와 견준다(R10). 포털 밖이면 늘 참이다. */
export function useTabActive(): boolean {
  const { tabId } = useTabPage();
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!tabId) return;
    const on = (e: Event) => setActive((e as CustomEvent<{ tabId?: string }>).detail?.tabId === tabId);
    window.addEventListener("portal-tab-activated", on);
    return () => window.removeEventListener("portal-tab-activated", on);
  }, [tabId]);
  return active;
}

export interface UseErdStreamOptions {
  modelId: string | null;
  session: string;
  /** 모델을 다 읽었는가. 읽기 전에는 열지 않는다(sinceRev=<읽은 rev> 로 열기 위해). */
  ready: boolean;
  /** 화면이 마지막으로 반영한 rev. 다시 열 때 sinceRev 로 쓴다. */
  lastRev: number | null;
  handlers: ErdStreamHandlers;
  factory?: EventSourceFactory;
}

export function useErdStream({ modelId, session, ready, lastRev, handlers, factory = defaultFactory }: UseErdStreamOptions): ErdStreamStatus {
  const [status, setStatus] = useState<ErdStreamStatus>("idle");
  const active = useTabActive();
  const revRef = useRef(lastRev);
  revRef.current = lastRev;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const activeRef = useRef(active);
  activeRef.current = active;
  const clientRef = useRef<ErdStreamClient | null>(null);

  useEffect(() => {
    if (!modelId || !ready) return;
    const client = new ErdStreamClient({
      modelId,
      session,
      factory,
      lastRev: () => revRef.current,
      onStatus: setStatus,
      handlers: {
        onHello: (rev) => handlersRef.current.onHello(rev),
        onDelta: (d) => handlersRef.current.onDelta(d),
        onReload: (rev) => handlersRef.current.onReload(rev),
        onPresence: (list) => handlersRef.current.onPresence(list),
        onClaims: (list) => handlersRef.current.onClaims(list),
      },
    });
    clientRef.current = client;
    client.setAllowed(activeRef.current && docVisible());
    client.start();
    return () => {
      client.stop();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [modelId, session, ready, factory]);

  useEffect(() => {
    const sync = () => clientRef.current?.setAllowed(active && docVisible());
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [active]);

  return status;
}
