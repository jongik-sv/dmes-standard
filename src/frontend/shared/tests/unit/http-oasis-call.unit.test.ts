/**
 * OASIS 호출 공통 계약(`@dk-oasis/shared/http` 의 callOasisAt·unwrapOasis·omitParams·OasisCallError) 단위 시험.
 *
 * 기본값은 m-mdm 공통본(src/dme/oasis-call.ts) 동작이고, 옵션 조합으로 m-mdm 화면 api.ts 15개·m-mls noticeMgmt 의 지금
 * 동작을 그대로 재현해야 한다(각 화면의 특성 시험: m-mdm tests/helpers/oasis-envelope.ts, m-mls notice-api.test.ts).
 * 결함(field 만 있고 message 가 없을 때 "F2: undefined")도 지금은 그대로 재현한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OasisCallError,
  callOasisAt,
  isOasisCallError,
  omitParams,
  unwrapOasis,
  type CactusErrorDetail,
  type OasisUnwrapOptions,
} from "../../src/http/entry";

interface Call {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

let calls: Call[];

function stubFetch(response: unknown): void {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body ?? "{}")) });
      return {
        status: 200,
        ok: true,
        statusText: "",
        headers: { get: () => null },
        json: async () => response,
      } as unknown as Response;
    }),
  );
}

async function rejectionOf(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error("거부될 줄 알았는데 성공했다");
}

function thrownBy(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("던질 줄 알았는데 던지지 않았다");
}

const NOISY = { keep: "x", zero: 0, no: false, nul: null, undef: undefined, empty: "", blank: "  " };

const SUCCESS = {
  meta: { success: true },
  data: { result: { a: 1, shared: "result" }, other: 2, shared: "data" },
  grids: { g: { rows: [{ k: 1 }] }, empty: {} },
};

const REJECT = {
  meta: { success: false, message: "  거부 문구  ", code: "MDM001" },
  errors: [
    { field: "F1", code: "E1", message: "칸 오류" },
    { message: "거부 문구" },
    { field: "F2" },
    { message: "java.lang.NullPointerException: boom" },
  ],
};

/** m-mls noticeMgmt 의 판정(예외·SQL 원문 차단)과 항목명 사전 — 재현 확인용 사본. */
const TECHNICAL_TEXT = /exception|java\.|\bat [\w.$]+\(|sqlite_|ora-\d|sqlstate|stack ?trace|null ?pointer/i;
const isUserSentence = (text: string | undefined): text is string => !!text && !!text.trim() && !TECHNICAL_TEXT.test(text);
const FIELD_LABEL: Record<string, string> = { TITLE: "제목", TARGET_ROLES: "대상 역할" };

class NoticeLikeError extends Error {
  constructor(
    message: string,
    readonly field?: string,
    readonly errors: CactusErrorDetail[] = [],
  ) {
    super(message);
    this.name = "NoticeApiError";
  }
}

const NOTICE_OPTIONS: OasisUnwrapOptions = {
  includeGrids: true,
  details: "append",
  isUserSentence,
  fieldLabel: (f) => FIELD_LABEL[f.toUpperCase()],
  errorFactory: (m, _code, errs, field) => new NoticeLikeError(m, field, errs),
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("omitParams", () => {
  it("nullish(기본)는 null·undefined 만 뺀다", () => {
    expect(omitParams(NOISY)).toEqual({ keep: "x", zero: 0, no: false, empty: "", blank: "  " });
    expect(omitParams(NOISY, "nullish")).toEqual(omitParams(NOISY));
  });

  it("nullish+empty 는 빈 문자열도 빼고 공백 문자열은 남긴다", () => {
    expect(omitParams(NOISY, "nullish+empty")).toEqual({ keep: "x", zero: 0, no: false, blank: "  " });
  });

  it("nullish+blank 는 공백만 있는 문자열도 빼고 0·false 는 남긴다", () => {
    expect(omitParams(NOISY, "nullish+blank")).toEqual({ keep: "x", zero: 0, no: false });
  });

  it("none 은 빼지 않는다", () => {
    expect(omitParams(NOISY, "none")).toEqual(NOISY);
  });

  it("원본을 바꾸지 않는다", () => {
    const src = { a: null, b: 1 };
    omitParams(src);
    expect(src).toEqual({ a: null, b: 1 });
  });
});

describe("callOasisAt — 요청 조립", () => {
  it("POST {basePath}/{serviceId}/{action}, meta.menuId=serviceId, params 는 nullish 로 거르고 grids 는 주지 않으면 키가 없다", async () => {
    stubFetch(SUCCESS);
    await callOasisAt("/api/mdm/oasis", "ruleEdit", "view", { ...NOISY });
    expect(calls[0].url).toBe("/api/mdm/oasis/ruleEdit/view");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].body).toEqual({
      meta: { menuId: "ruleEdit" },
      params: { keep: "x", zero: 0, no: false, empty: "", blank: "  " },
    });
    expect("signal" in calls[0].init).toBe(false);
  });

  it("grids 는 준 그대로(빈 객체도) 싣는다", async () => {
    stubFetch(SUCCESS);
    await callOasisAt("/api/mdm/oasis", "s", "save", {}, { items: { rows: [{ X: 1 }] }, empty: { rows: [] } });
    await callOasisAt("/api/mdm/oasis", "s", "save", {}, {});
    expect(calls[0].body.grids).toEqual({ items: { rows: [{ X: 1 }] }, empty: { rows: [] } });
    expect(calls[1].body.grids).toEqual({});
  });

  it("options.omit·menuId·signal", async () => {
    stubFetch(SUCCESS);
    const ac = new AbortController();
    await callOasisAt("/api/mcm/oasis", "commRoleMng", "search", { ...NOISY }, undefined, {
      omit: "none",
      menuId: "noticeMgmt",
      signal: ac.signal,
    });
    expect(calls[0].url).toBe("/api/mcm/oasis/commRoleMng/search");
    expect(calls[0].body.meta).toEqual({ menuId: "noticeMgmt" });
    expect(calls[0].body.params).toEqual({ keep: "x", zero: 0, no: false, nul: null, empty: "", blank: "  " });
    expect(calls[0].init.signal).toBe(ac.signal);
  });

  it("응답은 unwrapOasis 에 같은 옵션으로 넘긴다", async () => {
    stubFetch(SUCCESS);
    expect(await callOasisAt("/b", "s", "a", {}, undefined, { merge: "result" })).toEqual({ a: 1, shared: "result" });
    stubFetch(REJECT);
    const e = await rejectionOf(callOasisAt("/b", "s", "a", {}, undefined, { details: "none" }));
    expect(e).toBeInstanceOf(OasisCallError);
    expect(e.message).toBe("거부 문구");
  });
});

describe("unwrapOasis — 성공 펼치기", () => {
  it("data+result(기본)는 data 전체 위에 data.result(객체)를 덮고 응답 grids 는 올리지 않는다", () => {
    expect(unwrapOasis(SUCCESS)).toEqual({ result: { a: 1, shared: "result" }, other: 2, shared: "result", a: 1 });
  });

  it("result 는 data.result(객체)만 편다", () => {
    expect(unwrapOasis(SUCCESS, { merge: "result" })).toEqual({ a: 1, shared: "result" });
  });

  it("includeGrids 는 응답 grids 의 rows 를 이름대로 올린다(rows 가 없으면 빈 배열)", () => {
    expect(unwrapOasis(SUCCESS, { includeGrids: true })).toEqual({
      result: { a: 1, shared: "result" }, other: 2, shared: "result", a: 1, g: [{ k: 1 }], empty: [],
    });
  });

  it("data.result 가 배열이면 펴지 않는다. meta·data 가 없어도 성공이다", () => {
    expect(unwrapOasis({ meta: { success: true }, data: { result: [1] } })).toEqual({ result: [1] });
    expect(unwrapOasis({ data: { result: [1] } }, { merge: "result" })).toEqual({});
    expect(unwrapOasis({ data: { result: { a: 1 } } })).toEqual({ result: { a: 1 }, a: 1 });
    expect(unwrapOasis({ meta: { success: true } })).toEqual({});
    expect(unwrapOasis(undefined)).toEqual({});
    expect(unwrapOasis(null, { merge: "result" })).toEqual({});
  });
});

describe("unwrapOasis — 거부(meta.success=false)", () => {
  it("기본(append-dedup)은 OasisCallError — base 와 같은 문구를 거르고 field 만 있으면 'F2: undefined' 가 남는다(지금 동작)", () => {
    const e = thrownBy(() => unwrapOasis(REJECT)) as OasisCallError;
    expect(e).toBeInstanceOf(OasisCallError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("OasisCallError");
    expect(e.message).toBe("거부 문구\n- F1: 칸 오류\n- F2: undefined\n- java.lang.NullPointerException: boom");
    expect(e.code).toBe("MDM001");
    expect(e.field).toBe("F1");
    expect(e.errors).toEqual(REJECT.errors);
  });

  it("append 는 base 와 같은 문구도 남긴다(unitMng·termMng)", () => {
    expect(thrownBy(() => unwrapOasis(REJECT, { details: "append" })).message).toBe(
      "거부 문구\n- F1: 칸 오류\n- 거부 문구\n- F2: undefined\n- java.lang.NullPointerException: boom",
    );
  });

  it("none 은 meta.message 만 쓴다", () => {
    expect(thrownBy(() => unwrapOasis(REJECT, { details: "none" })).message).toBe("거부 문구");
  });

  it("빈 항목(message·field 모두 없음, 빈 message)은 어느 방식에서도 빠진다", () => {
    const env = { meta: { success: false, message: "m" }, errors: [{}, { message: "" }, { message: "x" }] };
    expect(thrownBy(() => unwrapOasis(env)).message).toBe("m\n- x");
    expect(thrownBy(() => unwrapOasis(env, { details: "append" })).message).toBe("m\n- x");
  });

  it("거부 문구가 없거나 공백이면 기본 문구(또는 defaultMessage)다", () => {
    expect(thrownBy(() => unwrapOasis({ meta: { success: false, message: "  " } })).message).toBe("요청이 거부되었습니다.");
    expect(thrownBy(() => unwrapOasis({ meta: { success: false, message: null } })).message).toBe("요청이 거부되었습니다.");
    expect(thrownBy(() => unwrapOasis({ meta: { success: false } }, { defaultMessage: "실패" })).message).toBe("실패");
    expect(
      thrownBy(() => unwrapOasis({ meta: { success: false }, errors: [{ message: "요청이 거부되었습니다." }, { message: "x" }] }))
        .message,
    ).toBe("요청이 거부되었습니다.\n- x");
  });

  it("code 는 meta.code, 없으면 errors[] 의 첫 code, 둘 다 없으면 null", () => {
    const e1 = thrownBy(() =>
      unwrapOasis({ meta: { success: false }, errors: [{ message: "a" }, { code: "E9", message: "b" }, { code: "E10" }] }),
    ) as OasisCallError;
    expect(e1.code).toBe("E9");
    const e2 = thrownBy(() => unwrapOasis({ meta: { success: false } })) as OasisCallError;
    expect(e2.code).toBeNull();
    expect(e2.errors).toEqual([]);
    expect(e2.field).toBeUndefined();
  });

  it("fieldLabel 을 주면 항목명이 있을 때만 '항목명: 글', 없으면 글만 쓴다", () => {
    const env = { meta: { success: false, message: "확인" }, errors: [{ field: "title", message: "필수" }, { field: "X", message: "y" }] };
    expect(thrownBy(() => unwrapOasis(env, { fieldLabel: (f) => FIELD_LABEL[f.toUpperCase()] })).message).toBe(
      "확인\n- 제목: 필수\n- y",
    );
  });

  it("isUserSentence 를 주면 base·errors 모두 사용자 문장만 쓰고, errors 에도 그것만 싣는다. field 는 모든 오류에서 첫 것", () => {
    const e = thrownBy(() =>
      unwrapOasis(
        {
          meta: { success: false, message: "SQLSTATE 23000" },
          errors: [{ field: "CONTENT", message: "java.lang.IllegalStateException" }, { field: "TITLE", message: "필수" }, { field: "F2" }],
        },
        { isUserSentence, details: "append" },
      ),
    ) as OasisCallError;
    expect(e.message).toBe("요청이 거부되었습니다.\n- TITLE: 필수");
    expect(e.errors).toEqual([{ field: "TITLE", message: "필수" }]);
    expect(e.field).toBe("CONTENT");
  });

  it("errorFactory 로 화면 오류 클래스를 만든다", () => {
    const factory = vi.fn((m: string) => new TypeError(m));
    const e = thrownBy(() => unwrapOasis(REJECT, { details: "none", errorFactory: factory }));
    expect(e).toBeInstanceOf(TypeError);
    expect(factory).toHaveBeenCalledWith("거부 문구", "MDM001", REJECT.errors, "F1");
  });
});

describe("옵션 조합으로 지금 화면 동작을 재현한다", () => {
  it("m-mdm 13개(meta.message 만, Error, code 없음) — details:none + Error 팩토리", () => {
    const e = thrownBy(() => unwrapOasis(REJECT, { merge: "result", details: "none", errorFactory: (m) => new Error(m) }));
    expect(Object.getPrototypeOf(e)).toBe(Error.prototype);
    expect(e.message).toBe("거부 문구");
    expect("code" in e).toBe(false);
  });

  it("unitMng·termMng(중복 거르지 않음, Error) — details:append + Error 팩토리", () => {
    const e = thrownBy(() => unwrapOasis(REJECT, { details: "append", errorFactory: (m) => new Error(m) }));
    expect(Object.getPrototypeOf(e)).toBe(Error.prototype);
    expect(e.message).toBe("거부 문구\n- F1: 칸 오류\n- 거부 문구\n- F2: undefined\n- java.lang.NullPointerException: boom");
  });

  it("noticeMgmt — 사용자 문장만·항목명 치환·base 중복 유지·field/errors 보존·응답 grids 펼침", () => {
    const e = thrownBy(() => unwrapOasis(REJECT, NOTICE_OPTIONS)) as NoticeLikeError;
    expect(e).toBeInstanceOf(NoticeLikeError);
    expect(e.message).toBe("거부 문구\n- 칸 오류\n- 거부 문구");
    expect(e.field).toBe("F1");
    expect(e.errors).toEqual([{ field: "F1", code: "E1", message: "칸 오류" }, { message: "거부 문구" }]);

    const e2 = thrownBy(() =>
      unwrapOasis(
        {
          meta: { success: false, message: "입력값을 확인해주세요." },
          errors: [
            { field: "TARGET_ROLES", message: "역할을 하나 이상 고르세요." },
            { field: "TITLE", message: "java.lang.NullPointerException: boom" },
          ],
        },
        NOTICE_OPTIONS,
      ),
    ) as NoticeLikeError;
    expect(e2.message).toBe("입력값을 확인해주세요.\n- 대상 역할: 역할을 하나 이상 고르세요.");
    expect(e2.field).toBe("TARGET_ROLES");

    expect(unwrapOasis(SUCCESS, NOTICE_OPTIONS)).toEqual({
      result: { a: 1, shared: "result" }, other: 2, shared: "result", a: 1, g: [{ k: 1 }], empty: [],
    });
  });
});

describe("OasisCallError·isOasisCallError", () => {
  it("생성자 기본값", () => {
    const e = new OasisCallError("m");
    expect(e.message).toBe("m");
    expect(e.code).toBeNull();
    expect(e.errors).toEqual([]);
    expect(e.field).toBeUndefined();
    expect(Object.keys(e)).not.toContain("field");
  });

  it("isOasisCallError 는 이 클래스의 오류를 알아본다", () => {
    expect(isOasisCallError(new OasisCallError("m", "MDM001"))).toBe(true);
    expect(isOasisCallError(thrownBy(() => unwrapOasis(REJECT)))).toBe(true);
  });

  it("클래스 사본이 달라도(다른 진입점 번들) 전역 심볼 표시로 알아본다", () => {
    const copy = new Error("m");
    Object.defineProperty(copy, Symbol.for("dk-oasis.OasisCallError"), { value: true });
    expect(isOasisCallError(copy)).toBe(true);
  });

  it("다른 오류·값은 아니다", () => {
    const named = new Error("m");
    named.name = "OasisCallError";
    expect(isOasisCallError(named)).toBe(false);
    expect(isOasisCallError(new Error("m"))).toBe(false);
    expect(isOasisCallError(null)).toBe(false);
    expect(isOasisCallError("OasisCallError")).toBe(false);
    expect(isOasisCallError(thrownBy(() => unwrapOasis(REJECT, { errorFactory: (m) => new Error(m) })))).toBe(false);
  });

  it("표시는 열거되지 않아 toEqual·JSON 에 드러나지 않는다", () => {
    const e = new OasisCallError("m", "C");
    expect(Object.getOwnPropertySymbols(e)).toHaveLength(1);
    expect(JSON.stringify({ ...e })).not.toContain("dk-oasis");
  });
});
