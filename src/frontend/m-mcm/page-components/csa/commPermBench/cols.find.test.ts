/** @vitest-environment happy-dom */
/**
 * 사람·역할 그룹·역할 칸 찾기(2026-11-28 m13). 진짜 shared(dist) 입력을 그려 찾는 말을 넣어 본다.
 *  - 사람 칸: 찾는 말이 없으면 받은 사람 전부. 200명(서버 상한)이면 좁히라는 안내, 아니면 안내 없음.
 *  - 그룹·역할 칸: ID·이름 부분 일치, 고른 항목은 걸러져도 목록에 남되 정렬된 자기 자리, 「N개 찾음」, 없으면 「찾는 …이 없습니다」.
 *  - 칸 머리 정렬 단추(2026-11-28 m15): 기준(ID·이름)·방향(오름·내림)을 칸마다 따로 바꾼다. 기본 ID 오름.
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { createMockPermBenchApi } from "./bench.fixture";
import { GroupCol } from "./GroupCol";
import { COL_SORT_DEFAULT, indexBench, sortRows, type BenchIndex } from "./model";
import { BenchContext } from "./parts";
import { PeopleCol } from "./PeopleCol";
import { RoleAllCol, RoleCol } from "./RoleCol";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  host.remove();
});

async function loadBench(): Promise<BenchIndex> {
  return indexBench(await createMockPermBenchApi().searchBench({}));
}

async function show(bench: BenchIndex, el: ReactNode) {
  const ctx = { bench, base: bench, canLink: false, isSysadmin: true };
  await act(async () => root!.render(createElement(DmesUiProvider, null, createElement(BenchContext.Provider, { value: ctx }, el))));
}

const names = (root: ParentNode = host) => [...root.querySelectorAll(".pb-pick__nm > span")].map((b) => b.textContent ?? "");
const onIndex = (root: ParentNode = host) => [...root.querySelectorAll(".pb-pick")].findIndex((x) => x.classList.contains("is-on"));
const panels = () => [...host.querySelectorAll<HTMLElement>(".pb-panel")];
/** 보이는 줄 이름이 기대한 이름으로 시작하는가(뒤에 꼬리표가 붙을 수 있다). */
function expectNames(got: string[], want: string[]) {
  expect(got).toHaveLength(want.length);
  got.forEach((g, i) => expect(g.startsWith(want[i]), `${i}: ${g} ≠ ${want[i]}`).toBe(true));
}
async function click(testId: string) {
  const b = host.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  expect(b, testId).not.toBeNull();
  await act(async () => b!.click());
}
const hint = () => host.querySelector(".pb-colhint")?.textContent ?? "";

async function type(label: string, text: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  expect(input, label).not.toBeNull();
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input, text);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("commPermBench 칸 찾기·정렬", () => {
  it("사람 칸: 찾는 말이 없으면 받은 사람 전부를 USER_ID 순으로, 고른 사람은 자기 자리에 두고 200명 미만이면 안내가 없다", async () => {
    const full = await loadBench();
    const users = full.users.slice(0, 30).reverse();
    const bench: BenchIndex = { ...full, users, userById: new Map(users.map((u) => [u.USER_ID, u])) };
    const sorted = sortRows(users, COL_SORT_DEFAULT, (u) => u.USER_ID, (u) => u.USER_NM);
    await show(bench, createElement(PeopleCol, { userId: sorted[5].USER_ID, onSelect: () => {} }));
    expectNames(names(), sorted.map((u) => u.USER_NM));
    expect(onIndex()).toBe(5);
    expect(hint()).not.toContain("그룹마다");
    expect(hint()).not.toContain("명만 보입니다");
  });

  it("사람 칸: 받은 사람이 200명(서버 상한)이면 좁히라는 안내를 보이고, 찾으면 N명 찾음", async () => {
    const full = await loadBench();
    const users = full.users.slice(0, 200);
    const bench: BenchIndex = { ...full, users, userById: new Map(users.map((u) => [u.USER_ID, u])) };
    await show(bench, createElement(PeopleCol, { userId: null, onSelect: () => {} }));
    expect(host.querySelectorAll(".pb-pick")).toHaveLength(200);
    expect(hint()).toContain("앞 200명만 보입니다. 찾기로 좁히세요");
    await type("이름·부서·사번 찾기", users[7].USER_ID);
    expect(hint()).toContain("1명 찾음");
    expect(hint()).not.toContain("명만 보입니다");
    expect(host.querySelectorAll(".pb-pick")).toHaveLength(1);
  });

  it("사람 칸: 찾기로 걸러진 고른 사람은 목록에 남되 맨 위가 아니라 정렬 자리에 있다", async () => {
    const bench = await loadBench();
    const sorted = sortRows(bench.users, COL_SORT_DEFAULT, (u) => u.USER_ID, (u) => u.USER_NM);
    await show(bench, createElement(PeopleCol, { userId: sorted[20].USER_ID, onSelect: () => {} }));
    await type("이름·부서·사번 찾기", sorted[3].USER_ID);
    expect(hint()).toContain("1명 찾음");
    expectNames(names(), [sorted[3].USER_NM, sorted[20].USER_NM]);
    expect(onIndex()).toBe(1);
  });

  it("역할 그룹 칸: ID·이름으로 찾고, 고른 그룹은 걸러져도 정렬 자리에 남는다", async () => {
    const bench = await loadBench();
    const sorted = sortRows(bench.groups, COL_SORT_DEFAULT, (g) => g.ROLE_GROUP_ID, (g) => g.ROLE_GROUP_NM);
    // 가짜 서버는 사람을 앞 200명만 준다 — 그 안에 사람이 있는 그룹 가운데 정렬상 마지막을 고른다
    const memberOf = (gid: string) => bench.users.find((u) => (bench.userGroups.get(u.USER_ID) ?? []).includes(gid));
    const selAt = sorted.map((g) => !!memberOf(g.ROLE_GROUP_ID)).lastIndexOf(true);
    const sel = sorted[selAt];
    const other = sorted.find((g, i) => i < selAt && i > 0) ?? sorted[0];
    expect(selAt).toBeGreaterThan(1);
    const userId = memberOf(sel.ROLE_GROUP_ID)!.USER_ID;
    await show(bench, createElement(GroupCol, { userId, groupId: sel.ROLE_GROUP_ID, canEdit: false, onSelect: () => {}, onToggleMember: () => {} }));
    expectNames(names(), sorted.map((g) => g.ROLE_GROUP_NM));
    expect(onIndex()).toBe(selAt);

    const word = other.ROLE_GROUP_ID.toLowerCase();
    await type("그룹 이름·ROLE_GROUP_ID 찾기", word);
    const hits = sorted.filter((g) => `${g.ROLE_GROUP_ID} ${g.ROLE_GROUP_NM}`.toLowerCase().includes(word));
    expect(hint()).toContain(`${hits.length}개 찾음`);
    const want = sorted.filter((g) => hits.includes(g) || g === sel);
    expectNames(names(), want.map((g) => g.ROLE_GROUP_NM));
    expect(onIndex()).toBe(want.indexOf(sel)); // 맨 위가 아니라 정렬된 자기 자리
    expect(want.indexOf(sel)).toBeGreaterThan(0);

    await type("그룹 이름·ROLE_GROUP_ID 찾기", "없는그룹말");
    expect(hint()).toContain("0개 찾음");
    expectNames(names(), [sel.ROLE_GROUP_NM]); // 고른 그룹만 남는다
  });

  it("역할 그룹 칸: 고른 그룹이 없고 맞는 그룹도 없으면 「찾는 그룹이 없습니다」", async () => {
    const bench = await loadBench();
    await show(bench, createElement(GroupCol, { userId: bench.users[0].USER_ID, groupId: null, canEdit: false, onSelect: () => {}, onToggleMember: () => {} }));
    await type("그룹 이름·ROLE_GROUP_ID 찾기", "없는그룹말");
    expect(host.textContent).toContain("찾는 그룹이 없습니다");
  });

  it("정렬 단추: 칸마다 따로 기준·방향을 바꾸고, 다른 칸 순서는 그대로다", async () => {
    const full = await loadBench();
    const users = full.users.slice(0, 25);
    const bench: BenchIndex = { ...full, users, userById: new Map(users.map((u) => [u.USER_ID, u])) };
    const uSorted = sortRows(users, COL_SORT_DEFAULT, (u) => u.USER_ID, (u) => u.USER_NM);
    const gid = (s: Parameters<typeof sortRows>[1]) => sortRows(bench.groups, s, (g) => g.ROLE_GROUP_ID, (g) => g.ROLE_GROUP_NM).map((g) => g.ROLE_GROUP_NM);
    await show(
      bench,
      createElement("div", null,
        createElement(PeopleCol, { userId: null, onSelect: () => {} }),
        createElement(GroupCol, { userId: users[0].USER_ID, groupId: null, canEdit: false, onSelect: () => {}, onToggleMember: () => {} }),
      ),
    );
    const [people, groups] = panels();
    expectNames(names(groups), gid({ key: "id", dir: "asc" }));

    await click("pb-sort-group-dir");
    expectNames(names(groups), gid({ key: "id", dir: "desc" }));
    await click("pb-sort-group-key");
    expectNames(names(groups), gid({ key: "name", dir: "desc" }));
    await click("pb-sort-group-dir");
    expectNames(names(groups), gid({ key: "name", dir: "asc" }));
    // 사람 칸은 그대로 ID 오름
    expectNames(names(people), uSorted.map((u) => u.USER_NM));

    await click("pb-sort-user-key");
    expectNames(names(people), sortRows(users, { key: "name", dir: "asc" }, (u) => u.USER_ID, (u) => u.USER_NM).map((u) => u.USER_NM));
    expectNames(names(groups), gid({ key: "name", dir: "asc" }));
  });

  it("역할 칸(사람 기준): ROLE_ID·ROLE_NM 으로 찾고, 고른 역할은 정렬 자리에 남고, 정렬 단추로 뒤집는다", async () => {
    const bench = await loadBench();
    const gid = bench.groups[0].ROLE_GROUP_ID;
    const sorted = sortRows(bench.roles, COL_SORT_DEFAULT, (r) => r.ROLE_ID, (r) => r.ROLE_NM);
    const sel = sorted[sorted.length - 1];
    const other = sorted[0];
    await show(bench, createElement(RoleCol, { groupId: gid, roleId: sel.ROLE_ID, canEdit: false, onSelect: () => {}, onToggleGroupRole: () => {} }));
    expectNames(names(), sorted.map((r) => r.ROLE_NM));

    await type("역할 이름·ROLE_ID 찾기", other.ROLE_ID.toLowerCase());
    expect(hint()).toMatch(/\d+개 찾음/);
    const got = names();
    expect(got[0].startsWith(other.ROLE_NM)).toBe(true);
    expect(got.at(-1)!.startsWith(sel.ROLE_NM)).toBe(true); // 맨 위가 아니라 끝(자기 자리)

    await click("pb-sort-role-dir");
    const rev = names();
    expect(rev[0].startsWith(sel.ROLE_NM)).toBe(true);
    expect(rev.at(-1)!.startsWith(other.ROLE_NM)).toBe(true);
  });

  it("역할 칸(역할 기준): 이름 정렬, 고른 역할 자리 유지, 맞는 역할이 없으면 「찾는 역할이 없습니다」", async () => {
    const bench = await loadBench();
    const byName = sortRows(bench.roles, { key: "name", dir: "asc" }, (r) => r.ROLE_ID, (r) => r.ROLE_NM);
    await show(bench, createElement(RoleAllCol, { roleId: byName[2].ROLE_ID, onSelect: () => {} }));
    await click("pb-sort-role-key");
    expectNames(names(), byName.map((r) => r.ROLE_NM));
    expect(onIndex()).toBe(2);

    await show(bench, createElement(RoleAllCol, { roleId: null, onSelect: () => {} }));
    await type("역할 이름·ROLE_ID 찾기", "없는역할말");
    expect(hint()).toContain("0개 찾음");
    expect(host.textContent).toContain("찾는 역할이 없습니다");
  });
});
