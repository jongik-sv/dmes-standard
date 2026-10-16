package com.dongkuk.dmes.cactus.oasis;

import static com.dongkuk.dmes.cactus.oasis.CactusResponseConverterTranslatorTest.CACTUS_DETAILS;
import static com.dongkuk.dmes.cactus.oasis.CactusResponseConverterTranslatorTest.FOREIGN_DETAILS;
import static com.dongkuk.dmes.cactus.oasis.CactusResponseConverterTranslatorTest.TRANSLATOR;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dongkuk.dmes.cactus.common.BusinessErrorTranslator;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.oasis.CactusResponseConverterTranslatorTest.CodedException;
import com.dongkuk.dmes.cactus.oasis.CactusResponseConverterTranslatorTest.ForeignBusinessException;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.transaction.TransactionException;
import java.util.HashMap;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;

/**
 * {@link OasisServiceExecutor} 의 BPMN 밖 catch 가 응답 변환기의 업무 예외 변환기({@link BusinessErrorTranslator})를 쓰는지 본다
 * (2026-10-16, BE 리팩토링 2회차 F2).
 *
 * <p>BPMN 밖 예외는 {@link ServiceStarter#start} 가 직접 던진 예외다(BPMN serviceTask 안 예외는 {@code CoreServiceStarter} 가
 * {@code ServiceResult} 로 바꿔 응답 변환기로 간다). 일반 예외 catch 는 업무 예외 변환기가 원인 사슬에서 코드를 알아볼 때만 업무
 * 예외로 응답한다 — 코드·상세는 응답 변환기와 같은 판정(USER_ERROR 단계 제외)이고 로그는 WARN 이다. 아무것도 알아보지 못하면
 * 예전처럼 ERROR 로그, {@code S999}, {@code errors} 없음이다.
 */
class OasisServiceExecutorTranslatorTest {

    private final ServiceStarter starter = mock(ServiceStarter.class);
    private Logger executorLogger;
    private ListAppender<ILoggingEvent> appender;

    @BeforeEach
    void attachAppender() {
        executorLogger = (Logger) LoggerFactory.getLogger(OasisServiceExecutor.class);
        appender = new ListAppender<>();
        appender.start();
        executorLogger.addAppender(appender);
    }

    @AfterEach
    void detachAppender() {
        executorLogger.detachAppender(appender);
    }

    /** 이 시험 스레드가 남긴 해당 수준 로그 수. */
    private long logs(Level level) {
        String thread = Thread.currentThread().getName();
        return appender.list.stream().filter(e -> e.getLevel() == level && thread.equals(e.getThreadName())).count();
    }

    private OasisServiceExecutor executor(List<BusinessErrorTranslator> translators) {
        return new OasisServiceExecutor(starter, mock(ApplicationContext.class), new CactusRequestConverter(),
                new CactusResponseConverter(translators));
    }

    private CactusResponse executeThrowing(List<BusinessErrorTranslator> translators, RuntimeException thrown) {
        // 한 시험에서 두 번 부를 수 있어 doThrow 로 다시 묶는다(when(...) 은 앞서 묶은 예외를 던진다).
        doThrow(thrown).when(starter).start(eq("probe"), any(ServiceContext.class));
        return executor(translators).execute("probe", "save",
                new CactusRequest(new RequestMeta("u1", "M1"), new HashMap<>(), null));
    }

    private static ForeignBusinessException foreign() {
        return new ForeignBusinessException("E001", "입력값을 확인해주세요.", FOREIGN_DETAILS);
    }

    // ── 일반 예외 catch ─────────────────────────────────────────

    @Test
    void 변환기가_아는_예외는_BPMN_밖에서도_그_코드와_상세를_싣는다() {
        CactusResponse res = executeThrowing(List.of(TRANSLATOR), foreign());

        assertThat(res.getMeta().success()).isFalse();
        assertThat(res.getMeta().code()).isEqualTo("E001");
        assertThat(res.getMeta().message()).isEqualTo("입력값을 확인해주세요.");
        assertThat(res.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
    }

    @Test
    void 감싸인_변환기_예외도_그_코드와_상세를_싣고_메시지는_바깥_문구다() {
        CactusResponse res = executeThrowing(List.of(TRANSLATOR), new IllegalStateException("감쌈", foreign()));

        assertThat(res.getMeta().code()).isEqualTo("E001");
        assertThat(res.getMeta().message()).isEqualTo("감쌈");
        assertThat(res.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
    }

    @Test
    void 변환기가_알아본_예외는_ERROR_가_아니라_WARN_으로_남긴다() {
        executeThrowing(List.of(TRANSLATOR), foreign());

        assertThat(logs(Level.WARN)).isEqualTo(1);
        assertThat(logs(Level.ERROR)).isZero();
    }

    @Test
    void 섞인_사슬은_응답_변환기와_같이_ResponseCodeAware_코드를_싣고_상세는_가장_바깥_것이다() {
        CodedException coded = new CodedException();
        coded.initCause(foreign());

        CactusResponse res = executeThrowing(List.of(TRANSLATOR), new RuntimeException("감쌈", coded));

        assertThat(res.getMeta().code()).isEqualTo("MDM027");
        assertThat(res.getMeta().message()).isEqualTo("감쌈");
        assertThat(res.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
    }

    @Test
    void 변환기_예외를_감싼_바깥_cactus_업무_예외가_있으면_그_코드와_상세가_앞선다() {
        BusinessException cactus = new BusinessException(ErrorCode.INVALID_VALUE, "검증", CACTUS_DETAILS);
        cactus.initCause(foreign());

        CactusResponse res = executeThrowing(List.of(TRANSLATOR), new RuntimeException("감쌈", cactus));

        assertThat(res.getMeta().code()).isEqualTo("E002");
        assertThat(res.getErrors()).containsExactlyElementsOf(CACTUS_DETAILS);
    }

    @Test
    void 변환기가_없으면_예전처럼_S999_이고_errors_가_없다() {
        CactusResponse res = executeThrowing(List.of(), foreign());

        assertThat(res.getMeta().code()).isEqualTo(ErrorCode.UNKNOWN_ERROR.getCode());
        assertThat(res.getMeta().message()).isEqualTo("입력값을 확인해주세요.");
        assertThat(res.getErrors()).isNull();
        assertThat(logs(Level.ERROR)).isEqualTo(1);
        assertThat(logs(Level.WARN)).isZero();
    }

    @Test
    void 변환기가_모르는_예외는_예전처럼_S999_이다() {
        CactusResponse nothing = executeThrowing(List.of(t -> null), foreign());
        CactusResponse unknown = executeThrowing(List.of(TRANSLATOR), new IllegalStateException("시스템"));

        assertThat(nothing.getMeta().code()).isEqualTo("S999");
        assertThat(nothing.getErrors()).isNull();
        assertThat(unknown.getMeta().code()).isEqualTo("S999");
        assertThat(unknown.getErrors()).isNull();
    }

    @Test
    void 던지는_변환기는_예전처럼_S999_이다() {
        BusinessErrorTranslator broken = t -> {
            throw new IllegalStateException("변환기 결함");
        };

        CactusResponse res = executeThrowing(List.of(broken), foreign());

        assertThat(res.getMeta().code()).isEqualTo("S999");
        assertThat(res.getErrors()).isNull();
    }

    @Test
    void 감싸인_cactus_업무_예외는_변환기가_있어도_없어도_예전처럼_S999_이다() {
        RuntimeException wrapped = new RuntimeException("감쌈",
                new BusinessException(ErrorCode.INVALID_VALUE, "검증", CACTUS_DETAILS));

        CactusResponse without = executeThrowing(List.of(), wrapped);
        CactusResponse with = executeThrowing(List.of(TRANSLATOR), wrapped);

        assertThat(without.getMeta().code()).isEqualTo("S999");
        assertThat(without.getErrors()).isNull();
        assertThat(with.getMeta().code()).isEqualTo("S999");
        assertThat(with.getErrors()).isNull();
    }

    @Test
    void 바깥이_트랜잭션_예외면_안쪽_변환기_예외가_있어도_S999_이다() {
        CactusResponse res = executeThrowing(List.of(TRANSLATOR), new TransactionException("커밋 실패", foreign()));

        assertThat(res.getMeta().code()).isEqualTo("S999");
        assertThat(res.getErrors()).isNull();
    }

    // ── 업무 예외 catch ─────────────────────────────────────────

    @Test
    void ErrorCode_가_없는_업무_예외가_감싼_변환기_예외는_그_코드를_쓰고_상세는_바깥_예외의_것이다() {
        BusinessException outer = new BusinessException(null, "코드 없음");
        outer.initCause(foreign());

        CactusResponse with = executeThrowing(List.of(TRANSLATOR), outer);
        CactusResponse without = executeThrowing(List.of(), outer);

        assertThat(with.getMeta().code()).isEqualTo("E001");
        assertThat(with.getMeta().message()).isEqualTo("코드 없음");
        assertThat(with.getErrors()).isNull();
        assertThat(without.getMeta().code()).isEqualTo("S001");
        assertThat(without.getErrors()).isNull();
    }

    @Test
    void 업무_예외_catch_는_변환기가_있어도_ResponseCodeAware_코드를_싣는다() {
        CactusResponse res = executeThrowing(List.of(TRANSLATOR), new CodedException());

        assertThat(res.getMeta().code()).isEqualTo("MDM027");
        assertThat(res.getMeta().message()).isEqualTo("시스템 관리자만 할 수 있습니다");
    }
}
