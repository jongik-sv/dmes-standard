/** @vitest-environment happy-dom */
/**
 * MdmMetaCard — 툴팁 본문 순서(spec B3): 제목 → 설명·메모 → 형식·필수·기본값 → 도메인·단위 → 표준식 → 허용 코드 → 서버 업무 규칙.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MdmMetaCard, formatMdmDataType } from "../../src/mdm-meta";
import { column, domain } from "./mdm-meta-fixtures";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root | null = null;

function render(el: ReturnType<typeof createElement>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

const sections = () =>
  [...host.querySelectorAll("[data-mdm-section]")].map((el) => el.getAttribute("data-mdm-section"));
const section = (name: string) => host.querySelector(`[data-mdm-section="${name}"]`)?.textContent ?? null;

describe("MdmMetaCard", () => {
  it("모든 칸이 있으면 B3 순서대로 보인다", () => {
    const codes = Array.from({ length: 12 }, (_, i) => ({ code: `C${i + 1}`, name: `코드${i + 1}` }));
    render(
      createElement(MdmMetaCard, {
        column: column("CATEGORY", {
          columnName: "분류",
          labelLong: "공지 분류",
          description: "공지 종류",
          usageNote: "필수 입력",
          dataType: "STRING",
          length: 240,
          required: true,
          defaultValue: "GEN",
          domain: { domainId: "D_CAT", domainName: "분류코드", domainKind: "CODE" },
          stdExpr: { text: "LEN(CATEGORY) <= 240", ast: null },
          allowedCodes: codes,
          bizRuleOnServer: true,
        }),
        domain: domain("D_CAT", { domainName: "분류코드", domainKind: "CODE", unitCode: "EA" }),
      })
    );

    expect(sections()).toEqual(["title", "description", "format", "domain", "stdExpr", "codes", "bizRule"]);
    expect(section("title")).toContain("공지 분류");
    expect(section("title")).toContain("CATEGORY");
    expect(section("description")).toContain("공지 종류");
    expect(section("description")).toContain("필수 입력");
    expect(section("format")).toContain("STRING(240)");
    expect(section("format")).toContain("필수");
    expect(section("format")).toContain("GEN");
    expect(section("domain")).toContain("분류코드");
    expect(section("domain")).toContain("D_CAT");
    expect(section("domain")).toContain("CODE");
    expect(section("domain")).toContain("EA");
    expect(section("stdExpr")).toContain("LEN(CATEGORY) <= 240");
    expect(section("codes")).toContain("C1 코드1");
    expect(section("codes")).toContain("C10 코드10");
    expect(section("codes")).not.toContain("C11");
    expect(section("codes")).toContain("외 2개");
    expect(section("bizRule")).toContain("저장할 때 서버에서 확인");
  });

  it("빈 칸은 그리지 않는다 — 제목은 labelLong 이 없으면 columnName, 그것도 없으면 물리명", () => {
    render(createElement(MdmMetaCard, { column: column("USE_YN", { columnName: "사용여부", dataType: null, length: null }) }));
    expect(sections()).toEqual(["title", "format"]);
    expect(section("title")).toContain("사용여부");
    expect(section("format")).toContain("선택");
  });

  it("별칭으로 맞았으면 제목 아래에 \"{시스템} 이름 {별칭} · 표준 {물리명}\" 한 줄이 보인다", () => {
    render(
      createElement(MdmMetaCard, {
        column: column("ABS_CHM_RPLN_AMT", {
          columnName: "금액",
          matchedSystem: "MES",
          systemPhysName: "ABS_CHM_SLP_AMT",
        }),
      })
    );

    expect(sections()).toEqual(["title", "alias", "format"]);
    expect(section("alias")).toBe("MES 이름 ABS_CHM_SLP_AMT · 표준 ABS_CHM_RPLN_AMT");
  });

  it("표준 이름으로 맞았거나(null) 옛 모듈 응답(칸 없음)이면 별칭 줄이 없다", () => {
    render(createElement(MdmMetaCard, { column: column("USE_YN", { matchedSystem: null, systemPhysName: null }) }));
    expect(sections()).not.toContain("alias");
    act(() => root?.unmount());
    host.remove();
    render(createElement(MdmMetaCard, { column: column("USE_YN") }));
    expect(sections()).not.toContain("alias");
  });

  it("한 칸만 있으면(시스템 또는 별칭 없음) 별칭 줄을 그리지 않는다", () => {
    render(createElement(MdmMetaCard, { column: column("USE_YN", { matchedSystem: "MES", systemPhysName: null }) }));
    expect(sections()).not.toContain("alias");
  });

  it("표준식은 컬럼에 없으면 도메인 것을 쓴다", () => {
    render(
      createElement(MdmMetaCard, {
        column: column("QTY", { dataType: "NUMBER", length: 3, scale: 1 }),
        domain: domain("D_QTY", { stdExpr: { text: "QTY >= 0", ast: null } }),
      })
    );
    expect(section("format")).toContain("NUMBER(3,1)");
    expect(section("stdExpr")).toContain("QTY >= 0");
  });
});

describe("formatMdmDataType", () => {
  it.each([
    [{ dataType: "STRING", length: 20, scale: null }, "STRING(20)"],
    [{ dataType: "NUMBER", length: 3, scale: 1 }, "NUMBER(3,1)"],
    [{ dataType: "NUMBER", length: 10, scale: 0 }, "NUMBER(10)"],
    [{ dataType: "DATE", length: null, scale: null }, "DATE"],
    [{ dataType: null, length: null, scale: null }, null],
  ])("%j → %s", (c, expected) => {
    expect(formatMdmDataType(c)).toBe(expected);
  });
});
