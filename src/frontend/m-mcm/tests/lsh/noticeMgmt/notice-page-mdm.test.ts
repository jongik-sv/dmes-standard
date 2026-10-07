/** @vitest-environment happy-dom */
/**
 * noticeMgmt 화면 전체 × MDM — 저장 때 오류가 상세 표의 제목 입력 칸에 붙는지 본다. fetch 만 가짜이고 화면·shared 는 진짜다.
 *  - 서버가 거부한 칸 오류(OASIS HTTP 200 + meta.success=false + errors)는 제목 칸에 보이고, 제목을 고치면 사라진다.
 *  - MDM 정의를 받아 둔 상태에서 정의를 어긴 제목은 서버를 부르기 전에 화면이 막고 같은 칸에 보인다.
 *  - 목록 행 클릭은 happy-dom 의 가상 스크롤에 기대지 않으려고 쓰지 않고 [신규] 로 빈 폼을 연다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageProvider } from "@dk-oasis/shared/message-provider";
import { MdmMetaProvider, resetMdmMetaStore } from "@dk-oasis/shared/mdm-meta";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import NoticeMgmtPage from "../../../page-components/lsh/noticeMgmt/page";
import { STRICT_TITLE, json, settle } from "./mdm-test-env";

const SERVER_MESSAGE = "제목은(는) 최대 1000자입니다";

interface FakeServerOptions {
  /** MDM 컬럼 사전에 TITLE 정의가 있으면 그 정의(없으면 MDM 에 없는 칸). */
  titleMeta?: typeof STRICT_TITLE;
  /** noticeMgmt/save 의 응답 본문. */
  saveBody?: unknown;
}

function fakeServer({ titleMeta, saveBody }: FakeServerOptions) {
  const urls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    // 버튼 권한(PageLayout RBAC) — 모든 버튼이 켜지도록 시스템 관리자로 답한다.
    if (url === "/api/auth/me") return json({ user: { id: "tester" } });
    if (url.endsWith("/secUser/myButtonEndpoints")) {
      return json({
        grids: { buttons: { rows: [{ objId: "*", action: "*" }] } },
      });
    }
    if (url.endsWith("/mdmMeta/columns")) {
      return titleMeta
        ? json({ items: { TITLE: titleMeta }, missing: [], unavailable: [] })
        : json({ items: {}, missing: ["TITLE"], unavailable: [] });
    }
    if (url.endsWith("/mdmMeta/domains")) {
      return json({ items: {}, missing: [], unavailable: [] });
    }
    if (url.endsWith("/noticeMgmt/search")) {
      return json({ meta: { success: true }, data: { result: { list: [] } } });
    }
    if (url.endsWith("/commRoleMng/search")) {
      return json({
        meta: { success: true },
        data: { result: { ds_main: [] } },
      });
    }
    if (url.endsWith("/noticeMgmt/save"))
      return json(saveBody ?? { meta: { success: true } });
    return json({});
  });
  return {
    fn,
    urls,
    saved: () => urls.some((u) => u.endsWith("/noticeMgmt/save")),
  };
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

const button = (text: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement;

const titleInput = () =>
  host.querySelector(
    'input[placeholder="홈 화면 목록에 보이는 제목"]',
  ) as HTMLInputElement;
const errorText = () => host.querySelector(".form-error-message")?.textContent;
const gridHeaders = () =>
  [...host.querySelectorAll(".ag-header-cell-text")].map(
    (el) => el.textContent,
  );
const detailLabels = () =>
  [...host.querySelectorAll("th")].map((el) => el.textContent);

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function showPage(server: ReturnType<typeof fakeServer>) {
  vi.stubGlobal("fetch", server.fn);
  // Node 의 localStorage 전역(파일 미지정이라 접근 시 예외)이 happy-dom 것을 가린다 — apiRequest 가 토큰을 읽는다.
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
  await act(async () =>
    root!.render(
      createElement(
        DmesUiProvider,
        null,
        createElement(
          MessageProvider,
          null,
          createElement(
            MdmMetaProvider,
            { module: "mcm", children: createElement(NoticeMgmtPage) },
          ),
        ),
      ),
    ),
  );
  await act(async () => {
    await settle(200);
  });
  await act(async () => button("신규").click());
}

describe("noticeMgmt 화면 — 저장 오류를 제목 칸에 붙인다", () => {
  it("서버 칸 오류가 제목 입력 칸에 보이고, 제목을 고치면 사라진다", async () => {
    const server = fakeServer({
      saveBody: {
        meta: { success: false, message: "입력값을 확인해주세요." },
        errors: [
          {
            grid: "master",
            rowIndex: 0,
            field: "TITLE",
            code: "INVALID_VALUE",
            message: SERVER_MESSAGE,
          },
        ],
      },
    });
    await showPage(server);
    expect(titleInput().disabled).toBe(false);
    await typeInto(titleInput(), "새 공지");
    expect(errorText()).toBeUndefined();

    await act(async () => button("저장").click());
    await act(async () => {
      await settle(80);
    });
    expect(server.saved()).toBe(true);
    expect(errorText()).toBe(SERVER_MESSAGE);

    await typeInto(titleInput(), "고친 제목");
    expect(errorText()).toBeUndefined();
  });

  it("MDM 정의를 어긴 제목은 서버를 부르기 전에 막고 같은 칸에 보인다", async () => {
    const server = fakeServer({ titleMeta: STRICT_TITLE });
    await showPage(server);
    await typeInto(titleInput(), "여섯글자입니다");
    // 입력 중에도 즉시 검사 문구가 보인다.
    expect(errorText()).toBe("공지제목은(는) 최대 5자입니다");

    await act(async () => button("저장").click());
    await act(async () => {
      await settle(80);
    });
    expect(server.saved()).toBe(false);
    expect(errorText()).toBe("공지제목은(는) 최대 5자입니다");
  });

  it("MDM 정의 안의 제목은 서버로 저장을 보낸다", async () => {
    const server = fakeServer({ titleMeta: STRICT_TITLE });
    await showPage(server);
    await typeInto(titleInput(), "짧은");
    await act(async () => button("저장").click());
    await act(async () => {
      await settle(80);
    });
    expect(server.saved()).toBe(true);
  });
});

describe("noticeMgmt 화면 — 캡션 우선순위(captionPriority=mdm)", () => {
  it("MDM 에 TITLE 이 있으면 목록 머리글은 labelShort, 상세 라벨은 labelMid(폼 캡션)", async () => {
    await showPage(fakeServer({ titleMeta: STRICT_TITLE }));
    expect(gridHeaders()[2]).toBe("제목단");
    expect(detailLabels()).toContain("공지제목 *");
  });

  it("MDM 에 TITLE 이 없으면 목록 머리글도 상세 라벨도 '제목' 으로 같다", async () => {
    await showPage(fakeServer({}));
    expect(gridHeaders()[2]).toBe("제목");
    expect(gridHeaders()).not.toContain("TITLE");
    expect(detailLabels()).toContain("제목 *");
  });
});
