package com.dongkuk.dmes.cactus.oasis;

import static com.dongkuk.dmes.cactus.oasis.CactusResponseConverterJsonTest.failed;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.common.ResponseCodeAware;
import com.dongkuk.dmes.cactus.oasis.OasisServiceStarterCharacterizationTest.RecordingTxManager;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * BPMN 안에서 던진 cactus {@link BusinessException} 의 행 단위 상세를 응답 {@code errors[]} 로 싣는다
 * (refactor/framework-tx 항목 8, 2026-10-04, TSK-04-04 design F12).
 *
 * <p>{@code meta.code}·{@code meta.message} 는 상세가 없을 때와 같고 {@code errors} 만 더해진다.
 * 상세가 없는 경우의 JSON 은 {@link CactusResponseConverterJsonTest} 가 고정한다.
 */
@Execution(ExecutionMode.SAME_THREAD)
class CactusResponseConverterBusinessErrorsTest {

    private static final List<ErrorDetail> DETAILS = List.of(
            ErrorDetail.of("MDM001", "기본 문구"),
            ErrorDetail.ofGrid("master", "r1", "termName", "MDM005", "용어명이 비었습니다"));

    private final CactusResponseConverter converter = new CactusResponseConverter();
    private final List<GenericApplicationContext> contexts = new java.util.ArrayList<>();

    @AfterEach
    void closeContexts() {
        contexts.forEach(GenericApplicationContext::close);
    }

    static final class CodedWithDetails extends BusinessException implements ResponseCodeAware {
        CodedWithDetails() {
            super(ErrorCode.ACCESS_DENIED, "시스템 관리자만 할 수 있습니다",
                    List.of(ErrorDetail.of("MDM027", "시스템 관리자만 할 수 있습니다")));
        }

        @Override
        public String responseCode() {
            return "MDM027";
        }
    }

    // ── 변환기 단위 ─────────────────────────────────────────────

    @Test
    void 감싸인_업무_예외의_상세를_순서대로_errors_로_싣고_meta_는_상세_없을_때와_같다() {
        BusinessException withDetails = new BusinessException(ErrorCode.INVALID_VALUE, "검증 실패", DETAILS);
        BusinessException without = new BusinessException(ErrorCode.INVALID_VALUE, "검증 실패");

        CactusResponse r = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR,
                new RuntimeException("검증 실패", new IllegalStateException("x", withDetails))), "tx");
        CactusResponse base = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR,
                new RuntimeException("검증 실패", new IllegalStateException("x", without))), "tx");

        assertThat(r.getErrors()).containsExactlyElementsOf(DETAILS);
        assertThat(r.getMeta()).isEqualTo(base.getMeta());
        assertThat(base.getErrors()).isNull();
    }

    @Test
    void errors_JSON_은_code_field_message_를_싣는다() throws Exception {
        CactusResponse r = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR,
                new BusinessException(ErrorCode.INVALID_VALUE, "검증 실패", DETAILS)), "tx");

        assertThat(new ObjectMapper().writeValueAsString(r)).isEqualTo(
                "{\"meta\":{\"txId\":\"tx\",\"success\":false,\"code\":\"S001\",\"message\":\"검증 실패\"},"
                        + "\"errors\":["
                        + "{\"grid\":null,\"rowKey\":null,\"rowIndex\":null,\"field\":null,\"code\":\"MDM001\",\"message\":\"기본 문구\"},"
                        + "{\"grid\":\"master\",\"rowKey\":\"r1\",\"rowIndex\":null,\"field\":\"termName\",\"code\":\"MDM005\",\"message\":\"용어명이 비었습니다\"}]}");
    }

    @Test
    void 빈_상세_목록은_상세_없음과_같아_errors_가_빠진다() {
        CactusResponse r = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR,
                new BusinessException(ErrorCode.INVALID_VALUE, "검증 실패", List.of())), "tx");

        assertThat(r.getErrors()).isNull();
        assertThat(r.getMeta().code()).isEqualTo("S001");
    }

    @Test
    void 바깥_업무_예외에_상세가_없으면_안쪽_업무_예외의_상세를_싣는다() {
        BusinessException inner = new BusinessException(ErrorCode.INVALID_VALUE, "안쪽", DETAILS);
        BusinessException outer = new BusinessException(ErrorCode.INVALID_VALUE, "바깥");
        outer.initCause(inner);

        CactusResponse r = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR, outer), "tx");

        assertThat(r.getErrors()).containsExactlyElementsOf(DETAILS);
        assertThat(r.getMeta().message()).isEqualTo("바깥");
    }

    @Test
    void 사용자_예외_코드에서도_원인_사슬의_상세를_싣고_E001_은_그대로다() {
        CactusResponse r = converter.convert(failed(ServiceResultCode.USER_ERROR,
                new RuntimeException("사용자", new BusinessException(ErrorCode.INVALID_VALUE, "검증 실패", DETAILS))), "tx");

        assertThat(r.getMeta().code()).isEqualTo("E001");
        assertThat(r.getErrors()).containsExactlyElementsOf(DETAILS);
    }

    @Test
    void ResponseCodeAware_업무_예외는_meta_code_는_그_코드이고_상세도_싣는다() {
        CactusResponse r = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR, new CodedWithDetails()), "tx");

        assertThat(r.getMeta().code()).isEqualTo("MDM027");
        assertThat(r.getMeta().message()).isEqualTo("시스템 관리자만 할 수 있습니다");
        assertThat(r.getErrors()).extracting(ErrorDetail::code).containsExactly("MDM027");
    }

    @Test
    void 자기_자신을_원인으로_가진_예외도_멈춘다() {
        RuntimeException loop = new RuntimeException("순환") {
            @Override
            public synchronized Throwable getCause() {
                return this;
            }
        };

        CactusResponse r = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR, loop), "tx");

        assertThat(r.getErrors()).isNull();
        assertThat(r.getMeta().code()).isEqualTo("S001");
    }

    // ── 실제 BPMN 경로(OasisServiceExecutor → CoreServiceStarter → serviceTask) ─────────

    @Test
    void BPMN_serviceTask_가_던진_업무_예외의_상세가_응답_errors_로_온다() {
        RecordingTxManager biz = new RecordingTxManager();
        CactusResponse r = executor(biz).execute("charBusinessErrors", "save", request());

        assertThat(r.getMeta().success()).isFalse();
        assertThat(r.getMeta().code()).isEqualTo("S001");
        assertThat(r.getMeta().message()).isEqualTo("검증 실패");
        assertThat(r.getErrors()).containsExactlyElementsOf(DETAILS);
        assertThat(biz.events).containsExactly("begin", "rollback");
    }

    @Test
    void BPMN_serviceTask_의_일반_예외는_예전대로_errors_가_없다() {
        RecordingTxManager biz = new RecordingTxManager();
        CactusResponse r = executor(biz).execute("charSystemError", "save", request());

        assertThat(r.getMeta().code()).isEqualTo("S001");
        assertThat(r.getMeta().message()).isEqualTo("시스템 예외");
        assertThat(r.getErrors()).isNull();
    }

    // ── 도우미 ──────────────────────────────────────────────────

    private OasisServiceExecutor executor(RecordingTxManager biz) {
        GenericApplicationContext ctx = new GenericApplicationContext();
        ctx.registerBean("txBiz", PlatformTransactionManager.class, () -> biz);
        ctx.refresh();
        contexts.add(ctx);

        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/cactus-starter-char");
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txBiz");

        ServiceStarter starter = new OasisAutoConfiguration().serviceStarter(props, tx, ctx);
        return new OasisServiceExecutor(starter, ctx, new CactusRequestConverter(), converter);
    }

    private static CactusRequest request() {
        return new CactusRequest(new RequestMeta("u1", "M1"), null, null);
    }
}
