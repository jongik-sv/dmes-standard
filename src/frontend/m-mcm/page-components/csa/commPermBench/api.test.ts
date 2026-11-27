/** api.ts 실패 문구 읽기·응답 풀기 보충 시험(f8). 기존 draft.test.ts 의 NOT_FOUND·PERM_DRAFT_BUSY 시험과 겹치지 않는 것만. */
import { describe, expect, it } from "vitest";
import { NETWORK_ERROR_TEXT, createPermBenchApi, failureFromMessage, failureOf, readResponse, scopesOfDetail, unwrapPayload } from "./api";
import { PERM_ERROR_CODES, PermApplyError } from "./types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("api — 실패 문구 → 오류", () => {
  it("아는 코드 목록 = 계약 전부(bench-be f3 추가 PERM_BAD_VALUE·PERM_BUSY, f10 실응답 대조 추가 5개 포함)", () => {
    expect([...PERM_ERROR_CODES].sort()).toEqual(
      ["NOT_FOUND", "PERM_BAD_VALUE", "PERM_BUSY", "PERM_CONFLICT", "PERM_DRAFT_BUSY", "PERM_DRAFT_CORRUPT", "PERM_EMPTY_BTN", "PERM_FORBIDDEN", "PERM_NEED_CONFIRM", "PERM_NOT_IN_OBJ", "PERM_NO_USER", "VALIDATION_ERROR", "PERM_REQUIRED", "PERM_BAD_SOURCE", "PERM_NOT_READY", "PERM_DRAFT_NOT_READY"].sort(),
    );
  });

  it("아는 코드 전부를 「CODE: 설명」에서 읽는다", () => {
    for (const c of PERM_ERROR_CODES) {
      const e = failureFromMessage(`${c}: 설명입니다`);
      expect(e).toBeInstanceOf(PermApplyError);
      expect((e as PermApplyError).code).toBe(c);
      expect(e.message).toBe("설명입니다");
    }
  });

  it("모르는 코드·코드 모양이 아닌 글은 일반 Error 로 그대로 둔다", () => {
    for (const m of ["UNKNOWN_CODE: x", "perm_conflict: x", "그냥 실패", "PERM_CONFLICT 설명"]) {
      const e = failureFromMessage(m);
      expect(e).not.toBeInstanceOf(PermApplyError);
      expect(e.message).toBe(m);
    }
  });

  it("앞뒤 공백·콜론 앞 공백·설명이 빈 경우도 읽는다(빈 설명은 원문)", () => {
    expect((failureFromMessage("  PERM_NO_USER : 로그인 필요  ") as PermApplyError).message).toBe("로그인 필요");
    expect(failureFromMessage("PERM_EMPTY_BTN:").message).toBe("PERM_EMPTY_BTN:");
  });

  it("failureOf: scopes 는 배열 또는 콤마 글, 문구가 비면 기본 문구", () => {
    const a = failureOf({ meta: { success: false, message: "PERM_CONFLICT: 충돌" }, data: { scopes: ["u1", 2] } }) as PermApplyError;
    expect(a.scopes).toEqual(["u1", "2"]);
    const b = failureOf({ meta: { success: false, message: "PERM_CONFLICT: 충돌" }, data: { scopes: "u1,,G1" } }) as PermApplyError;
    expect(b.scopes).toEqual(["u1", "G1"]);
    expect(failureOf({ meta: { success: false, message: "   " } }).message).toBe("요청이 거부되었습니다.");
    expect(failureOf({}).message).toBe("요청이 거부되었습니다.");
  });
});

describe("api — 응답 읽기", () => {
  it("HTTP 409 + envelope 의 PERM_DRAFT_BUSY 도 코드로 읽는다", async () => {
    const err = await readResponse(json({ meta: { success: false, message: "PERM_DRAFT_BUSY: 잠금" } }, 409)).catch((e: unknown) => e);
    expect((err as PermApplyError).code).toBe("PERM_DRAFT_BUSY");
  });

  it("envelope 없는 HTTP 오류: 본문 문구 → 상태 기본 문구 → 일반 문구 순", async () => {
    const e1 = await readResponse(json({ error: { message: "PERM_FORBIDDEN: 막힘" } }, 403)).catch((e: unknown) => e);
    expect((e1 as PermApplyError).code).toBe("PERM_FORBIDDEN");
    const e2 = await readResponse(new Response("<html>", { status: 503 })).catch((e: unknown) => e);
    expect((e2 as Error).message).toBe("서비스를 일시적으로 사용할 수 없습니다.");
    const e3 = await readResponse(new Response("x", { status: 418 })).catch((e: unknown) => e);
    expect((e3 as Error).message).toContain("418");
  });

  it("성공 본문은 그대로 돌려준다", async () => {
    expect(await readResponse(json({ meta: { success: true }, data: { a: 1 } }))).toEqual({ meta: { success: true }, data: { a: 1 } });
  });

  it("unwrapPayload: data.result(Map) 를 펴고 data.grids 가 이기며, 실패 envelope 는 던진다", () => {
    const out = unwrapPayload<Record<string, unknown>>({
      meta: { success: true },
      data: { other: 1, result: { users: { rows: [1] }, plain: [2], summary: [{ n: 1 }] }, grids: { users: { rows: [9] } } },
    });
    expect(out).toEqual({ other: 1, users: [9], plain: [2], summary: [{ n: 1 }] });
    expect(() => unwrapPayload({ meta: { success: false, message: "NOT_FOUND: 없음" } })).toThrow(PermApplyError);
    expect(unwrapPayload<Record<string, unknown>>({ grids: { draft: { rows: [{ a: 1 }] } } })).toEqual({ draft: [{ a: 1 }] });
  });
});

describe("api — 새 코드·상태 문구·네트워크 실패(f3 리뷰 14 · bench-be f3 추가)", () => {
  it("HTTP 400 envelope 의 PERM_BAD_VALUE·PERM_BUSY·PERM_DRAFT_CORRUPT 를 코드로 읽는다", async () => {
    for (const code of ["PERM_BAD_VALUE", "PERM_BUSY", "PERM_DRAFT_CORRUPT"] as const) {
      const err = await readResponse(json({ meta: { success: false, message: `${code}: 설명` } }, 400)).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PermApplyError);
      expect((err as PermApplyError).code).toBe(code);
    }
  });

  it("PERM_CONFLICT 가 범위 없이 와도(쓰기 단계 제약 위반) 빈 scopes 로 읽는다", () => {
    const e = failureOf({ meta: { success: false, message: "PERM_CONFLICT: 제약 위반" } }) as PermApplyError;
    expect(e.code).toBe("PERM_CONFLICT");
    expect(e.scopes).toEqual([]);
  });

  it("본문 없는 409·502·504 는 한국어 상태 문구", async () => {
    for (const st of [409, 502, 504]) {
      const e = (await readResponse(new Response("", { status: st })).catch((x: unknown) => x)) as Error;
      expect(e.message).not.toContain(`(${st})`);
      expect(e.message.length).toBeGreaterThan(5);
    }
  });

  it("fetch TypeError(Failed to fetch)는 한국어 네트워크 안내로 바꾼다", async () => {
    const api = createPermBenchApi(() => Promise.reject(new TypeError("Failed to fetch")));
    const e = (await api.loadDraft().catch((x: unknown) => x)) as Error;
    expect(e.message).toBe(NETWORK_ERROR_TEXT);
  });

  it("searchBench: me 칸이 있으면 넘기고, 없으면(옛 서버) 넣지 않는다", async () => {
    const body = (me?: unknown) => json({ meta: { success: true }, data: { result: { users: [], groups: [], roles: [], userGroups: [], groupRoles: [], ...(me ? { me } : {}) } } });
    const a = await createPermBenchApi(() => Promise.resolve(body([{ ME_SYSADMIN: "Y" }]))).searchBench({});
    expect(a.me).toEqual([{ ME_SYSADMIN: "Y" }]);
    const b = await createPermBenchApi(() => Promise.resolve(body())).searchBench({});
    expect("me" in b).toBe(false);
  });
});

describe("api — 실응답 모양(f10, BE 5c9075d4b)", () => {
  it("PERM_CONFLICT 상세 「group:G,role:R,user:U」 → scopes = 접두째 목록", () => {
    const e = failureOf({ meta: { success: false, message: "PERM_CONFLICT: group:RG_A,role:R_VIEW,user:U1" } }) as PermApplyError;
    expect(e.code).toBe("PERM_CONFLICT");
    expect(e.scopes).toEqual(["group:RG_A", "role:R_VIEW", "user:U1"]);
    expect(scopesOfDetail("다른 글")).toEqual([]);
    expect(scopesOfDetail("role:R1, 설명")).toEqual([]);
    // data.scopes 가 오면 그것이 먼저
    expect((failureOf({ meta: { success: false, message: "PERM_CONFLICT: role:R1" }, data: { scopes: ["X"] } }) as PermApplyError).scopes).toEqual(["X"]);
  });

  it("BE 가 새로 내는 코드(VALIDATION_ERROR 등)도 코드로 읽고 상세만 남긴다", () => {
    for (const c of ["VALIDATION_ERROR", "PERM_REQUIRED", "PERM_BAD_SOURCE", "PERM_NOT_READY", "PERM_DRAFT_NOT_READY"]) {
      const e = failureFromMessage(`${c}: 상세`) as PermApplyError;
      expect(e).toBeInstanceOf(PermApplyError);
      expect(e.message).toBe("상세");
    }
  });

  it("그리드 하나 action = 맨 위 grids, 여러 칸 action = data.result(줄 배열), me[0].ME_SYSADMIN 을 읽는다", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.endsWith("/searchBench"))
        return json({ meta: { success: true }, data: { result: { users: [{ USER_ID: "U1" }], groups: [], roles: [], userGroups: [], groupRoles: [], me: [{ ME_SYSADMIN: "Y" }] } } });
      return json({ meta: { success: true }, grids: { draft: { rows: [{ CHANGES_JSON: "[]", CHANGE_CNT: 0, U_AT: "2026-11-27 14:05:09" }] } } });
    }) as unknown as typeof fetch;
    const api = createPermBenchApi(fetchImpl);
    const b = await api.searchBench({});
    expect(b.users).toEqual([{ USER_ID: "U1" }]);
    expect(b.me?.[0].ME_SYSADMIN).toBe("Y");
    expect((await api.loadDraft()).draft[0].U_AT).toBe("2026-11-27 14:05:09");
    expect(calls).toEqual(["/api/mcm/oasis/commPermBench/searchBench", "/api/mcm/oasis/commPermBench/loadDraft"]);
  });
});
