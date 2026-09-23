package kr.dongkuk.maru.mdm.engine.domain;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator.Failure;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator.Step;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator.ValidationResult;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.ColumnDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DomainKind;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups.CountingBody;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * TSK-03-02 design.md §3.3·§6.9 — 02 실행 순서 1-4단계(02:381-389, 06:448): NOT_DEFINED → 예약 키 → 빈 값 정규화 →
 * 필수 → 타입 변환 → 유효 표준식 → 유효 비즈니스식. 앞 단계가 실패하면 멈춘다. 값이 틀린 것은 결과, 식 평가 오류는 예외다.
 */
class DefaultDomainValidatorTest {

    private static final String T = "T";
    private static final Instant TS = Instant.parse("2026-09-06T00:00:00Z");

    private CountingBody stdBody;
    private CountingBody bizBody;
    private DefaultDomainValidator validator;

    private static ColumnDefinition column(String name, DataType type, boolean required, String std, String biz) {
        return new ColumnDefinition(T, name, DomainKind.QTY, type, null, required, std, biz, List.of(), null, null, null, null);
    }

    @BeforeEach
    void setUp() {
        stdBody = new CountingBody(args -> {
            throw new IllegalStateException("부르면 안 된다");
        });
        bizBody = new CountingBody(args -> Boolean.TRUE);
        EngineLookups lookups = InMemoryLookups.create()
                .function(InMemoryLookups.fn("BOOM", stdBody, "v"))
                .function(InMemoryLookups.fn("BIZ", bizBody, "v"))
                .column(column("QTY", DataType.NUMBER, true, "value > 0", null))
                .column(column("OPT", DataType.NUMBER, false, "BOOM(value)", null))
                .column(column("STD_FALSE", DataType.NUMBER, false, "value > 100", "BIZ(value)"))
                .column(column("BIZ_VAR", DataType.NUMBER, false, null, "value >= COALESCE(COIL_NET_WGT, 0)"))
                .column(column("EXC", DataType.NUMBER, false, "value / 0 > 1", null))
                .column(column("NULL_RESULT", DataType.NUMBER, false, "IF(value > 0, NULL, TRUE)", null))
                .column(column("NON_BOOL", DataType.NUMBER, false, "value + 1", null))
                .column(column("STD_PARSE", DataType.NUMBER, false, "NOPE_FN(value)", null))
                .column(column("BIZ_PARSE", DataType.NUMBER, false, null, "NOPE_FN(value)"))
                .build();
        validator = new DefaultDomainValidator(lookups.definitions(), new MdmEvaluator(lookups));
    }

    private static Map<String, Object> record(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private static List<Step> steps(ValidationResult r) {
        return r.failures().stream().map(Failure::step).toList();
    }

    @Test
    void 컬럼_사전에_없으면_NOT_DEFINED_다() {
        ValidationResult r = validator.validate(T, "NOPE", record("NOPE", "1"), TS);
        assertAll(
                () -> assertFalse(r.valid()),
                () -> assertNull(r.value()),
                () -> assertEquals(List.of(Step.NOT_DEFINED), steps(r)));
    }

    @ParameterizedTest(name = "''{0}''")
    @ValueSource(strings = {"", "   ", "\t\n"})
    void 공백만_있는_값은_NULL_로_보고_필수면_REQUIRED_다(String blank) {
        ValidationResult r = validator.validate(T, "QTY", record("QTY", blank), TS);
        assertAll(
                () -> assertFalse(r.valid()),
                () -> assertEquals(List.of(Step.REQUIRED), steps(r)));
    }

    @Test
    void 필수가_아니면_NULL_은_통과하고_식은_돌지_않는다() {
        ValidationResult r = validator.validate(T, "OPT", record(), TS);
        assertAll(
                () -> assertTrue(r.valid()),
                () -> assertNull(r.value()),
                () -> assertEquals(0, stdBody.calls()));
    }

    @Test
    void 타입_변환_실패는_TYPE_CONVERSION_이고_식은_돌지_않는다() {
        ValidationResult r = validator.validate(T, "QTY", record("QTY", "abc"), TS);
        assertAll(
                () -> assertEquals(List.of(Step.TYPE_CONVERSION), steps(r)),
                () -> assertNull(r.value()));
    }

    @Test
    void 표준식이_거짓이면_비즈니스식을_돌리지_않는다() {
        ValidationResult r = validator.validate(T, "STD_FALSE", record("STD_FALSE", "5"), TS);
        assertAll(
                () -> assertEquals(List.of(Step.STD_EXPR), steps(r)),
                () -> assertEquals(0, bizBody.calls()));
    }

    @Test
    void 비즈니스_요구_변수_키가_없으면_BIZ_VAR_MISSING_이다() {
        ValidationResult r = validator.validate(T, "BIZ_VAR", record("BIZ_VAR", "20"), TS);
        assertAll(
                () -> assertEquals(List.of(Step.BIZ_VAR_MISSING), steps(r)),
                () -> assertTrue(r.failures().get(0).message().contains("COIL_NET_WGT"), r.toString()));
    }

    @Test
    void 키가_있고_값이_NULL_이면_누락이_아니다() {
        ValidationResult r = validator.validate(T, "BIZ_VAR", record("BIZ_VAR", "20", "COIL_NET_WGT", null), TS);
        assertAll(
                () -> assertTrue(r.valid(), r.toString()),
                () -> assertEquals(List.of(), steps(r)));
    }

    @Test
    void 요구_변수_키는_대소문자를_가리지_않는다() {
        ValidationResult r = validator.validate(T, "BIZ_VAR",
                record("BIZ_VAR", "20", "coil_net_wgt", new BigDecimal("19")), TS);
        assertTrue(r.valid(), r.toString());
    }

    @Test
    void 식_평가_예외는_EngineEvaluationException_RESULT_EVAL_이다() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> validator.validate(T, "EXC", record("EXC", "5"), TS));
        Violation v = e.violations().get(0);
        assertAll(
                () -> assertEquals(Stage.RESULT_EVAL, v.stage()),
                () -> assertEquals(Code.EVALUATION_ERROR, v.code()));
    }

    @Test
    void 레코드_예약_키는_EngineEvaluationException_INPUT_CHECK_이다() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> validator.validate(T, "QTY", record("QTY", "5", "_x", 1), TS));
        Violation v = e.violations().get(0);
        assertAll(
                () -> assertEquals(Stage.INPUT_CHECK, v.stage()),
                () -> assertEquals(Code.RESERVED_KEY, v.code()),
                () -> assertEquals("_x", v.name()));
    }

    @Test
    void 결과의_value_는_변환된_값이다() {
        ValidationResult r = validator.validate(T, "QTY", record("QTY", "1.60"), TS);
        assertAll(
                () -> assertTrue(r.valid()),
                () -> assertEquals(new BigDecimal("1.60"), r.value()));
    }

    @Test
    void 식_결과가_NULL_이면_검증_실패다() {
        ValidationResult r = validator.validate(T, "NULL_RESULT", record("NULL_RESULT", "5"), TS);
        assertAll(
                () -> assertFalse(r.valid()),
                () -> assertEquals(List.of(Step.STD_EXPR), steps(r)));
    }

    /** 비즈니스 함수 jar 에서 함수가 빠지면 저장된 식이 판정 때 파싱에 실패한다. 표준식·비즈니스식 어느 쪽이든 판정 오류다. */
    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"STD_PARSE", "BIZ_PARSE"})
    void 식_파싱_실패는_EngineEvaluationException_RESULT_EVAL_이다(String column) {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> validator.validate(T, column, record(column, "5"), TS));
        Violation v = e.violations().get(0);
        assertAll(
                () -> assertEquals(Stage.RESULT_EVAL, v.stage()),
                () -> assertEquals(Code.EVALUATION_ERROR, v.code()));
    }

    @Test
    void 식_결과가_불린이_아니면_판정_오류다() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> validator.validate(T, "NON_BOOL", record("NON_BOOL", "5"), TS));
        assertEquals(Code.EVALUATION_ERROR, e.violations().get(0).code());
    }
}
