import type { UsageDocumentLike, UsageEventTarget, UsageSegment } from "./usage-tracker";

/**
 * 화면 사용 구간 전송기 — 큐(최대 200건, 넘치면 오래된 것부터 버림), 20건 또는 60초마다 묶음 전송
 * (최대 100건/요청), 실패 시 큐에 되돌려 다음 주기 재시도, flush({ keepalive: true }).
 * 공유 계약 C2·C3. 오류는 console.warn 만 남기고 던지지 않는다.
 */

export interface UsageSenderOptions {
  endpoint: string; // "/api/mcm/oasis/screenUsage/record"
  buildMeta?: () => Promise<Record<string, unknown>>; // 기본 { menuId: "PORTAL_SHELL" }
  fetchImpl?: typeof fetch;
  batchSize?: number; // 20
  intervalMs?: number; // 60_000
  maxQueue?: number; // 200
  maxPerRequest?: number; // 100
}

export interface UsageSender {
  enqueue(segments: UsageSegment[]): void;
  flush(opts?: { keepalive?: boolean }): Promise<void>;
  dispose(): void;
}

const DEFAULT_MENU_ID = "PORTAL_SHELL";

export function createUsageSender(options: UsageSenderOptions): UsageSender {
  const batchSize = options.batchSize ?? 20;
  const intervalMs = options.intervalMs ?? 60_000;
  const maxQueue = options.maxQueue ?? 200;
  const maxPerRequest = options.maxPerRequest ?? 100;
  let queue: UsageSegment[] = [];
  /** 실패하면 다음 주기까지 묶음 크기 자동 전송을 멈춘다(백엔드 장애·403 때 탭 전환마다 요청이 나가지 않게). */
  let blocked = false;
  let disposed = false;

  function trimOldest(): void {
    if (queue.length > maxQueue) queue = queue.slice(queue.length - maxQueue);
  }

  async function send(rows: UsageSegment[], keepalive: boolean): Promise<boolean> {
    try {
      const meta = options.buildMeta ? await options.buildMeta() : { menuId: DEFAULT_MENU_ID };
      const fetchFn = options.fetchImpl ?? globalThis.fetch;
      const res = await fetchFn(options.endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meta, params: {}, grids: { segments: { rows } } }),
        keepalive,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json().catch(() => null)) as {
        meta?: { success?: boolean; message?: string };
      } | null;
      if (body?.meta?.success === false) throw new Error(body.meta.message ?? "기록 실패");
      return true;
    } catch (err) {
      console.warn("[usage-sender] 화면 사용 구간 전송 실패 — 다음 주기에 다시 보낸다", err);
      return false;
    }
  }

  async function flush(opts: { keepalive?: boolean } = {}): Promise<void> {
    if (queue.length === 0) return;
    // await 전에 큐에서 떼어 낸다 — 보내는 중에 다른 flush 가 와도 같은 구간을 두 번 싣지 않는다.
    const chunks: UsageSegment[][] = [];
    while (queue.length > 0) chunks.push(queue.splice(0, maxPerRequest));
    const keepalive = opts.keepalive === true;
    const results = await Promise.all(chunks.map((rows) => send(rows, keepalive)));
    const failed = chunks.filter((_, i) => !results[i]).flat();
    if (failed.length > 0) {
      queue = [...failed, ...queue];
      trimOldest();
      blocked = true;
    } else {
      blocked = false;
    }
  }

  const timer = setInterval(() => {
    blocked = false;
    void flush();
  }, intervalMs);

  return {
    enqueue(segments) {
      if (segments.length === 0) return;
      queue.push(...segments);
      trimOldest();
      if (disposed || blocked || queue.length < batchSize) return;
      // 마이크로태스크로 미룬다 — 같은 흐름에서 이어지는 keepalive flush(bindUsageSender)가 먼저 큐를 가져가게.
      void Promise.resolve().then(() => {
        if (!blocked && queue.length >= batchSize) void flush();
      });
    },
    flush,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer); // 큐는 남긴다 — 뒤늦게 온 구간도 명시적 flush 로 보낼 수 있다
    },
  };
}

export interface UsageExitTargets {
  doc?: UsageDocumentLike | null;
  win?: UsageEventTarget | null;
}

export interface UsageExitBinding {
  /** PortalShell onUsageSegments 로 넘긴다. 큐에 넣고, 닫는 중이거나 가려져 있으면 바로 keepalive 로 보낸다. */
  onSegments(segments: UsageSegment[]): void;
  /** 로그아웃·언마운트 — 닫는 중으로 표시하고 남은 큐를 keepalive 로 보낸다. */
  closeAndFlush(): void;
  /** 리스너만 뗀다(sender.dispose 는 부르는 쪽 몫). */
  dispose(): void;
}

/**
 * 페이지를 떠날 때 마지막 구간이 빠지지 않게 sender 를 page 수명에 묶는다.
 * pagehide 때는 visibilityState 가 아직 visible 일 수 있고 추적기 리스너와의 실행 순서도 정해져 있지 않다.
 * 그래서 pagehide 에서 "닫는 중" 표시를 켜고, 그 뒤 들어오는 구간은 받는 즉시 keepalive 로 보낸다.
 */
export function bindUsageSender(
  sender: UsageSender,
  targets: UsageExitTargets = {}
): UsageExitBinding {
  const doc = targets.doc ?? null;
  const win = targets.win ?? null;
  let closing = false;
  const flushKeepalive = () => {
    void sender.flush({ keepalive: true });
  };
  const onVisibilityChange = () => {
    if (doc?.visibilityState === "hidden") flushKeepalive();
  };
  const onPageHide = () => {
    closing = true;
    flushKeepalive();
  };
  const onPageShow = (event: Event) => {
    if ((event as { persisted?: boolean }).persisted) closing = false;
  };
  doc?.addEventListener("visibilitychange", onVisibilityChange);
  win?.addEventListener("pagehide", onPageHide);
  win?.addEventListener("pageshow", onPageShow);

  return {
    onSegments(segments) {
      if (segments.length === 0) return;
      sender.enqueue(segments);
      if (closing || doc?.visibilityState === "hidden") flushKeepalive();
    },
    closeAndFlush() {
      closing = true;
      flushKeepalive();
    },
    dispose() {
      doc?.removeEventListener("visibilitychange", onVisibilityChange);
      win?.removeEventListener("pagehide", onPageHide);
      win?.removeEventListener("pageshow", onPageShow);
    },
  };
}
