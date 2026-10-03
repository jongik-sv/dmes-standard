/** @vitest-environment happy-dom */
/**
 * HTML 설명 열이 있는 그리드의 다른 툴팁은 예전과 같다(2026-10-03 조정 결정 → 리뷰 반영 I1 ③).
 * HTML 카드는 머리글 라벨(MdmHeaderLabel)이 포털로 띄우고 그리드 tooltipInteraction 은 쓰지 않는다. 그래서 같은 그리드의 기본 셀 툴팁·
 * 검증 오류 툴팁·MDM 셀 툴팁·글자 MDM 머리글 카드는 ag-grid 비상호작용 툴팁 그대로다(마우스가 들어가지 못하고 다음 행을 가리지 않는다).
 * 글자 MDM 열의 열 정의(키 순서)도 예전과 같다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColDef } from "ag-grid-community";
import { AgDataGrid, buildColumnDefs, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { MdmMetaProvider, resetMdmMetaStore, type MdmColumnInfo } from "../../src/mdm-meta";
import { TITLE, column, fakeMetaFetch, settle } from "./mdm-meta-fixtures";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const BODY = column("NOTICE_BODY", {
  columnName: "본문",
  labelShort: "본문",
  description: "굵은 설명",
  descriptionHtml: "<p><b>굵은</b> 설명</p>",
});

describe("글자 MDM 열의 열 정의는 예전과 같다", () => {
  // HTML 설명 기능 이전(4fdeafe2) leafColDef 의 키 순서 — MDM 메타가 있는 글자 열은 headerTooltip 자리를 덮고 tooltipComponent·Params 를 rowDrag 뒤에 더한다.
  const DEV_TEXT_MDM_KEYS = [
    "field",
    "headerName",
    "headerComponent",
    "headerComponentParams",
    "hide",
    "pinned",
    "width",
    "flex",
    "minWidth",
    "sortable",
    "resizable",
    "editable",
    "cellEditor",
    "cellEditorParams",
    "cellDataType",
    "refData",
    "cellStyle",
    "cellClass",
    "cellClassRules",
    "headerClass",
    "headerTooltip",
    "headerStyle",
    "rowDrag",
    "tooltipComponent",
    "tooltipComponentParams",
    "cellRenderer",
    "valueFormatter",
  ];
  const info = (c: MdmColumnInfo["column"]): MdmColumnInfo => ({
    column: c,
    domain: null,
    loading: false,
  });

  it("HTML 열이 같은 그리드에 있어도 글자 MDM 열의 키·값은 예전 그대로(headerComponentParams 없음)", () => {
    const defs = buildColumnDefs([{ key: "title" }, { key: "noticeBody" }], {
      sortable: true,
      columnSizing: "fixed",
      shouldAutoSizeColumns: false,
      mdm: {
        priority: "explicit",
        infoByKey: new Map([
          ["title", info(TITLE)],
          ["noticeBody", info(BODY)],
        ]),
      },
    }) as ColDef[];
    expect(Object.keys(defs[0])).toEqual(DEV_TEXT_MDM_KEYS);
    expect(defs[0].headerComponentParams).toBeUndefined();
    expect(defs[0].headerTooltip).toBe("제목");
  });
});

describe("AgDataGrid — HTML 열이 있는 그리드의 셀·머리글 툴팁은 예전처럼 비상호작용", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  beforeEach(() => {
    resetMdmMetaStore();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    container.remove();
    document.querySelectorAll(".ag-tooltip-custom, .ag-tooltip").forEach((el) => el.remove());
    vi.unstubAllGlobals();
  });

  const columns: GridColumn[] = [
    { key: "title" },
    { key: "noticeBody" },
    { key: "etc", header: "기타", meta: false },
  ];
  const data = [{ title: "T1", noticeBody: "B1", etc: "E1" }];

  async function show(extra: Record<string, unknown> = {}) {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE, NOTICE_BODY: BODY } }).fn);
    await act(async () =>
      root!.render(
        createElement(
          MdmMetaProvider,
          { module: "mls" },
          createElement(AgDataGrid, { columns, data, rowKey: "title", height: "auto", ...extra })
        )
      )
    );
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await settle(60);
      });
    }
  }

  /** 칸(셀·머리글)에 마우스를 올리고 ag-grid 기본 표시 지연(2000ms)을 넘겨 기다린 뒤, 글자가 text 인 툴팁 상자를 돌려준다. */
  async function hover(selector: string, text: string): Promise<HTMLElement> {
    const el = container.querySelector<HTMLElement>(selector);
    expect(el, selector).not.toBeNull();
    await act(async () => {
      el!.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false, clientX: 10, clientY: 10 }));
    });
    await act(async () => {
      await settle(2200);
    });
    await act(async () => {
      await settle(50);
    });
    const box = [...document.querySelectorAll<HTMLElement>(".ag-tooltip")].find((b) =>
      b.textContent?.includes(text)
    );
    expect(box, `툴팁 ${text}`).toBeTruthy();
    return box!;
  }

  /** 예전과 같은 비상호작용 툴팁 — 문서 어디에도 ag-grid 상호작용 클래스가 없고 상자에 pointer-events 를 따로 두지 않는다(ag-grid CSS 의 none). */
  function expectDevTooltip(box: HTMLElement) {
    expect(document.querySelector(".ag-tooltip-interactive")).toBeNull();
    expect(box.style.pointerEvents).toBe("");
  }

  it("MDM 이 아닌 열의 기본 셀 툴팁", async () => {
    await show();
    expectDevTooltip(await hover('.ag-row[row-index="0"] .ag-cell[col-id="etc"]', "E1"));
  }, 15000);

  it("검증 오류 셀 툴팁(fieldErrors)", async () => {
    await show({ fieldErrors: [{ rowIndex: 0, field: "etc", message: "서버: 기타 오류" }] });
    expectDevTooltip(
      await hover('.ag-row[row-index="0"] .ag-cell[col-id="etc"]', "서버: 기타 오류")
    );
  }, 15000);

  it("HTML 열의 셀 툴팁(MDM 셀 툴팁)", async () => {
    await show();
    expectDevTooltip(await hover('.ag-row[row-index="0"] .ag-cell[col-id="noticeBody"]', "B1"));
  }, 15000);

  it("글자 MDM 머리글 카드", async () => {
    await show();
    const box = await hover('.ag-header-cell[col-id="title"]', "공지 제목");
    expect(box.classList.contains("mdm-meta-tooltip")).toBe(true);
    expect(box.getAttribute("style")).toBe("width: max-content; max-width: 380px;");
    expectDevTooltip(box);
  }, 15000);
});
