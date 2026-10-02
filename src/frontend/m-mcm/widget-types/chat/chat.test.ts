/**
 * AI 챗봇 유형 순수 로직·호출 시험(스펙 2026-10-02-widget-admin-generic §6·§9, 계획 Task 14).
 * @dk-oasis/shared 런타임을 import 하지 않는다 — 타입 import 만(m-mcm vitest 는 node 환경, 렌더 시험 없음).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchChatHistory, resetChat, searchQueryWidgetDefs, sendChatMessage } from "./api";
import {
  appendPending,
  buildQueryWidgetOptions,
  CHAT_DEFAULT_ERROR,
  CHAT_DEFAULT_WELCOME,
  CHAT_MAX_LENGTH,
  CHAT_MAX_LINKS,
  canSend,
  restoreDraft,
  chatErrorMessage,
  ChatServiceError,
  displayItems,
  failPending,
  hasPending,
  historyRequest,
  isLiveChat,
  normalizeChatConfig,
  parseHistory,
  parseLinks,
  parseReply,
  PREVIEW_INST_ID,
  PREVIEW_WIDGET_ID,
  queryWidgetIds,
  remainingChars,
  resetRequest,
  resolvePending,
  resolveWelcome,
  sendRequest,
  shouldSendOnKey,
  unwrapChat,
  validateChatConfig,
  validateDraft,
  type ChatMessage,
} from "./chat-model";
import { meta } from "./type.meta";

const msg = (seq: number, role: "user" | "assistant", content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  key: `${role}-${seq}`,
  seq,
  role,
  content,
  links: [],
  ...extra,
});

describe("유형 메타", () => {
  it("스펙 §3·§6 값 — 8×18, 최소 6×10, 안쪽 여백 없음", () => {
    expect(meta.id).toBe("chat");
    expect(meta.defaultSize).toEqual({ w: 8, h: 18 });
    expect(meta.minSize).toEqual({ w: 6, h: 10 });
    expect(meta.bodyPadding).toBe(false);
  });

  it("초기 설정이 계획 값과 같고 정규화해도 변하지 않으며 검사를 통과한다", () => {
    expect(meta.initialConfig).toEqual({
      systemPrompt: "",
      welcome: "무엇을 도와드릴까요?",
      pageGuide: true,
      dataQueryDefIds: [],
    });
    expect(normalizeChatConfig(meta.initialConfig)).toEqual(meta.initialConfig);
    expect(validateChatConfig(normalizeChatConfig(meta.initialConfig), [])).toEqual([]);
    expect(CHAT_DEFAULT_WELCOME).toBe("무엇을 도와드릴까요?");
  });
});

describe("글자 수 제한", () => {
  it("상한은 2000자이고 남은 글자는 입력 칸 값 기준이다", () => {
    expect(CHAT_MAX_LENGTH).toBe(2000);
    expect(remainingChars("")).toBe(2000);
    expect(remainingChars("가나다")).toBe(1997);
    expect(remainingChars("a".repeat(2000))).toBe(0);
    expect(remainingChars("a".repeat(2003))).toBe(-3);
  });

  it("보낼 글은 앞뒤 공백을 뺀 길이로 1~2000자를 본다", () => {
    expect(validateDraft("")).not.toBeNull();
    expect(validateDraft(" \n\t ")).not.toBeNull();
    expect(validateDraft("안녕")).toBeNull();
    expect(validateDraft("a".repeat(2000))).toBeNull();
    expect(validateDraft(`  ${"a".repeat(2000)}  `)).toBeNull();
    expect(validateDraft("a".repeat(2001))).toBe("2,000자까지 입력할 수 있습니다.");
  });

  it("restoreDraft — 입력 칸이 비었으면 보낸 글을 되돌리고, 새 글이 있으면 둔다", () => {
    expect(restoreDraft("", "질문")).toBe("질문");
    expect(restoreDraft("  \n", "질문")).toBe("질문");
    expect(restoreDraft("다음 질문", "질문")).toBe("다음 질문");
  });

  it("canSend — 보내는 중이거나 검사에 걸리면 false", () => {
    expect(canSend("안녕", false)).toBe(true);
    expect(canSend("안녕", true)).toBe(false);
    expect(canSend("   ", false)).toBe(false);
    expect(canSend("a".repeat(2001), false)).toBe(false);
  });
});

describe("Enter 로 보내기", () => {
  const key = (o: Partial<Parameters<typeof shouldSendOnKey>[0]>) =>
    shouldSendOnKey({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, ...o });

  it("Enter 만 보낸다. Shift+Enter 는 줄바꿈", () => {
    expect(key({})).toBe(true);
    expect(key({ shiftKey: true })).toBe(false);
    expect(key({ key: "a", keyCode: 65 })).toBe(false);
  });

  it("한글 입력 조합 중 Enter 는 보내지 않는다(마지막 글자 중복 방지)", () => {
    expect(key({ isComposing: true })).toBe(false);
    expect(key({ keyCode: 229 })).toBe(false);
  });
});

describe("링크 변환", () => {
  it("배열을 {pageId,title} 로 바꾼다", () => {
    expect(parseLinks([{ pageId: "mls:lsh/noticeMgmt", title: "공지 관리" }])).toEqual([
      { pageId: "mls:lsh/noticeMgmt", title: "공지 관리" },
    ]);
  });

  it("JSON 문자열(LINKS_JSON)도 받는다. 깨진 JSON·null 은 빈 배열", () => {
    expect(parseLinks('[{"pageId":"mcm:csa/commWidgetMng","title":"위젯 관리"}]')).toEqual([
      { pageId: "mcm:csa/commWidgetMng", title: "위젯 관리" },
    ]);
    expect(parseLinks("{깨짐")).toEqual([]);
    expect(parseLinks(null)).toEqual([]);
    expect(parseLinks(undefined)).toEqual([]);
    expect(parseLinks("")).toEqual([]);
    expect(parseLinks(42)).toEqual([]);
  });

  it("pageId 없는 항목·객체 아닌 항목은 버리고, 제목이 없으면 pageId 를 제목으로 쓴다", () => {
    expect(parseLinks([{ title: "제목만" }, "문자열", null, { pageId: "  " }, { pageId: "a:b/c" }])).toEqual([
      { pageId: "a:b/c", title: "a:b/c" },
    ]);
  });

  it("같은 pageId 는 한 번만, 최대 5개", () => {
    expect(
      parseLinks([
        { pageId: "a:1", title: "A" },
        { pageId: "a:1", title: "A 또" },
      ])
    ).toEqual([{ pageId: "a:1", title: "A" }]);
    const many = Array.from({ length: 9 }, (_, i) => ({ pageId: `m:p${i}`, title: `P${i}` }));
    expect(CHAT_MAX_LINKS).toBe(5);
    expect(parseLinks(many)).toHaveLength(5);
  });
});

describe("기록·답 해석", () => {
  it("history 는 seq 순으로 정렬하고 role 이 틀린 줄은 버린다", () => {
    const out = {
      messages: [
        { seq: "3", role: "assistant", content: "답", links: [{ pageId: "x:y", title: "Y" }] },
        { seq: 1, role: "user", content: "질문" },
        { seq: 2, role: "system", content: "숨김" },
        { seq: "q", role: "user", content: "seq 깨짐" },
        null,
      ],
    };
    const list = parseHistory(out);
    expect(list.map((m) => [m.seq, m.role, m.content])).toEqual([
      [1, "user", "질문"],
      [3, "assistant", "답"],
    ]);
    expect(list[1].links).toEqual([{ pageId: "x:y", title: "Y" }]);
    expect(list[0].links).toEqual([]);
    expect(list.every((m) => !m.pending)).toBe(true);
  });

  it("messages 가 배열이 아니면 빈 목록", () => {
    expect(parseHistory({})).toEqual([]);
    expect(parseHistory({ messages: "x" })).toEqual([]);
  });

  it("reply 를 해석한다. 없거나 깨지면 null", () => {
    expect(parseReply({ reply: { seq: 4, role: "assistant", content: "안녕하세요", links: [] } })).toMatchObject({
      seq: 4,
      role: "assistant",
      content: "안녕하세요",
    });
    expect(parseReply({})).toBeNull();
    expect(parseReply({ reply: { role: "assistant" } })).toBeNull();
  });
});

describe("메시지 목록 병합(기록 + 낙관적 사용자 메시지 + 답)", () => {
  const history = [msg(1, "user", "첫 질문"), msg(2, "assistant", "첫 답")];

  it("낙관적 사용자 메시지는 마지막 seq + 1, pending 으로 붙는다", () => {
    const next = appendPending(history, "둘째 질문");
    expect(next).toHaveLength(3);
    expect(next[2]).toMatchObject({ seq: 3, role: "user", content: "둘째 질문", pending: true, links: [] });
    expect(hasPending(next)).toBe(true);
    expect(hasPending(history)).toBe(false);
    // 원본은 바뀌지 않는다
    expect(history).toHaveLength(2);
  });

  it("빈 기록이면 seq 1 부터", () => {
    expect(appendPending([], "처음")[0].seq).toBe(1);
  });

  it("답이 오면 pending 을 풀고 답을 붙인다", () => {
    const sent = appendPending(history, "둘째 질문");
    const reply = msg(4, "assistant", "둘째 답", { links: [{ pageId: "a:b", title: "화면" }] });
    const done = resolvePending(sent, reply);
    expect(done.map((m) => [m.seq, m.role])).toEqual([
      [1, "user"],
      [2, "assistant"],
      [3, "user"],
      [4, "assistant"],
    ]);
    expect(hasPending(done)).toBe(false);
    expect(done[3].links).toEqual([{ pageId: "a:b", title: "화면" }]);
  });

  it("같은 키의 답이 이미 있으면 바꿔 넣는다(중복 없음)", () => {
    const sent = appendPending(history, "q");
    const once = resolvePending(sent, msg(4, "assistant", "답1"));
    const twice = resolvePending(once, msg(4, "assistant", "답2"));
    expect(twice.filter((m) => m.role === "assistant" && m.seq === 4)).toHaveLength(1);
    expect(twice[twice.length - 1].content).toBe("답2");
  });

  it("실패하면 보낸 질문은 목록에 남고 pending 만 풀린다", () => {
    const sent = appendPending(history, "실패할 질문");
    const failed = failPending(sent);
    expect(failed).toHaveLength(3);
    expect(failed[2]).toMatchObject({ content: "실패할 질문", role: "user" });
    expect(failed[2].pending).toBeFalsy();
    expect(hasPending(failed)).toBe(false);
  });

  it("실패한 질문 다음 새 질문의 seq 는 이어진다", () => {
    const failed = failPending(appendPending(history, "실패"));
    expect(appendPending(failed, "다시")[3].seq).toBe(4);
  });
});

describe("화면 목록(첫 인사)", () => {
  it("기록이 비어 있던 대화는 첫 인사를 맨 위에 보인다(저장 안 함)", () => {
    const items = displayItems({ messages: [], welcome: "무엇을 도와드릴까요?", showWelcome: true });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ role: "assistant", content: "무엇을 도와드릴까요?", welcome: true });
  });

  it("첫 질문을 보내도 첫 인사는 맨 위에 남는다", () => {
    const items = displayItems({
      messages: appendPending([], "질문"),
      welcome: "안녕하세요",
      showWelcome: true,
    });
    expect(items.map((i) => i.role)).toEqual(["assistant", "user"]);
    expect(items[0].welcome).toBe(true);
    expect(items[1].pending).toBe(true);
  });

  it("기록이 있던 대화·빈 인사말이면 첫 인사가 없다", () => {
    expect(displayItems({ messages: [msg(1, "user", "q")], welcome: "안녕", showWelcome: false })).toHaveLength(1);
    expect(displayItems({ messages: [], welcome: "", showWelcome: true })).toEqual([]);
  });

  it("resolveWelcome — 없으면 기본 문구, 빈 문자열이면 인사 없음, 문자열이면 앞뒤 공백 제거", () => {
    expect(resolveWelcome(null)).toBe(CHAT_DEFAULT_WELCOME);
    expect(resolveWelcome({})).toBe(CHAT_DEFAULT_WELCOME);
    expect(resolveWelcome({ welcome: 7 })).toBe(CHAT_DEFAULT_WELCOME);
    expect(resolveWelcome({ welcome: "" })).toBe("");
    expect(resolveWelcome({ welcome: "  반갑습니다 " })).toBe("반갑습니다");
  });
});

describe("미리보기 판정", () => {
  it("저장된 정의(def.…)를 놓은 위젯만 서버와 대화하고, 저장 전·__preview 는 서버를 부르지 않는다", () => {
    expect(isLiveChat("def.k3x9q2ab", { welcome: "x" }, "inst-1")).toBe(true);
    expect(isLiveChat("def.k3x9q2ab", null)).toBe(true);
    expect(isLiveChat("", {})).toBe(false);
    expect(isLiveChat("new", {})).toBe(false);
    expect(isLiveChat("def.k3x9q2ab", { __preview: true }, "inst-1")).toBe(false);
  });

  it("위젯관리 미리보기(instId preview·저장 전 widgetId def.preview)는 저장된 정의여도 대화하지 않는다", () => {
    expect(PREVIEW_INST_ID).toBe("preview");
    expect(PREVIEW_WIDGET_ID).toBe("def.preview");
    expect(isLiveChat("def.preview", {}, "preview")).toBe(false);
    expect(isLiveChat("def.preview", {}, "inst-1")).toBe(false);
    expect(isLiveChat("def.k3x9q2ab", {}, "preview")).toBe(false);
  });
});

describe("요청 모양(envelope·params)", () => {
  it("history — widgetChat/history, params.instId", () => {
    expect(historyRequest("inst-1")).toEqual({
      url: "/api/mcm/oasis/widgetChat/history",
      body: { meta: { menuId: "HOME" }, params: { instId: "inst-1" } },
    });
  });

  it("send — params 는 instId·defId·message 뿐이고 message 는 앞뒤 공백을 뺀다(userId 는 보내지 않는다)", () => {
    const req = sendRequest("inst-1", "def.k3x9q2ab", "  재고 알려줘\n");
    expect(req.url).toBe("/api/mcm/oasis/widgetChat/send");
    expect(req.body).toEqual({
      meta: { menuId: "HOME" },
      params: { instId: "inst-1", defId: "def.k3x9q2ab", message: "재고 알려줘" },
    });
    expect(JSON.stringify(req.body)).not.toContain("userId");
  });

  it("reset — params.instId", () => {
    expect(resetRequest("inst-9")).toEqual({
      url: "/api/mcm/oasis/widgetChat/reset",
      body: { meta: { menuId: "HOME" }, params: { instId: "inst-9" } },
    });
  });
});

describe("응답 봉투 해제", () => {
  it("data 와 data.result 를 펼치고 grids 는 rows 로 푼다", () => {
    expect(
      unwrapChat({ meta: { success: true }, data: { result: { reply: { seq: 2 } }, other: 1 }, grids: { g: { rows: [1] } } })
    ).toEqual({ result: { reply: { seq: 2 } }, other: 1, reply: { seq: 2 }, g: [1] });
  });

  it("meta.success=false 는 서버 메시지로 ChatServiceError 를 던진다", () => {
    expect(() =>
      unwrapChat({ meta: { success: false, message: "답을 받지 못했습니다. 잠시 뒤 다시 시도하세요." } })
    ).toThrowError(new ChatServiceError("답을 받지 못했습니다. 잠시 뒤 다시 시도하세요."));
    expect(() => unwrapChat({ meta: { success: false } })).toThrowError(ChatServiceError);
  });

  it("chatErrorMessage — 서버 업무 메시지는 그대로, 그 밖 오류는 기본 문구", () => {
    expect(chatErrorMessage(new ChatServiceError("메시지는 2000자까지 보낼 수 있습니다."), CHAT_DEFAULT_ERROR)).toBe(
      "메시지는 2000자까지 보낼 수 있습니다."
    );
    expect(chatErrorMessage(new Error("Failed to fetch"), CHAT_DEFAULT_ERROR)).toBe(CHAT_DEFAULT_ERROR);
    expect(chatErrorMessage("문자열", "대체")).toBe("대체");
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
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
    );
  const sent = (i = 0) => {
    const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
    return { url, init, body: JSON.parse(String(init.body)) as { meta: unknown; params: Record<string, unknown> } };
  };

  it("fetchChatHistory — history 를 POST 하고 messages 를 해석한다", async () => {
    reply({
      meta: { success: true },
      data: { result: { messages: [{ seq: 1, role: "user", content: "안녕", links: [] }] } },
    });
    const list = await fetchChatHistory("inst-1");
    expect(sent().url).toBe("/api/mcm/oasis/widgetChat/history");
    expect(sent().init.method).toBe("POST");
    expect(sent().body.params).toEqual({ instId: "inst-1" });
    expect(list.map((m) => m.content)).toEqual(["안녕"]);
  });

  it("sendChatMessage — instId·defId·message 를 보내고 reply 를 돌려준다", async () => {
    reply({
      meta: { success: true },
      data: { result: { reply: { seq: 2, role: "assistant", content: "네", links: '[{"pageId":"a:b","title":"A"}]' } } },
    });
    const r = await sendChatMessage("inst-1", "def.abc12345", " 질문 ");
    expect(sent().url).toBe("/api/mcm/oasis/widgetChat/send");
    expect(sent().body.params).toEqual({ instId: "inst-1", defId: "def.abc12345", message: "질문" });
    expect(r).toMatchObject({ seq: 2, role: "assistant", content: "네" });
    expect(r.links).toEqual([{ pageId: "a:b", title: "A" }]);
  });

  it("sendChatMessage — 서버가 거절하면 그 메시지로 던진다", async () => {
    reply({ meta: { success: false, message: "답을 받지 못했습니다. 잠시 뒤 다시 시도하세요." } });
    await expect(sendChatMessage("i", "def.abc12345", "q")).rejects.toThrowError(
      "답을 받지 못했습니다. 잠시 뒤 다시 시도하세요."
    );
  });

  it("sendChatMessage — reply 가 없으면 기본 오류 문구로 던진다", async () => {
    reply({ meta: { success: true }, data: { result: {} } });
    await expect(sendChatMessage("i", "def.abc12345", "q")).rejects.toThrowError(CHAT_DEFAULT_ERROR);
  });

  it("resetChat — reset 을 POST 한다", async () => {
    reply({ meta: { success: true }, data: { result: {} } });
    await resetChat("inst-2");
    expect(sent().url).toBe("/api/mcm/oasis/widgetChat/reset");
    expect(sent().body.params).toEqual({ instId: "inst-2" });
  });

  it("searchQueryWidgetDefs — commWidgetMng/search 의 defs 를 돌려준다(menuId commWidgetMng)", async () => {
    reply({ meta: { success: true }, data: { result: { defs: [{ widgetId: "def.a", typeId: "query-table" }], usage: {} } } });
    const defs = await searchQueryWidgetDefs();
    expect(sent().url).toBe("/api/mcm/oasis/commWidgetMng/search");
    expect(sent().body.meta).toEqual({ menuId: "commWidgetMng" });
    expect(defs).toEqual([{ widgetId: "def.a", typeId: "query-table" }]);
  });

  it("searchQueryWidgetDefs — defs 가 없으면 빈 배열", async () => {
    reply({ meta: { success: true }, data: { result: {} } });
    expect(await searchQueryWidgetDefs()).toEqual([]);
  });
});

describe("편집기 설정", () => {
  it("normalizeChatConfig — 빠진 값은 기본값, 틀린 형은 바로잡는다", () => {
    expect(normalizeChatConfig(null)).toEqual({
      systemPrompt: "",
      welcome: "무엇을 도와드릴까요?",
      pageGuide: true,
      dataQueryDefIds: [],
    });
    expect(
      normalizeChatConfig({
        systemPrompt: "친절하게",
        welcome: "",
        pageGuide: false,
        dataQueryDefIds: ["def.a", "", 3, "def.a", "def.b"],
      })
    ).toEqual({ systemPrompt: "친절하게", welcome: "", pageGuide: false, dataQueryDefIds: ["def.a", "def.b"] });
    expect(normalizeChatConfig({ pageGuide: "yes", dataQueryDefIds: "x", systemPrompt: 1 })).toEqual({
      systemPrompt: "",
      welcome: "무엇을 도와드릴까요?",
      pageGuide: true,
      dataQueryDefIds: [],
    });
  });

  const defs = [
    { widgetId: "def.tbl", srcTp: "D", typeId: "query-table", title: "재고 표", useYn: "Y" },
    { widgetId: "def.num", srcTp: "D", typeId: "query-number", title: "가동률", useYn: "Y" },
    { widgetId: "def.off", srcTp: "D", typeId: "query-chart", title: "중지된 차트", useYn: "N" },
    { widgetId: "def.md", srcTp: "D", typeId: "markdown", title: "글", useYn: "Y" },
    { widgetId: "def.chat", srcTp: "D", typeId: "chat", title: "챗봇", useYn: "Y" },
    { widgetId: "home.notice", srcTp: "C", typeId: null, title: "공지사항", useYn: "Y" },
    { widgetId: "def.notitle", srcTp: "D", typeId: "query-table", title: null, useYn: "Y" },
    "문자열",
    null,
  ];

  it("쿼리 위젯 목록 거르기 — query- 유형 + 사용 중만, 이름은 제목(ID)", () => {
    const options = buildQueryWidgetOptions(defs, []);
    expect(options.map((o) => o.value).sort()).toEqual(["def.notitle", "def.num", "def.tbl"]);
    expect(options.find((o) => o.value === "def.tbl")?.label).toBe("재고 표(def.tbl)");
    // 제목이 없으면 ID 만
    expect(options.find((o) => o.value === "def.notitle")?.label).toBe("def.notitle");
    expect(queryWidgetIds(defs).sort()).toEqual(["def.notitle", "def.num", "def.tbl"]);
  });

  it("제목 순(가나다)으로 정렬한다", () => {
    const options = buildQueryWidgetOptions(defs, []);
    const titles = options.map((o) => o.label);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "ko")));
  });

  it("이미 골라 둔 것이 목록에 없으면(삭제·중지) 「사용할 수 없음」으로 남겨 보여 준다", () => {
    const options = buildQueryWidgetOptions(defs, ["def.tbl", "def.off", "def.gone"]);
    expect(options.find((o) => o.value === "def.off")?.label).toBe("def.off (사용할 수 없음)");
    expect(options.find((o) => o.value === "def.gone")?.label).toBe("def.gone (사용할 수 없음)");
    expect(options.filter((o) => o.value === "def.tbl")).toHaveLength(1);
  });

  it("defs 가 배열이 아니어도 죽지 않는다", () => {
    expect(buildQueryWidgetOptions(undefined as unknown as unknown[], [])).toEqual([]);
    expect(queryWidgetIds(null as unknown as unknown[])).toEqual([]);
  });

  it("목록을 아직 못 불러왔으면(null) 고른 ID 를 「사용할 수 없음」 없이 그대로 보인다", () => {
    expect(buildQueryWidgetOptions(null, ["def.tbl", "def.num"])).toEqual([
      { value: "def.tbl", label: "def.tbl" },
      { value: "def.num", label: "def.num" },
    ]);
    // 빈 배열(읽었더니 후보가 없음)이면 사용할 수 없음
    expect(buildQueryWidgetOptions([], ["def.tbl"])).toEqual([{ value: "def.tbl", label: "def.tbl (사용할 수 없음)" }]);
  });

  it("validateChatConfig — 목록을 불러왔을 때만 사용할 수 없는 쿼리 위젯을 막는다", () => {
    const cfg = normalizeChatConfig({ dataQueryDefIds: ["def.tbl", "def.gone"] });
    expect(validateChatConfig(cfg, ["def.tbl", "def.num"])).toEqual([
      "사용할 수 없는 쿼리 위젯이 선택되어 있습니다(def.gone). 선택에서 빼 주세요.",
    ]);
    expect(validateChatConfig(cfg, ["def.tbl", "def.gone"])).toEqual([]);
    // 목록을 못 불러왔으면(null) 판단하지 않는다 — 기존 선택을 지우지 않고 저장할 수 있다
    expect(validateChatConfig(cfg, null)).toEqual([]);
  });
});
