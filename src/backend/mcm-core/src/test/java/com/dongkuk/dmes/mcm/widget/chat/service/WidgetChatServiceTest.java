package com.dongkuk.dmes.mcm.widget.chat.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyIterable;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
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
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmClient;
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
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

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

    private static final Instant NOW = Instant.parse("2026-10-01T16:30:00Z"); // 서울 10-02 01:30
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String FAILED = "답을 받지 못했습니다. 잠시 뒤 다시 시도하세요.";

    @Autowired WidgetChatWriter writer;
    @Autowired WidgetChatMessageRepository repository;
    @Autowired PlatformTransactionManager transactionManager;

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
        service = newService(llm, Clock.fixed(NOW, SEOUL));
        chatDef(CONFIG_GUIDE);
    }

    private WidgetChatService newService(LlmClient client, Clock clock) {
        return newService(client, clock, WidgetChatService.DEFAULT_DAILY_CALL_LIMIT);
    }

    private WidgetChatService newService(LlmClient client, Clock clock, int dailyCallLimit) {
        return new WidgetChatService(repository, writer, defRepository, queryRunner, userContextResolver, screenFinder,
                client, securityIdentity, transactionManager, Duration.ofSeconds(60), clock, dailyCallLimit);
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

    @Test
    @DisplayName("OASIS 처럼 바깥 트랜잭션(REQUIRED) 안에서 불러도 사용자 메시지는 따로 커밋돼 바깥 롤백 뒤에도 남는다. "
            + "LLM 호출·도구 실행 동안에는 트랜잭션을 잡지 않는다")
    void userMessageSurvivesOuterRollback() {
        List<Boolean> txActiveDuringLlm = new ArrayList<>();
        List<Integer> committedDuringLlm = new ArrayList<>();
        List<Boolean> txActiveDuringTool = new ArrayList<>();
        TransactionTemplate fresh = new TransactionTemplate(transactionManager);
        fresh.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        LlmClient probe = (system, messages, tools) -> {
            txActiveDuringLlm.add(TransactionSynchronizationManager.isActualTransactionActive());
            committedDuringLlm.add(fresh.execute(st -> stored("userA", "i1").size()));
            return llm.chat(system, messages, tools);
        };
        when(screenFinder.find(eq("위젯"), anyInt())).thenAnswer(inv -> {
            txActiveDuringTool.add(TransactionSynchronizationManager.isActualTransactionActive());
            return List.of();
        });
        llm.then(callTool("t1", "find_screen", Map.of("keyword", "위젯")))
                .thenThrow(new LlmException("anthropic HTTP 529"));
        WidgetChatService svc = newService(probe, Clock.fixed(NOW, SEOUL));
        TransactionTemplate oasis = new TransactionTemplate(transactionManager); // txBiz(REQUIRED) 흉내 — 예외면 롤백

        assertThatThrownBy(() -> oasis.executeWithoutResult(st -> svc.send(req("i1", DEF_ID, "안녕"))))
                .isInstanceOf(BusinessException.class).hasMessage(FAILED);

        assertThat(stored("userA", "i1")).singleElement().satisfies(m -> {
            assertThat(m.getRoleTp()).isEqualTo("user");
            assertThat(m.getContent()).isEqualTo("안녕");
        });
        assertThat(txActiveDuringLlm).as("LLM 호출 동안 트랜잭션 없음").containsExactly(false, false);
        assertThat(committedDuringLlm).as("LLM 을 부를 때 질문은 이미 커밋돼 있다").containsExactly(1, 1);
        assertThat(txActiveDuringTool).as("도구 실행 동안 트랜잭션 없음").containsExactly(false);
    }

    @Test
    @DisplayName("한 차례 시간 제한(60초)은 차례 전체에 걸린다 — 다음 LLM 호출 전에 넘었으면 더 부르지 않고 「답을 받지 못했습니다」")
    void turnDeadlineStopsBeforeNextCall() {
        MovableClock clock = new MovableClock(NOW, SEOUL);
        when(screenFinder.find(anyString(), anyInt())).thenReturn(List.of());
        List<Integer> calls = new ArrayList<>();
        LlmClient slow = (system, messages, tools) -> {
            calls.add(calls.size() + 1);
            clock.advance(Duration.ofSeconds(61));
            return callTool("t" + calls.size(), "find_screen", Map.of("keyword", "위젯"));
        };

        assertThatThrownBy(() -> newService(slow, clock).send(req("i1", DEF_ID, "찾아줘")))
                .isInstanceOf(BusinessException.class).hasMessage(FAILED);

        assertThat(calls).as("두 번째 호출 전에 멈춘다").containsExactly(1);
        assertThat(stored("userA", "i1")).extracting(WidgetChatMessage::getRoleTp).containsExactly("user");
    }

    @Test
    @DisplayName("시간 안이면 도구 반복을 이어 간다(59초 지난 뒤 두 번째 호출)")
    void turnDeadlineAllowsCallsWithinLimit() {
        MovableClock clock = new MovableClock(NOW, SEOUL);
        when(screenFinder.find(anyString(), anyInt())).thenReturn(List.of());
        llm.then(callTool("t1", "find_screen", Map.of("keyword", "위젯"))).then(LlmReply.ofText("없습니다."));
        LlmClient timed = (system, messages, tools) -> {
            LlmReply r = llm.chat(system, messages, tools);
            clock.advance(Duration.ofSeconds(59));
            return r;
        };

        Map<String, Object> reply = reply(newService(timed, clock).send(req("i1", DEF_ID, "찾아줘")));

        assertThat(reply.get("content")).isEqualTo("없습니다.");
        assertThat(llm.calls()).hasSize(2);
    }

    @Test
    @DisplayName("답 최대 토큰에 걸려 잘린 도구 호출(stop=max_tokens)은 실행하지 않는다 — 글이 없으면 「답을 받지 못했습니다」")
    void truncatedToolCallIsNotRun() {
        chatDef("{\"pageGuide\":true,\"dataQueryDefIds\":[\"def.q1aaaaaa\"]}");
        when(defRepository.findAllById(anyIterable())).thenReturn(List.of());
        llm.then(new LlmReply("", List.of(new LlmToolCall("t1", "run_widget_query", Map.of("defId", "def.q1aaaaaa")),
                new LlmToolCall("t2", "find_screen", Map.of("keyword", "위"))), "max_tokens", null));

        assertThatThrownBy(() -> service.send(req("i1", DEF_ID, "라인별 생산량?")))
                .isInstanceOf(BusinessException.class).hasMessage(FAILED);

        verify(queryRunner, never()).runDefinition(anyString(), anyInt());
        verify(screenFinder, never()).find(anyString(), anyInt());
        assertThat(llm.calls()).hasSize(1);
        assertThat(stored("userA", "i1")).extracting(WidgetChatMessage::getRoleTp).containsExactly("user");
    }

    @Test
    @DisplayName("잘린 답(OpenAI stop=length)에 글이 있으면 도구는 건너뛰고 그 글에 끊겼다는 표시를 붙여 저장한다")
    void truncatedTextIsSavedWithNotice() {
        llm.then(new LlmReply("1라인은 120 입니다. 2라인은", List.of(new LlmToolCall("t1", "find_screen", Map.of("keyword", "생산"))),
                "length", null));

        Map<String, Object> reply = reply(service.send(req("i1", DEF_ID, "생산량?")));

        assertThat(reply.get("content")).isEqualTo("1라인은 120 입니다. 2라인은\n\n" + WidgetChatService.TRUNCATED_NOTICE);
        verify(screenFinder, never()).find(anyString(), anyInt());
        assertThat(llm.calls()).hasSize(1);
        assertThat(stored("userA", "i1")).extracting(WidgetChatMessage::getContent).last().isEqualTo(reply.get("content"));
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

    /** 시험이 앞으로 돌리는 시계(한 차례 시간 제한 확인용). */
    private static final class MovableClock extends Clock {

        private Instant now;
        private final ZoneId zone;

        MovableClock(Instant start, ZoneId zone) {
            this.now = start;
            this.zone = zone;
        }

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return zone;
        }

        @Override
        public Clock withZone(ZoneId z) {
            return new MovableClock(now, z);
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private static Map<String, Object> row(String k1, Object v1, String k2, Object v2) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(k1, v1);
        m.put(k2, v2);
        return m;
    }

    // ── 남용 막기(사용자별 하루 LLM 호출 상한) ───────────────────────────────

    @Test
    @DisplayName("하루 LLM 호출 상한을 넘으면 질문을 저장하지 않고 거절한다 — instId 를 바꿔도 사용자 단위로 세고, 다른 사용자는 그대로")
    void dailyLimitIsPerUserAcrossInstances() {
        WidgetChatService limited = newService(llm, Clock.fixed(NOW, SEOUL), 2);
        llm.then(LlmReply.ofText("a1")).then(LlmReply.ofText("a2")).then(LlmReply.ofText("a3"));

        limited.send(req("i1", DEF_ID, "q1"));
        limited.send(req("i2", DEF_ID, "q2")); // 다른 인스턴스도 같은 사용자 몫
        assertThatThrownBy(() -> limited.send(req("i3", DEF_ID, "q3")))
                .isInstanceOf(BusinessException.class)
                .hasMessage("오늘 AI 챗봇 사용 한도(2회)를 모두 썼습니다. 내일 다시 이용하세요.");
        assertThat(stored("userA", "i3")).isEmpty(); // 거절한 질문은 저장하지 않는다
        assertThat(llm.calls()).hasSize(2);

        when(securityIdentity.currentUserId()).thenReturn("userB");
        assertThat(reply(limited.send(req("i3", DEF_ID, "q3"))).get("content")).isEqualTo("a3");
    }

    @Test
    @DisplayName("서울 날짜가 바뀌면 하루 상한이 0 부터 다시 — 23:59:59 까지는 거절, 00:00 부터 허용")
    void dailyLimitResetsOnNextDay() {
        MovableClock clock = new MovableClock(NOW, SEOUL); // 서울 10-02 01:30
        WidgetChatService limited = newService(llm, clock, 1);
        llm.then(LlmReply.ofText("a1")).then(LlmReply.ofText("a2"));

        limited.send(req("i1", DEF_ID, "q1"));
        assertThatThrownBy(() -> limited.send(req("i1", DEF_ID, "q2"))).isInstanceOf(BusinessException.class);
        clock.advance(Duration.between(NOW, Instant.parse("2026-10-02T14:59:59Z"))); // 서울 10-02 23:59:59
        assertThatThrownBy(() -> limited.send(req("i1", DEF_ID, "q2"))).isInstanceOf(BusinessException.class);
        clock.advance(Duration.ofSeconds(1)); // 서울 10-03 00:00
        assertThat(reply(limited.send(req("i1", DEF_ID, "q2"))).get("content")).isEqualTo("a2");
        assertThat(stored("userA", "i1")).extracting(WidgetChatMessage::getContent).containsExactly("q1", "a1", "q2", "a2");
    }

    @Test
    @DisplayName("상한은 LLM 호출마다 센다 — 도구 반복 중 닿으면 더 부르지 않고 그때까지 받은 글로 답한다(글이 없으면 한도 안내)")
    void dailyLimitMidTurnAnswersWithTextSoFar() {
        when(screenFinder.find(anyString(), anyInt())).thenReturn(List.of());
        WidgetChatService limited = newService(llm, Clock.fixed(NOW, SEOUL), 1);
        llm.then(LlmReply.ofToolCalls("찾아보는 중입니다.", List.of(new LlmToolCall("t1", "find_screen", Map.of("keyword", "위젯")))))
                .then(LlmReply.ofText("부르면 안 되는 답"));

        assertThat(reply(limited.send(req("i1", DEF_ID, "위젯 어디?"))).get("content")).isEqualTo("찾아보는 중입니다.");
        assertThat(llm.calls()).hasSize(1);
        assertThatThrownBy(() -> limited.send(req("i1", DEF_ID, "또"))).isInstanceOf(BusinessException.class);

        FakeLlmClient silent = FakeLlmClient.scripted()
                .then(callTool("t2", "find_screen", Map.of("keyword", "공지")))
                .then(LlmReply.ofText("부르면 안 되는 답"));
        when(securityIdentity.currentUserId()).thenReturn("userB");
        assertThat(reply(newService(silent, Clock.fixed(NOW, SEOUL), 1).send(req("i1", DEF_ID, "공지 어디?"))).get("content"))
                .isEqualTo(WidgetChatService.DAILY_LIMIT_PARTIAL_MESSAGE);
        assertThat(silent.calls()).hasSize(1);
    }

    @Test
    @DisplayName("하루 상한 경계의 동시 요청 2건 — 먼저 자리를 잡은 쪽만 질문을 저장하고 LLM 을 부른다, 다른 쪽은 저장 없이 거절")
    void dailyLimitBoundaryConcurrentSendsSaveOnlyOne() throws Exception {
        WidgetChatService limited = newService(llm, Clock.fixed(NOW, SEOUL), 1);
        llm.then(LlmReply.ofText("a1")).then(LlmReply.ofText("a2"));
        WidgetUserContext ctx = new WidgetUserContext("userA", "홍길동", "D100", "생산팀", List.of("D100"));
        CountDownLatch aInside = new CountDownLatch(1);
        CountDownLatch releaseA = new CountDownLatch(1);
        AtomicInteger resolverCalls = new AtomicInteger();
        // 요청 A 는 상한 확인을 지난 뒤(사용자 정보 읽기) 질문 저장 직전에 멈춘다 — 그 사이 요청 B 가 끝까지 돈다.
        when(userContextResolver.current()).thenAnswer(inv -> {
            if (resolverCalls.getAndIncrement() == 0) {
                aInside.countDown();
                if (!releaseA.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("시험 대기 시간 초과");
            }
            return ctx;
        });
        ExecutorService pool = Executors.newSingleThreadExecutor();
        Throwable bError;
        Map<String, Object> aResult;
        try {
            Future<Map<String, Object>> a = pool.submit(() -> limited.send(req("i1", DEF_ID, "qA")));
            assertThat(aInside.await(10, TimeUnit.SECONDS)).isTrue();
            bError = catchThrowable(() -> limited.send(req("i2", DEF_ID, "qB")));
            releaseA.countDown();
            aResult = a.get(10, TimeUnit.SECONDS);
        } finally {
            releaseA.countDown();
            pool.shutdownNow();
        }
        assertThat(bError).isInstanceOf(BusinessException.class)
                .hasMessage("오늘 AI 챗봇 사용 한도(1회)를 모두 썼습니다. 내일 다시 이용하세요.");
        assertThat(stored("userA", "i2")).isEmpty(); // 거절된 쪽은 질문도 남기지 않는다
        assertThat(reply(aResult).get("content")).isEqualTo("a1");
        assertThat(stored("userA", "i1")).extracting(WidgetChatMessage::getContent).containsExactly("qA", "a1");
        assertThat(llm.calls()).hasSize(1);
    }
}
