package com.dongkuk.dmes.cactus.oasis;

import static com.dongkuk.dmes.cactus.oasis.CactusResponseConverterJsonTest.failed;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dongkuk.dmes.cactus.common.BusinessErrorTranslator;
import com.dongkuk.dmes.cactus.common.BusinessErrorTranslator.Translated;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.common.ResponseCodeAware;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.transaction.TransactionException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.TransactionSystemException;

/**
 * 업무 예외 변환기({@link BusinessErrorTranslator})를 받은 {@link CactusResponseConverter} 의 코드·상세 판정
 * (2026-10-16, BE 리팩토링 2회차 F2).
 *
 * <p>{@link ForeignBusinessException} 은 cactus 를 모르는 모듈의 업무 예외 대역이다(mcm-core 의 {@code BusinessException} 사본
 * 흉내 — cactus {@link BusinessException} 을 상속하지 않고 {@link ResponseCodeAware} 도 구현하지 않는다). 변환기가 없을 때의
 * 동작은 {@link CactusResponseConverterErrorCodeTest}·{@link CactusResponseConverterBusinessErrorsTest}·
 * {@link CactusResponseConverterJsonTest} 가 고정한다.
 */
class CactusResponseConverterTranslatorTest {

    static final List<ErrorDetail> FOREIGN_DETAILS = List.of(
            ErrorDetail.ofGrid("master", "r1", 0, "masterCode", "E001", "코드ID를 입력해 주십시오."));

    static final List<ErrorDetail> CACTUS_DETAILS = List.of(ErrorDetail.of("E002", "cactus 상세"));

    /** cactus 를 모르는 모듈의 업무 예외 대역 — 자기 코드와 행 상세를 가진다. */
    static class ForeignBusinessException extends RuntimeException {
        final String code;
        final List<ErrorDetail> errors;

        ForeignBusinessException(String code, String message, List<ErrorDetail> errors) {
            super(message);
            this.code = code;
            this.errors = errors;
        }

        ForeignBusinessException(String code, String message, List<ErrorDetail> errors, Throwable cause) {
            super(message, cause);
            this.code = code;
            this.errors = errors;
        }
    }

    /** {@link ForeignBusinessException} 만 아는 변환기(호스트 모듈이 등록하는 어댑터 흉내). */
    static final BusinessErrorTranslator TRANSLATOR =
            t -> t instanceof ForeignBusinessException f ? new Translated(f.code, f.errors) : null;

    static final class CodedException extends BusinessException implements ResponseCodeAware {
        CodedException() {
            super(ErrorCode.ACCESS_DENIED, "시스템 관리자만 할 수 있습니다");
        }

        @Override
        public String responseCode() {
            return "MDM027";
        }
    }

    private final CactusResponseConverter plain = new CactusResponseConverter();
    private final CactusResponseConverter converter = new CactusResponseConverter(List.of(TRANSLATOR));

    private static ForeignBusinessException foreign() {
        return new ForeignBusinessException("E001", "입력값을 확인해주세요.", FOREIGN_DETAILS);
    }

    private static CactusResponse convert(CactusResponseConverter c, Throwable e) {
        return c.convert(failed(ServiceResultCode.SYSTEM_ERROR, e), "tx");
    }

    // ── 변환기가 아는 예외 ───────────────────────────────────────

    @Test
    void 변환기가_아는_예외는_그_코드와_상세를_싣는다() {
        CactusResponse r = convert(converter, foreign());

        assertThat(r.getMeta().success()).isFalse();
        assertThat(r.getMeta().code()).isEqualTo("E001");
        assertThat(r.getMeta().message()).isEqualTo("입력값을 확인해주세요.");
        assertThat(r.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
    }

    @Test
    void 감싸인_변환기_예외도_그_코드와_상세를_싣고_메시지는_바깥_문구다() {
        CactusResponse r = convert(converter, new IllegalStateException("감쌈", new RuntimeException("x", foreign())));

        assertThat(r.getMeta().code()).isEqualTo("E001");
        assertThat(r.getMeta().message()).isEqualTo("감쌈");
        assertThat(r.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
    }

    @Test
    void 변환된_응답_JSON_은_meta_code_와_errors_를_싣는다() throws Exception {
        CactusResponse r = convert(converter, foreign());

        assertThat(new ObjectMapper().writeValueAsString(r)).isEqualTo(
                "{\"meta\":{\"txId\":\"tx\",\"success\":false,\"code\":\"E001\",\"message\":\"입력값을 확인해주세요.\"},"
                        + "\"errors\":[{\"grid\":\"master\",\"rowKey\":\"r1\",\"rowIndex\":0,"
                        + "\"field\":\"masterCode\",\"code\":\"E001\",\"message\":\"코드ID를 입력해 주십시오.\"}]}");
    }

    @Test
    void 변환기가_없으면_같은_예외는_예전처럼_S001_이고_errors_가_빠진다() {
        CactusResponse r = convert(plain, foreign());

        assertThat(r.getMeta().code()).isEqualTo("S001");
        assertThat(r.getErrors()).isNull();
    }

    @Test
    void 변환_코드가_비었으면_코드는_S001_이고_상세는_싣는다() {
        CactusResponseConverter blank = new CactusResponseConverter(List.of(t -> new Translated(" ", FOREIGN_DETAILS)));

        CactusResponse r = convert(blank, new IllegalStateException("x"));

        assertThat(r.getMeta().code()).isEqualTo("S001");
        assertThat(r.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
    }

    @Test
    void 변환_상세가_비었으면_errors_가_빠진다() {
        CactusResponse r = convert(converter, new ForeignBusinessException("E003", "중복 데이터", List.of()));

        assertThat(r.getMeta().code()).isEqualTo("E003");
        assertThat(r.getErrors()).isNull();
    }

    // ── 앞서는 순서 ─────────────────────────────────────────────

    @Test
    void 안쪽_ResponseCodeAware_가_바깥_변환기_예외보다_앞선다() {
        // 안쪽 ResponseCodeAware 가 바깥 변환기 예외보다 앞선다 — ResponseCodeAware 는 원소별 판정 전에 사슬 전체를 먼저 본다.
        ForeignBusinessException outerForeign = new ForeignBusinessException("E001", "바깥", FOREIGN_DETAILS,
                new IllegalStateException("x", new CodedException()));

        assertThat(convert(converter, outerForeign).getMeta().code()).isEqualTo("MDM027");
    }

    @Test
    void 사용자_예외_E001_은_변환기보다_앞서고_상세는_싣는다() {
        CactusResponse r = converter.convert(failed(ServiceResultCode.USER_ERROR,
                new ForeignBusinessException("E003", "사용자", FOREIGN_DETAILS)), "tx");

        assertThat(r.getMeta().code()).isEqualTo("E001");
        assertThat(r.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
    }

    @Test
    void 같은_원소면_cactus_업무_예외가_변환기보다_앞선다() {
        CactusResponseConverter everything = new CactusResponseConverter(List.of(t -> new Translated("X999", FOREIGN_DETAILS)));

        CactusResponse r = convert(everything, new BusinessException(ErrorCode.INVALID_VALUE, "검증", CACTUS_DETAILS));

        assertThat(r.getMeta().code()).isEqualTo("E002");
        assertThat(r.getErrors()).containsExactlyElementsOf(CACTUS_DETAILS);
    }

    @Test
    void 바깥_cactus_업무_예외가_안쪽_변환기_예외보다_앞선다() {
        BusinessException outer = new BusinessException(ErrorCode.INVALID_VALUE, "바깥", CACTUS_DETAILS);
        outer.initCause(new ForeignBusinessException("E003", "안쪽", FOREIGN_DETAILS));

        CactusResponse r = convert(converter, outer);

        assertThat(r.getMeta().code()).isEqualTo("E002");
        assertThat(r.getErrors()).containsExactlyElementsOf(CACTUS_DETAILS);
    }

    @Test
    void 바깥_cactus_업무_예외에_상세가_없으면_안쪽_변환기_예외의_상세를_싣는다() {
        BusinessException outer = new BusinessException(ErrorCode.INVALID_VALUE, "바깥");
        outer.initCause(new ForeignBusinessException("E003", "안쪽", FOREIGN_DETAILS));

        CactusResponse r = convert(converter, outer);

        assertThat(r.getMeta().code()).isEqualTo("E002");
        assertThat(r.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
    }

    @Test
    void 바깥_변환기_예외가_안쪽_cactus_업무_예외보다_앞선다() {
        ForeignBusinessException outer = new ForeignBusinessException("E003", "바깥", FOREIGN_DETAILS,
                new BusinessException(ErrorCode.INVALID_VALUE, "안쪽", CACTUS_DETAILS));

        CactusResponse r = convert(converter, outer);

        assertThat(r.getMeta().code()).isEqualTo("E003");
        assertThat(r.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
    }

    @Test
    void ErrorCode_가_없는_cactus_업무_예외는_같은_원소의_변환기_코드를_쓴다() {
        CactusResponseConverter everything = new CactusResponseConverter(List.of(t -> new Translated("X999", null)));

        CactusResponse r = convert(everything, new BusinessException(null, "코드 없음"));

        assertThat(r.getMeta().code()).isEqualTo("X999");
        assertThat(r.getErrors()).isNull();
    }

    // ── 트랜잭션 예외 경계 ───────────────────────────────────────

    @Test
    void 바깥이_트랜잭션_예외면_안쪽_변환기_예외가_있어도_S001_이고_상세는_싣는다() {
        CactusResponse oasisTx = convert(converter, new TransactionException("커밋 실패", foreign()));
        CactusResponse springTx = convert(converter, new TransactionSystemException("커밋 실패", foreign()));

        assertThat(oasisTx.getMeta().code()).isEqualTo("S001");
        assertThat(springTx.getMeta().code()).isEqualTo("S001");
        // 상세 걷기는 트랜잭션 예외에서 멈추지 않는다 — cactus 형과 같다(CactusResponseConverterBusinessErrorsTest).
        assertThat(oasisTx.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
        assertThat(springTx.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
    }

    @Test
    void 사슬_가운데의_트랜잭션_예외도_경계라_안쪽_변환기_예외는_S001_이다() {
        CactusResponse r = convert(converter, new RuntimeException("감쌈", new TransactionException("커밋 실패", foreign())));

        assertThat(r.getMeta().code()).isEqualTo("S001");
    }

    @Test
    void 바깥이_변환기_예외면_원인이_트랜잭션_예외여도_변환_코드다() {
        ForeignBusinessException rethrown = new ForeignBusinessException("E003", "이미 있습니다", null,
                new TransactionException("커밋 실패", new IllegalStateException("UNIQUE")));

        CactusResponse r = convert(converter, rethrown);

        assertThat(r.getMeta().code()).isEqualTo("E003");
        assertThat(r.getErrors()).isNull();
    }

    // ── 변환기 결과 없음·실패 ─────────────────────────────────────

    @Test
    void null_을_내는_변환기는_변환기_없음과_같다() {
        CactusResponseConverter nothing = new CactusResponseConverter(List.of(t -> null));
        Throwable e = new RuntimeException("감쌈", foreign());

        CactusResponse r = convert(nothing, e);
        CactusResponse base = convert(plain, e);

        assertThat(r.getMeta()).isEqualTo(base.getMeta());
        assertThat(r.getMeta().code()).isEqualTo("S001");
        assertThat(r.getErrors()).isNull();
    }

    @Test
    void 던지는_변환기는_변환기_없음과_같고_응답을_깨지_않는다() {
        BusinessErrorTranslator broken = t -> {
            throw new IllegalStateException("변환기 결함");
        };
        CactusResponseConverter brokenOnly = new CactusResponseConverter(List.of(broken));
        Throwable e = new RuntimeException("감쌈", foreign());

        CactusResponse r = convert(brokenOnly, e);

        assertThat(r.getMeta()).isEqualTo(convert(plain, e).getMeta());
        assertThat(r.getErrors()).isNull();
    }

    @Test
    void 던지는_변환기_다음_변환기는_그대로_묻는다() {
        BusinessErrorTranslator broken = t -> {
            throw new IllegalStateException("변환기 결함");
        };
        CactusResponseConverter c = new CactusResponseConverter(List.of(broken, TRANSLATOR));

        CactusResponse r = convert(c, foreign());

        assertThat(r.getMeta().code()).isEqualTo("E001");
        assertThat(r.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
    }

    @Test
    void 변환기는_목록_순서로_묻고_처음_null_이_아닌_결과를_쓴다() {
        BusinessErrorTranslator first = t -> t instanceof ForeignBusinessException ? new Translated("F001", null) : null;
        BusinessErrorTranslator second = t -> new Translated("F002", CACTUS_DETAILS);

        CactusResponse firstWins = convert(new CactusResponseConverter(List.of(first, second)), foreign());
        CactusResponse secondWins = convert(new CactusResponseConverter(List.of(t -> null, second)), foreign());

        assertThat(firstWins.getMeta().code()).isEqualTo("F001");
        // 처음 결과에 상세가 없어도 다음 변환기로 넘어가지 않는다 — 그 원소의 상세는 없고, 사슬에 다른 원소도 없다.
        assertThat(firstWins.getErrors()).isNull();
        assertThat(secondWins.getMeta().code()).isEqualTo("F002");
        assertThat(secondWins.getErrors()).containsExactlyElementsOf(CACTUS_DETAILS);
    }

    // ── 생성자·판정 도우미 ─────────────────────────────────────────

    @Test
    void null_변환기_목록은_빈_목록과_같다() {
        CactusResponse r = convert(new CactusResponseConverter(null), foreign());

        assertThat(r.getMeta()).isEqualTo(convert(plain, foreign()).getMeta());
        assertThat(r.getErrors()).isNull();
    }

    @Test
    void 생성_뒤에_넘긴_목록을_바꿔도_변환기는_그대로다() {
        List<BusinessErrorTranslator> translators = new ArrayList<>(List.of(TRANSLATOR));
        CactusResponseConverter c = new CactusResponseConverter(translators);
        translators.clear();

        assertThat(convert(c, foreign()).getMeta().code()).isEqualTo("E001");
    }

    @Test
    void 정적_판정_도우미는_변환기를_보지_않고_인스턴스_판정은_본다() {
        assertThat(CactusResponseConverter.businessCode(foreign())).isNull();
        assertThat(converter.businessCodeOf(foreign())).isEqualTo("E001");
        assertThat(plain.businessCodeOf(foreign())).isNull();
        assertThat(converter.businessCodeOf(new CodedException())).isEqualTo("MDM027");
    }

    @Test
    void 변환기만_보는_코드_판정은_cactus_형을_보지_않고_상세_판정은_둘_다_본다() {
        RuntimeException wrappedCactus = new RuntimeException("감쌈", new BusinessException(ErrorCode.INVALID_VALUE, "검증", CACTUS_DETAILS));

        assertThat(converter.translatedCodeOf(wrappedCactus)).isNull();
        assertThat(converter.translatedCodeOf(new CodedException())).isNull();
        assertThat(converter.translatedCodeOf(new RuntimeException("감쌈", foreign()))).isEqualTo("E001");
        assertThat(plain.translatedCodeOf(foreign())).isNull();
        assertThat(converter.errorDetailsOf(wrappedCactus)).containsExactlyElementsOf(CACTUS_DETAILS);
        assertThat(converter.errorDetailsOf(new RuntimeException("감쌈", foreign()))).containsExactlyElementsOf(FOREIGN_DETAILS);
        assertThat(plain.errorDetailsOf(foreign())).isNull();
    }

    // ── 사슬 깊이·순환 ──────────────────────────────────────────

    /** {@code inner} 를 {@code wrappers} 겹 감싼다 — {@code inner} 는 바깥부터 센 사슬의 {@code wrappers + 1} 번째 원소다. */
    private static Throwable nested(Throwable inner, int wrappers) {
        Throwable t = inner;
        for (int i = wrappers; i > 0; i--) {
            t = new RuntimeException("감쌈" + i, t);
        }
        return t;
    }

    @Test
    void 변환기_예외가_사슬_16번째_원소면_깊이_한도_안이라_코드와_상세를_싣는다() {
        CactusResponse r = convert(converter, nested(foreign(), 15));

        assertThat(r.getMeta().code()).isEqualTo("E001");
        assertThat(r.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
    }

    @Test
    void 변환기_예외가_사슬_17번째_원소면_코드_걷기도_상세_걷기도_닿지_않는다() {
        CactusResponse r = convert(converter, nested(foreign(), 16));

        assertThat(r.getMeta().code()).isEqualTo("S001");
        assertThat(r.getErrors()).isNull();
    }

    @Test
    void 자기_자신을_원인으로_가진_예외에서_코드_걷기가_멈춘다() {
        AtomicInteger calls = new AtomicInteger();
        BusinessErrorTranslator counting = t -> {
            calls.incrementAndGet();
            return TRANSLATOR.translate(t);
        };
        RuntimeException loop = new RuntimeException("순환") {
            @Override
            public synchronized Throwable getCause() {
                return this;
            }
        };
        ForeignBusinessException foreignLoop = new ForeignBusinessException("E001", "순환", FOREIGN_DETAILS) {
            @Override
            public synchronized Throwable getCause() {
                return this;
            }
        };

        CactusResponse unknown = convert(new CactusResponseConverter(List.of(counting)), loop);
        CactusResponse known = convert(converter, foreignLoop);

        assertThat(unknown.getMeta().code()).isEqualTo("S001");
        assertThat(unknown.getErrors()).isNull();
        // 코드 걷기 1번 + 상세 걷기 1번 — 깊이 한도(16)까지 돌지 않는다.
        assertThat(calls).hasValue(2);
        assertThat(known.getMeta().code()).isEqualTo("E001");
        assertThat(known.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
    }

    // ── 변환 결과 사본·실패 로그 ───────────────────────────────────

    @Test
    void 변환_결과의_상세는_수정할_수_없는_사본이고_null_목록과_null_원소를_받는다() {
        List<ErrorDetail> source = new ArrayList<>(FOREIGN_DETAILS);
        source.add(null);
        Translated translated = new Translated("E001", source);
        source.clear();

        assertThat(translated.errors()).hasSize(2).containsExactly(FOREIGN_DETAILS.get(0), null);
        assertThatThrownBy(() -> translated.errors().add(null)).isInstanceOf(UnsupportedOperationException.class);
        assertThat(new Translated("E001", null).errors()).isNull();
    }

    @Test
    void 던지는_변환기는_경고를_스택_없이_한_줄로_남기고_스택은_DEBUG_로_남긴다() {
        Logger converterLogger = (Logger) LoggerFactory.getLogger(CactusResponseConverter.class);
        Level previous = converterLogger.getLevel();
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        converterLogger.addAppender(appender);
        converterLogger.setLevel(Level.DEBUG);
        try {
            BusinessErrorTranslator broken = t -> {
                throw new IllegalStateException("변환기 결함");
            };

            convert(new CactusResponseConverter(List.of(broken)), new IllegalArgumentException("x"));

            String thread = Thread.currentThread().getName();
            List<ILoggingEvent> warns = appender.list.stream()
                    .filter(e -> e.getLevel() == Level.WARN && thread.equals(e.getThreadName())).toList();
            List<ILoggingEvent> debugs = appender.list.stream()
                    .filter(e -> e.getLevel() == Level.DEBUG && thread.equals(e.getThreadName())).toList();
            // 코드 걷기 1번 + 상세 걷기 1번.
            assertThat(warns).hasSize(2).allSatisfy(w -> {
                assertThat(w.getThrowableProxy()).isNull();
                assertThat(w.getFormattedMessage()).contains("변환기 결함").contains(IllegalArgumentException.class.getName());
            });
            assertThat(debugs).hasSize(2).allSatisfy(d -> assertThat(d.getThrowableProxy()).isNotNull());
        } finally {
            converterLogger.setLevel(previous);
            converterLogger.detachAppender(appender);
        }
    }
}
