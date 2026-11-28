/** @vitest-environment happy-dom */

// 정렬 단추 묶음(shared sort-toggle) — 다음 기준·방향 뒤집기, 단추가 onChange 로 넘기는 값, 기준이 하나면 기준 단추 없음.
import { act, createElement, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { flipSortDir, nextSortKey, SortToggle, type SortState } from "../../src/components/sort-toggle";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;

afterEach(() => {
  r?.unmount();
  r = null;
});

const q = (id: string) => r!.host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);

describe("sort-state", () => {
  it("nextSortKey 는 다음 기준, 끝이면 처음, 목록 밖이면 첫 값", () => {
    expect(nextSortKey(["id", "name"], "id")).toBe("name");
    expect(nextSortKey(["id", "name"], "name")).toBe("id");
    expect(nextSortKey(["id", "name", "dept"], "zzz" as "id")).toBe("id");
    expect(nextSortKey([] as string[], "id")).toBe("id");
  });
  it("flipSortDir 는 오름·내림을 뒤집는다", () => {
    expect(flipSortDir("asc")).toBe("desc");
    expect(flipSortDir("desc")).toBe("asc");
  });
});

const OPTIONS = [
  { value: "id", label: "ID" },
  { value: "name", label: "이름" },
] as const;

function Harness({ seen }: { seen: SortState[] }) {
  const [v, setV] = useState<SortState<"id" | "name">>({ key: "id", dir: "asc" });
  return createElement(SortToggle<"id" | "name">, {
    options: OPTIONS,
    value: v,
    "aria-label": "사람 정렬",
    testId: "st",
    onChange: (next) => {
      seen.push(next);
      setV(next);
    },
  });
}

describe("SortToggle", () => {
  it("기준 단추는 다음 기준으로, 방향 단추는 방향만 바꾼다", async () => {
    const seen: SortState[] = [];
    r = renderWithMantine(createElement(Harness, { seen }));
    expect(q("st")!.getAttribute("role")).toBe("group");
    expect(q("st-key")!.textContent).toBe("ID");
    expect(q("st-key")!.getAttribute("aria-label")).toBe("사람 정렬 기준: ID — 누르면 이름");
    expect(q("st-dir")!.dataset.dir).toBe("asc");

    await act(async () => q("st-key")!.click());
    expect(seen.at(-1)).toEqual({ key: "name", dir: "asc" });
    expect(q("st-key")!.textContent).toBe("이름");

    await act(async () => q("st-dir")!.click());
    expect(seen.at(-1)).toEqual({ key: "name", dir: "desc" });
    expect(q("st-dir")!.getAttribute("aria-label")).toBe("사람 정렬 방향: 내림차순 — 누르면 오름차순");

    await act(async () => q("st-key")!.click());
    expect(seen.at(-1)).toEqual({ key: "id", dir: "desc" });
  });

  it("기준이 하나면 방향 단추만, disabled 면 두 단추 모두 잠근다", () => {
    r = renderWithMantine(
      createElement(SortToggle, { options: [{ value: "id", label: "ID" }], value: { key: "id", dir: "asc" }, onChange: () => {}, disabled: true }),
    );
    expect(r.host.querySelector('[data-testid="sort-toggle-key"]')).toBeNull();
    expect(r.host.querySelector<HTMLButtonElement>('[data-testid="sort-toggle-dir"]')!.disabled).toBe(true);
  });
});
