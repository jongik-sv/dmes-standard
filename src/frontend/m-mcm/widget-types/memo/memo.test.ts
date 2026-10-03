/**
 * 메모장 유형 순수 로직·호출 시험(스펙 2026-10-02-widget-admin-generic §17).
 * @dk-oasis/shared 런타임을 import 하지 않는다 — node 환경에서 shared dist 없이 돈다. 렌더 시험은 memo-render.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchMemo, saveMemo } from "./api";
import { readDraft, removeDraft, writeDraft } from "./memo-draft-storage";
import {
  canSave,
  classifyDraft,
  countLabel,
  draftDiffers,
  dropNullParams,
  formatDraftTime,
  isDraftWritable,
  isBlankMemo,
  isLiveMemo,
  loadRequest,
  MEMO_CONTENT_TYPE_ERROR,
  MEMO_DEFAULT_CONFIG,
  MEMO_DRAFT_DELAY_MS,
  MEMO_DRAFT_KEY_PREFIX,
  MEMO_FORMAT_ERROR,
  MEMO_MAX_LENGTH,
  MEMO_SAVE_ERROR,
  MEMO_SCOPE_ERROR,
  MEMO_TOO_LONG_MESSAGE,
  memoBaseHash,
  memoDraftKey,
  memoDraftNoticeText,
  memoEditBase,
  memoErrorMessage,
  MemoServiceError,
  parseDraft,
  parseMemo,
  readMemoChoices,
  readMemoConfig,
  restorableDraft,
  saveRequest,
  serializeDraft,
  unwrapMemo,
  validateDraft,
  validateMemoConfig,
  viewFormat,
  type MemoDraft,
  type MemoRecord,
} from "./memo-model";
import { MEMO_CSS } from "./memo-styles";
import { meta } from "./type.meta";

describe("유형 메타", () => {
  it("id·크기가 스펙 §17.1 과 같다", () => {
    expect(meta.id).toBe("memo");
    expect(meta.defaultSize).toEqual({ w: 8, h: 10 });
    expect(meta.minSize).toEqual({ w: 4, h: 6 });
  });

  it("초기 설정이 기본값(개인·텍스트·빈 글)과 같다", () => {
    expect(meta.initialConfig).toEqual({ scope: "personal", format: "text", content: "" });
    expect(meta.initialConfig).toEqual(MEMO_DEFAULT_CONFIG);
  });
});

describe("정의 설정 읽기", () => {
  it("정상 값은 그대로 읽는다", () => {
    expect(readMemoConfig({ scope: "shared", format: "md", content: "# 안내" })).toEqual({
      scope: "shared",
      format: "md",
      content: "# 안내",
    });
  });

  it("값이 없거나 객체가 아니면 기본값(개인·텍스트·빈 글)이다", () => {
    for (const raw of [null, undefined, "x", 3, [], {}]) {
      expect(readMemoConfig(raw)).toEqual({ scope: "personal", format: "text", content: "" });
    }
  });

  it("틀린 종류·형식·내용 형은 기본값으로 바로잡는다", () => {
    expect(readMemoConfig({ scope: "team", format: "rtf", content: 12 })).toEqual({
      scope: "personal",
      format: "text",
      content: "",
    });
  });
});

describe("편집기 선택칸 값", () => {
  it("허용값은 그대로, 빠졌거나 틀린 값은 빈 값(선택하세요)이다", () => {
    expect(readMemoChoices({ scope: "shared", format: "md" })).toEqual({ scope: "shared", format: "md" });
    expect(readMemoChoices({ scope: "team", format: "rtf" })).toEqual({ scope: "", format: "" });
    expect(readMemoChoices({})).toEqual({ scope: "", format: "" });
    expect(readMemoChoices(null)).toEqual({ scope: "", format: "" });
  });
});

describe("정의 설정 검사(서버 WidgetDefConfigRules §17.1 과 같은 규칙·문구)", () => {
  const ok = { scope: "shared", format: "text", content: "" };

  it("정상 설정은 오류가 없다", () => {
    expect(validateMemoConfig({ scope: "shared", format: "html", content: "<p>안내</p>" })).toEqual([]);
    expect(validateMemoConfig({ scope: "personal", format: "text", content: "" })).toEqual([]);
    expect(validateMemoConfig(meta.initialConfig)).toEqual([]);
  });

  it("서버 문구가 서버와 한 글자도 다르지 않다", () => {
    expect(MEMO_SCOPE_ERROR).toBe("메모 종류(scope)는 shared 또는 personal 이어야 합니다.");
    expect(MEMO_FORMAT_ERROR).toBe("메모 형식(format)은 text·md·html 중 하나여야 합니다.");
    expect(MEMO_CONTENT_TYPE_ERROR).toBe("메모 내용(content)은 문자열이어야 합니다.");
    expect(MEMO_TOO_LONG_MESSAGE).toBe("메모 내용은 20,000자까지 쓸 수 있습니다.");
  });

  it("종류는 shared·personal 만 허용하고 빠져도 오류다", () => {
    expect(validateMemoConfig({ ...ok, scope: "team" })).toEqual([MEMO_SCOPE_ERROR]);
    expect(validateMemoConfig({ ...ok, scope: "" })).toEqual([MEMO_SCOPE_ERROR]);
    expect(validateMemoConfig({ ...ok, scope: null })).toEqual([MEMO_SCOPE_ERROR]);
    expect(validateMemoConfig({ format: "text", content: "" })).toEqual([MEMO_SCOPE_ERROR]);
  });

  it("형식은 text·md·html 만 허용하고 빠져도 오류다", () => {
    expect(validateMemoConfig({ ...ok, format: "rtf" })).toEqual([MEMO_FORMAT_ERROR]);
    expect(validateMemoConfig({ ...ok, format: null })).toEqual([MEMO_FORMAT_ERROR]);
    expect(validateMemoConfig({ scope: "shared", content: "" })).toEqual([MEMO_FORMAT_ERROR]);
    for (const format of ["text", "md", "html"]) expect(validateMemoConfig({ ...ok, format })).toEqual([]);
  });

  it("값이 모두 빠졌거나 객체가 아니면 종류·형식 오류를 둘 다 알린다", () => {
    for (const raw of [{}, null, undefined, "x", 3, []]) {
      expect(validateMemoConfig(raw)).toEqual([MEMO_SCOPE_ERROR, MEMO_FORMAT_ERROR]);
    }
  });

  it("내용은 없거나 null 이어도 괜찮다(서버와 같다)", () => {
    expect(validateMemoConfig({ scope: "personal", format: "text" })).toEqual([]);
    expect(validateMemoConfig({ scope: "personal", format: "text", content: null })).toEqual([]);
  });

  it("내용은 20,000자까지 — 20,000자는 통과, 20,001자는 거절", () => {
    expect(MEMO_MAX_LENGTH).toBe(20000);
    expect(validateMemoConfig({ ...ok, content: "가".repeat(20000) })).toEqual([]);
    expect(validateMemoConfig({ ...ok, content: "가".repeat(20001) })).toEqual([MEMO_TOO_LONG_MESSAGE]);
  });

  it("내용이 글이 아니면 거절한다", () => {
    expect(validateMemoConfig({ ...ok, content: 5 })).toEqual([MEMO_CONTENT_TYPE_ERROR]);
    expect(validateMemoConfig({ ...ok, content: ["a"] })).toEqual([MEMO_CONTENT_TYPE_ERROR]);
  });

  it("틀린 값이 여럿이면 모두 알린다", () => {
    expect(validateMemoConfig({ scope: "x", format: "y", content: "a".repeat(20001) })).toEqual([
      MEMO_SCOPE_ERROR,
      MEMO_FORMAT_ERROR,
      MEMO_TOO_LONG_MESSAGE,
    ]);
  });
});

describe("형식별 보기 이름", () => {
  it("text→TEXT, md→MD, html→HTML(NoticeBodyView 형식)", () => {
    expect(viewFormat("text")).toBe("TEXT");
    expect(viewFormat("md")).toBe("MD");
    expect(viewFormat("html")).toBe("HTML");
  });
});

describe("편집 중인 글", () => {
  it("20,000자까지 저장할 수 있고 빈 글도 허용한다", () => {
    expect(validateDraft("")).toBeNull();
    expect(validateDraft("a".repeat(20000))).toBeNull();
    expect(validateDraft("a".repeat(20001))).toBe(MEMO_TOO_LONG_MESSAGE);
  });

  it("canSave — 저장 중이거나 글이 너무 길면 못 저장한다", () => {
    expect(canSave("메모", false)).toBe(true);
    expect(canSave("메모", true)).toBe(false);
    expect(canSave("a".repeat(20001), false)).toBe(false);
  });

  it("글자 수를 「현재 / 20,000자」로 보인다", () => {
    expect(countLabel("")).toBe("0 / 20,000자");
    expect(countLabel("a".repeat(1234))).toBe("1,234 / 20,000자");
  });
});

describe("메모 레코드 해석", () => {
  it("서버 memo 를 화면 값으로 바꾼다", () => {
    expect(
      parseMemo({ instId: "i1", defId: "def.abc12345", format: "md", content: "# 제목", updatedAt: "2026-10-03T10:00:00" })
    ).toEqual({ instId: "i1", defId: "def.abc12345", format: "md", content: "# 제목", updatedAt: "2026-10-03T10:00:00" });
  });

  it("객체가 아니면(null 포함) 메모 없음이다", () => {
    for (const raw of [null, undefined, "x", 1, []]) expect(parseMemo(raw)).toBeNull();
  });

  it("모르는 형식은 text, 빠진 값은 빈 값으로 본다", () => {
    expect(parseMemo({ instId: "i1", format: "rtf" })).toEqual({
      instId: "i1",
      defId: "",
      format: "text",
      content: "",
      updatedAt: null,
    });
  });

  it("isBlankMemo — 없거나 공백뿐이면 비었다", () => {
    expect(isBlankMemo(null)).toBe(true);
    expect(isBlankMemo({ instId: "i", defId: "d", format: "text", content: " \n ", updatedAt: null })).toBe(true);
    expect(isBlankMemo({ instId: "i", defId: "d", format: "text", content: "글", updatedAt: null })).toBe(false);
  });
});

describe("미리보기 판정", () => {
  it("저장된 정의(def.…)의 홈 인스턴스만 서버를 부른다", () => {
    expect(isLiveMemo("def.abc12345", "inst-1")).toBe(true);
    expect(isLiveMemo("def.abc12345")).toBe(true);
  });

  it("관리 화면 미리보기(instId preview·def.preview·저장 전 빈 widgetId)는 부르지 않는다", () => {
    expect(isLiveMemo("def.abc12345", "preview")).toBe(false);
    expect(isLiveMemo("def.preview", "inst-1")).toBe(false);
    expect(isLiveMemo("", "preview")).toBe(false);
    expect(isLiveMemo("", "inst-1")).toBe(false);
  });

  it("코드 위젯(def. 가 아님)은 부르지 않는다", () => {
    expect(isLiveMemo("mcm.notice", "inst-1")).toBe(false);
  });
});

describe("요청 모양", () => {
  it("load — 경로·menuId·instId 만(userId 는 보내지 않는다)", () => {
    expect(loadRequest("inst-1")).toEqual({
      url: "/api/mcm/oasis/widgetMemo/load",
      body: { meta: { menuId: "HOME" }, params: { instId: "inst-1" } },
    });
  });

  it("save — instId·defId·format·content", () => {
    expect(saveRequest({ instId: "inst-1", defId: "def.abc12345", format: "md", content: "# 제목" })).toEqual({
      url: "/api/mcm/oasis/widgetMemo/save",
      body: { meta: { menuId: "HOME" }, params: { instId: "inst-1", defId: "def.abc12345", format: "md", content: "# 제목" } },
    });
  });

  it("save — 빈 글(\"\")은 값이므로 보낸다", () => {
    expect(saveRequest({ instId: "i", defId: "def.abc12345", format: "text", content: "" }).body.params).toHaveProperty("content", "");
  });

  it("dropNullParams — null·undefined 키는 빼고 빈 글·0·false 는 남긴다", () => {
    expect(dropNullParams({ a: null, b: undefined, c: "", d: 0, e: false, f: "x" })).toEqual({ c: "", d: 0, e: false, f: "x" });
  });

  it("save — 값이 null 인 키는 params 에 넣지 않는다(cactus 변환기가 null 을 받으면 요청 전체가 실패)", () => {
    const req = saveRequest({ instId: "i", defId: null as unknown as string, format: "text", content: "x" });
    expect(Object.keys(req.body.params)).not.toContain("defId");
    expect(Object.values(req.body.params)).not.toContain(null);
  });
});

describe("응답 해제", () => {
  it("data.result 를 펼쳐 memo 를 얻는다", () => {
    expect(unwrapMemo({ meta: { success: true }, data: { result: { memo: { instId: "i" } } } })).toMatchObject({
      memo: { instId: "i" },
    });
  });

  it("meta.success=false 는 서버 문구로 던진다", () => {
    expect(() => unwrapMemo({ meta: { success: false, message: "메모는 100개까지 저장할 수 있습니다" } })).toThrowError(
      new MemoServiceError("메모는 100개까지 저장할 수 있습니다")
    );
  });

  it("서버 문구가 비어 있으면 기본 문구로 던진다", () => {
    expect(() => unwrapMemo({ meta: { success: false, message: "  " } })).toThrowError("요청이 거부되었습니다.");
  });

  it("memoErrorMessage — 서버 업무 문구는 그대로, 그 밖의 오류는 기본 문구", () => {
    expect(memoErrorMessage(new MemoServiceError("메모는 100개까지 저장할 수 있습니다"), MEMO_SAVE_ERROR)).toBe(
      "메모는 100개까지 저장할 수 있습니다"
    );
    expect(memoErrorMessage(new Error("Failed to fetch"), MEMO_SAVE_ERROR)).toBe(MEMO_SAVE_ERROR);
    expect(memoErrorMessage("x", MEMO_SAVE_ERROR)).toBe(MEMO_SAVE_ERROR);
  });
});

describe("api 호출(fetch 대역)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const reply = (body: unknown, status = 200) =>
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  const sent = (i = 0) => {
    const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
    return { url, init, body: JSON.parse(String(init.body)) as { meta: unknown; params: Record<string, unknown> } };
  };
  const memoRow = { instId: "inst-1", defId: "def.abc12345", format: "html", content: "<p>글</p>", updatedAt: "2026-10-03T10:00:00" };

  it("fetchMemo — load 를 POST 하고 data.result.memo 를 돌려준다", async () => {
    reply({ meta: { success: true }, data: { result: { memo: memoRow } } });
    const memo = await fetchMemo("inst-1");
    expect(sent().url).toBe("/api/mcm/oasis/widgetMemo/load");
    expect(sent().init.method).toBe("POST");
    expect(sent().body).toEqual({ meta: { menuId: "HOME" }, params: { instId: "inst-1" } });
    expect(memo).toEqual(memoRow);
  });

  it("fetchMemo — 메모가 없으면(memo: null) null 이다", async () => {
    reply({ meta: { success: true }, data: { result: { memo: null } } });
    expect(await fetchMemo("inst-1")).toBeNull();
  });

  it("fetchMemo — 서버가 거절하면 서버 문구로 던진다", async () => {
    reply({ meta: { success: false, message: "로그인이 필요합니다" } });
    await expect(fetchMemo("inst-1")).rejects.toThrowError("로그인이 필요합니다");
  });

  it("saveMemo — instId·defId·format·content 를 보내고 저장된 메모를 돌려준다", async () => {
    reply({ meta: { success: true }, data: { result: { memo: memoRow } } });
    const saved = await saveMemo({ instId: "inst-1", defId: "def.abc12345", format: "html", content: "<p>글</p>" });
    expect(sent().url).toBe("/api/mcm/oasis/widgetMemo/save");
    expect(sent().body).toEqual({
      meta: { menuId: "HOME" },
      params: { instId: "inst-1", defId: "def.abc12345", format: "html", content: "<p>글</p>" },
    });
    expect(saved).toEqual(memoRow);
  });

  it("saveMemo — 빈 글도 content 키를 보낸다", async () => {
    reply({ meta: { success: true }, data: { result: { memo: { ...memoRow, content: "" } } } });
    await saveMemo({ instId: "inst-1", defId: "def.abc12345", format: "text", content: "" });
    expect(sent().body.params).toHaveProperty("content", "");
  });

  it("saveMemo — 서버가 거절하면(meta.success=false) 서버 문구로 던진다", async () => {
    reply({ meta: { success: false, message: "메모는 100개까지 저장할 수 있습니다" } });
    await expect(saveMemo({ instId: "i", defId: "def.abc12345", format: "text", content: "x" })).rejects.toThrowError(
      "메모는 100개까지 저장할 수 있습니다"
    );
  });

  it("saveMemo — memo 가 없는 응답은 기본 저장 오류 문구로 던진다", async () => {
    reply({ meta: { success: true }, data: { result: {} } });
    await expect(saveMemo({ instId: "i", defId: "def.abc12345", format: "text", content: "x" })).rejects.toThrowError(MEMO_SAVE_ERROR);
  });

  it("saveMemo — HTTP 오류는 던지고 화면에는 기본 문구가 쓰인다", async () => {
    reply({ message: "boom" }, 500);
    const err = await saveMemo({ instId: "i", defId: "def.abc12345", format: "text", content: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(MemoServiceError);
    expect(memoErrorMessage(err, MEMO_SAVE_ERROR)).toBe(MEMO_SAVE_ERROR);
  });
});

describe("임시 저장(쓰다 만 글) 순수 로직", () => {
  const rec = (over: Partial<MemoRecord> = {}): MemoRecord => ({
    instId: "i",
    defId: "def.x",
    format: "text",
    content: "서버 글",
    updatedAt: null,
    ...over,
  });
  const draft = (over: Partial<MemoDraft> = {}): MemoDraft => ({
    format: "text",
    content: "쓰던 글",
    baseHash: memoBaseHash(rec()),
    savedAt: 1,
    ...over,
  });

  it("키는 dmes:widget:memo-draft:{userId}:{instanceId} 이고, 사용자·칸 중 하나라도 모르면 null", () => {
    expect(MEMO_DRAFT_KEY_PREFIX).toBe("dmes:widget:memo-draft:");
    expect(memoDraftKey("u1", "inst-1")).toBe("dmes:widget:memo-draft:u1:inst-1");
    expect(memoDraftKey("", "inst-1")).toBeNull();
    expect(memoDraftKey("u1", "")).toBeNull();
    expect(MEMO_DRAFT_DELAY_MS).toBe(300);
  });

  it("내용 해시는 형식·내용이 같으면 같고 하나라도 다르면 다르다 — 메모가 없으면 none", () => {
    expect(memoBaseHash(null)).toBe("none");
    expect(memoBaseHash(rec())).toBe(memoBaseHash(rec({ instId: "다른 칸", updatedAt: "2026-10-03T10:00:00" })));
    expect(memoBaseHash(rec())).not.toBe(memoBaseHash(rec({ content: "서버 글!" })));
    expect(memoBaseHash(rec())).not.toBe(memoBaseHash(rec({ format: "md" })));
    expect(memoBaseHash(rec({ content: "" }))).not.toBe("none");
  });

  it("직렬화한 임시본을 그대로 읽는다", () => {
    expect(parseDraft(serializeDraft(draft({ format: "html", content: "<p>글</p>", savedAt: 1790000000000 })))).toEqual({
      format: "html",
      content: "<p>글</p>",
      baseHash: memoBaseHash(rec()),
      savedAt: 1790000000000,
    });
  });

  it.each([
    ["빈 값", null],
    ["빈 문자열", ""],
    ["JSON 이 아님", "{깨짐"],
    ["객체가 아님", "[1]"],
    ["형식이 허용값이 아님", JSON.stringify({ ...draft(), format: "pdf" })],
    ["글이 문자열이 아님", JSON.stringify({ ...draft(), content: 3 })],
    ["기준 해시가 없음", JSON.stringify({ format: "text", content: "x", savedAt: 1 })],
    ["시각이 숫자가 아님", JSON.stringify({ ...draft(), savedAt: "어제" })],
    ["시각이 유한하지 않음", '{"format":"text","content":"x","baseHash":"a","savedAt":1e999}'],
    ["20,000자 초과", JSON.stringify({ ...draft(), content: "가".repeat(MEMO_MAX_LENGTH + 1) })],
  ])("깨진 저장값(%s)은 없는 것으로 읽는다", (_name, raw) => {
    expect(parseDraft(raw)).toBeNull();
  });

  it("20,000자까지만 쓸 수 있다", () => {
    expect(isDraftWritable("가".repeat(MEMO_MAX_LENGTH))).toBe(true);
    expect(isDraftWritable("가".repeat(MEMO_MAX_LENGTH + 1))).toBe(false);
    expect(parseDraft(serializeDraft(draft({ content: "가".repeat(MEMO_MAX_LENGTH) })))).not.toBeNull();
  });

  it("글이 다르면 쓰다 만 글이고, 같으면 아니다 — 글이 빈 채 형식만 다른 것은 쓰다 만 글이 아니다", () => {
    const base = { format: "text" as const, content: "서버 글" };
    expect(draftDiffers({ format: "text", content: "다른 글" }, base)).toBe(true);
    expect(draftDiffers({ format: "text", content: "서버 글" }, base)).toBe(false);
    expect(draftDiffers({ format: "html", content: "서버 글" }, base)).toBe(true); // 글이 있고 형식만 바뀜
    expect(draftDiffers({ format: "html", content: "" }, { format: "text", content: "" })).toBe(false);
    expect(draftDiffers({ format: "html", content: "  " }, { format: "text", content: "  " })).toBe(false);
    expect(draftDiffers({ format: "text", content: "" }, base)).toBe(true); // 메모를 비우려던 글
  });

  it("편집 기준은 서버 메모의 형식·내용·해시, 메모가 없으면 처음 형식·빈 글·none", () => {
    expect(memoEditBase(rec({ format: "md", content: "글" }), "text")).toEqual({
      format: "md",
      content: "글",
      hash: memoBaseHash(rec({ format: "md", content: "글" })),
    });
    expect(memoEditBase(null, "html")).toEqual({ format: "html", content: "", hash: "none" });
  });

  it("되살릴 임시본 — 기준과 다른 글만, 서버 메모가 그 뒤 바뀌었는지(changedElsewhere)도 알린다", () => {
    const base = memoEditBase(rec(), "text");
    expect(restorableDraft(null, base)).toBeNull();
    expect(restorableDraft(draft({ content: "서버 글" }), base)).toBeNull(); // 서버와 같다
    expect(restorableDraft(draft(), base)).toEqual({ draft: draft(), changedElsewhere: false });
    expect(restorableDraft(draft({ baseHash: memoBaseHash(rec({ content: "예전 글" })) }), base)?.changedElsewhere).toBe(true);
    // 메모가 없던 때의 임시본인데 그 사이 메모가 생겼다.
    expect(restorableDraft(draft({ baseHash: "none" }), base)?.changedElsewhere).toBe(true);
    // 메모가 아직 없으면 none 끼리라 바뀌지 않았다.
    expect(restorableDraft(draft({ baseHash: "none" }), memoEditBase(null, "text"))).toEqual({
      draft: draft({ baseHash: "none" }),
      changedElsewhere: false,
    });
  });

  it("보기 모드 분류 — 다른 글은 pending, 서버와 같아진 것은 stale, 없으면 둘 다 아님", () => {
    expect(classifyDraft(null, rec(), "text")).toEqual({ pending: null, stale: false });
    expect(classifyDraft(draft(), rec(), "text")).toEqual({ pending: draft(), stale: false });
    expect(classifyDraft(draft({ content: "서버 글" }), rec(), "text")).toEqual({ pending: null, stale: true });
    expect(classifyDraft(draft({ content: "" }), null, "text")).toEqual({ pending: null, stale: true }); // 빈 글 = 메모 없음
    expect(classifyDraft(draft({ content: "첫 글" }), null, "text").pending?.content).toBe("첫 글");
  });

  it("시각은 지역 시각 「yyyy-MM-dd HH:mm」, 안내 문구는 서버 메모가 바뀌었으면 한 문장 더 붙는다", () => {
    const at = new Date(2026, 9, 3, 4, 5).getTime();
    expect(formatDraftTime(at)).toBe("2026-10-03 04:05");
    expect(memoDraftNoticeText(at, false)).toBe("저장하지 않은 글이 있습니다(2026-10-03 04:05)");
    expect(memoDraftNoticeText(at, true)).toBe("저장하지 않은 글이 있습니다(2026-10-03 04:05). 그 뒤 다른 곳에서 메모가 바뀌었습니다.");
  });

  it("저장소 감싸개는 window·localStorage 가 없는 환경(서버 렌더)에서도 던지지 않는다", () => {
    expect(typeof window).toBe("undefined");
    expect(readDraft("k")).toBeNull();
    expect(() => writeDraft("k", draft())).not.toThrow();
    expect(() => removeDraft("k")).not.toThrow();
    expect(readDraft(null)).toBeNull();
    expect(() => writeDraft(null, draft())).not.toThrow();
  });
});

describe("md 편집기 높이 규칙", () => {
  it("기본 최소 높이는 두 줄 도구 막대 기준 190px, 편집 영역이 420px 이상이면 한 줄 기준 164px 다", () => {
    expect(MEMO_CSS).toMatch(/\.mcm-memo__md \{[^}]*min-height: 190px/);
    expect(MEMO_CSS).toMatch(/\.mcm-memo__edit \{[^}]*container-type: inline-size/);
    expect(MEMO_CSS).toMatch(/@container \(min-width: 420px\) \{ \.mcm-memo__md \{ min-height: 164px; \} \}/);
  });
});
