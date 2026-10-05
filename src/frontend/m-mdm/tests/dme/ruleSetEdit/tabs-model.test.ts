// 하위 세트 spec §10.3 — 세트 탭 열기·고르기·닫기·상한(순수 함수). 계획 Task 7 Step 2 + ui:7 조정(ver·pickInTab·draft·unconfirmedSetIds).
import { describe, expect, it } from "vitest";

import {
  CLOSE_CONFIRM, MAX_SET_TABS, TAB_LIMIT_MESSAGE, closeTab, currentOf, dirtySetIds, initialTabs, openFromParams, openInActive, openLinked, pickInTab,
  selectTab, unconfirmedSetIds, withStatus, type TabStatus, type TabsState,
} from "../../../pages/dme/ruleSetEdit/tabs-model";

const status = (setId: string, over: Partial<TabStatus> = {}): TabStatus => ({
  setId, setName: `${setId} 이름`, ver: "1.000", dirty: false, draft: false, ...over,
});
const loaded = (s: TabsState, key: string, setId: string, over: Partial<TabStatus> = {}) => withStatus(s, key, status(setId, over));
const activeSet = (s: TabsState) => currentOf(s.tabs.find((t) => t.key === s.active)!);

describe("tabs-model", () => {
  it("처음에는 세트 없는 탭 하나다", () => {
    const s = initialTabs();
    expect(s.tabs.map((t) => t.key)).toEqual(["t1"]);
    expect(s.active).toBe("t1");
    expect(currentOf(s.tabs[0])).toBeNull();
    expect(s.tabs[0].draft).toBe(false);
    expect(MAX_SET_TABS).toBe(8);
    expect(TAB_LIMIT_MESSAGE).toBe("세트 탭은 8개까지 연다. 다른 탭을 닫고 다시 연다");
    expect(CLOSE_CONFIRM).toBe("저장하지 않은 변경이 있다. 닫으면 변경을 버린다.");
  });

  it("지금 탭에서 열기는 매번 새 요청 번호를 주고 버전을 싣는다(없으면 null)", () => {
    const a = openInActive(initialTabs(), "S1");
    const b = openInActive(a, "S1", "2.001");
    expect(a.tabs[0].request).toEqual({ setId: "S1", ver: null, seq: a.tabs[0].request!.seq });
    expect(b.tabs[0].request!.seq).toBeGreaterThan(a.tabs[0].request!.seq);
    expect(b.tabs[0].request!.ver).toBe("2.001");
    expect(b.tabs).toHaveLength(1);
  });

  it("고르기는 다른 탭에 열린 세트면 그 탭으로 가고(요청 없음), 아니면 그 탭에 요청을 준다", () => {
    let s = loaded(openInActive(initialTabs(), "S1"), "t1", "S1");
    s = openLinked(s, "S2").state; // t1 S1 · t3 S2, 지금 t3
    const k2 = s.active;
    s = loaded(s, k2, "S2");
    const before = s.tabs.find((t) => t.key === k2)!.request;
    // t1 에서 S2 를 고름 → S2 탭으로 간다
    const r = pickInTab(selectTab(s, "t1"), "t1", "S2");
    expect(r.state.active).toBe(k2);
    expect(r.state.tabs.find((t) => t.key === k2)!.request).toBe(before);
    expect(currentOf(r.state.tabs[0])).toBe("S1");
    expect(r.message).toBeNull();
    // t1 에서 새 세트 S3 → t1 에 요청
    const n = pickInTab(selectTab(s, "t1"), "t1", "S3");
    expect(n.state.active).toBe("t1");
    expect(n.state.tabs[0].request).toMatchObject({ setId: "S3", ver: null });
    expect(n.state.tabs).toHaveLength(2);
    // 같은 탭에서 같은 세트를 다시 고르면 다시 불러온다(새 요청 번호)
    const again = pickInTab(selectTab(s, "t1"), "t1", "S1");
    expect(again.state.tabs[0].request!.seq).toBeGreaterThan(s.tabs[0].request!.seq);
    // 없는 탭이면 그대로
    expect(pickInTab(s, "t99", "S9").state).toBe(s);
  });

  it("링크는 이미 열린 탭으로 가고, 없으면 지금 탭 오른쪽에 새 탭을 연다", () => {
    let s = loaded(openInActive(initialTabs(), "S1"), "t1", "S1");
    s = openLinked(s, "S2").state;
    expect(s.tabs.map((t) => currentOf(t))).toEqual(["S1", "S2"]);
    expect(s.active).toBe(s.tabs[1].key);
    expect(s.tabs[1].request?.ver).toBeNull();
    s = selectTab(s, "t1");
    s = openLinked(s, "S3").state;
    expect(s.tabs.map((t) => currentOf(t))).toEqual(["S1", "S3", "S2"]);
    const again = openLinked(s, "S2");
    expect(again.state.tabs).toHaveLength(3);
    expect(activeSet(again.state)).toBe("S2");
  });

  it("탭이 8개면 열지 않고 메시지를 낸다", () => {
    let s = loaded(openInActive(initialTabs(), "S0"), "t1", "S0");
    for (let i = 1; i < MAX_SET_TABS; i++) s = openLinked(s, `S${i}`).state;
    expect(s.tabs).toHaveLength(8);
    const r = openLinked(s, "S9");
    expect(r.state).toBe(s);
    expect(r.message).toBe(TAB_LIMIT_MESSAGE);
    // 이미 열린 세트는 상한과 무관하게 그 탭으로 간다
    expect(openLinked(s, "S3").message).toBeNull();
  });

  it("포털 파라미터는 세트 없는 탭 하나뿐이면 그 탭에서, 아니면 링크처럼 연다", () => {
    const first = openFromParams(initialTabs(), "S1", "1.000");
    expect(first.state.tabs).toHaveLength(1);
    expect(first.state.tabs[0].request).toMatchObject({ setId: "S1", ver: "1.000" });
    const second = openFromParams(loaded(first.state, "t1", "S1"), "S2");
    expect(second.state.tabs.map((t) => currentOf(t))).toEqual(["S1", "S2"]);
    expect(activeSet(second.state)).toBe("S2");
  });

  it("포털 파라미터가 이미 열린 세트면 그 탭으로 가고, 다른 버전이면 그 탭에 그 버전으로 다시 연다", () => {
    let s = loaded(openFromParams(initialTabs(), "S1").state, "t1", "S1", { ver: "1.000" });
    s = loaded(openFromParams(s, "S2").state, "t3", "S2");
    const seqBefore = s.tabs[0].request!.seq;
    // 버전 없음 → 고르기만
    const same = openFromParams(s, "S1");
    expect(same.state.active).toBe("t1");
    expect(same.state.tabs[0].request!.seq).toBe(seqBefore);
    // 같은 버전(표기만 다름) → 고르기만
    expect(openFromParams(s, "S1", "1").state.tabs[0].request!.seq).toBe(seqBefore);
    // 다른 버전 → 그 탭에 새 요청
    const other = openFromParams(s, "S1", "2.000");
    expect(other.state.active).toBe("t1");
    expect(other.state.tabs).toHaveLength(2);
    expect(other.state.tabs[0].request).toMatchObject({ setId: "S1", ver: "2.000" });
    expect(other.state.tabs[0].request!.seq).toBeGreaterThan(seqBefore);
  });

  it("아직 불러오지 않은 탭은 요청한 버전과 견준다", () => {
    const s = openFromParams(initialTabs(), "S1", "2.000").state; // 알림 전
    expect(openFromParams(s, "S1", "2.000").state).toEqual(s);
    expect(openFromParams(s, "S1", "3.000").state.tabs[0].request!.ver).toBe("3.000");
  });

  it("닫으면 오른쪽(없으면 왼쪽) 탭으로 가고 마지막 탭은 닫지 않는다", () => {
    let s = loaded(openInActive(initialTabs(), "S1"), "t1", "S1");
    s = openLinked(s, "S2").state;
    s = openLinked(selectTab(s, "t1"), "S3").state; // S1 · S3 · S2, 지금 S3
    const k3 = s.active;
    s = closeTab(s, k3);
    expect(s.tabs.map((t) => currentOf(t))).toEqual(["S1", "S2"]);
    expect(activeSet(s)).toBe("S2");
    s = closeTab(closeTab(s, s.active), "t1");
    expect(s.tabs).toHaveLength(1);
    expect(closeTab(s, "nope")).toBe(s);
  });

  it("상태 알림은 같은 값이면 같은 객체를 돌려주고, dirty·DRAFT 탭의 세트를 모은다", () => {
    let s = loaded(openInActive(initialTabs(), "S1"), "t1", "S1");
    expect(withStatus(s, "t1", status("S1"))).toBe(s);
    expect(withStatus(s, "nope", status("S9"))).toBe(s);
    expect(withStatus(s, "t1", status("S1", { ver: "2.000" }))).not.toBe(s);
    s = openLinked(s, "S2").state;
    s = loaded(s, s.active, "S2", { draft: true });
    s = openLinked(s, "S3").state;
    s = loaded(s, s.active, "S3");
    const d = withStatus(s, "t1", status("S1", { dirty: true }));
    expect([...dirtySetIds(d)]).toEqual(["S1"]);
    expect([...unconfirmedSetIds(d)].sort()).toEqual(["S1", "S2"]);
    expect(unconfirmedSetIds(s).has("S3")).toBe(false);
  });

  // --- 불러오기 실패한 탭(ui:7 후속) — 요청만 있고 처리가 끝났는데 불러온 세트가 없으면 빈 탭이다 ---
  const failed = (s: TabsState, key: string): TabsState => {
    const seq = s.tabs.find((t) => t.key === key)!.request!.seq;
    return withStatus(s, key, { setId: null, setName: null, ver: null, dirty: false, draft: false, settledSeq: seq });
  };

  it("요청만 있고 아직 처리 중인 탭은 그 세트를 연 탭이다(불러오는 중)", () => {
    const s = openInActive(initialTabs(), "S1");
    expect(currentOf(s.tabs[0])).toBe("S1");
    expect(s.tabs[0].settledSeq).toBeNull();
    // 이전 요청의 처리 번호로는 지금 요청이 끝난 것으로 보지 않는다
    const stale = withStatus(s, "t1", { setId: null, setName: null, ver: null, dirty: false, draft: false, settledSeq: s.tabs[0].request!.seq - 1 });
    expect(currentOf(stale.tabs[0])).toBe("S1");
  });

  it("불러오기에 실패한 탭은 그 세트를 연 탭이 아니고 빈 탭이다", () => {
    const s = failed(openInActive(initialTabs(), "S1"), "t1");
    expect(currentOf(s.tabs[0])).toBeNull();
    // 같은 값을 다시 알려도 같은 객체
    expect(failed(s, "t1")).toBe(s);
    // 포털 파라미터는 세트 없는 탭 하나뿐일 때 그 탭을 다시 쓴다 — 새 탭을 열지 않는다
    const again = openFromParams(s, "S1");
    expect(again.state.tabs).toHaveLength(1);
    expect(again.state.tabs[0].request).toMatchObject({ setId: "S1" });
    expect(again.state.tabs[0].request!.seq).toBeGreaterThan(s.tabs[0].request!.seq);
    expect(currentOf(again.state.tabs[0])).toBe("S1"); // 새 요청은 다시 불러오는 중
  });

  it("실패한 탭은 링크·고르기·포털 파라미터가 '열린 탭' 으로 찾지 않는다(그 탭으로 가 놓고 다시 불러오지 않는 일이 없다)", () => {
    let s = loaded(openInActive(initialTabs(), "S1"), "t1", "S1");
    s = openLinked(s, "S2").state;
    const k2 = s.active;
    s = failed(s, k2); // S2 탭은 못 불러옴
    // 링크는 새 탭을 연다(실패한 탭으로 가지 않는다)
    const linked = openLinked(s, "S2");
    expect(linked.state.tabs).toHaveLength(3);
    expect(linked.state.tabs.filter((t) => t.request?.setId === "S2" && currentOf(t) === "S2")).toHaveLength(1);
    // 고르기도 실패한 탭을 '다른 탭에 열린 세트' 로 보지 않아 시작한 탭에서 연다
    const picked = pickInTab(selectTab(s, "t1"), "t1", "S2");
    expect(picked.state.active).toBe("t1");
    expect(picked.state.tabs[0].request).toMatchObject({ setId: "S2" });
  });

  it("불러온 세트가 있으면 그 세트가 먼저다 — 다음 요청이 실패해도 탭은 불러온 세트를 연 탭이다", () => {
    let s = loaded(openInActive(initialTabs(), "S1"), "t1", "S1");
    s = openInActive(s, "S2"); // 이 탭에서 S2 를 열려 했다
    expect(currentOf(s.tabs[0])).toBe("S1");
    s = withStatus(s, "t1", status("S1", { settledSeq: s.tabs[0].request!.seq })); // 실패 — 그대로 S1
    expect(currentOf(s.tabs[0])).toBe("S1");
  });

  it("처리 번호가 바뀌면 상태 알림이 새 탭 객체를 만든다", () => {
    const s = openInActive(initialTabs(), "S1");
    expect(withStatus(s, "t1", { ...status("S1"), setId: null, settledSeq: null })).not.toBe(s); // 세트 이름 등이 달라 바뀜
    const same = withStatus(s, "t1", { setId: null, setName: null, ver: null, dirty: false, draft: false });
    expect(same).toBe(s); // 생략한 settledSeq 는 null 과 같다
    expect(withStatus(s, "t1", { setId: null, setName: null, ver: null, dirty: false, draft: false, settledSeq: 2 })).not.toBe(s);
  });
});
