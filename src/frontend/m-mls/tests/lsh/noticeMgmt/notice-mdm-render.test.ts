/** @vitest-environment happy-dom */
/**
 * noticeMgmt 화면 × MDM 화면 메타·값 검증(spec 2026-10-03 §7 화면 부분) — 진짜 shared(dist) 공급자·그리드·입력을 가짜 fetch 로 돌린다.
 *  - 목록 그리드(화면이 captionPriority="mdm" 으로 감싼 상태): TITLE 열은 MDM 이 있으면 MDM 캡션(labelShort), 없으면 적어 둔 "제목". 파생 열은 적은 header 그대로.
 *  - 상세 표 제목 줄: 라벨(MdmFieldLabel)은 화면(captionPriority="mdm") 안에서 MDM 폼 캡션(labelMid)이고 올리면 MDM 카드 툴팁이 뜬다.
 *    화면 검사 문구가 입력 칸 오류로 보이고, 서버가 준 칸 오류가 화면 문구보다 앞선다.
 *  - 공급자 밖(포털 밖 단독 실행)에서는 부르지 않고 예전 라벨 "제목" 그대로.
 * 실제 MDM 의 TITLE 은 STRING(1000)·선택이라 입력 칸(200자 제한)에서는 검사에 걸리지 않으므로, 여기서는 더 엄격한 가짜 정의(5자·필수)를 쓴다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgDataGrid } from "@dk-oasis/shared/grid";
import { MdmMetaProvider, resetMdmMetaStore } from "@dk-oasis/shared/mdm-meta";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { STRICT_TITLE, settle } from "./mdm-test-env";
import { NOTICE_COLUMNS } from "../../../pages/lsh/noticeMgmt/notice-columns";
import { NoticeTitleRow } from "../../../pages/lsh/noticeMgmt/NoticeTitleRow";

function fakeMdmFetch({ knowsTitle = true }: { knowsTitle?: boolean } = {}) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const body = init?.body
      ? (JSON.parse(String(init.body)) as { names?: string[] })
      : {};
    const items: Record<string, unknown> = {};
    const missing: string[] = [];
    for (const n of body.names ?? []) {
      if (n === "TITLE" && knowsTitle) items[n] = STRICT_TITLE;
      else missing.push(n);
    }
    return new Response(JSON.stringify({ items, missing, unavailable: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { fn, calls };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  resetMdmMetaStore();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

async function show(el: ReturnType<typeof createElement>) {
  await act(async () => root!.render(createElement(DmesUiProvider, null, el)));
  await act(async () => {
    await settle();
  });
}

const inPortalTab = (child: ReturnType<typeof createElement>) =>
  createElement(MdmMetaProvider, { module: "mls" }, child);

/** 포털 탭 공급자 안에 noticeMgmt 화면이 두는 captionPriority="mdm" 공급자(module 은 바깥을 따른다)까지 — page.tsx 의 default export 와 같은 모양. */
const inNoticeScreen = (child: ReturnType<typeof createElement>) =>
  inPortalTab(createElement(MdmMetaProvider, { captionPriority: "mdm" }, child));

const grid = () =>
  createElement(AgDataGrid, {
    columns: NOTICE_COLUMNS,
    rowKey: "NOTICE_ID",
    data: [],
    mdmValidate: true,
  });
const headers = () =>
  [...host.querySelectorAll(".ag-header-cell-text")].map((el) => el.textContent);

const titleRow = (props: Partial<Parameters<typeof NoticeTitleRow>[0]> = {}) =>
  createElement(
    "table",
    null,
    createElement(
      "tbody",
      null,
      createElement(NoticeTitleRow, {
        value: "",
        onChange: () => undefined,
        ...props,
      }),
    ),
  );

const label = () => host.querySelector("th")?.textContent;
const tipPortal = () => document.querySelector(".form-tip-text--portal");
const errorText = () => host.querySelector(".form-error-message")?.textContent;

describe("목록 그리드 — MDM 캡션", () => {
  it("MDM 에 TITLE 이 있으면 MDM 캡션(labelShort), 파생 열은 적은 header 그대로", async () => {
    const f = fakeMdmFetch();
    vi.stubGlobal("fetch", f.fn);
    await show(inNoticeScreen(grid()));
    expect(headers()[2]).toBe("제목단"); // TITLE 은 세 번째 열
    expect(headers()[0]).toBe("분류");
    expect(f.calls.some((u) => u.endsWith("/api/mls/mdmMeta/columns"))).toBe(
      true,
    );
  });

  it("MDM 에 TITLE 이 없으면(사전에서 지워짐) 적어 둔 '제목' 이 보인다 — 열 key TITLE 이 아니다", async () => {
    vi.stubGlobal("fetch", fakeMdmFetch({ knowsTitle: false }).fn);
    await show(inNoticeScreen(grid()));
    expect(headers()[2]).toBe("제목");
    expect(headers()).not.toContain("TITLE");
  });

  it("MDM 이 오류(HTTP 500)여도 '제목' 이 보인다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "x" }), { status: 500 }),
      ),
    );
    await show(inNoticeScreen(grid()));
    expect(headers()[2]).toBe("제목");
  });

  it("공급자 밖(포털 밖 단독 실행)에서는 MDM 을 부르지 않고 '제목'", async () => {
    const f = fakeMdmFetch();
    vi.stubGlobal("fetch", f.fn);
    await show(grid());
    expect(headers()[2]).toBe("제목");
    expect(f.calls).toHaveLength(0);
  });

  it("우선순위를 바꾸지 않은(explicit) 공급자 아래에서는 적은 '제목' 이 이긴다 — 그래서 화면이 captionPriority=mdm 을 둔다", async () => {
    vi.stubGlobal("fetch", fakeMdmFetch().fn);
    await show(inPortalTab(grid()));
    expect(headers()[2]).toBe("제목");
  });
});

describe("상세 표 제목 줄", () => {
  it("화면(captionPriority=mdm) 안: 라벨은 MDM 폼 캡션(labelMid)에 필수 표시, 입력 칸 이름도 같다", async () => {
    vi.stubGlobal("fetch", fakeMdmFetch().fn);
    await show(inNoticeScreen(titleRow()));
    expect(label()).toBe("공지제목 *");
    expect(host.querySelector("input")?.getAttribute("aria-label")).toBe(
      "공지제목",
    );
  });

  it("explicit 공급자 안: 적어 둔 '제목' 이 이기고 입력 칸 이름도 같다 — 우선순위는 화면이 정한다", async () => {
    vi.stubGlobal("fetch", fakeMdmFetch().fn);
    await show(inPortalTab(titleRow()));
    expect(label()).toBe("제목 *");
    expect(host.querySelector("input")?.getAttribute("aria-label")).toBe(
      "제목",
    );
  });

  it("MDM 에 TITLE 이 있으면 라벨에 올리면 MDM 카드(컬럼·도메인 툴팁)가 뜨고 내리면 닫힌다", async () => {
    vi.stubGlobal("fetch", fakeMdmFetch().fn);
    await show(inNoticeScreen(titleRow()));
    const trigger = host.querySelector("th .form-tip-trigger") as HTMLElement;
    expect(trigger.textContent).toBe("공지제목 *");
    expect(tipPortal()).toBeNull();
    act(() => {
      trigger.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, relatedTarget: null }),
      );
    });
    const card = tipPortal()!;
    expect(
      card.querySelector('[data-mdm-section="title"]')?.textContent,
    ).toContain("공지 제목");
    expect(
      card.querySelector('[data-mdm-section="format"]')?.textContent,
    ).toContain("STRING(5)");
    act(() => {
      trigger.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: null }),
      );
    });
    expect(tipPortal()).toBeNull();
  });

  it("MDM 에 TITLE 이 없으면 라벨 글자는 '제목 *' 그대로이고 글자 툴팁 트리거만 있다(메타 카드·스크린리더 사본 없음)", async () => {
    vi.stubGlobal("fetch", fakeMdmFetch({ knowsTitle: false }).fn);
    await show(inNoticeScreen(titleRow()));
    expect(host.querySelector("th")?.textContent).toBe("제목 *");
    const trigger = host.querySelector("th .form-tip-trigger") as HTMLElement;
    expect(trigger).not.toBeNull();
    expect(trigger.hasAttribute("aria-describedby")).toBe(false);
  });

  it("공급자 밖: 예전 라벨 '제목' 그대로이고 MDM 을 부르지 않는다", async () => {
    const f = fakeMdmFetch();
    vi.stubGlobal("fetch", f.fn);
    await show(titleRow({ value: "여섯글자입니다" }));
    expect(label()).toBe("제목 *");
    expect(errorText()).toBeUndefined();
    expect(f.calls).toHaveLength(0);
  });

  it("MDM 정의를 어긴 값은 입력 칸 오류로 보인다(길이 5자)", async () => {
    vi.stubGlobal("fetch", fakeMdmFetch().fn);
    await show(inPortalTab(titleRow({ value: "여섯글자입니다" })));
    expect(errorText()).toBe("공지제목은(는) 최대 5자입니다");
    expect(host.querySelector("input")?.getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("정의 안의 값이거나 아직 손대지 않은 빈 칸에는 화면 오류를 보이지 않는다", async () => {
    vi.stubGlobal("fetch", fakeMdmFetch().fn);
    await show(inPortalTab(titleRow({ value: "짧은" })));
    expect(errorText()).toBeUndefined();
    await show(inPortalTab(titleRow({ value: "" })));
    expect(errorText()).toBeUndefined(); // 필수 검사는 저장 때(validateNotice·validateRow)
  });

  it("서버가 준 칸 오류는 화면 검사 문구보다 앞선다", async () => {
    vi.stubGlobal("fetch", fakeMdmFetch().fn);
    await show(
      inPortalTab(
        titleRow({
          value: "여섯글자입니다",
          error: "제목은(는) 최대 1000자입니다",
        }),
      ),
    );
    expect(errorText()).toBe("제목은(는) 최대 1000자입니다");
  });

  it.each([
    ["unavailable", 200],
    ["HTTP 500", 500],
  ] as const)(
    "MDM 을 받지 못하는 동안(%s) 제목을 여러 번 고쳐 그려도 메타 요청은 1회",
    async (_label, status) => {
      const calls: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          calls.push(String(input));
          return status === 200
            ? new Response(
                JSON.stringify({
                  items: {},
                  missing: [],
                  unavailable: ["TITLE"],
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              )
            : new Response(JSON.stringify({ message: "x" }), { status });
        }),
      );
      for (const value of ["가", "가나", "가나다", "가나다라마바"]) {
        await show(inPortalTab(titleRow({ value })));
      }
      expect(
        calls.filter((u) => u.endsWith("/api/mls/mdmMeta/columns")),
      ).toHaveLength(1);
      expect(label()).toBe("제목 *");
      expect(errorText()).toBeUndefined();
    },
  );

  it("값을 고치면 onChange 로 알린다", async () => {
    vi.stubGlobal("fetch", fakeMdmFetch().fn);
    const seen: string[] = [];
    await show(
      inPortalTab(
        titleRow({ value: "", onChange: (v: string) => seen.push(v) }),
      ),
    );
    const input = host.querySelector("input") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, "새 제목");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(seen).toEqual(["새 제목"]);
  });
});
