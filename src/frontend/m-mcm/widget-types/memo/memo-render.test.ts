/** @vitest-environment happy-dom */
/**
 * 메모장 렌더러·편집기 동작 시험(스펙 2026-10-02-widget-admin-generic §17.4).
 * - 서버 호출(./api)과 shared 의 폼 부품·위젯 틀 훅은 대역으로 바꾼다. 형식별 보기(NoticeBodyView)는 실물을 쓴다 —
 *   html 정화(script·onclick·style 제거)와 text 줄바꿈을 실제 DOM 으로 확인한다(shared dist 가 필요하다).
 * - md 편집기(shared MarkdownField)도 대역(textarea)이다 — Tiptap·서식/MD 전환은 shared markdown-editor 시험이 맡고, 여기서는
 *   렌더러가 넘기는 값(editable·fill·modeStorageKey)·key 로 새로 그리는지(마운트 번호)·잠금·저장 흐름만 본다.
 * - JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetBoardModeContext, type WidgetBoardMode } from "@/lib/widget-board-mode";

import { MEMO_MD_MODE_STORAGE_KEY, MemoServiceError, type MemoRecord } from "./memo-model";

const h = vi.hoisted(() => ({
  fetchMemo: vi.fn(),
  saveMemo: vi.fn(),
  setStatus: vi.fn(),
  /** MarkdownField 대역이 마운트될 때마다 올리는 번호 — key 로 새로 그렸는지 본다. */
  mdMounts: 0,
}));

vi.mock("./api", () => ({ fetchMemo: h.fetchMemo, saveMemo: h.saveMemo }));

vi.mock("@dk-oasis/shared/widget", () => ({ useWidgetStatus: () => h.setStatus }));

vi.mock("@dk-oasis/shared/form", async () => {
  const { createElement: el } = await import("react");
  return {
    Button: (p: { children?: unknown; onClick?: () => void; disabled?: boolean; "data-testid"?: string; variant?: string }) =>
      el("button", { type: "button", onClick: p.onClick, disabled: p.disabled, "data-testid": p["data-testid"], "data-variant": p.variant }, p.children as never),
    Select: (p: {
      value?: string;
      onChange?: (v: string) => void;
      options?: { value: string; label: string }[];
      placeholder?: string;
      disabled?: boolean;
      "data-testid"?: string;
      "aria-label"?: string;
    }) =>
      el(
        "select",
        {
          value: p.value,
          disabled: p.disabled,
          "data-testid": p["data-testid"],
          "aria-label": p["aria-label"],
          onChange: (e: { currentTarget: { value: string } }) => p.onChange?.(e.currentTarget.value),
        },
        [...(p.placeholder ? [{ value: "", label: p.placeholder }] : []), ...(p.options ?? [])].map((o) =>
          el("option", { key: o.value, value: o.value }, o.label)
        )
      ),
    Textarea: (p: {
      value?: string;
      onChange?: (v: string) => void;
      readOnly?: boolean;
      "data-testid"?: string;
      "aria-label"?: string;
    }) =>
      el("textarea", {
        value: p.value,
        readOnly: p.readOnly,
        "data-testid": p["data-testid"],
        "aria-label": p["aria-label"],
        onChange: (e: { currentTarget: { value: string } }) => p.onChange?.(e.currentTarget.value),
      }),
    FormGroup: (p: { label?: string; children?: unknown }) => el("div", { "data-group": p.label }, p.children as never),
  };
});

vi.mock("@dk-oasis/shared/markdown-editor", async () => {
  const { createElement: el, useState } = await import("react");
  return {
    MarkdownField: function MarkdownFieldDouble(p: {
      value?: string;
      onChange?: (v: string) => void;
      testId?: string;
      editable?: boolean;
      fill?: boolean;
      modeStorageKey?: string;
      ariaLabel?: string;
    }) {
      const [mount] = useState(() => ++h.mdMounts);
      return el("textarea", {
        value: p.value,
        "data-testid": p.testId,
        "data-editable": String(!!p.editable),
        "data-fill": String(!!p.fill),
        "data-mode-key": p.modeStorageKey ?? "",
        "data-mount": String(mount),
        "aria-label": p.ariaLabel,
        onChange: (e: { currentTarget: { value: string } }) => p.onChange?.(e.currentTarget.value),
      });
    },
  };
});

// 대역을 건 뒤에 읽는다(vi.mock 은 import 보다 먼저 올라가므로 정적 import 여도 대역이 적용되지만, 순서를 눈에 보이게 둔다).
const { default: MemoRenderer } = await import("./renderer");
const { default: MemoTypeEditor } = await import("./editor");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let unmounted = false;

/** 시험 안에서 먼저 내리는 경우(afterEach 가 한 번 더 내리지 않게 표시한다). */
function unmount() {
  if (unmounted) return;
  unmounted = true;
  act(() => root.unmount());
}

/** 직접 풀 수 있는 약속 — 「응답이 늦게 온다」를 순서대로 재현한다. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  unmounted = false;
  h.fetchMemo.mockReset();
  h.saveMemo.mockReset();
  h.setStatus.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  unmount();
  container.remove();
});

const q = (testId: string) => container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const must = (testId: string) => {
  const found = q(testId);
  if (!found) throw new Error(`[data-testid="${testId}"] 가 없습니다. 지금 화면: ${container.innerHTML.slice(0, 400)}`);
  return found;
};

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function click(testId: string) {
  await act(async () => {
    must(testId).click();
  });
  await flush();
}

async function typeInto(testId: string, text: string) {
  const el = must(testId) as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function choose(testId: string, value: string) {
  const el = must(testId) as HTMLSelectElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const record = (over: Partial<MemoRecord> = {}): MemoRecord => ({
  instId: "inst-1",
  defId: "def.abc12345",
  format: "text",
  content: "저장된 메모",
  updatedAt: "2026-10-03T10:00:00",
  ...over,
});

interface RenderProps {
  definition?: unknown;
  widgetId?: string;
  instanceId?: string;
  refreshKey?: number;
  /** 보드 성격 맥락 — 주면 그 값의 provider 안에서 그린다(위젯관리 [기본 배치] 보드는 "preview"). 안 주면 provider 밖(홈)이다. */
  boardMode?: WidgetBoardMode;
}

async function renderWidget(p: RenderProps = {}) {
  const props = {
    instanceId: p.instanceId ?? "inst-1",
    widgetId: p.widgetId ?? "def.abc12345",
    definition: p.definition ?? { scope: "personal", format: "text", content: "" },
    refreshKey: p.refreshKey ?? 0,
    size: { w: 8, h: 10 },
    config: null,
  };
  const widget = createElement(MemoRenderer, props as never);
  await act(async () => {
    root.render(p.boardMode ? createElement(WidgetBoardModeContext.Provider, { value: p.boardMode }, widget) : widget);
  });
  await flush();
  return props;
}

describe("공용 메모 — 보기만", () => {
  const shared = (format: string, content: string) => ({ scope: "shared", format, content });

  it("text 는 줄바꿈을 유지하는 글로 보이고 서버를 부르지 않으며 [편집]이 없다", async () => {
    await renderWidget({ definition: shared("text", "첫 줄\n둘째 줄\n\n<b>태그</b>") });
    const body = container.querySelector(".nbv-text");
    expect(body).not.toBeNull();
    expect(body!.textContent).toBe("첫 줄\n둘째 줄\n\n<b>태그</b>"); // 줄바꿈은 그대로, 태그는 글자 그대로
    expect(body!.querySelector("b")).toBeNull();
    expect(q("memo-edit")).toBeNull();
    expect(h.fetchMemo).not.toHaveBeenCalled();
    expect(h.saveMemo).not.toHaveBeenCalled();
  });

  it("md 는 마크다운 보기로 그린다", async () => {
    await renderWidget({ definition: shared("md", "# 큰제목\n\n- 항목하나\n- 항목둘") });
    const view = must("widget-memo-shared");
    expect(view.getAttribute("data-format")).toBe("MD");
    expect(view.querySelector("h1")?.textContent).toBe("큰제목");
    expect(view.querySelectorAll("li")).toHaveLength(2);
  });

  // happy-dom 의 노드 순회는 지운 노드의 다음 형제를 건너뛰는 결함이 있어(실제 브라우저에는 없다, shared notice-body-view 시험과 같은 사정)
  // 지워지는 요소 뒤에 다른 요소를 두지 않고 따로 시험한다.
  it("html 은 정화해서 보인다 — onclick·on*·style 속성은 지우고 본문은 남긴다", async () => {
    await renderWidget({
      definition: shared("html", '<h3 onclick="steal()" style="color:red">제목</h3><p style="position:fixed" onmouseover="x()">본문</p>'),
    });
    const view = must("widget-memo-shared");
    expect(view.getAttribute("data-format")).toBe("HTML");
    expect(view.innerHTML).not.toMatch(/onclick|onmouseover|style=/i);
    expect(view.querySelector("h3")?.textContent).toBe("제목");
    expect(view.querySelector("p")?.textContent).toBe("본문");
  });

  it("html 은 정화해서 보인다 — script 는 지우고 실행하지 않는다", async () => {
    await renderWidget({ definition: shared("html", "<p>본문</p><script>window.__memoPwned = 1</script>") });
    const view = must("widget-memo-shared");
    expect(view.querySelector("script")).toBeNull();
    expect(view.querySelector("p")?.textContent).toBe("본문");
    expect((window as unknown as { __memoPwned?: number }).__memoPwned).toBeUndefined();
  });

  it("html 은 정화해서 보인다 — iframe 은 지운다(src 없이 시험: happy-dom 이 주소로 실제 접속하지 않게)", async () => {
    await renderWidget({ definition: shared("html", "<p>본문</p><iframe></iframe>") });
    const view = must("widget-memo-shared");
    expect(view.querySelector("iframe")).toBeNull();
    expect(view.querySelector("p")?.textContent).toBe("본문");
  });

  it("내용이 비면 「내용이 없습니다」", async () => {
    await renderWidget({ definition: shared("text", "  \n ") });
    expect(container.textContent).toContain("내용이 없습니다");
    expect(q("memo-edit")).toBeNull();
  });
});

describe("개인 메모 — load → 보기 → 편집 → 저장", () => {
  it("마운트 때 instanceId 로 load 하고 메모를 보기 모드로 보인다(저장 단추는 없다)", async () => {
    h.fetchMemo.mockResolvedValue(record({ content: "내 메모\n둘째 줄" }));
    await renderWidget();
    expect(h.fetchMemo).toHaveBeenCalledTimes(1);
    expect(h.fetchMemo).toHaveBeenCalledWith("inst-1");
    expect(must("widget-memo-body").textContent).toContain("내 메모");
    expect(must("memo-edit").hasAttribute("disabled")).toBe(false);
    expect(q("memo-save")).toBeNull();
    expect(q("memo-input")).toBeNull();
    expect(h.setStatus).toHaveBeenLastCalledWith({ kind: "ready" });
  });

  it("메모가 없으면 안내 문구를 보인다", async () => {
    h.fetchMemo.mockResolvedValue(null);
    await renderWidget();
    expect(must("memo-empty").textContent).toBe("메모가 없습니다. [편집]을 눌러 쓰세요");
  });

  it("[편집] → 입력칸·형식 선택·글자 수·[저장]·[취소] 가 나타나고, 쓴 글을 저장하면 서버 값으로 보기에 돌아온다", async () => {
    h.fetchMemo.mockResolvedValue(record({ format: "md", content: "처음 글" }));
    h.saveMemo.mockResolvedValue(record({ format: "html", content: "<p>새 글</p>" }));
    await renderWidget();

    await click("memo-edit");
    expect((must("memo-input-md") as HTMLTextAreaElement).value).toBe("처음 글"); // md 는 마크다운 편집기
    expect((must("memo-format") as HTMLSelectElement).value).toBe("md");
    expect(must("memo-count").textContent).toBe("4 / 20,000자");
    expect(must("memo-save")).toBeTruthy();
    expect(must("memo-cancel")).toBeTruthy();
    expect(q("memo-edit")).toBeNull();

    await typeInto("memo-input-md", "<p>새 글</p>");
    expect(must("memo-count").textContent).toBe("10 / 20,000자");
    await choose("memo-format", "html");
    expect((must("memo-input") as HTMLTextAreaElement).value).toBe("<p>새 글</p>"); // html 은 입력칸, 쓰던 글 그대로
    await click("memo-save");

    expect(h.saveMemo).toHaveBeenCalledTimes(1);
    expect(h.saveMemo).toHaveBeenCalledWith({ instId: "inst-1", defId: "def.abc12345", format: "html", content: "<p>새 글</p>" });
    expect(q("memo-input")).toBeNull(); // 보기로 돌아왔다
    expect(q("memo-input-md")).toBeNull();
    expect(must("widget-memo-body").getAttribute("data-format")).toBe("HTML");
    expect(must("widget-memo-body").textContent).toBe("새 글");
    expect(h.fetchMemo).toHaveBeenCalledTimes(1); // 저장 뒤 다시 읽지 않는다(서버가 돌려준 값을 쓴다)
  });

  it("메모가 없던 칸의 첫 편집은 정의의 형식으로 시작한다", async () => {
    h.fetchMemo.mockResolvedValue(null);
    await renderWidget({ definition: { scope: "personal", format: "md", content: "" } });
    await click("memo-edit");
    expect((must("memo-format") as HTMLSelectElement).value).toBe("md");
    expect((must("memo-input-md") as HTMLTextAreaElement).value).toBe("");
  });

  it("[취소] 는 쓰던 글을 버리고 저장하지 않은 채 보기로 돌아온다", async () => {
    h.fetchMemo.mockResolvedValue(record({ content: "원래 글" }));
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input", "고치다 만 글");
    await click("memo-cancel");
    expect(h.saveMemo).not.toHaveBeenCalled();
    expect(q("memo-input")).toBeNull();
    expect(must("widget-memo-body").textContent).toContain("원래 글");
    // 다시 편집하면 서버 값에서 시작한다
    await click("memo-edit");
    expect((must("memo-input") as HTMLTextAreaElement).value).toBe("원래 글");
  });

  it("저장이 실패하면 아래 [저장]·[취소] 줄의 왼쪽에 서버 문구를 보이고 쓰던 글·형식은 그대로 둔다", async () => {
    h.fetchMemo.mockResolvedValue(record());
    h.saveMemo.mockRejectedValue(new MemoServiceError("메모는 100개까지 저장할 수 있습니다"));
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input", "꼭 지켜야 할 글");
    await choose("memo-format", "md");
    await click("memo-save");

    expect(must("memo-error").textContent).toBe("메모는 100개까지 저장할 수 있습니다");
    expect(must("memo-error").getAttribute("role")).toBe("alert");
    expect((must("memo-input-md") as HTMLTextAreaElement).value).toBe("꼭 지켜야 할 글"); // md 로 바꿨으니 마크다운 편집기
    expect((must("memo-format") as HTMLSelectElement).value).toBe("md");
    expect(must("memo-save").hasAttribute("disabled")).toBe(false); // 다시 시도할 수 있다
    // 오류 문구는 입력칸 아래, [저장]·[취소] 줄 안에서 단추보다 앞(왼쪽)에 있다 — 입력칸 위에 두면 md 편집기가 줄지 못해 [저장] 줄이 밀려난다
    expect(must("memo-input-md").compareDocumentPosition(must("memo-error")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(must("memo-error").compareDocumentPosition(must("memo-save")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(must("memo-error").compareDocumentPosition(must("memo-cancel")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(must("memo-error").closest(".mcm-memo__bar")).toBe(must("memo-save").closest(".mcm-memo__bar"));
    // 틀의 error 로 알리지 않는다(틀이 본문을 숨겨 쓰던 글이 사라진다)
    expect(h.setStatus).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));
  });

  it("서버 문구가 없는 오류(네트워크 등)는 기본 저장 오류 문구로 보이고, 다시 저장하면 성공한다", async () => {
    h.fetchMemo.mockResolvedValue(null);
    h.saveMemo.mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValueOnce(record({ content: "썼다" }));
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input", "썼다");
    await click("memo-save");
    expect(must("memo-error").textContent).toBe("메모를 저장하지 못했습니다. 잠시 뒤 다시 시도하세요.");
    await click("memo-save");
    expect(q("memo-error")).toBeNull();
    expect(q("memo-input")).toBeNull();
    expect(must("widget-memo-body").textContent).toBe("썼다");
  });

  it("20,000자를 넘기면 글자 수가 경고 표시가 되고 [저장]을 막는다", async () => {
    h.fetchMemo.mockResolvedValue(null);
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input", "가".repeat(20000));
    expect(must("memo-save").hasAttribute("disabled")).toBe(false);
    await typeInto("memo-input", "가".repeat(20001));
    expect(must("memo-count").textContent).toBe("20,001 / 20,000자");
    expect(must("memo-count").className).toContain("mcm-memo__count--over");
    expect(must("memo-save").hasAttribute("disabled")).toBe(true);
    expect(h.saveMemo).not.toHaveBeenCalled();
  });

  it("불러오기에 실패하면 틀에 오류·다시 시도를 알리고, 다시 시도하면 다시 읽는다", async () => {
    h.fetchMemo.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(record({ content: "다시 읽음" }));
    await renderWidget();
    const errorCall = h.setStatus.mock.calls.map((c) => c[0]).find((s) => s.kind === "error");
    expect(errorCall).toMatchObject({ kind: "error", message: "메모를 불러오지 못했습니다." });
    await act(async () => {
      errorCall.retry();
    });
    await flush();
    expect(h.fetchMemo).toHaveBeenCalledTimes(2);
    expect(must("widget-memo-body").textContent).toContain("다시 읽음");
  });

  it("새로 고침 신호는 보기에서는 다시 읽지만 편집 중에는 읽지 않는다(쓰던 글 보호)", async () => {
    h.fetchMemo.mockResolvedValue(record());
    const props = await renderWidget();
    expect(h.fetchMemo).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(createElement(MemoRenderer, { ...props, refreshKey: 1 } as never));
    });
    await flush();
    expect(h.fetchMemo).toHaveBeenCalledTimes(2);

    await click("memo-edit");
    await typeInto("memo-input", "쓰는 중");
    await act(async () => {
      root.render(createElement(MemoRenderer, { ...props, refreshKey: 2 } as never));
    });
    await flush();
    expect(h.fetchMemo).toHaveBeenCalledTimes(2);
    expect((must("memo-input") as HTMLTextAreaElement).value).toBe("쓰는 중");
  });

  it("새로 고침 재조회 중에 저장해도 틀이 「불러오는 중」에 갇히지 않고, 늦게 온 응답은 저장값을 덮지 못한다", async () => {
    const late = deferred<MemoRecord | null>();
    h.fetchMemo.mockResolvedValueOnce(record({ content: "처음 글" })).mockReturnValueOnce(late.promise);
    h.saveMemo.mockResolvedValue(record({ content: "저장값" }));
    const props = await renderWidget();

    // 새로 고침 신호로 재조회가 시작되고 아직 끝나지 않았다 — 처음 불러온 뒤라 [편집]은 켜져 있다.
    await act(async () => {
      root.render(createElement(MemoRenderer, { ...props, refreshKey: 1 } as never));
    });
    await flush();
    expect(h.fetchMemo).toHaveBeenCalledTimes(2);
    expect(h.setStatus).toHaveBeenLastCalledWith({ kind: "loading" });
    expect(must("memo-edit").hasAttribute("disabled")).toBe(false);

    // 재조회가 끝나기 전에 편집해 저장한다.
    await click("memo-edit");
    await typeInto("memo-input", "저장값");
    await click("memo-save");
    expect(must("widget-memo-body").textContent).toBe("저장값");
    expect(h.setStatus).toHaveBeenLastCalledWith({ kind: "ready" });

    // 늦은 응답이 도착해도 보기는 저장값이고 틀은 다시 「불러오는 중」이 되지 않는다.
    await act(async () => {
      late.resolve(record({ content: "늦게 온 옛 글" }));
    });
    await flush();
    expect(must("widget-memo-body").textContent).toBe("저장값");
    expect(h.setStatus).toHaveBeenLastCalledWith({ kind: "ready" });
    expect(h.setStatus.mock.calls.filter(([s]) => s.kind === "loading")).toHaveLength(2); // 처음 읽기 + 새로 고침
  });

  describe("언마운트 뒤에 늦게 온 응답은 상태를 쓰지 않는다", () => {
    let consoleError: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      consoleError.mockRestore();
    });

    it("load 성공", async () => {
      const late = deferred<MemoRecord | null>();
      h.fetchMemo.mockReturnValueOnce(late.promise);
      await renderWidget();
      expect(h.setStatus).toHaveBeenLastCalledWith({ kind: "loading" });
      const before = h.setStatus.mock.calls.length;
      unmount();
      await act(async () => {
        late.resolve(record());
      });
      await flush();
      expect(h.setStatus).toHaveBeenCalledTimes(before); // 「ready」도 쓰지 않는다
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("load 실패", async () => {
      const late = deferred<MemoRecord | null>();
      h.fetchMemo.mockReturnValueOnce(late.promise);
      await renderWidget();
      const before = h.setStatus.mock.calls.length;
      unmount();
      await act(async () => {
        late.reject(new Error("boom"));
      });
      await flush();
      expect(h.setStatus).toHaveBeenCalledTimes(before); // 오류 상태·다시 시도를 틀에 알리지 않는다
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("save 성공·실패", async () => {
      const lateSave = deferred<MemoRecord>();
      h.fetchMemo.mockResolvedValue(record());
      h.saveMemo.mockReturnValueOnce(lateSave.promise);
      await renderWidget();
      await click("memo-edit");
      await typeInto("memo-input", "저장하다 닫음");
      await click("memo-save"); // 응답을 기다리는 중
      expect(h.saveMemo).toHaveBeenCalledTimes(1);
      const before = h.setStatus.mock.calls.length;
      unmount();
      await act(async () => {
        lateSave.resolve(record({ content: "저장하다 닫음" }));
      });
      await flush();
      expect(h.setStatus).toHaveBeenCalledTimes(before);
      expect(h.fetchMemo).toHaveBeenCalledTimes(1);
      expect(consoleError).not.toHaveBeenCalled();
    });
  });
});

describe("개인 메모 — md 형식은 공용 마크다운 편집기(공지 작성과 같다)", () => {
  /** md 편집기를 담은 감싸개(잠금·aria-busy 가 붙는 곳). */
  const mdBox = () => must("memo-input-md").closest<HTMLElement>(".mcm-memo__md");
  const mount = () => must("memo-input-md").getAttribute("data-mount");

  it("md 편집 때 memo-input-md 편집기(editable·fill·메모장 전용 모드 키)가 보이고 memo-input 입력칸은 없다", async () => {
    h.fetchMemo.mockResolvedValue(record({ format: "md", content: "# 제목" }));
    await renderWidget();
    await click("memo-edit");
    const md = must("memo-input-md");
    expect(q("memo-input")).toBeNull();
    expect((md as HTMLTextAreaElement).value).toBe("# 제목");
    expect(md.getAttribute("data-editable")).toBe("true");
    expect(md.getAttribute("data-fill")).toBe("true");
    expect(md.getAttribute("data-mode-key")).toBe(MEMO_MD_MODE_STORAGE_KEY);
    expect(MEMO_MD_MODE_STORAGE_KEY).toBe("mcm-memo:mdMode");
    expect(md.getAttribute("aria-label")).toBe("메모 내용");
    // 편집기는 .mcm-memo__field(후손 div 규칙) 밖의 감싸개에 있다 — 그 규칙이 편집기 안 div 에 걸리지 않게
    expect(mdBox()).not.toBeNull();
    expect(md.closest(".mcm-memo__field")).toBeNull();
    expect(mdBox()!.hasAttribute("aria-busy")).toBe(false);
    expect(mdBox()!.hasAttribute("inert")).toBe(false);
    expect(mdBox()!.className).toBe("mcm-memo__md");
  });

  it("md 에서 고친 글이 저장 요청에 그대로 들어간다", async () => {
    h.fetchMemo.mockResolvedValue(record({ format: "md", content: "처음" }));
    h.saveMemo.mockResolvedValue(record({ format: "md", content: "# 새 제목\n\n- 항목 **굵게**" }));
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input-md", "# 새 제목\n\n- 항목 **굵게**");
    expect(must("memo-count").textContent).toBe("19 / 20,000자");
    await click("memo-save");
    expect(h.saveMemo).toHaveBeenCalledWith({
      instId: "inst-1",
      defId: "def.abc12345",
      format: "md",
      content: "# 새 제목\n\n- 항목 **굵게**",
    });
    expect(q("memo-input-md")).toBeNull(); // 보기로 돌아왔다
    expect(must("widget-memo-body").querySelector("h1")?.textContent).toBe("새 제목");
  });

  it("저장 중에는 감싸개가 잠긴다 — aria-busy·잠금 클래스·inert, 편집기는 editable·마운트를 그대로 둔다", async () => {
    const pending = deferred<MemoRecord>();
    h.fetchMemo.mockResolvedValue(record({ format: "md", content: "처음" }));
    h.saveMemo.mockReturnValueOnce(pending.promise);
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input-md", "저장할 글");
    const before = mount();
    await click("memo-save"); // 응답을 기다리는 중

    expect(mdBox()!.getAttribute("aria-busy")).toBe("true");
    expect(mdBox()!.className).toBe("mcm-memo__md mcm-memo__md--locked");
    expect(mdBox()!.hasAttribute("inert")).toBe(true); // Tab 으로 들어가 쓴 글이 저장에서 빠지지 않게
    expect(must("memo-input-md").getAttribute("data-editable")).toBe("true"); // editable 을 끄지 않는다
    expect(mount()).toBe(before); // 편집기를 내렸다 다시 그리지 않는다(되돌리기 기록 유지)
    expect((must("memo-format") as HTMLSelectElement).disabled).toBe(true);

    await act(async () => {
      pending.reject(new Error("Failed to fetch"));
    });
    await flush();
    // 실패 뒤에는 잠금이 풀리고 같은 편집기·쓰던 글이 남는다
    expect(must("memo-error").textContent).toBe("메모를 저장하지 못했습니다. 잠시 뒤 다시 시도하세요.");
    expect(mdBox()!.hasAttribute("aria-busy")).toBe(false);
    expect(mdBox()!.hasAttribute("inert")).toBe(false);
    expect(mdBox()!.className).toBe("mcm-memo__md");
    expect(mount()).toBe(before);
    expect((must("memo-input-md") as HTMLTextAreaElement).value).toBe("저장할 글");
    expect(h.saveMemo).toHaveBeenLastCalledWith(expect.objectContaining({ format: "md", content: "저장할 글" }));
  });

  it("저장 중 입력이 들어오면(IME 확정처럼 inert 를 뚫고 온 경우) draft 도 같은 값이 된다 — 편집기와 어긋나지 않는다", async () => {
    const pending = deferred<MemoRecord>();
    h.fetchMemo.mockResolvedValue(record({ format: "md", content: "처음" }));
    h.saveMemo.mockReturnValueOnce(pending.promise);
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input-md", "저장할 글");
    await click("memo-save"); // 응답을 기다리는 중
    expect(mdBox()!.hasAttribute("inert")).toBe(true);

    await typeInto("memo-input-md", "저장 중에 친 글");
    expect(must("memo-count").textContent).toBe("9 / 20,000자"); // draft 가 편집기 값을 따라간다
    expect((must("memo-input-md") as HTMLTextAreaElement).value).toBe("저장 중에 친 글");
    expect(h.saveMemo).toHaveBeenCalledTimes(1);
    expect(h.saveMemo).toHaveBeenLastCalledWith(expect.objectContaining({ content: "저장할 글" })); // 이미 보낸 요청은 그대로

    await act(async () => {
      pending.reject(new Error("Failed to fetch"));
    });
    await flush();
    // 실패 뒤 다시 저장하면 편집기에 보이는 글이 그대로 나간다(편집기에는 있고 draft 에는 없는 글이 없다)
    expect((must("memo-input-md") as HTMLTextAreaElement).value).toBe("저장 중에 친 글");
    h.saveMemo.mockResolvedValueOnce(record({ format: "md", content: "저장 중에 친 글" }));
    await click("memo-save");
    expect(h.saveMemo).toHaveBeenLastCalledWith(expect.objectContaining({ format: "md", content: "저장 중에 친 글" }));
  });

  describe("Esc — [배치 편집]의 취소(shared WidgetWorkspace 의 document keydown)로 새지 않는다", () => {
    const keydown = (target: Element, key: string) => {
      const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      act(() => {
        target.dispatchEvent(ev);
      });
      return ev;
    };
    /** document 의 bubble 단계 keydown 리스너 — WidgetWorkspace 가 쓰는 방식 그대로(capture 아님). 뿌리(container)보다 뒤에 등록한다. */
    let onDocument: ReturnType<typeof vi.fn>;
    /** 뿌리(container) 자신에 뒤늦게 건 bubble 리스너 — 포털(Next 앱 라우터)은 React 뿌리가 document 라 WidgetWorkspace 리스너가
     *  React 리스너와 같은 노드에 뒤에 걸린다. 같은 노드의 뒤 리스너는 stopPropagation 으로는 못 막고 stopImmediatePropagation 만 막는다. */
    let onRoot: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      onDocument = vi.fn();
      onRoot = vi.fn();
      document.addEventListener("keydown", onDocument);
      container.addEventListener("keydown", onRoot);
    });
    afterEach(() => {
      document.removeEventListener("keydown", onDocument);
      container.removeEventListener("keydown", onRoot);
    });

    it("md 편집 영역에서 Esc 를 누르면 document 의 bubble keydown 리스너에 닿지 않고, preventDefault 도 하지 않는다", async () => {
      h.fetchMemo.mockResolvedValue(record({ format: "md", content: "처음" }));
      await renderWidget();
      await click("memo-edit");

      const ev = keydown(must("memo-input-md"), "Escape");
      expect(onDocument).not.toHaveBeenCalled();
      expect(onRoot).not.toHaveBeenCalled(); // 같은 뿌리 노드의 뒤 리스너도(document 가 뿌리인 실제 포털과 같은 조건)
      expect(ev.defaultPrevented).toBe(false);
      expect(mdBox()).not.toBeNull(); // 편집은 그대로
    });

    it("Esc 가 아닌 키는 막지 않는다", async () => {
      h.fetchMemo.mockResolvedValue(record({ format: "md", content: "처음" }));
      await renderWidget();
      await click("memo-edit");

      keydown(must("memo-input-md"), "a");
      expect(onDocument).toHaveBeenCalledTimes(1);
      expect(onRoot).toHaveBeenCalledTimes(1);
    });

    it("md 편집 영역 밖(보기 모드 등)에서 누른 Esc 는 막지 않는다", async () => {
      h.fetchMemo.mockResolvedValue(record({ format: "md", content: "처음" }));
      await renderWidget();
      keydown(must("memo-view"), "Escape");
      expect(onDocument).toHaveBeenCalledTimes(1);
    });
  });

  it("text 로 바꾸면 Textarea 가 다시 나오고 쓰던 글이 남아 있다 — html 은 고정폭 칸, 다시 md 로 와도 글은 그대로", async () => {
    h.fetchMemo.mockResolvedValue(record({ format: "md", content: "처음" }));
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input-md", "## 쓰던 글");

    await choose("memo-format", "text");
    expect(q("memo-input-md")).toBeNull();
    expect((must("memo-input") as HTMLTextAreaElement).value).toBe("## 쓰던 글");
    expect(must("memo-input").closest(".mcm-memo__field")?.className).toBe("mcm-memo__field");

    await choose("memo-format", "html");
    expect((must("memo-input") as HTMLTextAreaElement).value).toBe("## 쓰던 글");
    expect(must("memo-input").closest(".mcm-memo__field")?.className).toBe("mcm-memo__field mcm-memo__field--code");

    await choose("memo-format", "md");
    expect(q("memo-input")).toBeNull();
    expect((must("memo-input-md") as HTMLTextAreaElement).value).toBe("## 쓰던 글");
    expect(must("memo-count").textContent).toBe("7 / 20,000자");
    expect(h.saveMemo).not.toHaveBeenCalled();
  });

  it("[편집]마다 편집기가 새로 마운트되고(보기·편집이 다른 가지), 인스턴스가 바뀌면 key(instanceId)로 새로 그린다(되돌리기 기록이 다른 글로 넘어가지 않게)", async () => {
    h.fetchMemo.mockResolvedValue(record({ format: "md", content: "처음" }));
    const props = await renderWidget();
    await click("memo-edit");
    const first = mount();
    await typeInto("memo-input-md", "고치다 만 글");
    expect(mount()).toBe(first); // 입력으로는 새로 그리지 않는다

    await click("memo-cancel");
    await click("memo-edit");
    const second = mount();
    expect(second).not.toBe(first);
    expect((must("memo-input-md") as HTMLTextAreaElement).value).toBe("처음");

    await act(async () => {
      root.render(createElement(MemoRenderer, { ...props, instanceId: "inst-2" } as never));
    });
    await flush();
    expect(mount()).not.toBe(second);
  });
});

describe("개인 메모 — html 정화(실물 NoticeBodyView)", () => {
  // happy-dom 의 노드 순회는 지운 노드의 다음 형제를 건너뛰는 결함이 있어 지워지는 요소 뒤에 다른 요소를 두지 않고 따로 시험한다.
  const CASES: { name: string; html: string; check: (view: HTMLElement) => void }[] = [
    {
      name: "onclick·on*·style 속성",
      html: '<h3 onclick="steal()" style="color:red">제목</h3><p style="position:fixed" onmouseover="x()">본문</p>',
      check: (view) => {
        expect(view.innerHTML).not.toMatch(/onclick|onmouseover|style=/i);
        expect(view.querySelector("h3")?.textContent).toBe("제목");
        expect(view.querySelector("p")?.textContent).toBe("본문");
      },
    },
    {
      name: "script",
      html: "<p>본문</p><script>window.__memoPwned = 1</script>",
      check: (view) => {
        expect(view.querySelector("script")).toBeNull();
        expect(view.querySelector("p")?.textContent).toBe("본문");
        expect((window as unknown as { __memoPwned?: number }).__memoPwned).toBeUndefined();
      },
    },
    {
      name: "iframe(src 없이 — happy-dom 이 주소로 실제 접속하지 않게)",
      html: "<p>본문</p><iframe></iframe>",
      check: (view) => {
        expect(view.querySelector("iframe")).toBeNull();
        expect(view.querySelector("p")?.textContent).toBe("본문");
      },
    },
  ];

  it.each(CASES)("load 로 불러온 html 메모 — $name 을 지운다", async ({ html, check }) => {
    h.fetchMemo.mockResolvedValue(record({ format: "html", content: html }));
    await renderWidget();
    const view = must("widget-memo-body");
    expect(view.getAttribute("data-format")).toBe("HTML");
    check(view);
  });

  it.each(CASES)("html 로 저장한 직후의 보기 — $name 을 지운다", async ({ html, check }) => {
    h.fetchMemo.mockResolvedValue(null);
    h.saveMemo.mockResolvedValue(record({ format: "html", content: html }));
    await renderWidget();
    await click("memo-edit");
    await choose("memo-format", "html");
    await typeInto("memo-input", html);
    await click("memo-save");
    expect(q("memo-input")).toBeNull(); // 보기로 돌아왔다
    const view = must("widget-memo-body");
    expect(view.getAttribute("data-format")).toBe("HTML");
    check(view);
  });
});

describe("개인 메모 — 관리 화면 미리보기", () => {
  it.each([
    ["instId 가 preview", { instanceId: "preview", widgetId: "def.abc12345" }],
    ["저장 전 정의(def.preview)", { instanceId: "inst-1", widgetId: "def.preview" }],
    ["저장 전 정의(빈 widgetId)", { instanceId: "preview", widgetId: "" }],
  ])("%s — load·save 를 부르지 않고 안내만 보이며 [편집]은 막힌다", async (_name, ids) => {
    await renderWidget(ids);
    expect(h.fetchMemo).not.toHaveBeenCalled();
    expect(h.saveMemo).not.toHaveBeenCalled();
    expect(must("memo-preview-hint").textContent).toBe("미리보기에서는 저장하지 않습니다");
    expect(must("memo-edit").hasAttribute("disabled")).toBe(true);
    await click("memo-edit");
    expect(q("memo-input")).toBeNull();
    expect(h.setStatus).toHaveBeenLastCalledWith({ kind: "ready" });
  });
});

describe("개인 메모 — 위젯관리 [기본 배치] 보드(스펙 §17.5)", () => {
  it("보드 맥락(preview) 안에서는 실제 칸이어도 load·save 를 부르지 않고 안내만 보이며 [편집]은 막힌다", async () => {
    h.fetchMemo.mockResolvedValue(record({ content: "관리자 본인 메모" }));
    await renderWidget({ boardMode: "preview" }); // 저장된 정의(def.abc12345)·실제 칸 ID(inst-1) — 미리보기 판정으로는 실제 메모다
    expect(h.fetchMemo).not.toHaveBeenCalled();
    expect(h.saveMemo).not.toHaveBeenCalled();
    expect(must("memo-preview-hint").textContent).toBe("기본 배치 화면에서는 개인 메모를 쓰지 않습니다(사용자가 홈에서 씁니다)");
    expect(container.textContent).not.toContain("관리자 본인 메모");
    expect(must("memo-edit").hasAttribute("disabled")).toBe(true);
    await click("memo-edit");
    expect(q("memo-input")).toBeNull();
    expect(q("memo-input-md")).toBeNull();
    expect(h.fetchMemo).not.toHaveBeenCalled();
    expect(h.saveMemo).not.toHaveBeenCalled();
    expect(h.setStatus).toHaveBeenLastCalledWith({ kind: "ready" });
  });

  it("새로 고침 신호가 와도 보드 맥락에서는 서버를 부르지 않는다", async () => {
    await renderWidget({ boardMode: "preview", refreshKey: 0 });
    await renderWidget({ boardMode: "preview", refreshKey: 1 });
    expect(h.fetchMemo).not.toHaveBeenCalled();
  });

  it("맥락 값이 live 이거나 provider 밖(홈)이면 같은 칸이 그대로 실제 메모다 — 불러오고 [편집]이 열린다", async () => {
    h.fetchMemo.mockResolvedValue(record({ content: "내 메모" }));
    await renderWidget(); // provider 밖
    expect(h.fetchMemo).toHaveBeenCalledWith("inst-1");
    expect(must("widget-memo-body").textContent).toContain("내 메모");
    expect(q("memo-preview-hint")).toBeNull();
    expect(must("memo-edit").hasAttribute("disabled")).toBe(false);

    h.fetchMemo.mockClear();
    await renderWidget({ boardMode: "live" });
    expect(h.fetchMemo).toHaveBeenCalledTimes(1);
    expect(q("memo-preview-hint")).toBeNull();
  });

  it("보드 맥락에서도 관리 화면 미리보기 안내 문구(「미리보기에서는…」)를 쓰지 않는다 — 두 곳의 문구가 다르다", async () => {
    await renderWidget({ boardMode: "preview" });
    expect(must("memo-preview-hint").textContent).not.toContain("미리보기에서는");
  });

  it("공용 메모는 보드 맥락과 상관없이 그대로 보인다", async () => {
    await renderWidget({ boardMode: "preview", definition: { scope: "shared", format: "text", content: "공지 내용" } });
    expect(must("widget-memo-shared").textContent).toBe("공지 내용");
  });
});

describe("편집기", () => {
  const onChange = vi.fn();
  const onValidate = vi.fn();
  beforeEach(() => {
    onChange.mockReset();
    onValidate.mockReset();
  });

  async function renderEditor(value: unknown) {
    await act(async () => {
      root.render(createElement(MemoTypeEditor, { value, onChange, onValidate } as never));
    });
  }

  it("개인 메모는 내용 칸 없이 안내 문구(§17.4 그대로)를 보인다", async () => {
    await renderEditor({ scope: "personal", format: "md", content: "" });
    expect(must("widget-memo-personal-note").textContent).toBe("사용자가 홈에서 직접 씁니다. 형식은 새 메모의 처음 형식입니다");
    expect(q("widget-memo-content")).toBeNull();
    expect((must("widget-memo-scope") as HTMLSelectElement).value).toBe("personal");
    expect((must("widget-memo-format") as HTMLSelectElement).value).toBe("md");
  });

  it("공용 text·html 은 입력칸, md 는 마크다운 편집기를 보이고 쓴 글을 설정으로 올린다", async () => {
    await renderEditor({ scope: "shared", format: "text", content: "안내" });
    await typeInto("widget-memo-content", "안내 글");
    expect(onChange).toHaveBeenLastCalledWith({ scope: "shared", format: "text", content: "안내 글" });

    await renderEditor({ scope: "shared", format: "html", content: "<p>a</p>" });
    expect(q("widget-memo-content")).not.toBeNull();
    expect(q("widget-memo-content-md")).toBeNull();

    await renderEditor({ scope: "shared", format: "md", content: "# a" });
    expect(q("widget-memo-content")).toBeNull();
    await typeInto("widget-memo-content-md", "# b");
    expect(onChange).toHaveBeenLastCalledWith({ scope: "shared", format: "md", content: "# b" });
  });

  it("종류를 개인으로 바꾸면 내용을 비우고 다시 공용으로 돌리면 쓰던 내용이 살아난다", async () => {
    await renderEditor({ scope: "shared", format: "text", content: "쓰던 안내" });
    await choose("widget-memo-scope", "personal");
    expect(onChange).toHaveBeenLastCalledWith({ scope: "personal", format: "text", content: "" });

    await renderEditor({ scope: "personal", format: "text", content: "" });
    await choose("widget-memo-scope", "shared");
    expect(onChange).toHaveBeenLastCalledWith({ scope: "shared", format: "text", content: "쓰던 안내" });
  });

  it("형식을 바꾸면 설정의 format 만 바뀐다", async () => {
    await renderEditor({ scope: "shared", format: "text", content: "글" });
    await choose("widget-memo-format", "html");
    expect(onChange).toHaveBeenLastCalledWith({ scope: "shared", format: "html", content: "글" });
  });

  it("종류·형식이 빠졌거나 틀린 정의는 선택칸을 「선택하세요」(빈 값)로 보여 다시 고르게 한다", async () => {
    await renderEditor({ content: "글" });
    expect((must("widget-memo-scope") as HTMLSelectElement).value).toBe("");
    expect((must("widget-memo-format") as HTMLSelectElement).value).toBe("");
    await choose("widget-memo-scope", "personal"); // 바로잡힌 기본값과 같은 값을 골라도 설정이 올라간다
    expect(onChange).toHaveBeenLastCalledWith({ scope: "personal", format: "text", content: "" });

    onChange.mockClear();
    await renderEditor({ scope: "team", format: "rtf", content: "글" });
    expect((must("widget-memo-scope") as HTMLSelectElement).value).toBe("");
    await choose("widget-memo-format", "md");
    expect(onChange).toHaveBeenLastCalledWith({ scope: "personal", format: "md", content: "글" });
  });

  it("검사 결과를 onValidate 로 알린다 — 정상은 빈 배열, 20,000자 초과·틀린 값은 오류", async () => {
    await renderEditor({ scope: "shared", format: "text", content: "정상" });
    expect(onValidate).toHaveBeenLastCalledWith([]);
    await renderEditor({ scope: "shared", format: "text", content: "가".repeat(20001) });
    expect(onValidate).toHaveBeenLastCalledWith(["메모 내용은 20,000자까지 쓸 수 있습니다."]);
    await renderEditor({ scope: "team", format: "rtf", content: "" });
    expect(onValidate).toHaveBeenLastCalledWith([
      "메모 종류(scope)는 shared 또는 personal 이어야 합니다.",
      "메모 형식(format)은 text·md·html 중 하나여야 합니다.",
    ]);
    // 종류·형식이 빠진 정의도 저장을 막는다(서버가 거절한다)
    await renderEditor({ content: "글" });
    expect(onValidate).toHaveBeenLastCalledWith([
      "메모 종류(scope)는 shared 또는 personal 이어야 합니다.",
      "메모 형식(format)은 text·md·html 중 하나여야 합니다.",
    ]);
  });
});
