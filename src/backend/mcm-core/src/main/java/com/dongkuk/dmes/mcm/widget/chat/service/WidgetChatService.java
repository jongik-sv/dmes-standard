package com.dongkuk.dmes.mcm.widget.chat.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.chat.WidgetLlmProperties;
import com.dongkuk.dmes.mcm.widget.chat.dto.WidgetChatRequest;
import com.dongkuk.dmes.mcm.widget.chat.entity.WidgetChatMessage;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmClient;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmException;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmMessage;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmReply;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmTool;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmToolCall;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmToolResult;
import com.dongkuk.dmes.mcm.widget.chat.repository.WidgetChatMessageRepository;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContext;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserQuota;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryResult;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * AI 챗봇 위젯 — OASIS {@code widgetChat}(스펙 2026-10-02-widget-admin-generic §5.1·§9). action history·send·reset.
 * <ul>
 *   <li>사용자는 늘 인증 컨텍스트(IDOR) — 기록은 (사용자, 인스턴스)로만 읽고 지운다.</li>
 *   <li>send: chat 유형·사용 중인 정의만. 사용자 메시지를 먼저 저장(즉시 커밋)하고, 최근 20개를 문맥으로 LLM 에 묻는다.
 *       도구는 정의 설정이 켠 것만 준다 — find_screen(pageGuide), run_widget_query(dataQueryDefIds 의 defId 만, 50행).
 *       도구 실행은 최대 4번(LLM 호출은 최대 5번). 공급자 오류·빈 답·글 없이 끊긴 답(도구 호출이 끊긴 경우 포함)·시간 초과면
 *       assistant 를 저장하지 않고 오류로 돌려준다. 끊긴 답에 글이 있으면 끊김 표시({@code TRUNCATED_NOTICE})를 붙여 저장한다.
 *       시간 제한({@code timeout-sec}, 기본 60초)은 LLM 호출 한 번이 아니라 차례 전체에 건다 — 다음 호출 전에 마감이 지났으면
 *       더 부르지 않는다. 마감은 각 호출 앞에서만 확인하므로, 마감 직전에 시작한 호출은 HTTP 읽기 시간(기본 60초)만큼 더 걸려
 *       한 차례가 최대 약 123초(연결 3초 포함)까지 갈 수 있다.</li>
 *   <li>모델이 SQL 을 만들어 실행하는 기능은 두지 않는다(W-D28). 키·프롬프트·메시지 본문은 로그에 남기지 않는다.</li>
 *   <li><b>남용 막기</b>: 사용자별 하루(서울 날짜) LLM 호출 수 상한({@code dmes.widget.llm.daily-call-limit}, 기본 200) — 인스턴스와
 *       관계없이 사용자 단위로 센다. 첫 호출 몫은 사용자 메시지를 저장하기 <b>전에</b> 잡는다(세기·확인이 한 잠금 안이라 상한 경계의
 *       동시 요청 2건이 함께 통과해 둘 다 질문을 저장하는 일이 없다). 못 잡으면 저장 없이 거절하고, 차례 도중에 상한에 닿으면 더 부르지
 *       않고 그때까지 받은 글로 답한다. 잡은 첫 몫은 그 뒤 실패(문맥 읽기 실패·마감 초과 등)로 LLM 을 못 불러도 돌려주지 않는다. 저장 기록 상한(사용자 합계)은 {@link WidgetChatWriter}. 배치 행이 있는 인스턴스만 받는 검사는
 *       두지 않는다 — 「홈」을 저장하지 않은 사용자의 부서·코드 기본 배치 칸은 행이 없어 막힌다.</li>
 * </ul>
 * <b>트랜잭션</b>: OASIS({@code cactus.oasis.transactional: true})는 서비스 시작 때 txBiz 를 열고 예외면 통째로 롤백한다.
 * send·reset 은 그 바깥 트랜잭션을 {@code NOT_SUPPORTED} 로 잠시 내려놓고 돈다 — 그래서 공급자가 실패해 바깥이 롤백돼도
 * 사용자 메시지는 남고(스펙 §9.2), LLM 을 기다리는 동안 DB 트랜잭션·잠금을 잡지 않는다. 쓰기는 {@link WidgetChatWriter} 가 한 건씩 자기 트랜잭션으로 커밋한다.
 * <br><b>연결</b>(oracle-1007 ③c 후속, docs/oracle-1007/design-mcm-lazy-ds.md): {@code NOT_SUPPORTED} 범위에서도 트랜잭션 동기화가
 * 켜져 있어, 트랜잭션 없이 도는 파생 쿼리가 범위에 묶인 EntityManager 를 열고 그 연결을 범위가 끝날 때까지(LLM 대기 내내) 쥔다(Hibernate
 * DELAYED_ACQUISITION_AND_HOLD). 그래서 범위 안의 읽기 — 대화 문맥과 도구 실행 — 는 짧은 읽기 트랜잭션({@link #readTx})으로 묶어 끝나면
 * 연결을 돌려준다. 남는 것은 바깥 txBiz 의 연결이다 — OASIS 가 READ_COMMITTED 를 지정해 시작할 때 물리 연결을 잡고, 내려놓아도(suspend)
 * 돌려주지 않는다. mcm 앱이 기본 DataSource 를 {@code LazyConnectionDataSourceProxy} 로 감싸면({@code dmes.datasource.lazy-connection})
 * 바깥은 첫 SQL 전까지 물리 연결을 받지 않으므로, send·reset 은 SQL 없이 바깥을 내려놓아 LLM 을 기다리는 동안 연결을 쥐지 않는다.
 * 감싸지 않으면 바깥 연결 1개를 LLM 대기 내내 쥔다.
 * 이 클래스에는 {@code @Transactional} 을 붙이지 않는다(BackEnd 표준 §6-B-1) — 경계는 프로그램으로({@link TransactionTemplate}) 잡는다.
 */
@Service("widgetChatService")
public class WidgetChatService {

    private static final Logger log = LoggerFactory.getLogger(WidgetChatService.class);

    static final String TYPE_CHAT = "chat";
    static final int MESSAGE_MAX = 2000;
    static final int INST_ID_MAX = 40;
    static final int DEF_ID_MAX = 100;
    /** 도구 실행 횟수 상한(스펙 §9.2). LLM 호출은 처음 1번 + 도구 결과 뒤 4번. */
    static final int MAX_TOOL_ROUNDS = 4;
    static final int SCREEN_LIMIT = 10;
    static final int LINK_LIMIT = 5;
    static final int QUERY_MAX_ROWS = 50;
    static final int TOOL_RESULT_MAX_CHARS = 8000;
    static final int LINKS_JSON_MAX = 4000;

    static final String TOOL_FIND_SCREEN = "find_screen";
    static final String TOOL_RUN_QUERY = "run_widget_query";

    static final String FAILED_MESSAGE = "답을 받지 못했습니다. 잠시 뒤 다시 시도하세요.";
    static final String TOOL_LIMIT_MESSAGE = "도구를 여러 번 써도 답을 마치지 못했습니다. 질문을 좁혀 다시 물어 주세요.";
    /** 차례 도중 하루 상한에 닿았는데 그때까지 받은 글이 없을 때 답. */
    static final String DAILY_LIMIT_PARTIAL_MESSAGE = "오늘 AI 챗봇 사용 한도에 닿아 답을 마치지 못했습니다. 내일 다시 이용하세요.";
    /** 하루 LLM 호출 수 상한 기본값. */
    static final int DEFAULT_DAILY_CALL_LIMIT = 200;
    /** 하루 상한을 기억하는 사용자 수(가장 오래 안 쓴 사용자부터 버린다). */
    static final int MAX_QUOTA_USERS = 10_000;
    /** 답 최대 토큰에 걸려 글이 끊겼을 때 답 끝에 붙이는 표시. */
    static final String TRUNCATED_NOTICE = "(답이 길어 중간에 끊겼습니다.)";
    /** 도구를 실행하지 못했을 때 모델에 돌려주는 도구 오류 결과. */
    static final String TOOL_FAILED_MESSAGE = "도구를 실행하지 못했습니다.";
    /** 한 차례(질문 하나 → 답 하나, 도구 반복 포함) 시간 제한 기본값(스펙 §9.2 「시간 초과 60초」). */
    static final int DEFAULT_TIMEOUT_SEC = 60;
    /** 답 최대 토큰에 걸려 끊긴 답의 끝난 이유 — Anthropic {@code max_tokens}, OpenAI 호환 {@code length}. */
    static final Set<String> TRUNCATED_STOPS = Set.of("max_tokens", "length");

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> LIST_OF_MAPS = new TypeReference<>() {};
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private static final LlmTool FIND_SCREEN_TOOL = new LlmTool(TOOL_FIND_SCREEN,
            "DMES 포털에서 이 사용자가 열 수 있는 화면(메뉴)을 이름으로 찾는다. 화면 위치·메뉴·어디서 하는지를 물으면 쓴다. "
                    + "결과는 [{pageId, title, path}] 이고, 찾은 화면은 답 아래에 [열기] 링크로 붙는다.",
            Map.of("type", "object",
                    "properties", Map.of("keyword", Map.of("type", "string",
                            "description", "화면 이름에 든 낱말 하나(예: 위젯, 공지, 사용자)")),
                    "required", List.of("keyword")));

    private final WidgetChatMessageRepository messageRepository;
    private final WidgetChatWriter writer;
    private final WidgetDefRepository defRepository;
    private final WidgetQueryRunner queryRunner;
    private final WidgetUserContextResolver userContextResolver;
    private final ChatScreenFinder screenFinder;
    private final LlmClient llmClient;
    private final SecurityIdentity securityIdentity;
    private final Duration turnTimeout;
    private final TransactionTemplate outsideTx;
    /**
     * {@code NOT_SUPPORTED} 범위 안의 읽기(대화 문맥·도구 실행)를 묶는 짧은 읽기 전용 트랜잭션 — 범위에 묶인 EntityManager 가 LLM 대기
     * 내내 연결을 쥐지 않게. 읽기뿐이라 늘 롤백한다({@link #read}).
     */
    private final TransactionTemplate readTx;
    private final Clock clock;
    private final int dailyCallLimit;
    /** 사용자 → 오늘(서울 날짜 epochDay) LLM 호출 수. */
    private final WidgetUserQuota llmQuota = new WidgetUserQuota(MAX_QUOTA_USERS);

    @Autowired
    public WidgetChatService(WidgetChatMessageRepository messageRepository,
                             WidgetChatWriter writer,
                             WidgetDefRepository defRepository,
                             WidgetQueryRunner queryRunner,
                             WidgetUserContextResolver userContextResolver,
                             ChatScreenFinder screenFinder,
                             LlmClient llmClient,
                             SecurityIdentity securityIdentity,
                             PlatformTransactionManager transactionManager,
                             WidgetLlmProperties llmProperties) {
        this(messageRepository, writer, defRepository, queryRunner, userContextResolver, screenFinder, llmClient,
                securityIdentity, transactionManager, turnTimeout(llmProperties), Clock.system(ZoneId.of("Asia/Seoul")),
                llmProperties == null ? 0 : llmProperties.getDailyCallLimit());
    }

    WidgetChatService(WidgetChatMessageRepository messageRepository,
                      WidgetChatWriter writer,
                      WidgetDefRepository defRepository,
                      WidgetQueryRunner queryRunner,
                      WidgetUserContextResolver userContextResolver,
                      ChatScreenFinder screenFinder,
                      LlmClient llmClient,
                      SecurityIdentity securityIdentity,
                      PlatformTransactionManager transactionManager,
                      Duration turnTimeout,
                      Clock clock,
                      int dailyCallLimit) {
        this.messageRepository = messageRepository;
        this.writer = writer;
        this.defRepository = defRepository;
        this.queryRunner = queryRunner;
        this.userContextResolver = userContextResolver;
        this.screenFinder = screenFinder;
        this.llmClient = llmClient;
        this.securityIdentity = securityIdentity;
        this.turnTimeout = turnTimeout;
        this.clock = clock;
        this.dailyCallLimit = dailyCallLimit > 0 ? dailyCallLimit : DEFAULT_DAILY_CALL_LIMIT;
        TransactionTemplate outside = new TransactionTemplate(transactionManager);
        outside.setName("widgetChat");
        outside.setPropagationBehavior(TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
        this.outsideTx = outside;
        TransactionTemplate read = new TransactionTemplate(transactionManager);
        read.setName("widgetChatRead");
        read.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        read.setReadOnly(true);
        this.readTx = read;
    }

    /** 한 차례 시간 제한 — {@code dmes.widget.llm.timeout-sec}(기본 60초, 0 이하면 60초). */
    static Duration turnTimeout(WidgetLlmProperties props) {
        int sec = props == null ? 0 : props.getTimeoutSec();
        return Duration.ofSeconds(sec > 0 ? sec : DEFAULT_TIMEOUT_SEC);
    }

    /** 그 인스턴스 기록 전부(오래된 순) — {@code { messages: [{seq, role, content, links}] }}. */
    public Map<String, Object> history(WidgetChatRequest request) {
        String userId = requireUser();
        String instId = requireInstId(request);
        List<Map<String, Object>> messages = new ArrayList<>();
        for (WidgetChatMessage m : messageRepository.findByUserIdAndInstIdOrderByMsgSeqAsc(userId, instId)) {
            messages.add(view(m.getMsgSeq(), m.getRoleTp(), m.getContent(), parseLinks(m.getLinksJson())));
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("messages", messages);
        return result;
    }

    /** 질문 하나 → 답 하나 — {@code { reply: {seq, role, content, links} }}. 바깥(OASIS) 트랜잭션 밖에서 돈다(클래스 설명). */
    public Map<String, Object> send(WidgetChatRequest request) {
        Instant deadline = clock.instant().plus(turnTimeout);
        return outsideTx.execute(status -> sendOutsideTx(request, deadline));
    }

    private Map<String, Object> sendOutsideTx(WidgetChatRequest request, Instant deadline) {
        String userId = requireUser();
        String instId = requireInstId(request);
        String message = requireMessage(request == null ? null : request.getMessage());
        WidgetDef def = requireChatDef(request.getDefId());
        ChatConfig config = ChatConfig.parse(def.getConfigJson(), def.getWidgetId());
        // 첫 LLM 호출 몫을 질문 저장 전에 잡는다 — 못 잡으면 질문을 저장하지 않고 거절한다(인스턴스를 바꿔도 사용자 단위로 센다).
        // 「쓴 수 확인 → 저장 → 호출 때 세기」 로 나누면 상한 경계의 동시 요청 둘이 함께 확인을 통과해 둘 다 질문을 저장한다.
        if (!llmQuota.tryAcquire(userId, today(), dailyCallLimit)) {
            log.info("[widgetChat] 하루 LLM 호출 상한 — userId={}", userId);
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, dailyLimitMessage());
        }
        WidgetUserContext user = userContextResolver.current();

        // 사용자 메시지는 먼저 저장 — Writer 가 바로 커밋하므로 공급자가 실패해도 보낸 질문은 남는다(스펙 §9.2).
        writer.append(userId, instId, WidgetChatMessage.ROLE_USER, message, null);

        ToolBox toolBox = new ToolBox(config);
        String answer;
        try {
            answer = converse(userId, systemPrompt(user, config.systemPrompt()), read(() -> context(userId, instId)), toolBox, deadline);
        } catch (BusinessException e) {
            throw e; // 업무 거절 문구는 그대로
        } catch (RuntimeException e) {
            log.warn("[widgetChat] 답을 받지 못함 defId={} instId={} cause={}", def.getWidgetId(), instId,
                    e instanceof LlmException ? e.getMessage() : e.getClass().getSimpleName());
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, FAILED_MESSAGE);
        }

        List<Map<String, Object>> links = toolBox.links();
        WidgetChatMessage saved = writer.append(userId, instId, WidgetChatMessage.ROLE_ASSISTANT, answer, linksJson(links));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reply", view(saved.getMsgSeq(), WidgetChatMessage.ROLE_ASSISTANT, answer, links));
        return result;
    }

    /** [새 대화] — 그 인스턴스 기록 전부 지움. {@code { deleted: n }}. send 와 같이 바깥 트랜잭션 밖에서 지우고 바로 커밋한다. */
    public Map<String, Object> reset(WidgetChatRequest request) {
        return outsideTx.execute(status -> {
            String userId = requireUser();
            String instId = requireInstId(request);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("deleted", writer.reset(userId, instId));
            return result;
        });
    }

    // ── 대화 ────────────────────────────────────────────────────────────

    /**
     * 도구 반복. 도구를 4번 실행한 뒤에도 모델이 도구를 원하면 멈추고 그때까지의 답(이번 차례에서 마지막으로 받은 글)을 쓴다.
     * 호출마다 앞서 차례 마감과 하루 상한을 확인한다(상한은 호출마다 1 씩 센다 — 첫 호출 몫은 send 가 질문 저장 전에 잡아 두었고,
     * 도중에 걸리면 그때까지의 글).
     * 답 최대 토큰에 걸려 끊긴 답은 도구를 실행하지 않는다 — 도구 입력이 덜 왔을 수 있다.
     * 글이 있으면 끊겼다는 표시를 붙여 답으로 쓰고, 없으면 실패로 본다.
     */
    private String converse(String userId, String system, List<LlmMessage> context, ToolBox toolBox, Instant deadline) {
        List<LlmMessage> messages = new ArrayList<>(context);
        List<LlmTool> tools = toolBox.tools();
        String lastText = "";
        for (int round = 0; ; round++) {
            requireTimeLeft(deadline);
            if (round > 0 && !llmQuota.tryAcquire(userId, today(), dailyCallLimit)) { // 첫 호출 몫은 send 가 잡았다
                log.info("[widgetChat] 하루 LLM 호출 상한 — userId={} round={}", userId, round);
                return lastText.isBlank() ? DAILY_LIMIT_PARTIAL_MESSAGE : lastText;
            }
            LlmReply reply = llmClient.chat(system, messages, tools);
            if (reply.stopReason() != null && TRUNCATED_STOPS.contains(reply.stopReason())) { // Set.of 는 null 을 못 받는다
                if (reply.text().isBlank()) throw new LlmException("답이 끊김(stop=" + reply.stopReason() + ")");
                return reply.text().stripTrailing() + "\n\n" + TRUNCATED_NOTICE;
            }
            if (!reply.text().isBlank()) lastText = reply.text();
            if (!reply.hasToolCalls()) {
                if (reply.text().isBlank()) throw new LlmException("빈 답(stop=" + reply.stopReason() + ")");
                return reply.text();
            }
            if (round >= MAX_TOOL_ROUNDS) {
                return lastText.isBlank() ? TOOL_LIMIT_MESSAGE : lastText;
            }
            messages.add(LlmMessage.assistantReply(reply));
            List<LlmToolResult> results = new ArrayList<>();
            for (LlmToolCall call : reply.toolCalls()) results.add(runTool(toolBox, call));
            messages.add(LlmMessage.toolResults(results));
        }
    }

    /**
     * 도구 하나를 짧은 읽기 트랜잭션({@link #read}) 안에서 실행한다. 도구 안의 실패는 {@link ToolBox#run} 이 도구 오류 결과로 바꾸지만,
     * 트랜잭션 시작(연결 획득)·롤백 실패는 그 바깥에서 나므로 여기서 같은 도구 오류 결과로 바꿔 대화를 이어 간다.
     */
    private LlmToolResult runTool(ToolBox toolBox, LlmToolCall call) {
        try {
            return read(() -> toolBox.run(call));
        } catch (RuntimeException e) {
            log.warn("[widgetChat] 도구 트랜잭션 실패 tool={} cause={}", call.name(), e.getClass().getSimpleName());
            return new LlmToolResult(call.id(), TOOL_FAILED_MESSAGE, true);
        }
    }

    /**
     * 짧은 읽기 트랜잭션({@link #readTx}) 안에서 돌리고 늘 롤백한다 — 끝나면 연결을 돌려준다. 늘 롤백이라 안쪽 저장소 호출이 실패해
     * rollback-only 가 되어도 커밋 때 UnexpectedRollbackException 이 나지 않는다.
     * <p>연결을 받는 시점은 기본 DataSource 설정에 달렸다 — 읽기 전용 정의라 {@code HibernateJpaDialect} 가 시작하자마자 연결을 잡고,
     * 지연 획득({@code dmes.datasource.lazy-connection})이 켜져 있으면 첫 SQL 때 실제로 받는다. 시작(연결 획득)·롤백 실패는
     * {@code work} 바깥에서 그대로 던진다 — 대화 문맥 읽기는 send 가 「답을 받지 못했습니다」로, 도구 실행은 {@link #runTool} 이
     * 도구 오류 결과로 바꾼다.
     */
    private <T> T read(Supplier<T> work) {
        return readTx.execute(status -> {
            status.setRollbackOnly();
            return work.get();
        });
    }

    /** 하루 상한의 구간 — 서울 날짜(시계 시간대). 날짜가 바뀌면 0 부터 다시 센다. */
    private long today() {
        return LocalDate.now(clock).toEpochDay();
    }

    private String dailyLimitMessage() {
        return "오늘 AI 챗봇 사용 한도(" + dailyCallLimit + "회)를 모두 썼습니다. 내일 다시 이용하세요.";
    }

    /** 차례 마감(send 시작 + timeout-sec)이 지났으면 더 묻지 않는다 → 「답을 받지 못했습니다」. */
    private void requireTimeLeft(Instant deadline) {
        if (!clock.instant().isBefore(deadline)) {
            throw new LlmException("한 차례 시간 제한(" + turnTimeout.toSeconds() + "초)을 넘음");
        }
    }

    /** 저장 기록 최근 20개(방금 저장한 질문 포함), 오래된 순. */
    private List<LlmMessage> context(String userId, String instId) {
        List<WidgetChatMessage> recent =
                new ArrayList<>(messageRepository.findTop20ByUserIdAndInstIdOrderByMsgSeqDesc(userId, instId));
        Collections.reverse(recent);
        List<LlmMessage> out = new ArrayList<>(recent.size());
        for (WidgetChatMessage m : recent) {
            out.add(WidgetChatMessage.ROLE_ASSISTANT.equals(m.getRoleTp())
                    ? LlmMessage.assistant(m.getContent()) : LlmMessage.user(m.getContent()));
        }
        return out;
    }

    /** 「너는 DMES 포털의 도우미다. 오늘은 {yyyy-MM-dd}, 사용자는 {userNm}({deptNm}).」 + 줄바꿈 + 정의 systemPrompt. */
    private String systemPrompt(WidgetUserContext user, String definitionPrompt) {
        String who = user.userNm() + (isBlank(user.deptNm()) ? "" : "(" + user.deptNm() + ")");
        String head = "너는 DMES 포털의 도우미다. 오늘은 " + LocalDate.now(clock).format(DAY) + ", 사용자는 " + who + ".";
        return isBlank(definitionPrompt) ? head : head + "\n" + definitionPrompt;
    }

    /** 이번 대화 차례의 도구 — 켜진 도구만 주고, 실행하면서 find_screen 이 돌려준 화면을 links 로 모은다. */
    private final class ToolBox {

        private final boolean pageGuide;
        private final Set<String> allowedDefIds;
        private final Map<String, Map<String, Object>> links = new LinkedHashMap<>();

        ToolBox(ChatConfig config) {
            this.pageGuide = config.pageGuide();
            this.allowedDefIds = new LinkedHashSet<>(config.dataQueryDefIds());
        }

        List<LlmTool> tools() {
            List<LlmTool> tools = new ArrayList<>();
            if (pageGuide) tools.add(FIND_SCREEN_TOOL);
            if (!allowedDefIds.isEmpty()) tools.add(runQueryTool());
            return tools;
        }

        /** 각 정의의 제목·설명을 도구 설명에 넣어 모델이 고르게 한다(스펙 §9.2). */
        private LlmTool runQueryTool() {
            Map<String, WidgetDef> byId = new LinkedHashMap<>();
            for (WidgetDef d : defRepository.findAllById(allowedDefIds)) byId.put(d.getWidgetId(), d);
            StringBuilder desc = new StringBuilder("관리자가 지정한 쿼리 위젯의 데이터를 읽는다(최대 " + QUERY_MAX_ROWS
                    + "행, 결과는 {columns, rows, truncated}). 데이터·수치·현황을 물으면 쓴다. defId 는 아래 목록 중 하나만 쓸 수 있다.");
            for (String id : allowedDefIds) {
                WidgetDef d = byId.get(id);
                desc.append("\n- ").append(id);
                if (d != null && !isBlank(d.getTitle())) desc.append(" : ").append(d.getTitle());
                if (d != null && !isBlank(d.getDescription())) desc.append(" — ").append(d.getDescription());
            }
            return new LlmTool(TOOL_RUN_QUERY, desc.toString(), Map.of("type", "object",
                    "properties", Map.of("defId", Map.of("type", "string", "enum", List.copyOf(allowedDefIds),
                            "description", "실행할 쿼리 위젯 ID")),
                    "required", List.of("defId")));
        }

        /** 도구 하나 실행. 어떤 실패도 예외로 대화를 끊지 않고 도구 오류 결과로 돌려준다. */
        LlmToolResult run(LlmToolCall call) {
            try {
                if (TOOL_FIND_SCREEN.equals(call.name())) {
                    return pageGuide ? findScreen(call) : error(call, "사용할 수 없는 도구입니다: " + TOOL_FIND_SCREEN);
                }
                if (TOOL_RUN_QUERY.equals(call.name())) {
                    return runQuery(call);
                }
                return error(call, "모르는 도구입니다: " + call.name());
            } catch (RuntimeException e) {
                log.warn("[widgetChat] 도구 실패 tool={} cause={}", call.name(), e.getClass().getSimpleName());
                return error(call, TOOL_FAILED_MESSAGE);
            }
        }

        private LlmToolResult findScreen(LlmToolCall call) {
            String keyword = text(call.input().get("keyword"));
            if (keyword == null) return error(call, "keyword 가 필요합니다.");
            List<Map<String, Object>> out = new ArrayList<>();
            for (ChatScreenFinder.Screen s : screenFinder.find(keyword, SCREEN_LIMIT)) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("pageId", s.pageId());
                m.put("title", s.title());
                m.put("path", s.path());
                out.add(m);
                Map<String, Object> link = new LinkedHashMap<>();
                link.put("pageId", s.pageId());
                link.put("title", s.title());
                links.putIfAbsent(s.pageId(), link);
            }
            return new LlmToolResult(call.id(), json(out), false);
        }

        private LlmToolResult runQuery(LlmToolCall call) {
            String defId = text(call.input().get("defId"));
            if (defId == null || !allowedDefIds.contains(defId)) {
                return error(call, "허용되지 않은 위젯입니다: " + (defId == null ? "(없음)" : defId)
                        + ". 쓸 수 있는 defId: " + String.join(", ", allowedDefIds));
            }
            WidgetQueryResult result;
            try {
                result = queryRunner.runDefinition(defId, QUERY_MAX_ROWS);
            } catch (RuntimeException e) {
                log.warn("[widgetChat] 쿼리 위젯 실행 실패 defId={} cause={}", defId, e.getMessage());
                return error(call, "위젯 데이터를 불러오지 못했습니다.");
            }
            List<Map<String, Object>> rows = result.rows() == null ? List.of() : result.rows();
            boolean cut = rows.size() > QUERY_MAX_ROWS;
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("columns", result.columns() == null ? List.of() : result.columns());
            body.put("rows", cut ? rows.subList(0, QUERY_MAX_ROWS) : rows);
            body.put("truncated", result.truncated() || cut);
            String text = json(body);
            return new LlmToolResult(call.id(), text.length() > TOOL_RESULT_MAX_CHARS ? text.substring(0, TOOL_RESULT_MAX_CHARS) : text,
                    false);
        }

        /** 이번 차례에 find_screen 이 돌려준 화면 전부(최대 5개) — {@code [{pageId, title}]}. */
        List<Map<String, Object>> links() {
            return new ArrayList<>(links.values().stream().limit(LINK_LIMIT).toList());
        }

        private LlmToolResult error(LlmToolCall call, String message) {
            return new LlmToolResult(call.id(), message, true);
        }
    }

    /** 정의 설정(CONFIG_JSON) 중 서버가 쓰는 칸. 깨진 JSON 이면 도구 없이 머리말만으로 답한다. */
    record ChatConfig(String systemPrompt, boolean pageGuide, List<String> dataQueryDefIds) {

        static ChatConfig parse(String configJson, String defId) {
            if (isBlank(configJson)) return new ChatConfig("", false, List.of());
            try {
                JsonNode n = JSON.readTree(configJson);
                List<String> ids = new ArrayList<>();
                JsonNode arr = n.path("dataQueryDefIds");
                if (arr.isArray()) {
                    for (JsonNode id : arr) {
                        String s = id.isTextual() ? id.asText().trim() : "";
                        if (!s.isEmpty() && !ids.contains(s)) ids.add(s);
                    }
                }
                return new ChatConfig(n.path("systemPrompt").asText(""), n.path("pageGuide").asBoolean(false), ids);
            } catch (JsonProcessingException e) {
                log.warn("[widgetChat] 정의 설정 JSON 을 읽지 못함 defId={}", defId);
                return new ChatConfig("", false, List.of());
            }
        }
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private String requireUser() {
        String userId = securityIdentity.currentUserId();
        if (userId == null || userId.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_FAILED, "인증 정보가 없습니다.");
        }
        return userId;
    }

    private static String requireInstId(WidgetChatRequest request) {
        String instId = request == null ? null : text(request.getInstId());
        if (instId == null) throw new BusinessException(ErrorCode.REQUIRED_VALUE, "위젯 인스턴스 ID 가 필요합니다.");
        if (instId.length() > INST_ID_MAX) throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 인스턴스 ID 가 올바르지 않습니다.");
        return instId;
    }

    private static String requireMessage(String message) {
        String msg = message == null ? "" : message.strip();
        if (msg.isEmpty()) throw new BusinessException(ErrorCode.REQUIRED_VALUE, "메시지를 입력해 주세요.");
        if (msg.length() > MESSAGE_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "메시지는 " + MESSAGE_MAX + "자까지 보낼 수 있습니다.");
        }
        return msg;
    }

    /** chat 유형이고 사용 중인 정의(SRC_TP='D')만. */
    private WidgetDef requireChatDef(String defId) {
        String id = text(defId);
        if (id == null || id.length() > DEF_ID_MAX) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "챗봇 위젯 ID 가 필요합니다.");
        }
        return defRepository.findById(id)
                .filter(d -> d.isDefinition() && TYPE_CHAT.equals(d.getTypeId()) && d.isInUse())
                .orElseThrow(() -> new BusinessException(ErrorCode.BUSINESS_ERROR, "사용할 수 없는 챗봇 위젯입니다."));
    }

    private static Map<String, Object> view(Integer seq, String role, String content, List<Map<String, Object>> links) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("seq", seq);
        m.put("role", role);
        m.put("content", content);
        m.put("links", links);
        return m;
    }

    /** links → LINKS_JSON(VARCHAR 4000). 넘치면 뒤에서부터 뺀다. 없으면 NULL. */
    private static String linksJson(List<Map<String, Object>> links) {
        List<Map<String, Object>> list = new ArrayList<>(links);
        while (!list.isEmpty()) {
            String s = json(list);
            if (s.length() <= LINKS_JSON_MAX) return s;
            list.remove(list.size() - 1);
        }
        return null;
    }

    private static List<Map<String, Object>> parseLinks(String linksJson) {
        if (isBlank(linksJson)) return List.of();
        try {
            List<Map<String, Object>> parsed = JSON.readValue(linksJson, LIST_OF_MAPS);
            return parsed == null ? List.of() : parsed;
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    private static String json(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("JSON 직렬화 실패: " + e.getClass().getSimpleName(), e);
        }
    }

    private static String text(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() || "null".equals(s) ? null : s;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
