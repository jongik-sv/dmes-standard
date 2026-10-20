package com.dongkuk.dmes.mcm.oasis;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.oasis.CactusRequestConverter;
import com.dongkuk.dmes.cactus.oasis.CactusResponseConverter;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.GridData;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.mcm.adapter.McmBusinessErrorTranslator;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.exception.ErrorDetail;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

/**
 * mcm-core 업무 예외가 OASIS 응답 봉투로 어떻게 나가는지 고정한다(refactor-be 2회차 F2).
 *
 * <p>mcm-core 는 자기 {@link BusinessException}·{@link ErrorCode}·{@link ErrorDetail} 복사본을 쓴다. 이 예외는 cactus
 * {@code BusinessException} 을 상속하지 않고 {@code ResponseCodeAware} 도 구현하지 않는다. 응답 변환기
 * {@link CactusResponseConverter} 는 cactus 형만 알아보므로, mcm 앱은 {@link McmBusinessErrorTranslator} 빈을 등록해
 * 응답 변환기에 넘긴다(OasisAutoConfiguration). 그래서 BPMN serviceTask 가 mcm-core 업무 예외를 던지면 {@code meta.code} 는
 * 그 ErrorCode 의 코드이고, 행 상세는 {@code errors[]} 로 실린다. {@code meta.message} 는 던진 예외(감쌌으면 바깥 예외)의 메시지다.
 * 변환기가 없던 때(dd681603b 의 특성 시험)는 {@code meta.code=S001} 이고 {@code errors[]} 가 빠졌다.
 *
 * <p>운영과 같은 조립({@link OasisAutoConfiguration#serviceStarter} 의 transactional + multi-tx 분기, 기본 매니저 {@code txBiz})으로
 * {@link OasisServiceExecutor} 를 직접 부른다. Oracle 은 쓰지 않는다. 트랜잭션 매니저는 begin·commit·rollback 만 기록하는 가짜다.
 * 시험 BPMN 은 {@code services/test/mcmBusinessErrorProbe.bpmn} 이다.
 * 2026-10-16 — 운영 BPMN masterCategoryMng 를 쓰던 사례 5 는 그 화면(옛 마스터코드 프로그램)을 걷어내며 뺐다.
 *
 * <p>사례 2 는 USER_ERROR 의 기본값 E001 과 겹치지 않는 E003 이라 ErrorCode 를 실제로 읽는지 보여 준다. 사례 4 는 대조군이다.
 * cactus 형은 변환기 없이도 E001 과 errors[] 로 나간다 — mcm-core 형도 이제 같은 봉투다.
 */
class McmBusinessErrorOasisResponseTest {

    private static final String PROBE = "mcmBusinessErrorProbe";

    /** 사례 1·3·4 응답의 {@code errors} JSON. 사례 1·3 이 던지는 mcm-core 행 상세와 사례 4 의 cactus 행 상세는 내용이 같다. */
    private static final String ROW_ERRORS_JSON = "[{\"grid\":\"master\",\"rowKey\":\"r1\",\"rowIndex\":0,"
            + "\"field\":\"masterCode\",\"code\":\"E001\",\"message\":\"코드ID를 입력해 주십시오.\"}]";

    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private GenericApplicationContext ctx;
    private RecordingTxManager txBiz;
    private OasisServiceExecutor executor;

    @BeforeEach
    void setUp() {
        txBiz = new RecordingTxManager();
        ctx = new GenericApplicationContext();
        ctx.registerBean("txBiz", PlatformTransactionManager.class, () -> txBiz);
        ctx.registerBean(PROBE, Probe.class, Probe::new);
        ctx.refresh();

        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/services");
        CactusTxProperties txProps = new CactusTxProperties();
        txProps.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        txProps.setDefaultManager("txBiz");
        executor = new OasisServiceExecutor(new OasisAutoConfiguration().serviceStarter(props, txProps, ctx), ctx,
                new CactusRequestConverter(), new CactusResponseConverter(List.of(new McmBusinessErrorTranslator())));
    }

    @AfterEach
    void tearDown() {
        UserContextHolder.clear();
        ctx.close();
    }

    /** 사례 1 — mcm-core 업무 예외(REQUIRED_VALUE=E001) + 행 상세. */
    @Test
    void mcm_core_업무_예외는_ErrorCode_코드와_행_상세_errors_로_나간다() {
        JsonNode res = post(PROBE, "mcmRowErrors", envelope(PROBE));

        assertThat(withoutTxId(res)).isEqualTo(
                "{\"meta\":{\"success\":false,\"code\":\"E001\",\"message\":\"입력값을 확인해주세요.\"},"
                        + "\"errors\":" + ROW_ERRORS_JSON + "}");
        assertThat(txBiz.events).containsExactly("begin", "rollback");
    }

    /** 사례 2 — mcm-core 업무 예외(DUPLICATE_DATA=E003), 행 상세 없음. */
    @Test
    void mcm_core_업무_예외는_행_상세가_없어도_ErrorCode_코드로_나간다() {
        JsonNode res = post(PROBE, "mcmNoRows", envelope(PROBE));

        assertThat(withoutTxId(res)).isEqualTo(
                "{\"meta\":{\"success\":false,\"code\":\"E003\",\"message\":\"중복 데이터\"}}");
        assertThat(txBiz.events).containsExactly("begin", "rollback");
    }

    /** 사례 3 — IllegalStateException("감쌈") 이 사례 1 의 mcm-core 업무 예외를 원인으로 감쌌다. */
    @Test
    void 감싼_mcm_core_업무_예외는_바깥_문구에_안쪽_코드와_행_상세로_나간다() {
        JsonNode res = post(PROBE, "mcmWrapped", envelope(PROBE));

        assertThat(withoutTxId(res)).isEqualTo(
                "{\"meta\":{\"success\":false,\"code\":\"E001\",\"message\":\"감쌈\"},"
                        + "\"errors\":" + ROW_ERRORS_JSON + "}");
        assertThat(txBiz.events).containsExactly("begin", "rollback");
    }

    /** 사례 4(대조군) — 같은 내용을 cactus BusinessException·cactus ErrorDetail 로 던졌다. */
    @Test
    void 대조_cactus_업무_예외는_E001_이고_행_상세가_errors_로_온다() {
        JsonNode res = post(PROBE, "cactusRowErrors", envelope(PROBE));

        assertThat(withoutTxId(res)).isEqualTo(
                "{\"meta\":{\"success\":false,\"code\":\"E001\",\"message\":\"입력값을 확인해주세요.\"},"
                        + "\"errors\":" + ROW_ERRORS_JSON + "}");
        assertThat(txBiz.events).containsExactly("begin", "rollback");
    }

    /** 응답 JSON 에서 매번 바뀌는 {@code meta.txId} 를 뺀 문자열. txId 가 실제로 실렸는지도 확인한다. */
    private static String withoutTxId(JsonNode res) {
        ObjectNode copy = res.deepCopy();
        ObjectNode meta = (ObjectNode) copy.get("meta");
        assertThat(meta.path("txId").asText()).as(res.toString()).isNotBlank();
        meta.remove("txId");
        return copy.toString();
    }

    // ── 시험 빈 ──────────────────────────────────────────────────

    /** {@code services/test/mcmBusinessErrorProbe.bpmn} 의 serviceTask 가 부르는 빈. action 마다 예외 하나를 던진다. */
    public static class Probe {

        static BusinessException mcmRowErrorsException() {
            return new BusinessException(ErrorCode.REQUIRED_VALUE, "입력값을 확인해주세요.",
                    List.of(ErrorDetail.ofGrid("master", "r1", 0, "masterCode",
                            ErrorCode.REQUIRED_VALUE.getCode(), "코드ID를 입력해 주십시오.")));
        }

        public Map<String, Object> mcmRowErrors() {
            throw mcmRowErrorsException();
        }

        public Map<String, Object> mcmNoRows() {
            throw new BusinessException(ErrorCode.DUPLICATE_DATA, "중복 데이터");
        }

        public Map<String, Object> mcmWrapped() {
            throw new IllegalStateException("감쌈", mcmRowErrorsException());
        }

        public Map<String, Object> cactusRowErrors() {
            throw new com.dongkuk.dmes.cactus.common.BusinessException(
                    com.dongkuk.dmes.cactus.common.ErrorCode.REQUIRED_VALUE, "입력값을 확인해주세요.",
                    List.of(com.dongkuk.dmes.cactus.web.response.ErrorDetail.ofGrid("master", "r1", 0, "masterCode",
                            com.dongkuk.dmes.cactus.common.ErrorCode.REQUIRED_VALUE.getCode(), "코드ID를 입력해 주십시오.")));
        }
    }

    /** DB 없이 begin·commit·rollback 순서만 기록하는 트랜잭션 매니저(빈 이름 {@code txBiz}). */
    static final class RecordingTxManager extends AbstractPlatformTransactionManager {
        final List<String> events = new ArrayList<>();

        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
            events.add("begin");
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            events.add("commit");
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            events.add("rollback");
        }
    }

    // ── 요청 봉투 ────────────────────────────────────────────────

    private ObjectNode envelope(String menuId) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", menuId);
        body.set("params", json.createObjectNode());
        return body;
    }

    /** BFF 가 보내는 봉투({@code meta·params·grids})를 실행기 요청으로 바꿔 돌리고, 응답을 HTTP 본문과 같은 JSON 으로 돌려준다. */
    private JsonNode post(String serviceId, String action, ObjectNode body) {
        UserContextHolder.set(new UserInfo("user01", "사용자", null, List.of("ROLE_SYSADMIN")));
        Map<String, Object> params = json.convertValue(body.path("params"), new TypeReference<HashMap<String, Object>>() { });
        Map<String, GridData> grids = new HashMap<>();
        JsonNode master = body.path("grids").path("master").path("rows");
        if (master.isArray()) {
            grids.put("master", new GridData(json.convertValue(master, new TypeReference<List<Map<String, Object>>>() { })));
        }
        CactusRequest request = new CactusRequest(
                new RequestMeta("user01", body.path("meta").path("menuId").asText()), params, grids);

        CactusResponse response = executor.execute(serviceId, action, request);
        return json.valueToTree(response);
    }
}
