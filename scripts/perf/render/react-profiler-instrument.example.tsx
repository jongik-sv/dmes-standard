/**
 * React <Profiler> 임시 계측 예제 — ★제품 코드에 넣지 않는다.★
 *
 * 왜 이런 파일이 있는가 (조정 지시 Q4)
 *   CDP Performance trace 는 "main thread 에서 무엇이 오래 걸렸는지" 를 알려 주지만
 *   "React 가 몇 번 커밋했고 어디가 그랬는지" 를 알려 주지 않는다. 그 빈틈을 이 계측이 메운다.
 *   - measure-screens.mjs 는 `window.__RENDER_PROFILER__.commits` 를 읽는다(없으면 그 항목을 비워 둔다).
 *   - 계측이 없으면 나머지 지표(shellReadyMs·long task·API·CDP 델타)는 그대로 정상 동작한다.
 *
 * 어떻게 쓰는지
 *   1. 측정 워크트리에서만 한다. 커밋하지 않는다(또는 측정 브랜치에만 올린다).
 *   2. m-mcm 이 해당 화면을 마운트하는 자리를 찾아 아래처럼 감싼다.
 *        import { withRenderProfiler } from "...";   // 이 파일
 *        export default withRenderProfiler("termMng", TermMngPage);
 *   3. 계측을 켜면 React DevMode 의 이중 렌더(StrictMode)가 커밋 수에 반영된다.
 *      **그래서 수치는 프로덕션 번들 기준으로 읽어야 한다**(개발 서버 수치 아님).
 *   4. 계측을 끄려면(원본으로 되돌리기) 감싼 부분을 해제한다. 파일을 지울 필요는 없다.
 *
 * 배열을 무한히 쌓지 않는다 — COMMITS_MAX 를 넘으면 오래된 것을 버린다(측정 구간만 알면 된다).
 */

import { Profiler, type ComponentType, type ProfilerOnRenderCallback, type ReactNode } from "react";

/** 측정 구간에서 남길 커밋 수 상한. 넘으면 앞에서부터 버린다. */
const COMMITS_MAX = 400;

interface Commit {
  /** Profiler 의 onRender 인자 phase ("mount" | "update" | "nested-update"). */
  phase: string;
  /** 이 커밋의 실제 소요 시간(React 내부 클럭, ms). */
  actualDuration: number;
  /** 기준 커밋 대비 추가 시간(ms). */
  baseDuration: number;
  /** 커밋 시각(performance.now(), ms). */
  startTime: number;
  /** 갱신 횟수 — 2면 이중 렌더. */
  updates: number;
}

interface Store {
  commits: Commit[];
  /** id → 누적 actualDuration 합. 상위 드리어가 빨리 보이도록 measure-screens 가 JSON 으로 뽑는다. */
  topIds: Array<{ id: string; actualMs: number; count: number }>;
  /** 계측이 켜졌는지 — 중복 계측(화면 이중 등록)을 눈치채기 위한 표시. */
  enabled: boolean;
}

declare global {
  interface Window {
    __RENDER_PROFILER__?: Store | null;
  }
}

function store(): Store | null {
  if (typeof window === "undefined") return null;
  let s = window.__RENDER_PROFILER__;
  if (!s) {
    s = { commits: [], topIds: [], enabled: false };
    window.__RENDER_PROFILER__ = s;
  }
  return s;
}

/** 같은 화면을 두 번 감쌌는지 확인한다 — 두 번 등록하면 수치가 두 배로 나온다. */
function markEnabled(id: string): void {
  const s = store();
  if (!s) return;
  if (s.enabled) {
    // eslint-disable-next-line no-console
    console.warn(`[render-profiler] 이미 켜져 있다. "${id}" 은 두 번째 계측이니 감싼 곳을 하나만 남긴다.`);
    return;
  }
  s.enabled = true;
}

export const RENDER_PROFILER_FLAG = "__RENDER_PROFILER_ON__";

/**
 * 계측을 켜고 끈다. 끄면 `window.__RENDER_PROFILER__` 이 null 이 되고 measure-screens 는
 * 커밋 항목을 비워 둔다(나머지 지표는 영향 없다).
 *
 * 전역으로 붙인다 — 측정 세션에서 개발자 도구 콘솔로:
 *   window.__RENDER_PROFILER_ON__ = true
 */
export function setRenderProfilerEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window[RENDER_PROFILER_FLAG] = on;
  window.__RENDER_PROFILER__ = on ? store() ?? { commits: [], topIds: [], enabled: false } : null;
}

/**
 * 컴포넌트를 감싼다. `id` 는 measure-screens 의 screen id 와 같은 이름을 쓴다(그래야 결과가 붙는다).
 *
 * @example
 *   export default withRenderProfiler("termMng", TermMngPage);
 */
export function withRenderProfiler<P extends object>(id: string, Wrapped: ComponentType<P>): ComponentType<P> {
  const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration, startTime, commits) => {
    const s = store();
    if (!s) return;
    s.commits.push({
      phase,
      actualDuration: Math.round(actualDuration * 100) / 100,
      baseDuration: Math.round(baseDuration * 100) / 100,
      startTime: Math.round(startTime),
      updates: commits,
    });
    if (s.commits.length > COMMITS_MAX) s.commits.splice(0, s.commits.length - COMMITS_MAX);

    const agg = new Map<string, { actualMs: number; count: number }>();
    for (const c of s.commits) {
      const prev = agg.get(id) ?? { actualMs: 0, count: 0 };
      prev.actualMs += c.actualDuration;
      prev.count += 1;
      agg.set(id, prev);
    }
    s.topIds = [...agg.entries()]
      .map(([k, v]) => ({ id: k, actualMs: Math.round(v.actualMs * 100) / 100, count: v.count }))
      .sort((a, b) => b.actualMs - a.actualMs);
  };

  markEnabled(id);

  return function Profiled(props: P & { children?: ReactNode }) {
    const { children, ...rest } = props as P & { children?: ReactNode };
    return (
      <Profiler id={id} onRender={onRender}>
        <Wrapped {...(rest as P)}>{children}</Wrapped>
      </Profiler>
    );
  };
}
