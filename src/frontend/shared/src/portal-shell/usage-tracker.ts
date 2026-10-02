import { parsePageId } from "./module";

/**
 * 화면 사용 구간 추적기 — 사용자가 한 화면을 실제로 보고 있던 연속 시간(구간)을 만든다.
 * 설계: docs/superpowers/specs/2026-10-02-screen-usage-stats-design.md §3.1.
 * React 에 의존하지 않는다. 시계(now)와 이벤트 대상(document·window)을 주입받는다.
 */

/** 구간 시작 사유(공유 계약 C1). 열람 횟수 = OPEN 구간 수, 이용 시간 = 모든 구간 길이 합. */
export type UsageStartKind = "OPEN" | "SWITCH" | "RESUME";

/** 공유 계약 C1 — 서버 원본 1행. */
export interface UsageSegment {
  clientSegId: string; // crypto.randomUUID()
  pageId: string; // `${PARENT_MENU_ID}/${OBJECT_ID}`
  startKind: UsageStartKind;
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
}

/** PortalShell `onUsageSegments` 가 구간을 넘기는 사유. 로그아웃이면 호출부가 바로 보내고 끝나기를 알려야 한다. */
export type UsageEmitReason = "normal" | "logout";

/** 활성 화면을 알릴 때 쓰는 시작 사유. RESUME 은 추적기가 스스로 붙인다. */
export type UsageActivateKind = "OPEN" | "SWITCH";

/** 이 시간 동안 입력이 없으면 구간을 마지막 입력 시각에서 끝낸다. */
export const USAGE_IDLE_MS = 30 * 60 * 1000;
/** 구간이 이 길이에 이르면 자르고 RESUME 으로 잇는다(창이 비정상 종료돼도 잃는 시간을 묶는다). */
export const USAGE_MAX_SEGMENT_MS = 15 * 60 * 1000;
/** 이보다 짧은 구간은 버린다. */
export const USAGE_MIN_SEGMENT_MS = 1000;
/** 무입력·자르기 판정 주기. */
export const USAGE_TICK_MS = 60 * 1000;

export interface UsageEventTarget {
  addEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: boolean | EventListenerOptions
  ): void;
}

export interface UsageDocumentLike extends UsageEventTarget {
  readonly visibilityState: string;
}

export interface UsageTrackerOptions {
  /** 닫힌 구간(1초 이상)을 한 번에 넘긴다. 던져도 추적은 계속한다. */
  onSegments: (segments: UsageSegment[]) => void;
  now?: () => number;
  /** visibilitychange·입력(pointerdown·keydown·wheel) 대상. 없으면 늘 보이는 것으로 본다. */
  doc?: UsageDocumentLike | null;
  /** pagehide 대상. */
  win?: UsageEventTarget | null;
  createId?: () => string;
  idleMs?: number;
  maxSegmentMs?: number;
  minSegmentMs?: number;
  tickMs?: number;
}

interface OpenSegment {
  id: string;
  pageId: string;
  startKind: UsageStartKind;
  startedAt: number;
}

const INPUT_EVENTS = ["pointerdown", "keydown", "wheel"] as const;
const INPUT_LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };

/** 탭 pageId(`moduleId:componentPath`) → 기록용 pageId(componentPath). 형식이 다르면 그대로 둔다. */
export function toUsagePageId(tabPageId: string): string {
  return parsePageId(tabPageId)?.pageName ?? tabPageId;
}

/**
 * 구간 ID(36자 UUID v4). http 로 IP 접속하면 보안 컨텍스트가 아니라 crypto.randomUUID 가 없으므로
 * getRandomValues(보안 컨텍스트 불필요)로 만든다. 그것도 없으면 Math.random 으로 채운다.
 */
export function createUsageSegmentId(): string {
  const cryptoApi = (globalThis as { crypto?: Partial<Crypto> }).crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // 버전 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 변형
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class UsageTracker {
  private readonly onSegments: (segments: UsageSegment[]) => void;
  private readonly now: () => number;
  private readonly doc: UsageDocumentLike | null;
  private readonly win: UsageEventTarget | null;
  private readonly createId: () => string;
  private readonly idleMs: number;
  private readonly maxSegmentMs: number;
  private readonly minSegmentMs: number;
  private readonly timer: ReturnType<typeof setInterval>;
  /** 지금 보고 있다고 보는 화면. 홈·탭 없음·로그아웃이면 null. */
  private pageId: string | null = null;
  /** 다음에 여는 구간의 시작 사유. 한 번 열면 RESUME 으로 돌아간다. */
  private nextKind: UsageStartKind = "RESUME";
  private open: OpenSegment | null = null;
  private lastInputAt = 0;
  /** 시계가 뒤로 가도 구간이 겹치지 않게 지금까지 본 가장 늦은 시각. */
  private lastTime = Number.NEGATIVE_INFINITY;
  private disposed = false;

  private readonly handleVisibilityChange = (): void => {
    if (this.disposed) return;
    const t = this.time();
    if (this.isHidden()) {
      this.close(t);
      return;
    }
    this.lastInputAt = t;
    this.openIfVisible(t);
  };

  private readonly handlePageHide = (): void => {
    if (this.disposed) return;
    this.close(this.time());
  };

  private readonly handleInput = (): void => {
    if (this.disposed) return;
    const t = this.time();
    this.lastInputAt = t;
    if (!this.open) this.openIfVisible(t); // 무입력·pagehide 뒤 돌아온 입력 → RESUME
  };

  constructor(options: UsageTrackerOptions) {
    this.onSegments = options.onSegments;
    this.now = options.now ?? (() => Date.now());
    this.doc = options.doc ?? null;
    this.win = options.win ?? null;
    this.createId = options.createId ?? createUsageSegmentId;
    this.idleMs = options.idleMs ?? USAGE_IDLE_MS;
    this.maxSegmentMs = options.maxSegmentMs ?? USAGE_MAX_SEGMENT_MS;
    this.minSegmentMs = options.minSegmentMs ?? USAGE_MIN_SEGMENT_MS;
    this.lastInputAt = this.time();
    this.doc?.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.win?.addEventListener("pagehide", this.handlePageHide);
    for (const type of INPUT_EVENTS) {
      this.doc?.addEventListener(type, this.handleInput, INPUT_LISTENER_OPTIONS);
    }
    this.timer = setInterval(() => this.tick(), options.tickMs ?? USAGE_TICK_MS);
  }

  /** 활성 화면이 바뀌었다. 이전 구간을 지금 닫고, pageId 가 있으면 새 구간을 연다(가려져 있으면 보일 때 연다). */
  activate(pageId: string | null, startKind: UsageActivateKind = "SWITCH"): void {
    if (this.disposed) return;
    if (pageId != null && pageId === this.pageId) {
      // 같은 화면 재활성화 — 구간을 쪼개거나 시작 사유·마지막 입력 시각을 덮어쓰지 않는다.
      // 아직 열리지 않은 구간(가려진 채 연 탭 등)이 OPEN 을 요청받은 경우에만 OPEN 으로 올린다.
      if (!this.open && startKind === "OPEN") this.nextKind = "OPEN";
      return;
    }
    const t = this.time();
    this.close(t);
    this.pageId = pageId;
    this.nextKind = startKind;
    this.lastInputAt = t;
    this.openIfVisible(t);
  }

  /** 로그아웃 — 열린 구간을 닫고, 다시 activate 될 때까지 열지 않는다. */
  end(): void {
    if (this.disposed) return;
    this.close(this.time());
    this.pageId = null;
  }

  /** 60초 판정. 무입력 30분이면 마지막 입력 시각에서 끝내고, 아니면 15분 넘은 구간을 자른다. */
  tick(): void {
    if (this.disposed || !this.open) return;
    const t = this.time();
    if (t - this.lastInputAt >= this.idleMs) {
      this.close(Math.max(this.open.startedAt, this.lastInputAt));
      return; // 다음 입력 때 RESUME 으로 다시 연다
    }
    this.emit(this.cutAtLastInput(t));
  }

  dispose(): void {
    if (this.disposed) return;
    this.end();
    this.disposed = true;
    clearInterval(this.timer);
    this.doc?.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.win?.removeEventListener("pagehide", this.handlePageHide);
    for (const type of INPUT_EVENTS) {
      this.doc?.removeEventListener(type, this.handleInput, { capture: true });
    }
  }

  private time(): number {
    const t = Math.max(this.now(), this.lastTime);
    this.lastTime = t;
    return t;
  }

  private isHidden(): boolean {
    return this.doc?.visibilityState === "hidden";
  }

  private openIfVisible(t: number): void {
    if (this.open || this.pageId == null || this.isHidden()) return;
    this.open = { id: this.createId(), pageId: this.pageId, startKind: this.nextKind, startedAt: t };
    this.nextKind = "RESUME";
  }

  /** 열린 구간을 at 에서 닫는다. 15분이 넘으면 15분 조각으로 나눠 함께 넘긴다. */
  private close(at: number): void {
    if (!this.open) return;
    const pieces = this.cutLongPieces(at);
    const last = this.open;
    this.open = null;
    if (last) pieces.push(this.toSegment(last, Math.max(at, last.startedAt)));
    this.emit(pieces);
  }

  /**
   * 닫을 때의 15분 자르기 — 타이머가 멈춰 있던(절전·백그라운드 제한) 구간도 15분 넘게 내지 않도록
   * 15분째마다 무조건 자르고 같은 화면의 RESUME 구간으로 잇는다. 잘린 조각을 돌려준다.
   */
  private cutLongPieces(at: number): UsageSegment[] {
    const pieces: UsageSegment[] = [];
    while (this.open && at - this.open.startedAt >= this.maxSegmentMs) {
      const cutAt = this.open.startedAt + this.maxSegmentMs;
      pieces.push(this.toSegment(this.open, cutAt));
      this.open = {
        id: this.createId(),
        pageId: this.open.pageId,
        startKind: "RESUME",
        startedAt: cutAt,
      };
    }
    return pieces;
  }

  /**
   * 60초 판정의 15분 자르기. 열린 구간이 at 까지 15분 이상이면 마지막 입력 시각(최대 시작+15분)에서 자르고
   * 그 시각에서 같은 화면의 RESUME 구간을 잇는다. 끝이 시작 이하(입력이 없었음)면 내보내지 않고 그대로 둔다.
   */
  private cutAtLastInput(at: number): UsageSegment[] {
    const pieces: UsageSegment[] = [];
    while (this.open && at - this.open.startedAt >= this.maxSegmentMs) {
      const cutAt = Math.min(
        Math.max(this.open.startedAt, this.lastInputAt),
        this.open.startedAt + this.maxSegmentMs
      );
      if (cutAt <= this.open.startedAt) break;
      pieces.push(this.toSegment(this.open, cutAt));
      this.open = {
        id: this.createId(),
        pageId: this.open.pageId,
        startKind: "RESUME",
        startedAt: cutAt,
      };
    }
    return pieces;
  }

  private toSegment(open: OpenSegment, endedAt: number): UsageSegment {
    return {
      clientSegId: open.id,
      pageId: open.pageId,
      startKind: open.startKind,
      startedAt: open.startedAt,
      endedAt,
    };
  }

  private emit(pieces: UsageSegment[]): void {
    const kept = pieces.filter((s) => s.endedAt - s.startedAt >= this.minSegmentMs);
    if (kept.length === 0) return;
    try {
      this.onSegments(kept);
    } catch (err) {
      console.warn("[usage-tracker] 화면 사용 구간 처리 실패", err);
    }
  }
}
