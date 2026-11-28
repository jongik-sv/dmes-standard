/** @vitest-environment happy-dom */
/**
 * 사람·역할 그룹·역할 칸 찾기(2026-11-28 m13). 진짜 shared(dist) 입력을 그려 찾는 말을 넣어 본다.
 *  - 사람 칸: 찾는 말이 없으면 받은 사람 전부. 200명(서버 상한)이면 좁히라는 안내, 아니면 안내 없음.
 *  - 그룹·역할 칸: ID·이름 부분 일치, 고른 항목은 걸러져도 맨 위, 「N개 찾음」, 없으면 「찾는 …이 없습니다」.
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { createMockPermBenchApi } from "./bench.fixture";
import { GroupCol } from "./GroupCol";
import { indexBench, type BenchIndex } from "./model";
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

const names = () => [...host.querySelectorAll(".pb-pick__nm")].map((b) => b.textContent ?? "");
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

describe("commPermBench 칸 찾기", () => {
  it("사람 칸: 찾는 말이 없으면 받은 사람 전부를 보이고, 200명 미만이면 안내가 없다", async () => {
    const full = await loadBench();
    const users = full.users.slice(0, 30);
    const bench: BenchIndex = { ...full, users, userById: new Map(users.map((u) => [u.USER_ID, u])) };
    await show(bench, createElement(PeopleCol, { userId: users[5].USER_ID, onSelect: () => {} }));
    expect(host.querySelectorAll(".pb-pick")).toHaveLength(30);
    expect(names()[0]).toContain(users[5].USER_NM);
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

  it("역할 그룹 칸: ID·이름으로 찾고, 고른 그룹은 걸러져도 맨 위에 남는다", async () => {
    const bench = await loadBench();
    const [sel, other] = bench.groups;
    const userId = bench.users.find((u) => (bench.userGroups.get(u.USER_ID) ?? []).includes(sel.ROLE_GROUP_ID))!.USER_ID;
    await show(bench, createElement(GroupCol, { userId, groupId: sel.ROLE_GROUP_ID, canEdit: false, onSelect: () => {}, onToggleMember: () => {} }));
    expect(host.querySelectorAll(".pb-pick")).toHaveLength(bench.groups.length);

    await type("그룹 이름·ROLE_GROUP_ID 찾기", other.ROLE_GROUP_ID.toLowerCase());
    const hits = bench.groups.filter((g) => `${g.ROLE_GROUP_ID} ${g.ROLE_GROUP_NM}`.toLowerCase().includes(other.ROLE_GROUP_ID.toLowerCase()));
    expect(hint()).toContain(`${hits.length}개 찾음`);
    expect(names()[0]).toContain(sel.ROLE_GROUP_NM);
    expect(names().some((n) => n.includes(other.ROLE_GROUP_NM))).toBe(true);

    await type("그룹 이름·ROLE_GROUP_ID 찾기", other.ROLE_GROUP_NM);
    expect(names().some((n) => n.includes(other.ROLE_GROUP_NM))).toBe(true);

    await type("그룹 이름·ROLE_GROUP_ID 찾기", "없는그룹말");
    expect(hint()).toContain("0개 찾음");
    expect(host.querySelectorAll(".pb-pick")).toHaveLength(1); // 고른 그룹만 남는다
  });

  it("역할 그룹 칸: 고른 그룹이 없고 맞는 그룹도 없으면 「찾는 그룹이 없습니다」", async () => {
    const bench = await loadBench();
    await show(bench, createElement(GroupCol, { userId: bench.users[0].USER_ID, groupId: null, canEdit: false, onSelect: () => {}, onToggleMember: () => {} }));
    await type("그룹 이름·ROLE_GROUP_ID 찾기", "없는그룹말");
    expect(host.textContent).toContain("찾는 그룹이 없습니다");
  });

  it("역할 칸(사람 기준): ROLE_ID·ROLE_NM 으로 찾고, 고른 역할은 맨 위, 없으면 「찾는 역할이 없습니다」", async () => {
    const bench = await loadBench();
    const gid = bench.groups[0].ROLE_GROUP_ID;
    const [sel, other] = bench.roles;
    await show(bench, createElement(RoleCol, { groupId: gid, roleId: sel.ROLE_ID, canEdit: false, onSelect: () => {}, onToggleGroupRole: () => {} }));
    expect(host.querySelectorAll(".pb-pick")).toHaveLength(bench.roles.length);

    await type("역할 이름·ROLE_ID 찾기", other.ROLE_NM.toUpperCase());
    expect(hint()).toMatch(/\d+개 찾음/);
    expect(names()[0]).toContain(sel.ROLE_NM);
    expect(names().some((n) => n.includes(other.ROLE_NM))).toBe(true);

    await type("역할 이름·ROLE_ID 찾기", other.ROLE_ID.toLowerCase());
    expect(names().some((n) => n.includes(other.ROLE_NM))).toBe(true);
  });

  it("역할 칸(역할 기준): 고른 역할이 없고 맞는 역할도 없으면 「찾는 역할이 없습니다」", async () => {
    const bench = await loadBench();
    await show(bench, createElement(RoleAllCol, { roleId: null, onSelect: () => {} }));
    await type("역할 이름·ROLE_ID 찾기", "없는역할말");
    expect(hint()).toContain("0개 찾음");
    expect(host.textContent).toContain("찾는 역할이 없습니다");
  });
});
