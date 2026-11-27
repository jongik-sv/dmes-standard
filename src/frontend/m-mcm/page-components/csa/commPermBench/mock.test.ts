import { describe, expect, it } from "vitest";
import { buildMockGraph, createMockPermBenchApi, parseTokens, readPreset } from "./mock";
import { PermApplyError } from "./types";

describe("commPermBench 가짜 자료", () => {
  it("시안과 같은 규모(화면 1,004 · 역할 12 · 그룹 11 · 사람 554)", () => {
    const g = buildMockGraph();
    expect(g.objects.size).toBe(1004);
    expect(g.roles).toHaveLength(12);
    expect(g.groups).toHaveLength(11);
    expect(g.users).toHaveLength(554);
  });

  it("토큰 parse·조회만 프리셋", () => {
    expect(parseTokens(" find, save,,find  send ")).toEqual(["find", "save", "send"]);
    expect(readPreset(["search", "save", "findLot", "itemLov", "view", "export"])).toEqual(["search", "findLot", "itemLov", "view"]);
  });

  it("explain: 오브젝트에 없는 값은 NOT_IN_OBJ, SYSADMIN 은 모두 SYSADMIN", async () => {
    const api = createMockPermBenchApi();
    const g = api.graph();
    const lead = g.users.find((u) => g.userGroups.get(u.USER_ID)?.includes("RG_QC_LEAD"))!;
    const report = [...g.perms.get("ROLE_QC_MANAGER")!].find(([, p]) => p.btn.includes("approve"))![0];
    const ex = await api.explain({ userId: lead.USER_ID, objectId: report, source: "CUR" });
    expect(ex.buttons.find((b) => b.CODE === "approve")).toMatchObject({ ALLOWED: "N", GRANTED: "N", REASON: "NOT_IN_OBJ" });
    const admin = g.users.find((u) => g.userGroups.get(u.USER_ID)?.includes("RG_ADMIN"))!;
    const ex2 = await api.explain({ userId: admin.USER_ID, objectId: report, source: "CUR" });
    expect(ex2.buttons.every((b) => b.GRANTED === "Y" && b.REASON === "SYSADMIN")).toBe(true);
  });

  it("초안 → 영향 → 잃는 사람 확인 → 적용 → 이력", async () => {
    const api = createMockPermBenchApi();
    await api.saveDraft({
      grids: { changes: { rows: [{ TP: "GRP_ROLE", KEY1: "RG_QC_LEAD", KEY2: "ROLE_QC_MANAGER", OP: "DEL", BTN_PERM: null, POPUP_PERM: null }] } },
    });
    const im = await api.impact();
    expect(im.summary[0].LOSE_USER_CNT).toBe(7);
    await expect(api.apply({ confirmLoss: "N", memo: "" })).rejects.toBeInstanceOf(PermApplyError);
    const res = await api.apply({ confirmLoss: "Y", memo: "시험" });
    expect(res.result[0].CHANGE_CNT).toBe(1);
    expect((await api.loadDraft()).draft[0].CHANGE_CNT).toBe(0);
    const his = await api.searchHistory({});
    expect(his.his[0].APPLY_ID).toBe(res.result[0].APPLY_ID);
  });
});
