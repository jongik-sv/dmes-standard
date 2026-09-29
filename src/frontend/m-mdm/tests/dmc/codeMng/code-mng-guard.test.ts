/** @vitest-environment happy-dom */

// 2026-09-28 codeMng 검토 결함 회귀 — 목록 강조와 상세·쓰기 대상의 정합(결함 1: 조회 실패·응답 순서 뒤바뀜·쓰기 중 행
// 클릭), 삭제 중 선택 변경(2), 등록 뒤 busy(3), 적용된 조회 조건(4), snapshot(5), 등록 [취소](6), 그리고 버튼 권한이
// OBJECT 이름(codeMng·codeEdit)으로 갈리는지(8a)와 넘기기 끄기 표시(8b). 서버 응답은 키(`{action}:{maruCodeId}`)별로
// 잡아 두었다가(`hold`) 원하는 순서로 풀어(`release`) 경합을 재현한다.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { HANDOVER_AVAILABLE, HANDOVER_PENDING_TEXT, openMdmPage, takeMdmPageParams } from "@/shell";
import CodeMngPage from "../../../pages/dmc/codeMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const WILDCARD = [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }];
const GUIDE = "목록에서 마루 코드를 고르거나";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
const calls: { svc: string; action: string; params: Record<string, unknown> }[] = [];
let rbacRows: Record<string, string>[] = WILDCARD;
let viewFail = new Set<string>();
let saveFail = new Map<string, string>();
let viewFlags: Record<string, Record<string, unknown>> = {};
const gates = new Map<string, () => void>();
const waiting = new Map<string, Promise<void>>();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function listRow(id: string) {
  return {
    maruCodeId: id, maruCodeName: `${id} 이름`, sourceKind: "MDM", status: "CREATED", storedStatus: "CREATED",
    currentVer: null, currentVerLabel: "미확정", pending: true, unappliedLabel: "v1.000 DRAFT", unappliedCount: 1,
  };
}

function viewOf(id: string) {
  return {
    header: {
      maruCodeId: id, maruCodeName: `${id} 이름`, description: null, lvlCnt: 0, sourceKind: "MDM",
      status: "CREATED", storedStatus: "CREATED", auditVer: 0, currentVerLabel: "미확정", unappliedLabel: "v1.000 DRAFT",
    },
    versions: [
      { ver: "1.000", verLabel: "v1.000", verKind: "MAJOR", status: "DRAFT", ownerId: "tester", applyFrom: null,
        applyTo: null, releasedAt: null, restoredFrom: null, restoredLabel: null, rowVersion: 0, unapplied: true,
        description: null },
    ],
    flags: { unappliedCount: 1, canNewMajor: false, canNewMinor: false, nextMajor: "2.000", nextMinor: "1.001",
      minorLimit: false, canDeprecate: false, editable: true, ...(viewFlags[id] ?? {}) },
    restoreSources: [],
    me: "tester",
    steward: true,
  };
}

const ok = (result: unknown) => jsonResponse({ meta: { success: true }, data: { result } });

/** 이 키의 다음 서버 응답을 release(key) 할 때까지 잡아 둔다. */
function hold(key: string) {
  waiting.set(key, new Promise<void>((resolve) => gates.set(key, resolve)));
}

async function release(key: string) {
  const open = gates.get(key);
  expect(open, `held ${key}`).toBeTruthy();
  gates.delete(key);
  await act(async () => {
    open!();
  });
  await flush();
  await flush();
}

function visibleText(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
    else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName;
      if (tag === "STYLE" || tag === "SCRIPT") continue;
      out += visibleText(node as Element);
    }
  }
  return out;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function render(props: Record<string, unknown> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(CodeMngPage, { tabId: "t1", snapshot: null, onSnapshotChange: () => {}, ...props })));
  });
  await flush();
  await flush();
}

function byTestId(id: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${id}"]`);
}

const headerId = () => byTestId("header-code-id")?.textContent ?? null;
const button = (id: string) => byTestId(id) as HTMLButtonElement;

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
}

async function typeInto(testId: string, value: string) {
  const el = byTestId(testId) as HTMLInputElement;
  expect(el, testId).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function gridRow(id: string) {
  return Array.from(document.body.querySelectorAll('[data-testid="code-list"] .ag-row')).find((r) =>
    r.querySelector('.ag-cell[col-id="maruCodeId"]')?.textContent === id);
}

async function clickRow(id: string) {
  const row = gridRow(id);
  expect(row, `row ${id}`).toBeTruthy();
  await act(async () => {
    row!.querySelector(".ag-cell")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
  await flush();
}

const highlighted = () =>
  Array.from(document.body.querySelectorAll('[data-testid="code-list"] .ag-row-highlighted'))
    .map((r) => r.querySelector('.ag-cell[col-id="maruCodeId"]')?.textContent);

function pageButton(label: string) {
  return Array.from(container.querySelectorAll(".page-layout__header-buttons button")).find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement | undefined;
}

async function confirmDialog() {
  await click(Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "확인"));
}

const actions = (name: string) => calls.filter((c) => c.action === name);

describe("codeMng — 선택·응답 정합과 권한(검토 결함 회귀)", () => {
  beforeEach(() => {
    calls.length = 0;
    rbacRows = WILDCARD;
    viewFail = new Set();
    saveFail = new Map();
    viewFlags = {};
    gates.clear();
    waiting.clear();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const params = (body.params ?? {}) as Record<string, unknown>;
      const m = url.match(/\/oasis\/(codeEdit|codeMng)\/(\w+)/);
      if (m) {
        const [, svc, action] = m;
        calls.push({ svc, action, params });
        const key = `${action}:${String(params.maruCodeId ?? "")}`;
        const gate = waiting.get(key);
        if (gate) {
          waiting.delete(key);
          await gate;
        }
        const id = String(params.maruCodeId ?? "");
        if (svc === "codeMng") {
          if (action === "search") return ok({ rows: [listRow("PROC_A"), listRow("PROC_B")] });
          if (action === "reg") return ok({ maruCodeId: id, ver: "1.000", rowVersion: 0, ownerId: "tester" });
          return ok({});
        }
        if (action === "view" && viewFail.has(id)) {
          return jsonResponse({ meta: { success: false, message: `${id} 코드가 없습니다` } });
        }
        if (action === "save" && saveFail.has(id)) return jsonResponse({ meta: { success: false, message: saveFail.get(id) } });
        if (action === "delete" && params.target === "CODE") return ok({ deleted: "CODE", maruCodeId: id });
        return ok(viewOf(id));
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({ grids: { buttons: { rows: rbacRows.map((r) => ({ endpoint: "*", httpMethod: "*", ...r })) } } });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    takeMdmPageParams("dmc/codeMng");
  });

  afterEach(async () => {
    for (const open of gates.values()) open();
    // 토스트 저장소는 테스트 사이에 남는다(표시 한도 3) — 닫아 두지 않으면 다음 테스트의 토스트가 줄에 밀려 안 보이고,
    // 앞 테스트의 같은 문구가 남아 단언을 거짓으로 통과시킨다.
    for (let i = 0; i < 10; i++) {
      const closers = Array.from(document.body.querySelectorAll(".mantine-Notification-closeButton")) as HTMLElement[];
      if (closers.length === 0) break;
      await act(async () => {
        closers.forEach((b) => b.click());
      });
      await flush();
    }
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    document.body.innerHTML = "";
  });

  // ── 결함 1 ──

  it("B 조회가 실패하면 오류를 닫은 뒤 선택이 비고, A 의 상세·쓰기 버튼이 남지 않는다", async () => {
    const snapshots: unknown[] = [];
    await render({ onSnapshotChange: (s: unknown) => snapshots.push(s) });
    await clickRow("PROC_A");
    expect(headerId()).toBe("PROC_A");

    viewFail.add("PROC_B");
    await clickRow("PROC_B");
    expect(visibleText(document.body)).toContain("PROC_B 코드가 없습니다");
    await confirmDialog();

    expect(headerId()).toBeNull();
    expect(byTestId("header-save")).toBeNull();
    expect(byTestId("version-list")).toBeNull();
    expect(visibleText(container)).toContain(GUIDE);
    expect(highlighted()).toEqual([]);
    expect(snapshots.at(-1)).toEqual({});
    expect(actions("save")).toHaveLength(0);
  });

  it("A→B 를 빠르게 누르고 A 응답이 늦게 와도 상세와 쓰기는 B 로 간다", async () => {
    await render();
    hold("view:PROC_A");
    hold("view:PROC_B");
    await clickRow("PROC_A");
    await clickRow("PROC_B");
    // 처음 고른 코드는 비교할 이전 상세가 없어 로딩을 보인다.
    expect(byTestId("detail-loading")).toBeTruthy();
    expect(highlighted()).toEqual(["PROC_B"]);

    await release("view:PROC_B");
    expect(headerId()).toBe("PROC_B");
    // A 조회가 아직 진행 중이라 쓰기 버튼은 꺼져 있다(먼저 끝난 요청이 busy 를 풀지 않는다).
    expect(button("header-save").disabled).toBe(true);

    await release("view:PROC_A");
    expect(headerId()).toBe("PROC_B");
    expect(highlighted()).toEqual(["PROC_B"]);
    expect(button("header-save").disabled).toBe(false);

    await typeInto("header-name", "B 새 이름");
    await click(byTestId("header-save"));
    expect(actions("save").map((c) => c.params.maruCodeId)).toEqual(["PROC_B"]);
  });

  it("A 를 보다가 B 를 고르면 상세를 지웠다 다시 그리지 않고, B 가 올 때까지 A 를 잠근 채 둔다(깜빡임 방지)", async () => {
    const snapshots: unknown[] = [];
    await render({ onSnapshotChange: (s: unknown) => snapshots.push(s) });
    await clickRow("PROC_A");
    const headerCell = byTestId("header-code-id");
    const versionList = byTestId("version-list");
    expect(headerCell?.textContent).toBe("PROC_A");

    hold("view:PROC_B");
    await clickRow("PROC_B");
    expect(highlighted()).toEqual(["PROC_B"]);
    expect(byTestId("detail-loading")).toBeNull();
    expect(byTestId("detail-stale")).toBeTruthy();
    expect(headerId()).toBe("PROC_A");
    // 이전 코드(A) 상세가 보이는 동안에는 어떤 쓰기도, 버전 선택도 A 로 가지 않는다.
    expect(button("header-save").disabled).toBe(true);
    expect((byTestId("header-name") as HTMLInputElement).disabled).toBe(true);
    await click(byTestId("version-row-1.000"));
    expect(byTestId("version-row-1.000")?.getAttribute("aria-selected")).toBe("false");
    expect(snapshots.at(-1)).toEqual({ maruCodeId: "PROC_B" });

    await release("view:PROC_B");
    expect(byTestId("detail-stale")).toBeNull();
    expect(headerId()).toBe("PROC_B");
    // 같은 DOM 을 고쳐 쓴다 — 상세 트리를 버리고 새로 만들지 않는다.
    expect(byTestId("header-code-id")).toBe(headerCell);
    expect(byTestId("version-list")).toBe(versionList);
    expect(button("header-save").disabled).toBe(false);
  });

  it("A 저장 중에 B 를 눌러도 선택을 바꾸지 않고, 저장 결과는 A 위에 보인다", async () => {
    await render();
    await clickRow("PROC_A");
    hold("save:PROC_A");
    await click(byTestId("header-save"));
    await clickRow("PROC_B");
    expect(actions("view").map((c) => c.params.maruCodeId)).toEqual(["PROC_A"]);
    expect(highlighted()).toEqual(["PROC_A"]);

    expect(visibleText(document.body)).not.toContain("저장했습니다");
    await release("save:PROC_A");
    expect(visibleText(document.body)).toContain("저장했습니다");
    expect(headerId()).toBe("PROC_A");
    expect(button("header-save").disabled).toBe(false);
  });

  async function handOffTo(id: string) {
    openMdmPage("dmc/codeMng", { maruCodeId: id });
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId: "t1" } }));
    });
    await flush();
    await flush();
  }

  it("A 저장 중 handoff 로 B 를 고르면 늦게 온 A 저장 응답이 B 화면을 덮지 않고, 다음 쓰기는 B 로 간다", async () => {
    await render();
    await clickRow("PROC_A");
    hold("save:PROC_A");
    await click(byTestId("header-save"));
    await handOffTo("PROC_B");
    expect(headerId()).toBe("PROC_B");
    expect(visibleText(document.body)).not.toContain("저장했습니다");

    await release("save:PROC_A");
    expect(visibleText(document.body)).toContain("저장했습니다");
    expect(headerId()).toBe("PROC_B");
    expect((byTestId("header-name") as HTMLInputElement).value).toBe("PROC_B 이름");
    expect(highlighted()).toEqual(["PROC_B"]);

    await click(byTestId("header-save"));
    expect(actions("save").map((c) => c.params.maruCodeId)).toEqual(["PROC_A", "PROC_B"]);
  });

  it("A 저장이 handoff 뒤에 충돌로 실패하면 오류는 보이되 닫아도 B 를 다시 부르지 않는다", async () => {
    saveFail.set("PROC_A", "다른 사용자가 수정했습니다. 다시 불러오세요");
    await render();
    await clickRow("PROC_A");
    hold("save:PROC_A");
    await click(byTestId("header-save"));
    await handOffTo("PROC_B");
    await release("save:PROC_A");
    expect(visibleText(document.body)).toContain("다른 사용자가 수정했습니다");

    const viewsBefore = actions("view").length;
    await confirmDialog();
    await flush();
    expect(actions("view")).toHaveLength(viewsBefore);
    expect(headerId()).toBe("PROC_B");
  });

  // ── 결함 2 ──

  it("코드 삭제 중 handoff 로 B 를 고르면 삭제가 끝난 뒤에도 B 선택이 남는다", async () => {
    viewFlags.PROC_A = { neverReleased: true, canDeleteCode: true };
    await render();
    await clickRow("PROC_A");
    hold("delete:PROC_A");
    await click(byTestId("header-delete-code"));
    await confirmDialog();

    openMdmPage("dmc/codeMng", { maruCodeId: "PROC_B" });
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId: "t1" } }));
    });
    await flush();
    expect(headerId()).toBe("PROC_B");

    expect(visibleText(document.body)).not.toContain("삭제했습니다");
    await release("delete:PROC_A");
    expect(actions("delete")[0].params).toMatchObject({ maruCodeId: "PROC_A", target: "CODE" });
    expect(visibleText(document.body)).toContain("삭제했습니다");
    expect(headerId()).toBe("PROC_B");
    expect(highlighted()).toEqual(["PROC_B"]);
  });

  // ── 결함 3 ──

  it("등록 뒤 새 코드의 상세가 올 때까지 안내 문구 대신 로딩을 보이고 버튼을 잠근다", async () => {
    await render();
    await click(pageButton("신규"));
    await typeInto("code-reg-id", "NEW_CD");
    await typeInto("code-reg-name", "새 코드");
    hold("view:NEW_CD");
    await click(byTestId("code-reg-save"));

    expect(actions("reg")).toHaveLength(1);
    expect(visibleText(container)).not.toContain(GUIDE);
    expect(byTestId("detail-loading")).toBeTruthy();
    expect(pageButton("신규")!.disabled).toBe(true);

    await release("view:NEW_CD");
    expect(headerId()).toBe("NEW_CD");
    expect(pageButton("신규")!.disabled).toBe(false);
  });

  // ── 결함 4 ──

  it("액션 뒤 목록 재조회는 입력만 한 검색어가 아니라 마지막으로 조회한 조건을 쓴다", async () => {
    await render();
    await clickRow("PROC_A");
    await typeInto("code-search-keyword", "PROC");
    await click(pageButton("조회"));
    await typeInto("code-search-keyword", "입력만");
    await click(byTestId("header-save"));
    expect(actions("save")).toHaveLength(1);
    expect(actions("search").at(-1)!.params.keyword).toBe("PROC");
  });

  // ── 결함 5 ──

  it("snapshot 의 코드가 없어졌으면 오류를 한 번 띄우고 snapshot 의 maruCodeId·ver 를 지운다", async () => {
    viewFail.add("GONE");
    const snapshots: unknown[] = [];
    await render({ snapshot: { maruCodeId: "GONE", ver: "1.000", other: 1 }, onSnapshotChange: (s: unknown) => snapshots.push(s) });
    expect(document.body.querySelectorAll(".error-modal__body")).toHaveLength(1);
    expect(snapshots.at(-1)).toEqual({ other: 1 });
    await confirmDialog();
    expect(actions("view")).toHaveLength(1);
    expect(visibleText(container)).toContain(GUIDE);
  });

  it("버전 카드에서 고른 ver 를 snapshot 에 남긴다", async () => {
    const snapshots: unknown[] = [];
    await render({ onSnapshotChange: (s: unknown) => snapshots.push(s) });
    await clickRow("PROC_A");
    expect(snapshots.at(-1)).toEqual({ maruCodeId: "PROC_A" });
    await click(byTestId("version-row-1.000"));
    expect(snapshots.at(-1)).toEqual({ maruCodeId: "PROC_A", ver: "1.000" });
  });

  // ── 결함 6 ──

  it("등록 폼 [취소] 는 [신규] 전 선택(버전 포함)으로 돌아간다", async () => {
    await render();
    await clickRow("PROC_A");
    await click(byTestId("version-row-1.000"));
    await click(pageButton("신규"));
    expect(byTestId("code-reg-id")).toBeTruthy();

    await click(byTestId("code-reg-cancel"));
    await flush();
    expect(byTestId("code-reg-id")).toBeNull();
    expect(headerId()).toBe("PROC_A");
    expect(byTestId("version-row-1.000")?.getAttribute("aria-selected")).toBe("true");
  });

  it("고른 코드 없이 [신규] 를 열었으면 [취소] 는 안내로 돌아간다", async () => {
    await render();
    await click(pageButton("신규"));
    await typeInto("code-reg-id", "DRAFT_ONLY");
    await click(byTestId("code-reg-cancel"));
    expect(byTestId("code-reg-id")).toBeNull();
    expect(visibleText(container)).toContain(GUIDE);
    expect(actions("reg")).toHaveLength(0);

    await click(pageButton("신규"));
    expect((byTestId("code-reg-id") as HTMLInputElement).value).toBe("");
  });

  // ── 8(a) 권한은 OBJECT 이름으로 판정한다 ──

  it("codeMng reg 권한만 있으면 [신규]·등록은 되고 상세 쓰기 버튼은 꺼진다", async () => {
    rbacRows = [{ objId: "codeMng", action: "search" }, { objId: "codeMng", action: "reg" }];
    await render({ snapshot: { maruCodeId: "PROC_A" } });
    // RBAC 로딩 중에는 모든 버튼이 꺼지므로, [신규] 가 켜진 것(= 로딩 끝)을 먼저 확인한다.
    await vi.waitFor(() => expect(pageButton("신규")?.disabled).toBe(false));
    expect(headerId()).toBe("PROC_A");
    await click(byTestId("version-row-1.000"));
    expect(button("header-save").disabled).toBe(true);
    expect(button("ver-unlock").disabled).toBe(true);
    expect(button("ver-delete").disabled).toBe(true);

    await click(pageButton("신규"));
    expect(button("code-reg-save").disabled).toBe(false);
  });

  it("codeEdit 권한만 있으면 상세 쓰기 버튼은 켜지고 [신규] 는 보이지 않는다", async () => {
    rbacRows = [
      { objId: "codeEdit", action: "save" },
      { objId: "codeEdit", action: "unlock" },
      { objId: "codeEdit", action: "delete" },
    ];
    await render({ snapshot: { maruCodeId: "PROC_A" } });
    await vi.waitFor(() => expect(button("header-save")?.disabled).toBe(false));
    await click(byTestId("version-row-1.000"));
    expect(button("ver-unlock").disabled).toBe(false);
    expect(button("ver-delete").disabled).toBe(false);
    expect(pageButton("신규")).toBeUndefined();
  });

  // ── 8(b) 넘기기 끄기 표시 ──

  it("넘기기는 매트릭스상 켜질 버전(내 DRAFT·미적용 1개)을 골라도 꺼진 채 준비 중 안내를 보인다", async () => {
    expect(HANDOVER_AVAILABLE).toBe(false);
    await render({ snapshot: { maruCodeId: "PROC_A" } });
    await click(byTestId("version-row-1.000"));
    // 같은 조건의 [해제] 는 켜진다 — 넘기기가 꺼진 까닭이 매트릭스·권한이 아니라 HANDOVER_AVAILABLE 임을 보인다.
    expect(button("ver-unlock").disabled).toBe(false);
    const handover = button("ver-handover");
    expect(handover.disabled).toBe(true);
    expect(handover.textContent).toBe("넘기기(준비 중)");
    expect(byTestId("ver-handover-wrap")?.getAttribute("title")).toBe(HANDOVER_PENDING_TEXT);
  });
});
