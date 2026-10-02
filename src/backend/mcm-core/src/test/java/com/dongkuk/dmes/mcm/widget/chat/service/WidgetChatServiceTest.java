package com.dongkuk.dmes.mcm.widget.chat.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyIterable;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.chat.WidgetChatJpaTestConfig;
import com.dongkuk.dmes.mcm.widget.chat.dto.WidgetChatRequest;
import com.dongkuk.dmes.mcm.widget.chat.entity.WidgetChatMessage;
import com.dongkuk.dmes.mcm.widget.chat.llm.FakeLlmClient;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmException;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmMessage;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmReply;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmTool;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmToolCall;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmToolResult;
import com.dongkuk.dmes.mcm.widget.chat.repository.WidgetChatMessageRepository;
import com.dongkuk.dmes.mcm.widget.chat.service.ChatScreenFinder.Screen;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContext;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryResult;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

/**
 * {@link WidgetChatService} — 각본 가짜 LLM + H2 기록(실제 Writer·저장소) + mock(정의·쿼리 실행기·사용자·화면 찾기).
 * 스펙 §9: 일반 답 저장, 도구 반복(상한 4), 허용 defId, pageGuide, 메시지 길이, chat 정의 검사, 공급자 오류, 100개 유지, 문맥 20개, IDOR.
 */
@SpringJUnitConfig(WidgetChatJpaTestConfig.class)
class WidgetChatServiceTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String DEF_ID = "def.chat1234";
    private static final String CONFIG_GUIDE = "{\"systemPrompt\":\"생산 관련 질문에 답한다.\",\"welcome\":\"무엇을 도와드릴까요?\","
            + "\"pageGuide\":true,\"dataQueryDefIds\":[]}";

    @Autowired WidgetChatWriter writer;
    @Autowired WidgetChatMessageRepository repository;

    private WidgetDefRepository defRepository;
    private WidgetQueryRunner queryRunner;
    private WidgetUserContextResolver userContextResolver;
    private ChatScreenFinder screenFinder;
    private SecurityIdentity securityIdentity;
    private FakeLlmClient llm;
    private WidgetChatService service;

    @BeforeEach
    void setUp() {
        repository.deleteAllInBatch();
        defRepository = mock(WidgetDefRepository.class);
        queryRunner = mock(WidgetQueryRunner.class);
        userContextResolver = mock(WidgetUserContextResolver.class);
        screenFinder = mock(ChatScreenFinder.class);
        securityIdentity = mock(SecurityIdentity.class);
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(userContextResolver.current())
                .thenReturn(new WidgetUserContext("userA", "홍길동", "D100", "생산팀", List.of("D100")));
        llm = FakeLlmClient.scripted();
        Clock clock = Clock.fixed(Instant.parse("2026-10-01T16:30:00Z"), ZoneId.of("Asia/Seoul")); // 서울 10-02 01:30
        service = new WidgetChatService(repository, writer, defRepository, queryRunner, userContextResolver, screenFinder,
                llm, securityIdentity, clock);
        chatDef(CONFIG_GUIDE);
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private WidgetDef chatDef(String configJson) {
        WidgetDef d = def(DEF_ID, "chat", configJson);
        when(defRepository.findById(DEF_ID)).thenReturn(Optional.of(d));
        return d;
    }

    private static WidgetDef def(String id, String typeId, String configJson) {
        WidgetDef d = new WidgetDef();
        d.setWidgetId(id);
        d.setSrcTp(WidgetDef.SRC_DEF);
        d.setTypeId(typeId);
        d.setTitle("도우미");
        d.setUseYn("Y");
        d.setConfigJson(configJson);
        return d;
    }

    private static WidgetChatRequest req(String instId, String defId, String message) {
        WidgetChatRequest r = new WidgetChatRequest();
        r.setInstId(instId);
        r.setDefId(defId);
        r.setMessage(message);
        return r;
    }

    private static WidgetChatRequest inst(String instId) {
        return req(instId, null, null);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> reply(Map<String, Object> result) {
        return (Map<String, Object>) result.get("reply");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> messages(Map<String, Object> history) {
        return (List<Map<String, Object>>) history.get("messages");
    }

    private static LlmReply callTool(String id, String name, Map<String, Object> input) {
        return LlmReply.ofToolCalls("", List.of(new LlmToolCall(id, name, input)));
    }

    private List<WidgetChatMessage> stored(String userId, String instId) {
        return repository.findByUserIdAndInstIdOrderByMsgSeqAsc(userId, instId);
    }

    private static List<String> toolNames(List<LlmTool> tools) {
        return tools.stream().map(LlmTool::name).toList();
    }

    // ── 일반 답 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("일반 답: 사용자 메시지 → 답을 차례로 저장하고 reply 를 돌려준다. 시스템 프롬프트 앞에 오늘·사용자·부서를 붙인다")
    void plainAnswerIsSaved() {
        llm.then(LlmReply.ofText("안녕하세요. 무엇을 도와드릴까요?"));

        Map<String, Object> reply = reply(service.send(req("i1", DEF_ID, "안녕")));

        assertThat(reply).containsEntry("seq", 2).containsEntry("role", "assistant")
                .containsEntry("content", "안녕하세요. 무엇을 도와드릴까요?");
        assertThat((List<?>) reply.get("links")).isEmpty();
        assertThat(stored("userA", "i1")).extracting(WidgetChatMessage::getRoleTp, WidgetChatMessage::getContent)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("user", "안녕"),
                        org.assertj.core.groups.Tuple.tuple("assistant", "안녕하세요. 무엇을 도와드릴까요?"));

        FakeLlmClient.Call call = llm.calls().get(0);
        assertThat(call.systemPrompt())
                .isEqualTo("너는 DMES 포털의 도우미다. 오늘은 2026-10-02, 사용자는 홍길동(생산팀).\n생산 관련 질문에 답한다.");
        assertThat(call.messages()).singleElement().satisfies(m -> {
            assertThat(m.role()).isEqualTo(LlmMessage.USER);
            assertThat(m.text()).isEqualTo("안녕");
        });
        assertThat(toolNames(call.tools())).containsExactly("find_screen");
    }

    @Test
    @DisplayName("부서 이름이 없으면 괄호를 빼고, 정의 systemPrompt 가 비면 머리말만 쓴다")
    void systemPromptWithoutDept() {
        when(userContextResolver.current()).thenReturn(new WidgetUserContext("userA", "홍길동", null, null, List.of()));
        chatDef("{\"pageGuide\":false,\"dataQueryDefIds\":[]}");
        llm.then(LlmReply.ofText("네"));

        service.send(req("i1", DEF_ID, "질문"));

        assertThat(llm.calls().get(0).systemPrompt()).isEqualTo("너는 DMES 포털의 도우미다. 오늘은 2026-10-02, 사용자는 홍길동.");
    }

    // ── 도구 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("도구 1회 후 답: find_screen 결과를 모델에 돌려주고, 그 화면을 links({pageId,title})로 저장·반환한다")
    void toolOnceThenAnswer() throws Exception {
        when(screenFinder.find("위젯", 10)).thenReturn(List.of(
                new Screen("mcm:csa/commWidgetMng", "위젯관리", "공통관리 > 시스템관리")));
        llm.then(callTool("t1", "find_screen", Map.of("keyword", "위젯")))
                .then(LlmReply.ofText("「위젯관리」 화면에서 바꿀 수 있습니다."));

        Map<String, Object> reply = reply(service.send(req("i1", DEF_ID, "위젯은 어디서 바꿔?")));

        assertThat(reply.get("content")).isEqualTo("「위젯관리」 화면에서 바꿀 수 있습니다.");
        assertThat(reply.get("links")).isEqualTo(List.of(Map.of("pageId", "mcm:csa/commWidgetMng", "title", "위젯관리")));

        assertThat(llm.calls()).hasSize(2);
        List<LlmMessage> second = llm.calls().get(1).messages();
        assertThat(second).extracting(LlmMessage::role).containsExactly("user", "assistant", "tool");
        assertThat(second.get(1).toolCalls()).singleElement().extracting(LlmToolCall::id).isEqualTo("t1");
        LlmToolResult result = second.get(2).toolResults().get(0);
        assertThat(result.toolCallId()).isEqualTo("t1");
        assertThat(result.error()).isFalse();
        JsonNode screens = JSON.readTree(result.content());
        assertThat(screens.get(0).get("pageId").asText()).isEqualTo("mcm:csa/commWidgetMng");
        assertThat(screens.get(0).get("path").asText()).isEqualTo("공통관리 > 시스템관리");

        Map<String, Object> history = service.history(inst("i1"));
        assertThat(messages(history).get(1).get("links"))
                .isEqualTo(List.of(Map.of("pageId", "mcm:csa/commWidgetMng", "title", "위젯관리")));
    }

    @Test
    @DisplayName("도구 반복은 4번까지 — 다섯 번째 답이 또 도구를 원하면 멈추고 그때까지의 답(글)을 저장한다. links 는 최대 5개")
    void toolLoopStopsAtFour() {
        when(screenFinder.find(anyString(), anyInt())).thenAnswer(inv -> {
            String k = inv.getArgument(0);
            return List.of(new Screen("mcm:" + k + "A", k + "A", ""), new Screen("mcm:" + k + "B", k + "B", ""));
        });
        for (int i = 1; i <= 4; i++) llm.then(callTool("t" + i, "find_screen", Map.of("keyword", "k" + i)));
        llm.then(LlmReply.ofToolCalls("지금까지 찾은 화면입니다.", List.of(new LlmToolCall("t5", "find_screen", Map.of("keyword", "k5")))));
        llm.then(LlmReply.ofText("쓰이면 안 되는 답"));

        Map<String, Object> reply = reply(service.send(req("i1", DEF_ID, "찾아줘")));

        assertThat(llm.calls()).as("처음 1번 + 도구 결과 뒤 4번").hasSize(5);
        verify(screenFinder, times(4)).find(anyString(), anyInt());
        assertThat(reply.get("content")).isEqualTo("지금까지 찾은 화면입니다.");
        assertThat((List<?>) reply.get("links")).hasSize(5);
        assertThat(stored("userA", "i1")).hasSize(2);
    }

    @Test
    @DisplayName("도구 상한에 걸렸는데 글이 비면 정해진 안내 문구를 답으로 저장한다")
    void toolLoopLimitWithoutTextUsesNotice() {
        when(screenFinder.find(anyString(), anyInt())).thenReturn(List.of());
        for (int i = 1; i <= 5; i++) llm.then(callTool("t" + i, "find_screen", Map.of("keyword", "k")));

        Map<String, Object> reply = reply(service.send(req("i1", DEF_ID, "찾아줘")));

        assertThat(reply.get("content")).isEqualTo(WidgetChatService.TOOL_LIMIT_MESSAGE);
    }

    @Test
    @DisplayName("dataQueryDefIds 에 없는 defId 는 도구 오류 결과로 돌려주고(대화 계속) 실행기를 부르지 않는다. 도구 설명에 정의 제목·설명을 넣는다")
    void disallowedDefIdIsToolError() {
        chatDef("{\"systemPrompt\":\"\",\"pageGuide\":false,\"dataQueryDefIds\":[\"def.q1aaaaaa\"]}");
        WidgetDef q1 = def("def.q1aaaaaa", "query-table", "{}");
        q1.setTitle("생산 실적");
        q1.setDescription("오늘 라인별 생산량");
        when(defRepository.findAllById(anyIterable())).thenReturn(List.of(q1));
        llm.then(callTool("t1", "run_widget_query", Map.of("defId", "def.zzzzzzzz")))
                .then(LlmReply.ofText("그 데이터는 볼 수 없습니다."));

        Map<String, Object> reply = reply(service.send(req("i1", DEF_ID, "출하 실적 보여줘")));

        assertThat(reply.get("content")).isEqualTo("그 데이터는 볼 수 없습니다.");
        verify(queryRunner, never()).runDefinition(anyString(), anyInt());
        LlmToolResult result = llm.calls().get(1).messages().get(2).toolResults().get(0);
        assertThat(result.error()).isTrue();
        assertThat(result.content()).contains("def.zzzzzzzz");

        List<LlmTool> tools = llm.calls().get(0).tools();
        assertThat(toolNames(tools)).as("pageGuide=false 면 find_screen 없음").containsExactly("run_widget_query");
        assertThat(tools.get(0).description()).contains("def.q1aaaaaa").contains("생산 실적").contains("오늘 라인별 생산량");
    }

    @Test
    @DisplayName("허용된 defId 는 행 상한 50 으로 실행하고 columns·rows·truncated 를 JSON 으로, 8000자에서 자른다")
    void allowedDefIdRunsQuery() throws Exception {
        chatDef("{\"pageGuide\":false,\"dataQueryDefIds\":[\"def.q1aaaaaa\",\"def.q2bbbbbb\"]}");
        when(defRepository.findAllById(anyIterable())).thenReturn(List.of(def("def.q1aaaaaa", "query-table", "{}")));
        List<Map<String, Object>> small = List.of(row("LINE", "1라인", "QTY", 120), row("LINE", "2라인", "QTY", 80));
        when(queryRunner.runDefinition("def.q1aaaaaa", 50)).thenReturn(new WidgetQueryResult(List.of("LINE", "QTY"), small, false));
        List<Map<String, Object>> big = new ArrayList<>();
        for (int i = 0; i < 50; i++) big.add(row("NOTE", "가".repeat(300), "N", i));
        when(queryRunner.runDefinition("def.q2bbbbbb", 50)).thenReturn(new WidgetQueryResult(List.of("NOTE", "N"), big, true));
        llm.then(LlmReply.ofToolCalls("", List.of(
                        new LlmToolCall("t1", "run_widget_query", Map.of("defId", "def.q1aaaaaa")),
                        new LlmToolCall("t2", "run_widget_query", Map.of("defId", "def.q2bbbbbb")))))
                .then(LlmReply.ofText("1라인 120, 2라인 80 입니다."));

        service.send(req("i1", DEF_ID, "라인별 생산량?"));

        List<LlmToolResult> results = llm.calls().get(1).messages().get(2).toolResults();
        assertThat(results).hasSize(2);
        JsonNode first = JSON.readTree(results.get(0).content());
        assertThat(results.get(0).error()).isFalse();
        assertThat(first.get("columns").get(1).asText()).isEqualTo("QTY");
        assertThat(first.get("rows").get(0).get("QTY").asInt()).isEqualTo(120);
        assertThat(first.get("truncated").asBoolean()).isFalse();
        assertThat(results.get(1).content()).hasSizeLessThanOrEqualTo(8000).startsWith("{\"columns\"");
    }

    @Test
    @DisplayName("쿼리 실행 실패·꺼진 도구 호출은 도구 오류로 돌려주고 대화를 끊지 않는다")
    void toolFailuresDoNotBreakConversation() {
        chatDef("{\"pageGuide\":false,\"dataQueryDefIds\":[\"def.q1aaaaaa\"]}");
        when(defRepository.findAllById(anyIterable())).thenReturn(List.of());
        when(queryRunner.runDefinition("def.q1aaaaaa", 50)).thenThrow(new BusinessException(ErrorCode.BUSINESS_ERROR, "SQL 오류 ORA-00942"));
        llm.then(LlmReply.ofToolCalls("", List.of(
                        new LlmToolCall("t1", "run_widget_query", Map.of("defId", "def.q1aaaaaa")),
                        new LlmToolCall("t2", "find_screen", Map.of("keyword", "위젯")),
                        new LlmToolCall("t3", "delete_all", Map.of()))))
                .then(LlmReply.ofText("데이터를 불러오지 못했습니다."));

        Map<String, Object> reply = reply(service.send(req("i1", DEF_ID, "q")));

        assertThat(reply.get("content")).isEqualTo("데이터를 불러오지 못했습니다.");
        List<LlmToolResult> results = llm.calls().get(1).messages().get(2).toolResults();
        assertThat(results).extracting(LlmToolResult::error).containsExactly(true, true, true);
        assertThat(results.get(0).content()).doesNotContain("ORA-00942");
        verify(screenFinder, never()).find(anyString(), anyInt());
    }

    @Test
    @DisplayName("pageGuide=false 이고 데이터 질의도 없으면 도구를 하나도 주지 않는다")
    void noToolsWhenNothingEnabled() {
        chatDef("{\"systemPrompt\":\"x\",\"pageGuide\":false,\"dataQueryDefIds\":[]}");
        llm.then(LlmReply.ofText("네"));

        service.send(req("i1", DEF_ID, "질문"));

        assertThat(llm.calls().get(0).tools()).isEmpty();
    }

    // ── 입력·정의 검사 ──────────────────────────────────────────────────

    @Test
    @DisplayName("메시지는 1~2000자 — 2001자·빈 값은 거절하고 아무것도 저장하지 않는다. 2000자는 된다")
    void messageLength() {
        assertThatThrownBy(() -> service.send(req("i1", DEF_ID, "가".repeat(2001))))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE);
        assertThatThrownBy(() -> service.send(req("i1", DEF_ID, "   ")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE);
        assertThatThrownBy(() -> service.send(req(" ", DEF_ID, "q"))).isInstanceOf(BusinessException.class);
        assertThat(repository.count()).isZero();
        assertThat(llm.calls()).isEmpty();

        llm.then(LlmReply.ofText("ok"));
        service.send(req("i1", DEF_ID, "나".repeat(2000)));
        assertThat(stored("userA", "i1")).hasSize(2);
    }

    @Test
    @DisplayName("chat 유형·사용 중인 정의가 아니면 거절하고 아무것도 저장하지 않는다")
    void rejectsNonChatDefinition() {
        when(defRepository.findById("def.mdaaaaaa")).thenReturn(Optional.of(def("def.mdaaaaaa", "markdown", "{}")));
        WidgetDef disabled = def("def.offaaaaa", "chat", CONFIG_GUIDE);
        disabled.setUseYn("N");
        when(defRepository.findById("def.offaaaaa")).thenReturn(Optional.of(disabled));
        WidgetDef codeRow = def("home.notice", "chat", CONFIG_GUIDE);
        codeRow.setSrcTp(WidgetDef.SRC_CODE);
        when(defRepository.findById("home.notice")).thenReturn(Optional.of(codeRow));
        when(defRepository.findById("def.noneaaaa")).thenReturn(Optional.empty());

        for (String defId : List.of("def.mdaaaaaa", "def.offaaaaa", "home.notice", "def.noneaaaa")) {
            assertThatThrownBy(() -> service.send(req("i1", defId, "안녕")))
                    .as(defId).isInstanceOf(BusinessException.class);
        }
        assertThatThrownBy(() -> service.send(req("i1", null, "안녕"))).isInstanceOf(BusinessException.class);
        assertThat(repository.count()).isZero();
        assertThat(llm.calls()).isEmpty();
    }

    // ── 실패 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("공급자 오류면 「답을 받지 못했습니다」 오류 — assistant 는 저장하지 않고 사용자 메시지는 남는다")
    void providerErrorKeepsUserMessageOnly() {
        llm.thenThrow(new LlmException("anthropic HTTP 500"));

        assertThatThrownBy(() -> service.send(req("i1", DEF_ID, "안녕")))
                .isInstanceOf(BusinessException.class)
                .hasMessage("답을 받지 못했습니다. 잠시 뒤 다시 시도하세요.")
                .extracting(e -> ((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.BUSINESS_ERROR);

        assertThat(stored("userA", "i1")).singleElement().satisfies(m -> {
            assertThat(m.getRoleTp()).isEqualTo("user");
            assertThat(m.getContent()).isEqualTo("안녕");
        });
    }

    @Test
    @DisplayName("빈 답(글도 도구도 없음)도 공급자 실패로 보고 assistant 를 저장하지 않는다")
    void emptyReplyIsFailure() {
        llm.then(new LlmReply("", List.of(), "refusal", null));

        assertThatThrownBy(() -> service.send(req("i1", DEF_ID, "안녕")))
                .hasMessage("답을 받지 못했습니다. 잠시 뒤 다시 시도하세요.");
        assertThat(stored("userA", "i1")).hasSize(1);
    }

    // ── 기록 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("기록은 인스턴스당 100개만 남는다(오래된 것부터 지움)")
    void keepsHundredMessages() {
        for (int i = 1; i <= 100; i++) writer.append("userA", "i1", i % 2 == 1 ? "user" : "assistant", "m" + i, null);
        llm.then(LlmReply.ofText("답"));

        service.send(req("i1", DEF_ID, "새 질문"));

        List<WidgetChatMessage> kept = stored("userA", "i1");
        assertThat(kept).hasSize(100);
        assertThat(kept.get(0).getMsgSeq()).isEqualTo(3);
        assertThat(kept.get(99).getContent()).isEqualTo("답");
    }

    @Test
    @DisplayName("문맥은 저장 기록 최근 20개(이번 질문 포함, 오래된 순)")
    void contextIsLatestTwenty() {
        for (int i = 1; i <= 29; i++) writer.append("userA", "i1", i % 2 == 1 ? "user" : "assistant", "m" + i, null);
        llm.then(LlmReply.ofText("답"));

        service.send(req("i1", DEF_ID, "새 질문"));

        List<LlmMessage> context = llm.calls().get(0).messages();
        assertThat(context).hasSize(20);
        assertThat(context.get(0).text()).isEqualTo("m11");
        assertThat(context.get(0).role()).isEqualTo("user");
        assertThat(context.get(1).role()).isEqualTo("assistant");
        assertThat(context.get(19).text()).isEqualTo("새 질문");
    }

    @Test
    @DisplayName("history 는 인증 사용자의 그 인스턴스 기록을 오래된 순 전부, reset 은 그것만 지운다(IDOR)")
    void historyAndResetAreScopedToUser() {
        writer.append("userA", "i1", "user", "a-q", null);
        writer.append("userA", "i1", "assistant", "a-a", "[{\"pageId\":\"mcm:csa/commWidgetMng\",\"title\":\"위젯관리\"}]");
        writer.append("userB", "i1", "user", "b-q", null);
        writer.append("userA", "i2", "user", "a2", null);

        List<Map<String, Object>> list = messages(service.history(inst("i1")));
        assertThat(list).hasSize(2);
        assertThat(list.get(0)).containsEntry("seq", 1).containsEntry("role", "user").containsEntry("content", "a-q");
        assertThat((List<?>) list.get(0).get("links")).isEmpty();
        assertThat(list.get(1).get("links")).isEqualTo(List.of(Map.of("pageId", "mcm:csa/commWidgetMng", "title", "위젯관리")));

        assertThat(service.reset(inst("i1"))).containsEntry("deleted", 2);
        assertThat(stored("userA", "i1")).isEmpty();
        assertThat(stored("userB", "i1")).hasSize(1);
        assertThat(stored("userA", "i2")).hasSize(1);
        assertThat(messages(service.history(inst("i1")))).isEmpty();
    }

    @Test
    @DisplayName("인증 사용자가 없으면 history·send·reset 모두 AUTH_FAILED")
    void requiresAuthenticatedUser() {
        when(securityIdentity.currentUserId()).thenReturn(null);

        for (Runnable call : List.<Runnable>of(
                () -> service.history(inst("i1")),
                () -> service.send(req("i1", DEF_ID, "q")),
                () -> service.reset(inst("i1")))) {
            assertThatThrownBy(call::run)
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.AUTH_FAILED);
        }
        assertThat(llm.calls()).isEmpty();
    }

    private static Map<String, Object> row(String k1, Object v1, String k2, Object v2) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(k1, v1);
        m.put(k2, v2);
        return m;
    }
}
