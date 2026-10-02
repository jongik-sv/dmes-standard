import { parsePageId } from "./module";

/**
 * 화면 사용 구간 추적기 — 활성화된 탭마다 열린 구간 하나를 두고 그 탭을 실제로 보고 있던 시간을 누적한다.
 * 다른 탭으로 가거나 브라우저 탭이 가려지면 구간을 닫지 않고 일시정지했다가, 다시 보면 같은 구간에 이어 누적한다.
 * 설계: docs/superpowers/specs/2026-10-02-screen-usage-stats-design.md §3.1.
 * React 에 의존하지 않는다. 시계(now)와 이벤트 대상(document·window)을 주입받는다.
 */

/**
 * 구간 시작 사유(공유 계약 C1). OPEN = 탭의 첫 업무 호출, RESUME = 15분 경과·무입력·pagehide 로 잘린 뒤 다시 보기 시작.
 * 열람 횟수 = OPEN 구간 수, 이용 시간 = 모든 구간 durationMs 합. (서버는 옛 행 호환으로 SWITCH 도 받는다.)
 */
export type UsageStartKind = "OPEN" | "RESUME";

/** 공유 계약 C1 — 서버 원본 1행. */
export interface UsageSegment {
  clientSegId: string; // crypto.randomUUID()
  pageId: string; // `${PARENT_MENU_ID}/${OBJECT_ID}`
  startKind: UsageStartKind;
  startedAt: number; // epoch ms — 첫 업무 호출(또는 RESUME 시작) 시각
  endedAt: number; // epoch ms — 마지막으로 보고 있던 시각
  durationMs: number; // 실제로 보고 있던 시간의 합(일시정지 제외). endedAt - startedAt 이하
}

/** PortalShell `onUsageSegments` 가 구간을 넘기는 사유. 로그아웃이면 호출부가 바로 보내고 끝나기를 알려야 한다. */
export type UsageEmitReason = "normal" | "logout";

/** 추적 대상 — key 는 구간을 묶는 단위(포털에서는 탭 ID), pageId 는 기록용 화면 ID. 문자열이면 둘이 같다. */
export type UsageTarget = string | { key: string; pageId: string };

/** 이 시간 동안 입력이 없으면 보고 있던 구간을 마지막 입력 시각에서 끝낸다. */
export const USAGE_IDLE_MS = 30 * 60 * 1000;
/** 구간 시작 뒤 이 시간이 지나면(일시정지 중이어도) 내보낸다. 창이 비정상 종료돼도 잃는 시간을 묶는다. */
export const USAGE_MAX_SEGMENT_MS = 15 * 60 * 1000;
/** 이용 시간(durationMs)이 이보다 짧은 구간은 버린다. */
export const USAGE_MIN_SEGMENT_MS = 1000;
/** 무입력·15분 판정 주기. */
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
  /** 내보낼 구간(이용 시간 1초 이상)을 한 번에 넘긴다. 던져도 추적은 계속한다. */
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
  /** 일시정지 전까지 누적한 이용 시간. 보고 있는 동안의 몫은 runningSince 부터 더한다. */
  accumulatedMs: number;
  /** 지금 보고 있으면 그 시작 시각, 일시정지 중이면 null. */
  runningSince: number | null;
  /** 마지막으로 보고 있던 시각 = 내보낼 때의 endedAt. */
  lastActiveAt: number;
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
  /** 지금 보고 있는 추적 대상(key). 홈·활성화 안 된 탭·탭 없음·로그아웃이면 null. */
  private currentKey: string | null = null;
  private currentPageId: string | null = null;
  /** 지금 대상에 구간이 없어 새로 열 때의 시작 사유. 한 번 열면 RESUME 으로 돌아간다. */
  private nextKind: UsageStartKind = "RESUME";
  /** key → 열린 구간(보고 있거나 일시정지 중). 보고 있는 것은 currentKey 의 구간 하나뿐이다. */
  private readonly segments = new Map<string, OpenSegment>();
  private lastInputAt = 0;
  /** 시계가 뒤로 가도 이용 시간이 음수가 되지 않게 지금까지 본 가장 늦은 시각. */
  private lastTime = Number.NEGATIVE_INFINITY;
  private disposed = false;

  private readonly handleVisibilityChange = (): void => {
    if (this.disposed) return;
    const t = this.time();
    this.closeIfIdle(t);
    if (this.isHidden()) {
      this.pauseRunning(t);
      return;
    }
    this.lastInputAt = t;
    this.expire(t); // 가려진 사이 판정 타이머가 멈췄다면 15분 지난 구간을 먼저 내보낸다(다시 보면 RESUME)
    this.resumeIfVisible(t);
  };

  private readonly handlePageHide = (): void => {
    if (this.disposed) return;
    this.closeAll(this.time());
  };

  private readonly handleInput = (): void => {
    if (this.disposed) return;
    const t = this.time();
    this.closeIfIdle(t); // 판정 타이머가 멈춰 있던 무입력 30분 — 공백을 이용 시간으로 넣지 않는다
    this.lastInputAt = t;
    if (this.running()) return;
    this.expire(t); // 판정 타이머가 멈춘 사이 15분 지난 일시정지 구간을 먼저 내보낸다
    this.resumeIfVisible(t); // 무입력·pagehide 뒤 돌아온 입력 → RESUME
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

  /**
   * 보고 있는 대상이 바뀌었다. 이전 대상의 구간은 닫지 않고 일시정지한다. 새 대상에 구간이 있으면 이어 누적하고,
   * 없으면 startKind 로 새 구간을 연다(가려져 있으면 보일 때 연다). null 이면 일시정지만 한다.
   */
  activate(target: UsageTarget | null, startKind: UsageStartKind = "RESUME"): void {
    if (this.disposed) return;
    const key = target == null ? null : typeof target === "string" ? target : target.key;
    const pageId = target == null ? null : typeof target === "string" ? target : target.pageId;
    if (key != null && key === this.currentKey) {
      // 같은 대상 재활성화 — 구간이나 마지막 입력 시각을 덮어쓰지 않는다.
      // 아직 열리지 않은 구간(가려진 채 시작 등)이 OPEN 을 요청받은 경우에만 OPEN 으로 올린다.
      if (!this.segments.has(key) && startKind === "OPEN") this.nextKind = "OPEN";
      return;
    }
    const t = this.time();
    if (!this.closeIfIdle(t)) this.pauseRunning(t);
    // 판정 타이머가 멈춘 사이(절전·백그라운드 제한) 15분 지난 일시정지 구간을 먼저 내보낸다 — 옛 구간을 이어 쓰면
    // endedAt 이 늦어지고 벽시계 길이가 24시간을 넘으면 서버가 행을 버린다. 지금은 보고 있는 구간이 없다.
    this.expire(t);
    this.currentKey = key;
    this.currentPageId = pageId;
    this.nextKind = startKind;
    this.lastInputAt = t;
    this.resumeIfVisible(t);
  }

  /** 탭 닫기 — 그 대상의 구간을 지금 내보내고 잊는다. 보고 있던 대상이면 일시정지 상태(null)로 둔다. */
  release(key: string): void {
    if (this.disposed) return;
    const t = this.time();
    if (key === this.currentKey) {
      if (!this.closeIfIdle(t)) this.pauseRunning(t);
      this.currentKey = null;
      this.currentPageId = null;
      this.nextKind = "RESUME";
    }
    const seg = this.segments.get(key);
    if (seg) this.emit([this.finish(key, seg)]);
  }

  /** 로그아웃 — 일시정지 중인 것까지 모든 구간을 내보내고, 다시 activate 될 때까지 열지 않는다. */
  end(): void {
    if (this.disposed) return;
    this.closeAll(this.time());
    this.currentKey = null;
    this.currentPageId = null;
  }

  /** 60초 판정. 보고 있는 구간의 무입력 30분을 먼저 보고, 시작 뒤 15분이 지난 구간을 내보낸다. */
  tick(): void {
    if (this.disposed || this.segments.size === 0) return;
    const t = this.time();
    this.closeIfIdle(t);
    this.expire(t);
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

  /** 지금 보고 있는(누적 중인) 구간. */
  private running(): OpenSegment | null {
    if (this.currentKey == null) return null;
    const seg = this.segments.get(this.currentKey);
    return seg && seg.runningSince != null ? seg : null;
  }

  /** 지금 대상이 보이면 구간을 이어 누적하고, 구간이 없으면 nextKind 로 새로 연다. */
  private resumeIfVisible(t: number): void {
    if (this.currentKey == null || this.currentPageId == null || this.isHidden()) return;
    const seg = this.segments.get(this.currentKey);
    if (seg) {
      if (seg.runningSince == null) seg.runningSince = t;
      return;
    }
    this.segments.set(this.currentKey, {
      id: this.createId(),
      pageId: this.currentPageId,
      startKind: this.nextKind,
      startedAt: t,
      accumulatedMs: 0,
      runningSince: t,
      lastActiveAt: t,
    });
    this.nextKind = "RESUME";
  }

  /** 보고 있는 구간을 at 까지 누적하고 일시정지한다. */
  private pauseRunning(at: number): void {
    const seg = this.running();
    if (!seg || seg.runningSince == null) return;
    const until = Math.max(at, seg.runningSince);
    seg.accumulatedMs += until - seg.runningSince;
    seg.lastActiveAt = Math.max(seg.lastActiveAt, until);
    seg.runningSince = null;
  }

  /**
   * 무입력 규칙(설계 §3.1) — 마지막 입력 뒤 30분 이상 지났으면 보고 있던 구간을 마지막 입력 시각까지 누적해 내보낸다.
   * 60초 판정만 믿지 않는다: 절전·백그라운드 제한으로 타이머가 멈췄다가 판정보다 입력·전환·가림이 먼저 와도
   * 공백이 이용 시간으로 잡히지 않게, 구간을 건드리는 모든 경로가 먼저 부른다. 내보냈으면 true.
   */
  private closeIfIdle(t: number): boolean {
    const seg = this.running();
    if (!seg || this.currentKey == null || t - this.lastInputAt < this.idleMs) return false;
    this.pauseRunning(this.lastInputAt);
    this.emit([this.finish(this.currentKey, seg)]);
    return true;
  }

  /** pagehide·로그아웃 — 보고 있던 구간을 t 까지 누적하고(무입력이면 마지막 입력까지) 모든 구간을 내보낸다. */
  private closeAll(t: number): void {
    if (!this.closeIfIdle(t)) this.pauseRunning(t);
    const out: UsageSegment[] = [];
    for (const [key, seg] of [...this.segments]) out.push(this.finish(key, seg));
    this.nextKind = "RESUME";
    this.emit(out);
  }

  /**
   * 15분 경과 — 시작 뒤 15분이 지난 구간을 내보낸다. 일시정지 중이면 그대로 내보내고(다시 보면 RESUME),
   * 보고 있는 구간은 마지막 입력 시각에서 잘라 그 시각부터 RESUME 으로 잇는다(무입력 판정과 어긋나지 않게).
   * 시작 뒤 입력이 없었으면 자르지 않고 둔다(무입력 30분이 닫는다).
   */
  private expire(t: number): void {
    const out: UsageSegment[] = [];
    for (const [key, seg] of [...this.segments]) {
      if (t - seg.startedAt < this.maxSegmentMs) continue;
      if (seg.runningSince == null) {
        out.push(this.finish(key, seg));
        continue;
      }
      const cutAt = Math.min(Math.max(seg.runningSince, this.lastInputAt), t);
      if (cutAt <= seg.startedAt) continue;
      this.pauseRunning(cutAt);
      out.push(this.finish(key, seg));
      this.segments.set(key, {
        id: this.createId(),
        pageId: seg.pageId,
        startKind: "RESUME",
        startedAt: cutAt,
        accumulatedMs: 0,
        runningSince: cutAt,
        lastActiveAt: cutAt,
      });
    }
    this.emit(out);
  }

  /** 일시정지된 구간을 목록에서 빼고 내보낼 행으로 바꾼다. */
  private finish(key: string, seg: OpenSegment): UsageSegment {
    this.segments.delete(key);
    return {
      clientSegId: seg.id,
      pageId: seg.pageId,
      startKind: seg.startKind,
      startedAt: seg.startedAt,
      endedAt: seg.lastActiveAt,
      durationMs: seg.accumulatedMs,
    };
  }

  private emit(pieces: UsageSegment[]): void {
    const kept = pieces.filter((s) => s.durationMs >= this.minSegmentMs);
    if (kept.length === 0) return;
    try {
      this.onSegments(kept);
    } catch (err) {
      console.warn("[usage-tracker] 화면 사용 구간 처리 실패", err);
    }
  }
}
