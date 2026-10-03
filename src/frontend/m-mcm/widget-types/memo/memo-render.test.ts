/** @vitest-environment happy-dom */
/**
 * 메모장 렌더러·편집기 동작 시험(스펙 2026-10-02-widget-admin-generic §17.4).
 * - 메모장 제목(2026-10-03): 틀 제목 훅(useWidgetTitle)은 마지막으로 틀에 알린 값(h.frameTitle)을 기록하는 대역이다 — 저장된 제목만 알리는지,
 *   공용 메모·미리보기·기본 배치 보드에서는 알리지 않는지 본다. 실제 틀(제목 줄 h3)에서 바뀌는 것은 shared widget-frame 시험이 맡는다.
 * - 서버 호출(./api)과 shared 의 폼 부품·위젯 틀 훅은 대역으로 바꾼다. 형식별 보기(NoticeBodyView)는 실물을 쓴다 —
 *   html 정화(script·onclick·style 제거)와 text 줄바꿈을 실제 DOM 으로 확인한다(shared dist 가 필요하다).
 * - md 편집기(shared MarkdownField)도 대역(textarea)이다 — Tiptap·서식/MD 전환은 shared markdown-editor 시험이 맡고, 여기서는
 *   렌더러가 넘기는 값(editable·fill·modeStorageKey)·key 로 새로 그리는지(마운트 번호)·잠금·저장 흐름만 본다.
 * - JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetBoardModeContext, type WidgetBoardMode } from "@/lib/widget-board-mode";

import {
  MEMO_DRAFT_DELAY_MS,
  MEMO_MAX_LENGTH,
  MEMO_MD_MODE_STORAGE_KEY,
  MemoServiceError,
  memoBaseHash,
  type MemoDraft,
  type MemoRecord,
} from "./memo-model";

const h = vi.hoisted(() => ({
  fetchMemo: vi.fn(),
  saveMemo: vi.fn(),
  setStatus: vi.fn(),
  /** MarkdownField 대역이 마운트될 때마다 올리는 번호 — key 로 새로 그렸는지 본다. */
  mdMounts: 0,
  /** 확인된 사용자 ID(대역) — "" 면 사용자를 모르는 상태다. */
  userId: "u1",
  /** 사용자 확인 상태(대역) — pending: 확인 중, confirmed: 확인됨, failed: 확인이 끝났는데 ID 를 모른다. */
  userStatus: "confirmed" as "pending" | "confirmed" | "failed",
  /** renderWidget 이 마지막으로 넘긴 props — 같은 위젯을 다시 그리는 시험이 쓴다. */
  lastProps: null as unknown,
  /** useWidgetTitle 대역이 틀에 알린 제목(위젯이 사라지면 null 로 되돌린다). */
  frameTitle: null as string | null,
  /** useWidgetTitle 이 렌더마다 받은 값 — 훅을 아예 부르지 않는 경우(공용 메모)를 가린다. */
  titleArgs: [] as (string | null | undefined)[],
}));

vi.mock("./api", () => ({ fetchMemo: h.fetchMemo, saveMemo: h.saveMemo }));

vi.mock("@dk-oasis/shared/widget", async () => {
  const { useEffect } = await import("react");
  return {
    useWidgetStatus: () => h.setStatus,
    useWidgetTitle: (title: string | null | undefined) => {
      h.titleArgs.push(title);
      useEffect(() => {
        h.frameTitle = title ?? null;
        return () => {
          h.frameTitle = null;
        };
      }, [title]);
    },
  };
});

// 사용자 확인(shared portal-shell 의 /api/auth/me 호출)을 막고 시험이 정한 사용자를 돌려준다. enabled 를 무시해
// 미리보기·보드 맥락에서 읽지·쓰지 않는 것이 렌더러 자신의 판정임을 확인한다(실제 훅은 enabled=false 면 "").
vi.mock("./memo-user", () => ({ useConfirmedUser: () => ({ userId: h.userId, status: h.userStatus }) }));

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
    Input: (p: {
      value?: string;
      onChange?: (v: string) => void;
      readOnly?: boolean;
      placeholder?: string;
      "data-testid"?: string;
      "aria-label"?: string;
    }) =>
      el("input", {
        type: "text",
        value: p.value,
        readOnly: p.readOnly,
        placeholder: p.placeholder,
        "data-testid": p["data-testid"],
        "aria-label": p["aria-label"],
        onChange: (e: { currentTarget: { value: string } }) => p.onChange?.(e.currentTarget.value),
      }),
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

/**
 * 메모리 저장소 대역 — Node 22+ 는 `--localstorage-file` 없이는 전역 localStorage 가 undefined 인 접근자를 갖고 있어
 * happy-dom 환경에서도 window.localStorage 가 비어 있다. 시험마다 새 저장소를 window.localStorage 로 꽂는다.
 */
class MemoryStorage {
  private readonly map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, v: string) {
    this.map.set(key, String(v));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
}

let store = new MemoryStorage();
/** 시험이 저장소를 막거나 감쌀 때 건다 — window.localStorage 접근이 이 함수의 결과(또는 던진 예외)가 된다. */
let storageOverride: (() => unknown) | null = null;
const ownStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
Object.defineProperty(window, "localStorage", { configurable: true, get: () => (storageOverride ? storageOverride() : store) });

afterAll(() => {
  if (ownStorageDescriptor) Object.defineProperty(window, "localStorage", ownStorageDescriptor);
  else delete (window as unknown as { localStorage?: unknown }).localStorage;
});

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
  h.userId = "u1";
  h.userStatus = "confirmed";
  h.frameTitle = null;
  h.titleArgs = [];
  store = new MemoryStorage();
  storageOverride = null;
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

/** 제목 입력칸(<input>)에 쓴다 — typeInto 는 textarea 전용이다. */
async function typeTitle(text: string) {
  const el = must("memo-title-input") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
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
  title: null,
  updatedAt: "2026-10-03T10:00:00",
  ...over,
});

interface RenderProps {
  definition?: unknown;
  widgetId?: string;
  instanceId?: string;
  refreshKey?: number;
  /** 위젯 정의 이름(WidgetProps.title) — 제목 입력칸 placeholder 가 알린다. */
  title?: string;
  /** 보드 성격 맥락 — 주면 그 값의 provider 안에서 그린다(위젯관리 [기본 배치] 보드는 "preview"). 안 주면 provider 밖(홈)이다. */
  boardMode?: WidgetBoardMode;
}

async function renderWidget(p: RenderProps = {}) {
  const props = {
    instanceId: p.instanceId ?? "inst-1",
    widgetId: p.widgetId ?? "def.abc12345",
    definition: p.definition ?? { scope: "personal", format: "text", content: "" },
    refreshKey: p.refreshKey ?? 0,
    title: p.title ?? "메모장",
    size: { w: 8, h: 10 },
    config: null,
  };
  h.lastProps = props;
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
    expect(h.saveMemo).toHaveBeenCalledWith({ instId: "inst-1", defId: "def.abc12345", format: "html", content: "<p>새 글</p>", title: null });
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
      title: null,
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

describe("개인 메모 — 쓰다 만 글 임시 저장(localStorage)", () => {
  const KEY = "dmes:widget:memo-draft:v1:u1:inst-1";
  const PREFIX = "dmes:widget:memo-draft:";
  const SAVED = record({ content: "서버 글" });
  /** 시험 안의 「지금」 — 가짜 시계를 이 시각에 맞춘다(임시본은 7일 만료라 실제 시계에 기대면 날짜가 지나 깨진다). putDraft 의 기본 savedAt 은 이 시각 55분 전. */
  const NOW = new Date(2026, 9, 3, 15, 0).getTime();
  const DAY = 24 * 60 * 60 * 1000;
  /** 저장소에 있는 키(정렬). */
  const keys = () => Array.from({ length: store.length }, (_, i) => store.key(i) as string).sort();

  const stored = (key = KEY): MemoDraft | null => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as MemoDraft) : null;
  };
  const putDraft = (over: Partial<MemoDraft> = {}, key = KEY) =>
    window.localStorage.setItem(
      key,
      JSON.stringify({ format: "text", content: "쓰던 글", baseHash: memoBaseHash(SAVED), savedAt: new Date(2026, 9, 3, 14, 5).getTime(), ...over })
    );
  /**
   * 디바운스가 지나게 한다 — 가짜 타이머를 앞으로 돌린다. shouldAdvanceTime 이라 실제 시간도 흘러(flush 의 setTimeout 0 이 풀린다)
   * 다른 도움 함수는 그대로 쓴다.
   */
  const settle = () =>
    act(async () => {
      vi.advanceTimersByTime(MEMO_DRAFT_DELAY_MS + 60);
      await Promise.resolve();
    });
  /** 위젯을 내렸다 새로 올린다(탭 전환·화면 이동). */
  async function remount(p: RenderProps = {}) {
    act(() => root.unmount());
    root = createRoot(container);
    await renderWidget(p);
  }

  /** 사용자 확인 결과가 바뀐 것을 반영한다(같은 위젯을 다시 그린다). */
  async function changeUser(userId: string, status: "pending" | "confirmed" | "failed") {
    h.userId = userId;
    h.userStatus = status;
    await act(async () => {
      root.render(createElement(MemoRenderer, h.lastProps as never));
    });
    await flush();
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    h.fetchMemo.mockResolvedValue(SAVED);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("글을 바꾸면 300ms 뒤에 { format, content, baseHash, savedAt } 를 쓴다 — 그 전에는 쓰지 않는다", async () => {
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input", "쓰는 중");
    expect(stored()).toBeNull(); // 디바운스 중
    await typeInto("memo-input", "쓰는 중인 글");
    await settle();
    const draft = stored();
    expect(draft).toMatchObject({ format: "text", content: "쓰는 중인 글", baseHash: memoBaseHash(SAVED) });
    expect(typeof draft!.savedAt).toBe("number");
    expect(window.localStorage.length).toBe(1);
  });

  it("키의 사용자·칸 ID 는 URI 인코딩한다 — 구분자(:)가 들어 있어도 키가 모호하지 않다", async () => {
    await renderWidget({ instanceId: "inst:1/a" });
    await click("memo-edit");
    await typeInto("memo-input", "글");
    await settle();
    expect(keys()).toEqual([`${PREFIX}v1:u1:inst%3A1%2Fa`]);
  });

  it("편집을 열기만 하고 바꾸지 않으면 쓰지 않는다 — 서버 글을 편집기에 넣은 것은 사용자 변경이 아니다", async () => {
    await renderWidget();
    await click("memo-edit");
    await settle();
    act(() => root.unmount());
    expect(window.localStorage.length).toBe(0);
  });

  it("형식만 바꿔도(글이 있으면) 임시 저장한다", async () => {
    await renderWidget();
    await click("memo-edit");
    await choose("memo-format", "html");
    await settle();
    expect(stored()).toMatchObject({ format: "html", content: "서버 글" });
  });

  it("md 편집기에서 쓴 글도 임시 저장한다", async () => {
    h.fetchMemo.mockResolvedValue(record({ format: "md", content: "처음 md" }));
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input-md", "# 고친 md");
    await settle();
    expect(stored()).toMatchObject({ format: "md", content: "# 고친 md" });
  });

  it("글을 쓰다 위젯을 내렸다 다시 올리면 [편집] 옆에 표시가 뜨고, [편집]에서 안내가 뜨며 [이어 쓰기]로 형식·글이 복원된다", async () => {
    await renderWidget();
    await click("memo-edit");
    await choose("memo-format", "html");
    await typeInto("memo-input", "<p>쓰다 만 글</p>");
    // 디바운스가 지나기 전에 내린다 — 내릴 때 못 쓴 값은 바로 쓴다.
    await remount();
    expect(must("memo-draft-flag").textContent).toBe("쓰다 만 글 있음");
    expect(must("widget-memo-body").textContent).toContain("서버 글"); // 보기는 서버 메모 그대로

    await click("memo-edit");
    expect(q("memo-draft-flag")).toBeNull();
    expect(must("memo-draft-notice").textContent).toContain("저장하지 않은 글이 있습니다(");
    expect(must("memo-draft-text").textContent).not.toContain("다른 곳에서");
    expect((must("memo-input") as HTMLTextAreaElement).value).toBe("서버 글"); // 고르기 전에는 서버 글

    await click("memo-draft-resume");
    expect(q("memo-draft-notice")).toBeNull();
    expect((must("memo-format") as HTMLSelectElement).value).toBe("html");
    expect((must("memo-input") as HTMLTextAreaElement).value).toBe("<p>쓰다 만 글</p>");
    expect(stored()).toMatchObject({ format: "html", content: "<p>쓰다 만 글</p>" }); // 임시본은 그대로
  });

  it("md 형식 임시본도 복원된다", async () => {
    putDraft({ format: "md", content: "# 쓰던 md" });
    await renderWidget();
    await click("memo-edit");
    await click("memo-draft-resume");
    expect((must("memo-format") as HTMLSelectElement).value).toBe("md");
    expect((must("memo-input-md") as HTMLTextAreaElement).value).toBe("# 쓰던 md");
  });

  it("안내 시각은 임시본의 savedAt 을 「yyyy-MM-dd HH:mm」 로 보인다", async () => {
    putDraft();
    await renderWidget();
    await click("memo-edit");
    expect(must("memo-draft-text").textContent).toBe("저장하지 않은 글이 있습니다(2026-10-03 14:05)");
  });

  it("[버리기] 는 임시본을 지우고 서버 글로 계속 쓴다 — 보기로 돌아와도 표시가 없다", async () => {
    putDraft();
    await renderWidget();
    expect(must("memo-draft-flag")).toBeTruthy();
    await click("memo-edit");
    await click("memo-draft-discard");
    expect(q("memo-draft-notice")).toBeNull();
    expect(stored()).toBeNull();
    expect((must("memo-input") as HTMLTextAreaElement).value).toBe("서버 글");
    await click("memo-cancel");
    expect(q("memo-draft-flag")).toBeNull();
    act(() => root.unmount());
    expect(stored()).toBeNull();
  });

  it("[버리기] 뒤에 쓰는 글은 다시 임시 저장된다", async () => {
    putDraft();
    await renderWidget();
    await click("memo-edit");
    await click("memo-draft-discard");
    await typeInto("memo-input", "다시 쓰는 글");
    await settle();
    expect(stored()).toMatchObject({ content: "다시 쓰는 글", baseHash: memoBaseHash(SAVED) });
  });

  it("저장에 성공하면 임시본을 지운다 — 늦게 도는 타이머·언마운트 뒤처리가 되살리지 않는다", async () => {
    h.saveMemo.mockResolvedValue(record({ content: "저장한 글" }));
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input", "저장한 글");
    await settle();
    expect(stored()).not.toBeNull();
    await typeInto("memo-input", "저장한 글!"); // 타이머가 걸린 채로 저장
    await click("memo-save");
    expect(h.saveMemo).toHaveBeenCalledTimes(1);
    expect(stored()).toBeNull();
    await settle();
    expect(stored()).toBeNull();
    act(() => root.unmount());
    expect(stored()).toBeNull();
    expect(q("memo-draft-flag")).toBeNull();
  });

  it("저장에 실패하면 임시본을 남긴다", async () => {
    h.saveMemo.mockRejectedValue(new MemoServiceError("서버 거절"));
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input", "못 저장한 글");
    await click("memo-save");
    expect(must("memo-error").textContent).toBe("서버 거절");
    await settle();
    expect(stored()).toMatchObject({ content: "못 저장한 글" });
  });

  it("[취소] 는 임시본을 지운다 — 디바운스 중에 눌러도, 그 뒤 위젯을 내려도 되살아나지 않는다", async () => {
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input", "한 번 쓴 글");
    await settle();
    expect(stored()).not.toBeNull();
    await typeInto("memo-input", "한 번 쓴 글 더");
    await click("memo-cancel"); // 타이머가 걸린 채로 취소
    expect(stored()).toBeNull();
    expect(q("memo-draft-flag")).toBeNull();
    await settle();
    expect(stored()).toBeNull();
    act(() => root.unmount());
    expect(stored()).toBeNull();
  });

  it("글을 서버 글과 같게 되돌리면 임시본을 지운다", async () => {
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input", "바꾼 글");
    await settle();
    expect(stored()).not.toBeNull();
    await typeInto("memo-input", "서버 글");
    await settle();
    expect(stored()).toBeNull();
  });

  describe("사용자 확인", () => {
    const locked = (el: HTMLElement) => (el as HTMLTextAreaElement).readOnly === true;

    it("확인이 끝나기 전(pending)에는 [편집]이 막혀 있다 — 확인되면 열리고, 옛 임시본 안내가 편집 첫 화면부터 나온다", async () => {
      putDraft();
      h.userId = "";
      h.userStatus = "pending";
      await renderWidget();
      expect(must("memo-edit").hasAttribute("disabled")).toBe(true);
      await click("memo-edit");
      expect(q("memo-editing")).toBeNull();
      await changeUser("u1", "confirmed");
      expect(must("memo-edit").hasAttribute("disabled")).toBe(false);
      await click("memo-edit");
      expect(must("memo-draft-notice")).toBeTruthy();
      expect(locked(must("memo-input"))).toBe(true);
    });

    it("확인이 실패로 끝나면(failed) 임시 저장하지 않고 읽지도 않는다 — 편집·저장은 그대로 된다", async () => {
      h.userId = "";
      h.userStatus = "failed";
      putDraft({}, `${PREFIX}:inst-1`);
      putDraft({}, `${PREFIX}undefined:inst-1`);
      const before = window.localStorage.length;
      h.saveMemo.mockResolvedValue(record({ content: "저장한 글" }));
      await renderWidget();
      expect(q("memo-draft-flag")).toBeNull();
      expect(must("memo-edit").hasAttribute("disabled")).toBe(false);
      await click("memo-edit");
      expect(q("memo-draft-notice")).toBeNull();
      await typeInto("memo-input", "사용자 모르는 글");
      await settle();
      act(() => root.unmount());
      expect(window.localStorage.length).toBe(before); // 새 키가 생기지 않았고 있던 키도 훑어 지우지 않았다
      root = createRoot(container);
      await renderWidget();
      await click("memo-edit");
      await typeInto("memo-input", "저장할 글");
      await click("memo-save");
      expect(h.saveMemo).toHaveBeenCalledTimes(1);
    });

    it("확인 실패로 시작한 편집 도중 사용자가 확인돼도 입력이 잠기지 않고 방금 쓴 글이 옛 임시본으로 덮이지 않는다", async () => {
      putDraft({ content: "옛 임시본" });
      h.userId = "";
      h.userStatus = "failed";
      h.saveMemo.mockResolvedValue(record({ content: "방금 쓴 글" }));
      await renderWidget();
      await click("memo-edit");
      await typeInto("memo-input", "방금 쓴 글");
      await changeUser("u1", "confirmed");
      await settle();
      expect(q("memo-draft-notice")).toBeNull();
      expect(locked(must("memo-input"))).toBe(false);
      expect((must("memo-input") as HTMLTextAreaElement).value).toBe("방금 쓴 글");
      expect(must("memo-save").hasAttribute("disabled")).toBe(false);
      expect(stored()).toMatchObject({ content: "옛 임시본" }); // 이 편집은 임시 저장 없이 시작했으므로 옛 임시본을 건드리지 않는다
      await click("memo-save");
      expect(h.saveMemo).toHaveBeenCalledWith(expect.objectContaining({ content: "방금 쓴 글" }));
    });

    it.each([
      ["저장", "memo-save"],
      ["취소", "memo-cancel"],
    ])("편집 도중 사용자 ID 가 사라져도 그 뒤 입력이 같은 키에 임시 저장되고 [%s]가 그 임시본을 지운다", async (_name, button) => {
      h.saveMemo.mockResolvedValue(record({ content: "첫 글 더" }));
      await renderWidget();
      await click("memo-edit");
      await typeInto("memo-input", "첫 글");
      await settle();
      expect(stored()).toMatchObject({ content: "첫 글" });
      await changeUser("", "failed");
      await typeInto("memo-input", "첫 글 더");
      await settle();
      expect(stored()).toMatchObject({ content: "첫 글 더" }); // 사용자를 잃었어도 이 편집의 임시 저장은 이어진다
      await click(button);
      expect(stored()).toBeNull();
      await settle();
      act(() => root.unmount());
      expect(keys()).toEqual([]);
    });

    it("사용자를 확인한 뒤에야 임시본을 읽는다 — 확인 전에는 표시도 없다", async () => {
      putDraft();
      h.userId = "";
      h.userStatus = "pending";
      await renderWidget();
      expect(q("memo-draft-flag")).toBeNull();
      await changeUser("u1", "confirmed");
      expect(must("memo-draft-flag")).toBeTruthy();
    });
  });

  it("다른 사용자의 임시본은 보이지 않는다", async () => {
    putDraft({}, `${PREFIX}v1:other:inst-1`);
    await renderWidget();
    expect(q("memo-draft-flag")).toBeNull();
    await click("memo-edit");
    expect(q("memo-draft-notice")).toBeNull();
  });

  it("다른 칸(instanceId)의 임시본은 보이지 않는다", async () => {
    putDraft({}, `${PREFIX}v1:u1:inst-2`);
    await renderWidget();
    expect(q("memo-draft-flag")).toBeNull();
  });

  describe("보관 기간(7일)과 정리", () => {
    it("savedAt 으로부터 7일이 지난 임시본은 없는 것으로 본다 — 표시도 안내도 없고 저장소에서도 사라진다", async () => {
      putDraft({ savedAt: NOW - 7 * DAY - 60_000 });
      await renderWidget();
      expect(q("memo-draft-flag")).toBeNull();
      await click("memo-edit");
      expect(q("memo-draft-notice")).toBeNull();
      expect(stored()).toBeNull();
    });

    it("7일이 안 된 임시본은 그대로 되살린다", async () => {
      putDraft({ savedAt: NOW - 7 * DAY + 60_000 });
      await renderWidget();
      expect(must("memo-draft-flag")).toBeTruthy();
      await click("memo-edit");
      expect(must("memo-draft-notice")).toBeTruthy();
    });

    it("화면을 연 채 7일이 지나면 [편집] 때 읽다가 만료를 알아보고 지운다(훑기가 아니라 읽기 쪽 만료)", async () => {
      putDraft();
      await renderWidget();
      expect(must("memo-draft-flag")).toBeTruthy(); // 마운트 때는 살아 있다
      act(() => {
        vi.setSystemTime(NOW + 8 * DAY);
      });
      await click("memo-edit");
      expect(q("memo-draft-notice")).toBeNull();
      expect(stored()).toBeNull();
    });

    it("사용자가 확인되면 7일 지난 임시본과 다른 사용자·옛 모양 키를 지운다 — 본인의 유효한 임시본과 이 기능 밖의 키는 남긴다", async () => {
      putDraft({}, KEY); // 본인·유효
      putDraft({ savedAt: NOW - 7 * DAY - 60_000 }, `${PREFIX}v1:u1:inst-9`); // 본인·만료
      putDraft({}, `${PREFIX}v1:other:inst-1`); // 다른 사용자(유효해도)
      putDraft({}, `${PREFIX}v1:u10:inst-1`); // u1 의 접두에 걸리지 않는 다른 사용자
      putDraft({}, `${PREFIX}u1:inst-1`); // 옛 모양 키
      window.localStorage.setItem(`${PREFIX}v1:u1:inst-8`, "{깨짐"); // 본인·쓸 수 없는 값
      window.localStorage.setItem("dmes:other:thing", "x");
      await renderWidget();
      expect(keys()).toEqual([KEY, "dmes:other:thing"].sort());
    });

    it("사용자 확인 전·실패에는 훑지 않는다 — 확인되는 순간 한 번 훑는다", async () => {
      putDraft({}, `${PREFIX}v1:other:inst-1`);
      h.userId = "";
      h.userStatus = "pending";
      await renderWidget();
      expect(keys()).toEqual([`${PREFIX}v1:other:inst-1`]);
      await changeUser("", "failed");
      expect(keys()).toEqual([`${PREFIX}v1:other:inst-1`]);
      await changeUser("u1", "confirmed");
      expect(keys()).toEqual([]);
    });

    it("미리보기 맥락에서는 사용자를 알아도 훑지 않는다", async () => {
      putDraft({}, `${PREFIX}v1:other:inst-1`);
      await renderWidget({ boardMode: "preview" });
      expect(keys()).toEqual([`${PREFIX}v1:other:inst-1`]);
    });

    it("훑는 도중 저장소가 던져도 보기·편집이 그대로 된다", async () => {
      storageOverride = () => ({
        length: 2,
        key: () => {
          throw new Error("denied");
        },
        getItem: (k: string) => store.getItem(k),
        setItem: (k: string, v: string) => store.setItem(k, v),
        removeItem: (k: string) => store.removeItem(k),
      });
      await renderWidget();
      expect(must("widget-memo-body").textContent).toContain("서버 글");
      await click("memo-edit");
      await typeInto("memo-input", "훑기가 던져도 쓰는 글");
      expect((must("memo-input") as HTMLTextAreaElement).value).toBe("훑기가 던져도 쓰는 글");
    });
  });

  describe("페이지가 사라질 때 못 쓴 글을 바로 쓴다(pagehide·visibilitychange)", () => {
    const setVisibility = (state: "visible" | "hidden") =>
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    afterEach(() => {
      delete (document as unknown as { visibilityState?: unknown }).visibilityState;
    });

    it("pagehide — 디바운스가 지나기 전의 글을 바로 쓰고, 그 뒤에도 입력은 계속 임시 저장된다", async () => {
      await renderWidget();
      await click("memo-edit");
      await typeInto("memo-input", "새로 고침 직전 글");
      expect(stored()).toBeNull(); // 디바운스 중
      act(() => {
        window.dispatchEvent(new Event("pagehide"));
      });
      expect(stored()).toMatchObject({ content: "새로 고침 직전 글" });
      await typeInto("memo-input", "돌아와서 더 쓴 글");
      await settle();
      expect(stored()).toMatchObject({ content: "돌아와서 더 쓴 글" });
    });

    it("visibilitychange — hidden 이 될 때만 바로 쓴다(visible 로 돌아올 때는 쓰지 않는다)", async () => {
      await renderWidget();
      await click("memo-edit");
      await typeInto("memo-input", "탭을 가리기 직전 글");
      setVisibility("visible");
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(stored()).toBeNull();
      setVisibility("hidden");
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(stored()).toMatchObject({ content: "탭을 가리기 직전 글" });
    });

    it("[취소]한 뒤에는 pagehide 가 와도 지운 임시본을 되살리지 않는다", async () => {
      await renderWidget();
      await click("memo-edit");
      await typeInto("memo-input", "쓰다 취소할 글");
      await click("memo-cancel");
      act(() => {
        window.dispatchEvent(new Event("pagehide"));
      });
      expect(stored()).toBeNull();
    });

    it("리스너는 마운트 때 달고 위젯이 내려갈 때 같은 함수로 뗀다", async () => {
      const winAdd = vi.spyOn(window, "addEventListener");
      const winRemove = vi.spyOn(window, "removeEventListener");
      const docAdd = vi.spyOn(document, "addEventListener");
      const docRemove = vi.spyOn(document, "removeEventListener");
      try {
        await renderWidget();
        const onPageHide = winAdd.mock.calls.find((c) => c[0] === "pagehide")?.[1];
        const onVisibility = docAdd.mock.calls.find((c) => c[0] === "visibilitychange")?.[1];
        expect(onPageHide).toBeTypeOf("function");
        expect(onVisibility).toBeTypeOf("function");
        expect(winRemove).not.toHaveBeenCalledWith("pagehide", onPageHide);
        unmount();
        expect(winRemove).toHaveBeenCalledWith("pagehide", onPageHide);
        expect(docRemove).toHaveBeenCalledWith("visibilitychange", onVisibility);
      } finally {
        winAdd.mockRestore();
        winRemove.mockRestore();
        docAdd.mockRestore();
        docRemove.mockRestore();
      }
    });
  });

  describe("저장소를 쓸 수 없을 때", () => {
    it("localStorage 접근이 예외를 던져도 보기·편집·저장이 그대로 된다", async () => {
      storageOverride = () => {
        throw new Error("storage denied");
      };
      h.saveMemo.mockResolvedValue(record({ content: "저장한 글" }));
      await renderWidget();
      expect(must("widget-memo-body").textContent).toContain("서버 글");
      expect(q("memo-draft-flag")).toBeNull();
      await click("memo-edit");
      await typeInto("memo-input", "저장소 없이 쓴 글");
      await settle();
      expect((must("memo-input") as HTMLTextAreaElement).value).toBe("저장소 없이 쓴 글");
      await click("memo-save");
      expect(h.saveMemo).toHaveBeenCalledWith(expect.objectContaining({ content: "저장소 없이 쓴 글" }));
      expect(must("widget-memo-body").textContent).toBe("저장한 글");
      // 쓰다가 내려도 예외가 새지 않는다.
      await click("memo-edit");
      await typeInto("memo-input", "또 쓰는 글");
      expect(() => act(() => root.unmount())).not.toThrow();
    });

    it("localStorage 가 아예 없어도(undefined) 그대로 된다", async () => {
      storageOverride = () => undefined;
      await renderWidget();
      await click("memo-edit");
      await typeInto("memo-input", "저장소 없는 글");
      await settle();
      expect((must("memo-input") as HTMLTextAreaElement).value).toBe("저장소 없는 글");
      expect(must("memo-save").hasAttribute("disabled")).toBe(false);
      expect(() => act(() => root.unmount())).not.toThrow();
    });

    it("setItem 이 용량 초과로 던져도 편집이 그대로 된다", async () => {
      storageOverride = () => ({
        getItem: (k: string) => store.getItem(k),
        removeItem: (k: string) => store.removeItem(k),
        setItem: () => {
          throw new DOMException("quota", "QuotaExceededError");
        },
      });
      await renderWidget();
      await click("memo-edit");
      await typeInto("memo-input", "용량 넘친 글");
      await settle();
      expect((must("memo-input") as HTMLTextAreaElement).value).toBe("용량 넘친 글");
      expect(must("memo-save").hasAttribute("disabled")).toBe(false);
    });
  });

  describe("미리보기·기본 배치 보드", () => {
    /** 읽기·쓰기·지우기 호출을 기록하는 저장소 감싸개. */
    function trackStorage() {
      const calls: string[] = [];
      storageOverride = () => ({
        getItem: (k: string) => (calls.push(`get:${k}`), store.getItem(k)),
        setItem: (k: string, v: string) => (calls.push(`set:${k}`), store.setItem(k, v)),
        removeItem: (k: string) => (calls.push(`remove:${k}`), store.removeItem(k)),
      });
      return calls;
    }

    it.each([
      ["관리 화면 미리보기(instId preview)", { instanceId: "preview", widgetId: "def.abc12345" }],
      ["저장 전 정의(def.preview)", { instanceId: "inst-1", widgetId: "def.preview" }],
      ["기본 배치 보드 맥락", { boardMode: "preview" as const }],
    ])("%s — 저장소를 읽지도 쓰지도 지우지도 않는다(사용자를 알아도)", async (_name, p) => {
      putDraft({}, `${PREFIX}v1:u1:preview`);
      putDraft();
      const calls = trackStorage();
      await renderWidget(p);
      await click("memo-edit"); // 막혀 있다
      await settle();
      expect(q("memo-draft-flag")).toBeNull();
      expect(q("memo-draft-notice")).toBeNull();
      act(() => root.unmount());
      expect(calls.filter((c) => c.includes(PREFIX))).toEqual([]);
    });
  });

  describe("안내에서 고르기 전", () => {
    const locked = (el: HTMLElement) => (el as HTMLTextAreaElement).readOnly === true;

    it("입력칸·형식 선택·[저장]이 잠기고 [취소]·[이어 쓰기]·[버리기]만 열려 있다 — 쓴 글이 임시 저장되지 않아 사라지는 것을 막는다", async () => {
      putDraft({ content: "옛 임시본" });
      await renderWidget();
      await click("memo-edit");
      expect(locked(must("memo-input"))).toBe(true);
      expect(must("memo-format").hasAttribute("disabled")).toBe(true);
      expect(must("memo-save").hasAttribute("disabled")).toBe(true);
      expect(must("memo-cancel").hasAttribute("disabled")).toBe(false);
      expect(must("memo-draft-resume").hasAttribute("disabled")).toBe(false);
      expect(must("memo-draft-discard").hasAttribute("disabled")).toBe(false);
      await click("memo-save"); // 막혀 있다 — 서버 글을 다시 저장해 옛 임시본이 고르기 없이 지워지지 않는다
      expect(h.saveMemo).not.toHaveBeenCalled();
      expect(stored()).toMatchObject({ content: "옛 임시본" });
    });

    it("md 형식도 편집기를 잠근다(inert)", async () => {
      h.fetchMemo.mockResolvedValue(record({ format: "md", content: "서버 md" }));
      putDraft({ format: "md", content: "옛 md", baseHash: memoBaseHash(record({ format: "md", content: "서버 md" })) });
      await renderWidget();
      await click("memo-edit");
      const wrap = must("memo-input-md").closest(".mcm-memo__md")!;
      expect(wrap.hasAttribute("inert")).toBe(true);
      await click("memo-draft-discard");
      expect(wrap.hasAttribute("inert")).toBe(false);
    });

    it.each([
      ["이어 쓰기", "memo-draft-resume"],
      ["버리기", "memo-draft-discard"],
    ])("[%s]를 누르면 잠금이 풀리고 [저장]이 열린다", async (_name, button) => {
      putDraft({ content: "옛 임시본" });
      await renderWidget();
      await click("memo-edit");
      expect(locked(must("memo-input"))).toBe(true);
      await click(button);
      expect(q("memo-draft-notice")).toBeNull();
      expect(locked(must("memo-input"))).toBe(false);
      expect(must("memo-format").hasAttribute("disabled")).toBe(false);
      expect(must("memo-save").hasAttribute("disabled")).toBe(false);
    });

    it("잠금을 뚫고 들어온 입력(IME 조합 확정 등)도 옛 임시본을 덮어쓰지 않는다 — 임시 저장을 쉰다", async () => {
      putDraft({ content: "옛 임시본" });
      await renderWidget();
      await click("memo-edit");
      await typeInto("memo-input", "새어 들어온 글"); // readOnly 여도 시험 대역은 입력을 전달한다
      await settle();
      expect(stored()).toMatchObject({ content: "옛 임시본" });
      act(() => root.unmount());
      expect(stored()).toMatchObject({ content: "옛 임시본" });
    });

    it("[취소] 해도 옛 임시본은 남고 보기에 표시가 뜬다 — 사용자가 고르지 않았다", async () => {
      putDraft({ content: "옛 임시본" });
      await renderWidget();
      await click("memo-edit");
      await click("memo-cancel");
      expect(stored()).toMatchObject({ content: "옛 임시본" });
      expect(must("memo-draft-flag")).toBeTruthy();
    });

    it("[이어 쓰기] 뒤 글을 더 쓰면 새 임시본이 된다 — 기준은 지금의 서버 메모다", async () => {
      putDraft({ content: "옛 임시본", baseHash: "old" });
      await renderWidget();
      await click("memo-edit");
      expect(must("memo-draft-text").textContent).toContain("그 뒤 다른 곳에서 메모가 바뀌었습니다");
      await click("memo-draft-resume");
      await typeInto("memo-input", "옛 임시본에 더 쓴 글");
      await settle();
      expect(stored()).toMatchObject({ content: "옛 임시본에 더 쓴 글", baseHash: memoBaseHash(SAVED) });
    });

    it("[이어 쓰기] 만 하고 글을 바꾸지 않은 채 내려가면 임시본은 그대로다 — 기준 해시·시각을 지금 값으로 다시 쓰지 않는다", async () => {
      const original = { content: "옛 임시본", baseHash: "old", savedAt: new Date(2026, 9, 1, 9, 0).getTime() };
      putDraft(original);
      await renderWidget();
      await click("memo-edit");
      await click("memo-draft-resume");
      expect((must("memo-input") as HTMLTextAreaElement).value).toBe("옛 임시본");
      await settle();
      act(() => root.unmount());
      expect(stored()).toEqual({ format: "text", ...original });
    });

    it("[이어 쓰기] 뒤 [취소]는 확인 없이 임시본을 지운다", async () => {
      putDraft({ content: "옛 임시본" });
      await renderWidget();
      await click("memo-edit");
      await click("memo-draft-resume");
      await click("memo-cancel");
      expect(stored()).toBeNull();
      expect(q("memo-draft-flag")).toBeNull();
    });

    it("안내가 없는 보통 편집에서는 잠기지 않는다", async () => {
      await renderWidget();
      await click("memo-edit");
      expect(locked(must("memo-input"))).toBe(false);
      expect(must("memo-format").hasAttribute("disabled")).toBe(false);
    });
  });

  describe("서버 메모와의 관계", () => {
    it("임시본을 만든 뒤 서버 메모가 바뀌었으면 안내에 「그 뒤 다른 곳에서 메모가 바뀌었습니다」를 덧붙인다", async () => {
      putDraft({ baseHash: memoBaseHash(record({ content: "예전 서버 글" })) });
      await renderWidget();
      await click("memo-edit");
      const text = must("memo-draft-text").textContent!;
      expect(text).toContain("저장하지 않은 글이 있습니다(2026-10-03 14:05)");
      expect(text).toContain("그 뒤 다른 곳에서 메모가 바뀌었습니다");
      expect(must("memo-draft-notice").textContent).toContain("이어 쓰기");
    });

    it("메모가 없던 때 만든 임시본인데 그 사이 메모가 저장되었으면 바뀐 것으로 본다", async () => {
      putDraft({ baseHash: memoBaseHash(null) });
      await renderWidget();
      await click("memo-edit");
      expect(must("memo-draft-text").textContent).toContain("그 뒤 다른 곳에서 메모가 바뀌었습니다");
    });

    it("서버 메모가 그대로면 덧붙이지 않는다", async () => {
      putDraft();
      await renderWidget();
      await click("memo-edit");
      expect(must("memo-draft-text").textContent).not.toContain("바뀌었습니다");
    });

    it("임시본 내용이 서버 메모와 같으면 안내도 표시도 없이 조용히 지운다(저장 응답을 못 받고 내려간 경우)", async () => {
      putDraft({ content: "서버 글" });
      await renderWidget();
      expect(q("memo-draft-flag")).toBeNull();
      expect(stored()).toBeNull();
      await click("memo-edit");
      expect(q("memo-draft-notice")).toBeNull();
    });

    it("메모가 없는 칸의 임시본도 되살린다", async () => {
      h.fetchMemo.mockResolvedValue(null);
      putDraft({ content: "첫 글", baseHash: memoBaseHash(null) });
      await renderWidget();
      expect(must("memo-draft-flag")).toBeTruthy();
      await click("memo-edit");
      expect(must("memo-draft-text").textContent).not.toContain("다른 곳에서");
      await click("memo-draft-resume");
      expect((must("memo-input") as HTMLTextAreaElement).value).toBe("첫 글");
    });
  });

  describe("상한·깨진 값", () => {
    it("20,000자를 넘는 글은 임시 저장하지 않는다 — 넘기기 전의 값이 남는다", async () => {
      await renderWidget();
      await click("memo-edit");
      await typeInto("memo-input", "넘기기 전");
      await settle();
      await typeInto("memo-input", "가".repeat(MEMO_MAX_LENGTH + 1));
      await settle();
      act(() => root.unmount()); // 내릴 때도 쓰지 않는다
      expect(stored()).toMatchObject({ content: "넘기기 전" });
    });

    it("글을 쓴 뒤 300ms 안에 20,001자를 붙여 넣어도 임시본에는 앞서 쓴 글이 남는다 — 못 쓰는 글이 맡겨 둔 값을 덮지 않는다", async () => {
      await renderWidget();
      await click("memo-edit");
      await typeInto("memo-input", "A");
      await typeInto("memo-input", "가".repeat(MEMO_MAX_LENGTH + 1)); // 디바운스가 지나기 전
      await settle();
      expect(stored()).toMatchObject({ content: "A" });
    });

    it("정확히 20,000자는 저장한다", async () => {
      await renderWidget();
      await click("memo-edit");
      await typeInto("memo-input", "가".repeat(MEMO_MAX_LENGTH));
      await settle();
      expect(stored()!.content).toHaveLength(MEMO_MAX_LENGTH);
    });

    it.each([
      ["JSON 이 아님", "{깨짐"],
      ["형식이 허용값이 아님", JSON.stringify({ format: "pdf", content: "x", baseHash: "a", savedAt: 1 })],
      ["글이 문자열이 아님", JSON.stringify({ format: "text", content: 3, baseHash: "a", savedAt: 1 })],
      ["20,000자 초과", JSON.stringify({ format: "text", content: "가".repeat(MEMO_MAX_LENGTH + 1), baseHash: "a", savedAt: 1 })],
      ["시각이 숫자가 아님", JSON.stringify({ format: "text", content: "x", baseHash: "a", savedAt: "어제" })],
    ])("깨진 임시본(%s)은 없는 것으로 본다", async (_name, raw) => {
      window.localStorage.setItem(KEY, raw);
      await renderWidget();
      expect(q("memo-draft-flag")).toBeNull();
      await click("memo-edit");
      expect(q("memo-draft-notice")).toBeNull();
      expect((must("memo-input") as HTMLTextAreaElement).value).toBe("서버 글");
    });
  });
});

describe("개인 메모 — 메모장 제목(2026-10-03)", () => {
  const KEY = "dmes:widget:memo-draft:v1:u1:inst-1";
  const SAVED = record({ content: "서버 글", title: "저장된 제목" });
  const NOW = new Date(2026, 9, 3, 15, 0).getTime();
  const stored = (): MemoDraft | null => {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MemoDraft) : null;
  };
  const putDraft = (over: Record<string, unknown> = {}) =>
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ format: "text", content: "서버 글", baseHash: memoBaseHash(SAVED), savedAt: new Date(2026, 9, 3, 14, 5).getTime(), ...over })
    );
  const settle = () =>
    act(async () => {
      vi.advanceTimersByTime(MEMO_DRAFT_DELAY_MS + 60);
      await Promise.resolve();
    });
  async function remount(p: RenderProps = {}) {
    act(() => root.unmount());
    root = createRoot(container);
    await renderWidget(p);
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("저장된 제목이 있으면 load 뒤 틀 제목을 그것으로 바꾸고, 없으면 바꾸지 않는다(정의 이름)", async () => {
    h.fetchMemo.mockResolvedValue(SAVED);
    await renderWidget();
    expect(h.frameTitle).toBe("저장된 제목");

    act(() => root.unmount());
    expect(h.frameTitle).toBeNull(); // 위젯이 사라지면 틀이 되돌린다
    root = createRoot(container);
    h.fetchMemo.mockResolvedValue(record({ title: null }));
    await renderWidget();
    expect(h.frameTitle).toBeNull();
  });

  it("[편집] 입력칸은 저장된 제목으로 시작하고, 비었으면 placeholder 가 정의 이름으로 돌아간다고 알린다", async () => {
    h.fetchMemo.mockResolvedValue(record({ title: null }));
    await renderWidget({ title: "메모장" });
    await click("memo-edit");
    const input = must("memo-title-input") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("제목(비우면 「메모장」)");
    expect(input.getAttribute("aria-label")).toBe("메모 제목");
    // 맨 위 줄 — 형식 선택과 같은 줄이고 입력칸이 먼저다
    const bar = input.closest(".mcm-memo__bar")!;
    expect(bar.querySelector('[data-testid="memo-format"]')).not.toBeNull();
    expect(bar.firstElementChild!.contains(input)).toBe(true);
    // 메모가 없는 칸(첫 편집)도 같다
    await click("memo-cancel");
    h.fetchMemo.mockResolvedValue(SAVED);
    await remount({ title: "메모장" });
    await click("memo-edit");
    expect((must("memo-title-input") as HTMLInputElement).value).toBe("저장된 제목");
  });

  it("제목을 쓰고 [저장]하면 내용과 함께 보내고(앞뒤 공백은 자른다), 저장 뒤 틀 제목이 서버가 돌려준 제목으로 바뀐다 — 편집 중에는 미리 바뀌지 않는다", async () => {
    h.fetchMemo.mockResolvedValue(record({ title: null }));
    h.saveMemo.mockResolvedValue(record({ content: "새 글", title: "나의 할 일" }));
    await renderWidget();
    await click("memo-edit");
    await typeInto("memo-input", "새 글");
    await typeTitle("  나의 할 일  ");
    expect(h.frameTitle).toBeNull(); // 저장 전

    await click("memo-save");
    expect(h.saveMemo).toHaveBeenCalledWith({ instId: "inst-1", defId: "def.abc12345", format: "text", content: "새 글", title: "나의 할 일" });
    expect(q("memo-title-input")).toBeNull(); // 보기로 돌아왔다
    expect(h.frameTitle).toBe("나의 할 일");
  });

  it("제목을 비우고 저장하면 title 을 null 로 넘기고(요청 계층이 \"\" 로 보낸다), 서버가 title 없이 돌려주면 틀 제목은 정의 이름으로 돌아간다", async () => {
    h.fetchMemo.mockResolvedValue(SAVED);
    h.saveMemo.mockResolvedValue(record({ content: "서버 글", title: null }));
    await renderWidget();
    expect(h.frameTitle).toBe("저장된 제목");
    await click("memo-edit");
    await typeTitle("   ");
    await click("memo-save");
    expect(h.saveMemo).toHaveBeenCalledWith(expect.objectContaining({ title: null }));
    expect(h.frameTitle).toBeNull();
  });

  it("제목은 40자(코드 포인트)까지만 담긴다 — 더 쓰거나 붙여 넣으면 잘리고 이모지는 쌍 가운데서 잘리지 않는다", async () => {
    h.fetchMemo.mockResolvedValue(record({ title: null }));
    await renderWidget();
    await click("memo-edit");
    await typeTitle("가".repeat(50));
    expect((must("memo-title-input") as HTMLInputElement).value).toBe("가".repeat(40));
    await typeTitle("😀".repeat(50));
    expect((must("memo-title-input") as HTMLInputElement).value).toBe("😀".repeat(40));
    await typeTitle("😀".repeat(40)); // 40자(UTF-16 80단위)는 그대로 저장할 수 있다
    expect(must("memo-save").hasAttribute("disabled")).toBe(false);
  });

  it("제목에 탭 같은 제어 문자가 들어 있으면 [저장]을 막는다 — 지우면 다시 열린다(한 줄 입력칸은 줄바꿈을 스스로 지운다)", async () => {
    h.fetchMemo.mockResolvedValue(record({ title: null }));
    await renderWidget();
    await click("memo-edit");
    await typeTitle("가\t나");
    expect(must("memo-save").hasAttribute("disabled")).toBe(true);
    await click("memo-save");
    expect(h.saveMemo).not.toHaveBeenCalled();
    await typeTitle("가나");
    expect(must("memo-save").hasAttribute("disabled")).toBe(false);
  });

  it("서버가 제목을 거절하면 서버 문구를 아래 줄에 보이고 쓰던 제목·글은 그대로 둔다", async () => {
    h.fetchMemo.mockResolvedValue(record({ title: null }));
    h.saveMemo.mockRejectedValue(new MemoServiceError("메모 제목은 40자까지 쓸 수 있습니다."));
    await renderWidget();
    await click("memo-edit");
    await typeTitle("쓰던 제목");
    await click("memo-save");
    expect(must("memo-error").textContent).toBe("메모 제목은 40자까지 쓸 수 있습니다.");
    expect((must("memo-title-input") as HTMLInputElement).value).toBe("쓰던 제목");
    expect(h.frameTitle).toBeNull();
  });

  it("저장 중에는 제목 입력칸이 잠긴다", async () => {
    h.fetchMemo.mockResolvedValue(record({ title: null }));
    const d = deferred<MemoRecord>();
    h.saveMemo.mockReturnValue(d.promise);
    await renderWidget();
    await click("memo-edit");
    await typeTitle("제목");
    await act(async () => {
      must("memo-save").click();
    });
    expect((must("memo-title-input") as HTMLInputElement).readOnly).toBe(true);
    await act(async () => {
      d.resolve(record({ title: "제목" }));
    });
    await flush();
    expect(h.frameTitle).toBe("제목");
  });

  it("공용 메모는 제목 입력칸도 틀 제목 바꾸기도 없다", async () => {
    await renderWidget({ definition: { scope: "shared", format: "text", content: "공지" } });
    expect(q("memo-title-input")).toBeNull();
    expect(h.titleArgs).toEqual([]); // useWidgetTitle 을 부르지 않는다
    expect(h.frameTitle).toBeNull();
  });

  it.each([
    ["관리 화면 미리보기", { instanceId: "preview", widgetId: "def.abc12345" }],
    ["기본 배치 보드", { boardMode: "preview" as const }],
  ])("%s — 편집이 막혀 제목 입력칸이 없고 틀 제목은 정의 이름 그대로다(서버도 부르지 않는다)", async (_name, p) => {
    h.fetchMemo.mockResolvedValue(SAVED);
    await renderWidget(p);
    await click("memo-edit");
    expect(q("memo-title-input")).toBeNull();
    expect(h.frameTitle).toBeNull();
    expect(h.fetchMemo).not.toHaveBeenCalled();
    expect(h.titleArgs.every((t) => t === null)).toBe(true);
  });

  it("제목만 바꿔도 300ms 뒤 임시본에 title 을 쓰고, 저장된 제목으로 되돌리면 임시본을 지운다", async () => {
    h.fetchMemo.mockResolvedValue(SAVED);
    await renderWidget();
    await click("memo-edit");
    await typeTitle("쓰던 제목");
    expect(stored()).toBeNull(); // 디바운스 중
    await settle();
    expect(stored()).toMatchObject({ format: "text", content: "서버 글", title: "쓰던 제목", baseHash: memoBaseHash(SAVED) });
    await typeTitle("저장된 제목");
    await settle();
    expect(stored()).toBeNull();
  });

  it("제목을 비우려던 글도 임시 저장하고, 위젯을 내렸다 올리면 [이어 쓰기]로 제목 입력칸이 복원된다", async () => {
    h.fetchMemo.mockResolvedValue(SAVED);
    await renderWidget();
    await click("memo-edit");
    await typeTitle("쓰던 제목");
    await remount(); // 디바운스가 지나기 전에 내려도 바로 쓴다
    expect(must("memo-draft-flag").textContent).toBe("쓰다 만 글 있음");
    await click("memo-edit");
    expect((must("memo-title-input") as HTMLInputElement).value).toBe("저장된 제목"); // 고르기 전에는 서버 값(입력칸은 잠김)
    expect((must("memo-title-input") as HTMLInputElement).readOnly).toBe(true);
    await click("memo-draft-resume");
    expect((must("memo-title-input") as HTMLInputElement).value).toBe("쓰던 제목");
    expect((must("memo-title-input") as HTMLInputElement).readOnly).toBe(false);
  });

  it("제목 칸이 생기기 전의 옛 임시본(title 없음)은 이어 쓰면 저장된 제목을 그대로 쓰고 글만 복원한다", async () => {
    h.fetchMemo.mockResolvedValue(SAVED);
    putDraft({ content: "쓰던 글" }); // title 키 없음
    await renderWidget();
    expect(must("memo-draft-flag")).toBeTruthy();
    await click("memo-edit");
    await click("memo-draft-resume");
    expect((must("memo-title-input") as HTMLInputElement).value).toBe("저장된 제목");
    expect((must("memo-input") as HTMLTextAreaElement).value).toBe("쓰던 글");
  });

  it("옛 임시본이 글도 서버와 같으면(제목 없음) 쓸모없어 지운다 — 제목 칸 때문에 쓰다 만 글로 보이지 않는다", async () => {
    h.fetchMemo.mockResolvedValue(SAVED);
    putDraft({ content: "서버 글" });
    await renderWidget();
    expect(q("memo-draft-flag")).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("제목만 다른 임시본은 쓰다 만 글로 표시된다", async () => {
    h.fetchMemo.mockResolvedValue(SAVED);
    putDraft({ title: "다른 제목" });
    await renderWidget();
    expect(must("memo-draft-flag")).toBeTruthy();
  });

  it("저장에 성공하면 제목 포함 임시본을 지운다", async () => {
    h.fetchMemo.mockResolvedValue(SAVED);
    h.saveMemo.mockResolvedValue(record({ content: "서버 글", title: "새 제목" }));
    await renderWidget();
    await click("memo-edit");
    await typeTitle("새 제목");
    await settle();
    expect(stored()).toMatchObject({ title: "새 제목" });
    await click("memo-save");
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(h.frameTitle).toBe("새 제목");
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
