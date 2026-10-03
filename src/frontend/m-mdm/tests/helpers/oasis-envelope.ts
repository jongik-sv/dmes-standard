/**
 * 화면별 OASIS 호출(api.ts)의 지금 동작을 고정하는 특성 시험 도우미.
 *
 * 화면마다 따로 쓴 봉투 해제·params 거르기·오류 문구 조립을 `@dk-oasis/shared/http` 의 공통 계약으로 옮기기 전에, 옮긴 뒤에도
 * 같은 시험이 그대로 통과해야 한다. 그래서 `fetch` 만 바꿔 끼우고(진짜 `apiRequest` 를 거친다) 요청 URL·본문·응답 펼침·
 * 거부 오류(클래스 이름·message·code 유무)를 문자 그대로 비교한다. 결함(field 만 있고 message 가 없을 때 "F2: undefined")도
 * 지금 동작이라 그대로 고정한다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

export interface OasisCall {
  url: string;
  init: RequestInit;
  body: { meta?: Record<string, unknown>; params?: Record<string, unknown>; grids?: unknown } & Record<string, unknown>;
}

/** `fetch` 를 응답 하나로 바꿔 끼우고 부른 기록을 돌려준다. `afterEach` 에서 `vi.unstubAllGlobals()` 로 되돌린다. */
export function stubOasis(response: unknown): OasisCall[] {
  const calls: OasisCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

/** 거부를 기다려 던진 값을 돌려준다(던지지 않으면 시험 실패). */
export async function rejectionOf(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error("거부될 줄 알았는데 성공했다");
}

/** params 거르기 판정용 값 — 화면이 params 를 그대로 넘기는 함수에 넣는다. */
export const NOISY_PARAMS: Readonly<Record<string, unknown>> = Object.freeze({
  keep: "x",
  zero: 0,
  no: false,
  nul: null,
  undef: undefined,
  empty: "",
  blank: "  ",
});

/** 거르기 방식별로 서버에 실리는 params(JSON 본문 기준 — undefined 는 직렬화에서 빠진다). */
export const NOISY_SENT = {
  /** null·undefined 만 뺀다. */
  nullish: { keep: "x", zero: 0, no: false, empty: "", blank: "  " },
  /** null·undefined·빈 문자열("")을 뺀다. 공백 문자열은 남는다. */
  "nullish+empty": { keep: "x", zero: 0, no: false, blank: "  " },
  /** null·undefined·공백만 있는 문자열을 뺀다. */
  "nullish+blank": { keep: "x", zero: 0, no: false },
  /** 거르지 않는다(null 도 실린다). */
  none: { keep: "x", zero: 0, no: false, nul: null, empty: "", blank: "  " },
} as const;

export type OmitMode = keyof typeof NOISY_SENT;

/** 성공 봉투 — data 의 다른 키·result 객체·응답 grids 를 모두 가진다. */
export const SUCCESS_ENVELOPE = {
  meta: { success: true },
  data: { result: { a: 1, shared: "result" }, other: 2, shared: "data" },
  grids: { g: { rows: [{ k: 1 }] } },
};

/** 펼침 방식별 결과. */
export const SUCCESS_OUT = {
  /** data 전체를 펴고 그 위에 data.result(객체) 를 덮는다. 응답 grids 는 버린다. */
  "data+result": { result: { a: 1, shared: "result" }, other: 2, shared: "result", a: 1 },
  /** data.result(객체) 만 편다. */
  result: { a: 1, shared: "result" },
} as const;

export type MergeMode = keyof typeof SUCCESS_OUT;

/**
 * 거부 봉투 — meta.message 앞뒤 공백, meta.code, errors[] 에 field·code 가 있는 것, base 와 같은 문구, message 없는 field,
 * 예외 원문 문구를 모두 싣는다.
 */
export const REJECT_ENVELOPE = {
  meta: { success: false, message: "  거부 문구  ", code: "MDM001" },
  errors: [
    { field: "F1", code: "E1", message: "칸 오류" },
    { message: "거부 문구" },
    { field: "F2" },
    { message: "java.lang.NullPointerException: boom" },
  ],
};

/** 문구 조립 방식별 message. */
export const REJECT_MESSAGE = {
  /** meta.message(trim) 만 — errors[] 는 보지 않는다. */
  "meta-only": "거부 문구",
  /** errors[] 를 `field: message` 로 붙인다. base 와 같은 문구도 걸러지지 않고, message 없는 field 는 "F2: undefined" 가 된다. */
  append: "거부 문구\n- F1: 칸 오류\n- 거부 문구\n- F2: undefined\n- java.lang.NullPointerException: boom",
} as const;

export type RejectMode = keyof typeof REJECT_MESSAGE;

export const DEFAULT_REJECT_MESSAGE = "요청이 거부되었습니다.";

export interface OasisEnvelopeSpec {
  /** 대표 호출 하나(성공·거부 판정에 쓴다). 결과를 그대로 돌려주는 함수여야 한다. */
  call: () => Promise<unknown>;
  url: string;
  menuId: string;
  merge: MergeMode;
  reject: RejectMode;
  /** params 를 그대로 넘기는 호출이 있으면 넣는다 — NOISY_PARAMS 가 omit 방식대로 걸러지는지 본다. */
  noisy?: { call: (params: Record<string, unknown>) => Promise<unknown>; omit: OmitMode };
  /** 대표 호출이 grids 를 보내지 않으면 true — 본문에 grids 키가 없어야 한다. */
  noGrids?: boolean;
}

/**
 * 한 화면 api.ts 의 공통 특성 묶음. 화면별로 다른 점(grids 모양·signal·params 가공)은 각 시험 파일이 따로 적는다.
 * 지금 15개 MDM 파일은 모두 `Error`(하위 클래스 아님)를 던지고 code 를 싣지 않는다.
 */
export function describeOasisEnvelope(name: string, spec: OasisEnvelopeSpec): void {
  describe(`${name} — OASIS 호출 특성(현재 동작 고정)`, () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it(`요청은 POST ${spec.url} 이고 meta 는 menuId 하나다`, async () => {
      const calls = stubOasis(SUCCESS_ENVELOPE);
      await spec.call();
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(spec.url);
      expect(calls[0].init.method).toBe("POST");
      expect(calls[0].body.meta).toEqual({ menuId: spec.menuId });
      if (spec.noGrids) expect("grids" in calls[0].body).toBe(false);
    });

    if (spec.noisy) {
      const noisy = spec.noisy;
      it(`params 거르기는 ${noisy.omit} 방식이다`, async () => {
        const calls = stubOasis(SUCCESS_ENVELOPE);
        await noisy.call({ ...NOISY_PARAMS });
        expect(calls[0].body.params).toEqual(NOISY_SENT[noisy.omit]);
      });
    }

    it(`성공 응답은 ${spec.merge} 로 편다(응답 grids 는 올리지 않는다)`, async () => {
      stubOasis(SUCCESS_ENVELOPE);
      expect(await spec.call()).toEqual(SUCCESS_OUT[spec.merge]);
    });

    it("data.result 가 배열이면 펴지 않는다", async () => {
      stubOasis({ meta: { success: true }, data: { result: [1, 2] } });
      expect(await spec.call()).toEqual(spec.merge === "result" ? {} : { result: [1, 2] });
    });

    it("meta 가 없거나 data 가 없어도 성공으로 본다", async () => {
      stubOasis({ data: { result: { a: 1 } } });
      expect(await spec.call()).toEqual(spec.merge === "result" ? { a: 1 } : { result: { a: 1 }, a: 1 });
      stubOasis({ meta: { success: true } });
      expect(await spec.call()).toEqual({});
    });

    it(`거부(meta.success=false)는 Error 를 던지고 문구는 ${spec.reject} 방식이다(code 없음)`, async () => {
      stubOasis(REJECT_ENVELOPE);
      const e = await rejectionOf(spec.call());
      expect(Object.getPrototypeOf(e)).toBe(Error.prototype);
      expect(e.name).toBe("Error");
      expect(e.message).toBe(REJECT_MESSAGE[spec.reject]);
      expect("code" in e).toBe(false);
    });

    it("거부 문구가 비거나 공백이면 기본 문구다", async () => {
      stubOasis({ meta: { success: false, message: "   " } });
      expect((await rejectionOf(spec.call())).message).toBe(DEFAULT_REJECT_MESSAGE);
      stubOasis({ meta: { success: false } });
      expect((await rejectionOf(spec.call())).message).toBe(DEFAULT_REJECT_MESSAGE);
    });

    it("기본 문구 + errors[] 일 때의 문구", async () => {
      stubOasis({ meta: { success: false, message: null }, errors: [{ field: "F1", message: "칸 오류" }] });
      expect((await rejectionOf(spec.call())).message).toBe(
        spec.reject === "append" ? `${DEFAULT_REJECT_MESSAGE}\n- F1: 칸 오류` : DEFAULT_REJECT_MESSAGE,
      );
    });
  });
}
