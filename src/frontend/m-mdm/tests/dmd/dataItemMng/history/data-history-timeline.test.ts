/** @vitest-environment happy-dom */

// TSK-07-03 design.md §3.4 — 선분 타임라인 렌더 스모크(D-104 로 항목 이력 화면을 항목 편집 이력 패널로 합치며 화면 대신
// 타임라인 컴포넌트를 직접 그린다). 서버가 준 빈 구간(gapFrom)을 "닫혀 있던 구간" 줄로 그대로 끼우고(H2), 빈 결과면
// "행이 없습니다" 를 보인다. 화면은 사건을 다시 계산하지 않는다.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { DataHistoryTimeline, timelineColumns } from "../../../../pages/dmd/dataItemMng/history/DataHistoryTimeline";
import type { DataHistoryResult } from "../../../../pages/dmd/dataItemMng/history/types";

let container: HTMLDivElement;
let root: Root | null = null;

const header = {
  maruDataId: "PORT",
  maruDataName: "항구",
  status: "INUSE",
  sourceKind: "MDM",
  sourceSystem: null,
  lvlCnt: 0,
  attrLabels: [],
  editable: true,
  categories: [],
};

function historyRow(over: Record<string, unknown>) {
  return { open: false, gapFrom: null, gapTo: null, name: "부산", rowVersion: 0, ...over };
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function render(result: DataHistoryResult) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(DataHistoryTimeline, { result })));
  });
  await flush();
}

describe("DataHistoryTimeline", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
  });

  it("빈 구간이 있는 행 앞에 닫혀 있던 구간 줄을 하나 끼운다", async () => {
    await render({
      header,
      target: "ITEM",
      key: "KRPUS",
      state: "OPEN",
      rows: [
        historyRow({ validFrom: "2026-08-20 09:00:00", validTo: "2026-08-20 09:05:00", event: "CREATED", rowState: "PAST" }),
        historyRow({ validFrom: "2026-08-20 09:05:00", validTo: "2026-08-20 09:10:00", event: "CHANGED", rowState: "PAST" }),
        historyRow({
          validFrom: "2026-08-20 09:20:00",
          validTo: "9999-12-31 00:00:00",
          open: true,
          event: "REOPENED",
          rowState: "OPEN",
          gapFrom: "2026-08-20 09:10:00",
          gapTo: "2026-08-20 09:20:00",
        }),
      ],
    } as DataHistoryResult);

    const rows = Array.from(container.querySelectorAll(".ag-center-cols-container .ag-row"));
    expect(rows).toHaveLength(4);
    const gapRows = Array.from(container.querySelectorAll('.ag-row[row-id^="gap"]'));
    expect(gapRows).toHaveLength(1);
    expect(gapRows[0].textContent).toContain("닫혀 있던 구간");
    expect(gapRows[0].textContent).toContain("2026-08-20 09:10:00");
    expect(container.querySelector('.ag-row[row-id="r2"]')?.textContent).toContain("다시 열기");
    expect(container.querySelector('.ag-row[row-id="r0"]')?.textContent).toContain("생성");
    expect(container.querySelector('[data-testid="history-state"]')?.textContent).toContain("열림");
  });

  it("빈 결과면 행이 없습니다 를 보인다", async () => {
    await render({ header, target: "ITEM", key: "NOPE", state: "NONE", rows: [] });

    expect(container.querySelector('[data-testid="history-empty"]')?.textContent).toBe("행이 없습니다");
  });

  // D-104 회귀 — 오른쪽 열(1280 폭에서 330px 안팎)에서 판단에 필요한 값이 가로 스크롤 없이 보이도록 칸 안에 쌓는다.
  const headers = () => Array.from(container.querySelectorAll(".ag-header-cell-text")).map((h) => h.textContent);
  const cellOf = (rowId: string, colId: string) =>
    container.querySelector(`.ag-row[row-id="${rowId}"] .ag-cell[col-id="${colId}"]`) as HTMLElement | null;

  it("카테고리 이력은 네 칸 — 이름·종류·대상·정규식을 한 칸에 세 줄로 쌓고 제목에 전체 값을 둔다", async () => {
    await render({
      header,
      target: "CATE",
      key: "KRONLY",
      state: "OPEN",
      rows: [
        historyRow({ validFrom: "2026-08-20 09:00:00", validTo: "2026-08-20 09:05:00", event: "CREATED", rowState: "PAST",
          cateName: "한국 항구", defKind: "REGEX", defTarget: "KEY", defExpr: "^.*$" }),
        historyRow({ validFrom: "2026-08-20 09:05:00", validTo: "9999-12-31 00:00:00", open: true, event: "CHANGED",
          rowState: "OPEN", cateName: "한국 항구(계층)", defKind: "REGEX", defTarget: "LVL1", defExpr: "^KR$" }),
      ],
    } as DataHistoryResult);

    expect(headers()).toEqual(["사건", "시작", "끝", "카테고리 정의"]);
    const def = cellOf("r1", "cateName");
    expect(def?.textContent).toContain("한국 항구(계층)");
    expect(def?.textContent).toContain("REGEX · LVL1");
    expect(def?.textContent).toContain("^KR$");
    expect(def?.querySelector("[title]")?.getAttribute("title")).toBe("이름 한국 항구(계층) · 종류 REGEX · 대상 LVL1 · 정규식 ^KR$");
    // 사건 칸은 사건·행 상태 배지 두 줄, 시작·끝 칸은 날짜·시각 두 줄.
    expect(cellOf("r0", "eventLabel")?.textContent).toBe("생성 지난 행");
    expect(Array.from(cellOf("r0", "validTo")?.querySelectorAll("[title] > div") ?? []).map((d) => d.textContent)).toEqual([
      "2026-08-20", "09:05:00",
    ]);
    // 글자로는 한 일시로 읽힌다 — 앞 행의 끝과 다음 행의 시작을 같은 글자로 맞대 본다(e2e S3).
    expect(cellOf("r0", "validTo")?.textContent).toBe("2026-08-20 09:05:00");
    expect(cellOf("r1", "validFrom")?.textContent).toBe(cellOf("r0", "validTo")?.textContent);
    expect(cellOf("r1", "validTo")?.textContent).toBe("열림");
  });

  // e2e dataItemMng S10 — 1280 기본 폭에서 카테고리 이력 칸은 약 325px(실측 clientWidth 325, 66f40e88 배치)인데 열 최소 폭 합이
  // 326px 이라 1px 가로 스크롤이 생겼다. fit 그리드는 칸이 좁으면 minWidth 까지 줄고 그 합이 칸보다 넓으면 넘친다. 행이 많아 세로 스크롤바가
  // 생기면(Windows 고정 스크롤바 약 17px) 그만큼 더 좁아지므로 예산은 325 - 17 = 308px 이다. 레이아웃은 happy-dom 이 계산하지 않아
  // 열 정의의 최소 폭 합으로 고정하고, 실제 폭은 e2e S10 이 본다. 항목 이력(ITEM)은 덜 중요한 칸을 가로로 밀어 보는 설계라 대상이 아니다.
  it("카테고리·소속 이력은 열 최소 폭 합이 1280 폭의 이력 칸(세로 스크롤바 몫 제외 308px) 안에 들어 가로 스크롤이 없다", () => {
    const minSum = (target: "CATE" | "CATE_ITEM") =>
      timelineColumns(target, header, "K").reduce((sum, c) => sum + (c.minWidth ?? c.width ?? 50), 0);
    expect(minSum("CATE")).toBeLessThanOrEqual(308);
    expect(minSum("CATE_ITEM")).toBeLessThanOrEqual(308);
  });

  // 넷째 칸은 56px 까지 줄어 머리글(「카테고리 정의」·「항목 키」)이 말줄임될 수 있다. 셀 값은 제목(title)으로 보이지만 머리글은
  // 다른 방법이 없으므로, 머리 툴팁에 머리글 전체를 둔다.
  it("좁아지는 넷째 칸은 머리 툴팁에 머리글 전체를 둔다", () => {
    const fourth = (target: "CATE" | "CATE_ITEM") => timelineColumns(target, header, "K")[3];
    expect(fourth("CATE")).toMatchObject({ header: "카테고리 정의", headerTooltip: "카테고리 정의" });
    expect(fourth("CATE_ITEM")).toMatchObject({ header: "항목 키", headerTooltip: "항목 키" });
  });

  it("소속 이력은 항목 키 칸을, 항목 이력은 이름 칸을 네 번째에 두고 덜 중요한 칸은 뒤로 보낸다", async () => {
    await render({ header, target: "CATE_ITEM", key: "KRPUS", state: "OPEN", rows: [
      historyRow({ validFrom: "2026-08-20 09:00:00", validTo: "9999-12-31 00:00:00", open: true, event: "CREATED", rowState: "OPEN" }),
    ] } as DataHistoryResult);
    expect(headers()).toEqual(["사건", "시작", "끝", "항목 키"]);
    expect(cellOf("r0", "memberKey")?.textContent).toBe("KRPUS");
    act(() => root?.unmount());
    container.remove();

    await render({
      header: { ...header, lvlCnt: 1, attrLabels: [{ field: "attr01", label: "국가" }] },
      target: "ITEM", key: "KRPUS", state: "OPEN",
      rows: [historyRow({ validFrom: "2026-08-20 09:00:00", validTo: "9999-12-31 00:00:00", open: true, event: "CREATED",
        rowState: "OPEN", alterName: "PUS" })],
    } as DataHistoryResult);
    expect(headers().slice(0, 4)).toEqual(["사건", "시작", "끝", "이름"]);
    expect(cellOf("r0", "name")?.textContent).toBe("부산 PUS");
  });
});
