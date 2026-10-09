/** @vitest-environment happy-dom */
/**
 * 공통 폼 렌더 최적화(shared-form-perf):
 *  - ComboBox: memo 로 같은 props 의 부모 재렌더를 막고, 값이 있는 콤보는 마운트 직후 한 번 더 그려지지 않는다.
 *  - FormGroup: MDM HTML 카드의 스크린리더 글자 사본은 hover·focus 를 처음 받을 때까지 만들지 않는다.
 */
import { act, createElement } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComboBox } from "../../src/components/form/ComboBox";
import { FormGroup } from "../../src/components/form/FormGroup";
import { Input } from "../../src/components/form/Input";
import { dmesTheme } from "../../src/ui-provider/theme";
import { MdmMetaProvider, resetMdmMetaStore } from "../../src/mdm-meta";
import { TEXT_DOMAIN, TITLE, column, fakeMetaFetch, settle } from "./mdm-meta-fixtures";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;

beforeEach(() => resetMdmMetaStore());
afterEach(() => {
  r?.unmount();
  r = null;
  vi.unstubAllGlobals();
});

const DATA = [
  { value: "a", label: "에이" },
  { value: "b", label: "비이" },
];

describe("ComboBox 렌더 횟수", () => {
  it("값이 있는 콤보는 첫 렌더부터 선택 라벨을 입력창에 둔다(효과 뒤 추가 렌더 없음)", () => {
    // renderToString 은 효과를 돌리지 않는다 — 첫 렌더 결과에 라벨이 있어야 마운트 직후 setSearchValue 렌더가 필요 없다.
    const html = renderToString(
      createElement(MantineProvider, { theme: dmesTheme }, createElement(ComboBox, { data: DATA, value: "b" }))
    );
    expect(html).toContain('value="비이"');
  });

  it("ComboBox·FormGroup 은 memo 부품이다(같은 props 의 부모 재렌더를 건너뛴다)", () => {
    const MEMO = Symbol.for("react.memo");
    expect((ComboBox as unknown as { $$typeof: symbol }).$$typeof).toBe(MEMO);
    expect((FormGroup as unknown as { $$typeof: symbol }).$$typeof).toBe(MEMO);
  });
});

describe("FormGroup 스크린리더 사본 늦추기", () => {
  const BODY = column("NOTICE_BODY", {
    columnName: "본문",
    labelLong: "공지 본문",
    labelMid: "본문",
    description: "굵은 설명 링크",
    descriptionHtml: '<p><b>굵은</b> 설명 <a href="https://example.com/doc">링크</a></p>',
    dataType: "STRING",
    length: 4000,
  });
  const input = () => createElement(Input, { value: "", onChange: () => undefined });

  async function show() {
    vi.stubGlobal(
      "fetch",
      fakeMetaFetch({ columns: { NOTICE_BODY: BODY, TITLE }, domains: { D_TEXT: TEXT_DOMAIN } }).fn
    );
    r = renderWithMantine(
      createElement(MdmMetaProvider, { module: "mls" }, createElement(FormGroup, { name: "noticeBody" }, input()))
    );
    await act(async () => {
      await settle(60);
    });
    await act(async () => {
      await settle(60);
    });
  }

  it("HTML 카드는 hover 전에는 제목·설명 글자만 두고, 처음 hover 뒤 카드 전체 글자 사본으로 바꾼다", async () => {
    await show();
    const sr = () => r!.host.querySelector(".form-sr-only") as HTMLElement;
    // 준비 전에도 제목·설명 글자는 있다(커서 읽기 모드·첫 focus 대비) — 카드 전체(형식·도메인 줄)는 아직 없다.
    expect(sr().textContent).toBe("공지 본문 굵은 설명 링크");
    expect(sr().querySelector(".mdm-meta-card")).toBeNull();
    expect(r!.host.querySelector("input")!.getAttribute("aria-describedby")).toBe(sr().id);
    act(() => {
      (r!.host.querySelector(".form-tip-trigger") as HTMLElement).dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, relatedTarget: null })
      );
    });
    expect(sr().querySelector(".mdm-meta-card")).not.toBeNull();
    expect(sr().textContent).toContain("굵은 설명 링크");
    expect(sr().querySelector("a")).toBeNull();
  });

  it("필드 focus 도 사본을 채운다", async () => {
    await show();
    act(() => (r!.host.querySelector("input") as HTMLInputElement).focus());
    expect((r!.host.querySelector(".form-sr-only") as HTMLElement).querySelector(".mdm-meta-card")).not.toBeNull();
  });
});
