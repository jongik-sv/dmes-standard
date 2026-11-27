/** @vitest-environment happy-dom */
/** 초안 저장 줄(chain) 시험(f3 리뷰 1·2·6·7) — 화면 닫을 때 저장·버리기가 앞 저장과 겹치지 않는다. JSX 없이 createElement 로 쓴다. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLink } from "./draft";
import { BUSY_RETRY_MS, DraftSaveError, SAVE_DELAY_MS, useBenchDraft, type BenchDraft } from "./useBenchDraft";
import { PermApplyError, type DraftResult, type PermBenchApi, type SaveDraftRequest } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};

const okDraft = (n: number): DraftResult => ({ draft: [{ CHANGES_JSON: "[]", CHANGE_CNT: n, U_AT: "2026-11-27T10:00:00" }] });

/** 저장·버리기를 손으로 끝내는 가짜 API. 부른 순서를 log 에 남긴다. */
function fakeApi() {
  const log: string[] = [];
  const saves: Array<{ req: SaveDraftRequest; d: Deferred<DraftResult> }> = [];
  const discards: Array<Deferred<void>> = [];
  let saveImpl: ((req: SaveDraftRequest) => Promise<DraftResult>) | null = null;
  const api = {
    loadDraft: () => Promise.resolve({ draft: [] }),
    saveDraft: (req: SaveDraftRequest) => {
      log.push(`save:${req.grids.changes.rows.length}`);
      if (saveImpl) return saveImpl(req);
      const d = deferred<DraftResult>();
      saves.push({ req, d });
      return d.promise;
    },
    discardDraft: () => {
      log.push("discard");
      const d = deferred<void>();
      discards.push(d);
      return d.promise;
    },
    impact: () => Promise.resolve({ summary: [{ GAIN_USER_CNT: 0, LOSE_USER_CNT: 0, SCREEN_CNT: 0 }], impacts: [] }),
    apply: () => Promise.resolve({ result: [] }),
  } as unknown as PermBenchApi;
  return { api, log, saves, discards, setSave: (f: typeof saveImpl) => (saveImpl = f) };
}

describe("useBenchDraft — 저장 줄", () => {
  let root: Root;
  let host: HTMLElement;
  let state: BenchDraft;
  let onError: ReturnType<typeof vi.fn>;
  let f: ReturnType<typeof fakeApi>;
  const Probe = () => {
    state = useBenchDraft(f.api, { enabled: true, onError });
    return null;
  };
  const tick = (ms = 0) => act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  const edit = (gid: string) => act(async () => {
    state.mutate((x) => setLink(x, "USER_GRP", "u1", gid, true, false));
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    f = fakeApi();
    onError = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(createElement(Probe));
    });
    await tick();
    expect(state.status).toBe("ready");
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  it("화면을 닫을 때 저장은 앞 저장이 끝난 뒤 마지막 목록으로 나간다(리뷰 1)", async () => {
    await edit("G1");
    await tick(SAVE_DELAY_MS);
    expect(f.log).toEqual(["save:1"]);
    await edit("G2");
    act(() => root.unmount());
    root = createRoot(host); // afterEach 가 다시 unmount 해도 되게
    await tick();
    expect(f.log).toEqual(["save:1"]); // 앞 저장이 날아가는 중 — 겹쳐 보내지 않는다
    await act(async () => f.saves[0].d.resolve(okDraft(1)));
    await tick();
    expect(f.log).toEqual(["save:1", "save:2"]);
    expect(f.saves[1].req.grids.changes.rows.map((r) => r.KEY2)).toEqual(["G1", "G2"]);
  });

  it("화면을 닫을 때 저장이 잠금 충돌이면 잠깐 뒤 다시 보낸다", async () => {
    let n = 0;
    f.setSave(() => (++n === 1 ? Promise.reject(new PermApplyError("PERM_DRAFT_BUSY", "잠금")) : Promise.resolve(okDraft(1))));
    await edit("G1");
    act(() => root.unmount());
    root = createRoot(host);
    await tick();
    expect(n).toBe(1);
    await tick(BUSY_RETRY_MS);
    expect(n).toBe(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it("버리기는 앞 저장이 끝난 뒤 나가고, 버리는 동안 편집·자동 저장을 받지 않는다(리뷰 2)", async () => {
    await edit("G1");
    await tick(SAVE_DELAY_MS);
    expect(f.log).toEqual(["save:1"]);
    let done: boolean | undefined;
    await act(async () => {
      void state.discard().then((ok) => (done = ok));
    });
    expect(state.discarding).toBe(true);
    await edit("G2"); // 막힌다
    expect(state.draft.size).toBe(1);
    expect(f.log).toEqual(["save:1"]); // 저장이 끝나기 전에는 버리지 않는다
    await act(async () => f.saves[0].d.resolve(okDraft(1)));
    await tick();
    expect(f.log).toEqual(["save:1", "discard"]);
    await act(async () => f.discards[0].resolve());
    await tick(SAVE_DELAY_MS * 2);
    expect(done).toBe(true);
    expect(state.discarding).toBe(false);
    expect(state.draft.size).toBe(0);
    expect(f.log).toEqual(["save:1", "discard"]); // 유령 저장이 뒤따르지 않는다
  });

  it("버리기가 실패하면 false 를 돌려주고 초안을 그대로 둔다", async () => {
    await edit("G1");
    let done: boolean | undefined;
    await act(async () => {
      void state.discard().then((ok) => (done = ok));
    });
    await tick();
    await act(async () => f.discards[0].reject(new Error("실패")));
    await tick();
    expect(done).toBe(false);
    expect(state.draft.size).toBe(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("자동 저장이 같은 오류로 다시 실패하면 다시 알리지 않고, 적용은 이미 알린 저장 실패를 DraftSaveError 로 던진다(리뷰 6·7)", async () => {
    const forbid = () => Promise.reject(new PermApplyError("PERM_FORBIDDEN", "막힘"));
    f.setSave(forbid);
    await edit("G1");
    await tick(SAVE_DELAY_MS);
    expect(onError).toHaveBeenCalledTimes(1);
    await edit("G2");
    await tick(SAVE_DELAY_MS);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(state.saveError).toBe("막힘");
    let err: unknown;
    await act(async () => {
      err = await state.apply("", "N").catch((e: unknown) => e);
    });
    expect(err).toBeInstanceOf(DraftSaveError);
    expect((err as DraftSaveError).original).toBeInstanceOf(PermApplyError);
  });

  it("저장이 PERM_DRAFT_CORRUPT 면 corrupt 로 바꿔 「초안 버리기」로 이끈다", async () => {
    f.setSave(() => Promise.reject(new PermApplyError("PERM_DRAFT_CORRUPT", "지문 밖")));
    await edit("G1");
    await tick(SAVE_DELAY_MS);
    expect(state.status).toBe("corrupt");
  });
});
