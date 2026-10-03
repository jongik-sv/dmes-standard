/** @vitest-environment happy-dom */
/**
 * 열 그룹 AgDataGrid × MDM 화면 메타 × React StrictMode(개발 모드 효과 재실행).
 *
 * ag-grid 는 열 정의를 다시 받으면 머리 그룹 칸 ctrl 을 새로 만들고 옛 ctrl 을 파기한다(column = null). 머리 그룹 칸이 붙은 바로 그 커밋에서
 * 열 정의가 다시 들어가면, StrictMode 가 그 칸의 ref 를 떼었다 다시 붙일 때 파기된 ctrl 의 setComp 가 불려
 * `Cannot read properties of null (reading 'getProvidedColumnGroup')` 로 화면이 깨진다(2026-10-03 ruleEdit 첫 열 적용).
 * 메타가 없는 열(404·모듈 꺼짐·사전에 없음)도 처음엔 `loading` 이었다가 응답 뒤 없음으로 바뀐다 — 그리드는 `loading` 을 쓰지 않으므로
 * 그것만 바뀐 때는 열 정의를 다시 넣지 않아야 한다.
 */
import { StrictMode, act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgDataGrid, sameGridMdmValues, useResolvedGridColumns, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { MdmMetaProvider, isModuleDisabled, resetMdmMetaStore, type MdmColumnInfo } from "../../src/mdm-meta";
import { TEXT_DOMAIN, TITLE, fakeMetaFetch, settle } from "./mdm-meta-fixtures";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/** 의사결정표처럼 맨 앞 잎 열 + 2단 그룹(묶음 → 변수 → 칸) + 맨 뒤 잎 열. */
function groupColumns(withResult: boolean): GridColumn[] {
  const cols: GridColumn[] = [
    { key: "rowLabel", header: "행" },
    {
      key: "grp_cond",
      header: "조건",
      children: [{ key: "v1", header: "두께", children: [{ key: "c1_op", header: "OP" }, { key: "c1_left", header: "값" }] }],
    },
  ];
  if (withResult) {
    cols.push({ key: "grp_result", header: "결과", children: [{ key: "v4", header: "등급", children: [{ key: "title" }] }] });
  }
  cols.push({ key: "note", header: "설명" });
  return cols;
}

describe("열 그룹 그리드 × MDM 메타 × StrictMode", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let errors: string[] = [];

  beforeEach(() => {
    resetMdmMetaStore();
    errors = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container, {
      onUncaughtError: (e) => errors.push(String((e as Error)?.message ?? e)),
      onRecoverableError: (e) => errors.push(String((e as Error)?.message ?? e)),
    });
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    container.remove();
    vi.unstubAllGlobals();
  });

  const grid = (columns: GridColumn[], key: string, strict = true): ReactNode => {
    const g = createElement(
      MdmMetaProvider,
      { module: "mdm" },
      createElement(AgDataGrid, { key, columns, rowKey: "id", data: [{ id: 1 }], columnSizing: "fixed" })
    );
    return strict ? createElement(StrictMode, null, g) : g;
  };
  /** 렌더 뒤 메타 묶음 요청(16ms)과 응답 처리까지 기다린다. act 가 모은 예외(AggregateError)도 errors 로 모은다. */
  async function show(el: ReactNode) {
    try {
      await act(async () => root!.render(el));
      await act(async () => {
        await settle(80);
      });
    } catch (e) {
      const all = e instanceof AggregateError ? e.errors : [e];
      for (const x of all) errors.push(String((x as Error)?.message ?? x));
    }
  }
  const groupTexts = () => [...container.querySelectorAll(".ag-header-group-cell")].map((el) => el.textContent?.trim() ?? "");
  const headerTexts = () => [...container.querySelectorAll(".ag-header-cell-text")].map((el) => el.textContent);

  it("메타 엔드포인트가 404 여도 그룹 머리를 그리고 예외가 없다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ status: 404 }).fn);
    await show(grid(groupColumns(true), "a"));
    expect(errors).toEqual([]);
    expect(isModuleDisabled("mdm")).toBe(true);
    expect(groupTexts()).toEqual(expect.arrayContaining(["조건", "결과", "두께", "등급"]));
  });

  it("모듈이 이미 꺼진 뒤 새 그리드(열 0 → 첫 그룹 열, 그룹 추가·삭제)로 바꿔도 예외가 없다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ status: 404 }).fn);
    await show(grid(groupColumns(false), "a"));
    expect(isModuleDisabled("mdm")).toBe(true);
    await show(grid([{ key: "rowLabel", header: "행" }, { key: "note", header: "설명" }], "empty"));
    await show(grid(groupColumns(true), "b"));
    expect(groupTexts()).toEqual(expect.arrayContaining(["조건", "결과"]));
    await show(grid(groupColumns(false), "c"));
    expect(groupTexts()).not.toContain("결과");
    expect(errors).toEqual([]);
  });

  it("메타가 실제로 오면 그룹 안 잎 열 머리글이 MDM 캡션으로 바뀌고 예외가 없다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE } }).fn);
    await show(grid(groupColumns(true), "a"));
    expect(errors).toEqual([]);
    expect(headerTexts()).toContain("제목");
  });

  it("메타가 없는 열의 loading 만 끝나면 그리드 MDM 옵션(→ 열 정의)을 새로 내지 않는다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ status: 404 }).fn);
    const seen: GridColumn[][] = [];
    const columns = groupColumns(true);
    function Probe() {
      const resolved = useResolvedGridColumns(columns);
      if (seen[seen.length - 1] !== resolved) seen.push(resolved);
      return null;
    }
    await show(createElement(MdmMetaProvider, { module: "mdm" }, createElement(Probe)));
    expect(isModuleDisabled("mdm")).toBe(true);
    expect(seen).toHaveLength(1);
  });

  it("메타가 실제로 오면 그리드 MDM 옵션을 새로 내 캡션이 바뀐다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE } }).fn);
    const seen: GridColumn[][] = [];
    const columns = groupColumns(true);
    function Probe() {
      const resolved = useResolvedGridColumns(columns);
      if (seen[seen.length - 1] !== resolved) seen.push(resolved);
      return null;
    }
    await show(createElement(MdmMetaProvider, { module: "mdm" }, createElement(Probe)));
    const title = (cols: GridColumn[]) => cols[2].children?.[0].children?.[0].header;
    expect(title(seen[0])).toBe("title");
    expect(title(seen[seen.length - 1])).toBe("제목");
  });
});

describe("sameGridMdmValues", () => {
  const info = (column: MdmColumnInfo["column"], loading = false, domain: MdmColumnInfo["domain"] = null): MdmColumnInfo => ({
    column,
    domain,
    loading,
  });
  it("loading 만 다르면 같다고 본다", () => {
    expect(sameGridMdmValues(new Map([["a", info(null, true)]]), new Map([["a", info(null, false)]]))).toBe(true);
  });
  it("column·domain 참조나 키 목록이 다르면 다르다", () => {
    expect(sameGridMdmValues(new Map([["a", info(null)]]), new Map([["a", info(TITLE)]]))).toBe(false);
    expect(sameGridMdmValues(new Map([["a", info(TITLE)]]), new Map([["a", info({ ...TITLE })]]))).toBe(false);
    expect(sameGridMdmValues(new Map([["a", info(TITLE)]]), new Map([["a", info(TITLE, false, TEXT_DOMAIN)]]))).toBe(false);
    expect(sameGridMdmValues(new Map([["a", info(null)]]), new Map([["b", info(null)]]))).toBe(false);
    expect(sameGridMdmValues(new Map([["a", info(null)]]), new Map([["a", info(null)], ["b", info(null)]]))).toBe(false);
  });
});
