/** @vitest-environment happy-dom */
/**
 * noticeMgmt 화면 × MDM 화면 메타·값 검증(spec 2026-10-03 §7 화면 부분) — 진짜 shared(dist) 공급자·그리드·입력을 가짜 fetch 로 돌린다.
 *  - 목록 그리드: header 를 비운 TITLE 열은 MDM 캡션(labelShort), 적은 header 는 그대로.
 *  - 상세 표 제목 줄: 라벨은 MDM 폼 캡션(labelMid), 화면 검사 문구가 입력 칸 오류로 보이고, 서버가 준 칸 오류가 화면 문구보다 앞선다.
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

function fakeMdmFetch() {
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
      if (n === "TITLE") items[n] = STRICT_TITLE;
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
const errorText = () => host.querySelector(".form-error-message")?.textContent;

describe("목록 그리드 — MDM 캡션", () => {
  it("header 를 비운 TITLE 열은 MDM 캡션(labelShort), 적은 header 는 그대로", async () => {
    const f = fakeMdmFetch();
    vi.stubGlobal("fetch", f.fn);
    await show(
      inPortalTab(
        createElement(AgDataGrid, {
          columns: NOTICE_COLUMNS,
          rowKey: "NOTICE_ID",
          data: [],
          mdmValidate: true,
        }),
      ),
    );
    const headers = [...host.querySelectorAll(".ag-header-cell-text")].map(
      (el) => el.textContent,
    );
    expect(headers[2]).toBe("제목단"); // TITLE 은 세 번째 열
    expect(headers[0]).toBe("분류");
    // 화면의 열 key 중 TITLE 만 MDM 으로 묻는다(파생 열은 물리명이 맞지 않는다는 응답이 와도 되지만 TITLE 은 반드시 포함).
    expect(f.calls.some((u) => u.endsWith("/api/mls/mdmMeta/columns"))).toBe(
      true,
    );
  });
});

describe("상세 표 제목 줄", () => {
  it("공급자 안: 라벨은 MDM 폼 캡션(labelMid)에 필수 표시", async () => {
    vi.stubGlobal("fetch", fakeMdmFetch().fn);
    await show(inPortalTab(titleRow()));
    expect(label()).toBe("공지제목 *");
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
