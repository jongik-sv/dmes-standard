package kr.dongkuk.maru.mdm.engine.domain;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator.Failure;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator.Step;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator.ValidationResult;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.testsupport.DomainFixtures;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvFileSource;

/**
 * TSK-03-02 design.md §3.3 — 수용 기준 5: 02 「도메인 종류」 예시 전부(QTY·CODE·ID·TEXT·DATE·FLAG, 상속 예 포함)를
 * {@code validate} 로 판정한다. 유효 식은 자신의 식을 조상부터 AND 로 이어 만든다(02 "파생값을 저장하지 않는다").
 */
class DomainKindExamplesTest {

    private static final Instant DEFAULT_TS = Instant.parse("2026-09-09T15:00:00Z");

    private static final EngineLookups LOOKUPS = DomainFixtures.lookups().build();
    private static final MdmEvaluator EVALUATOR = new MdmEvaluator(LOOKUPS);
    private static final DefaultDomainValidator VALIDATOR = new DefaultDomainValidator(LOOKUPS.definitions(), EVALUATOR);

    @ParameterizedTest(name = "{0} ''{1}'' {2} → {4} {5}")
    @CsvFileSource(resources = "/kr/dongkuk/maru/mdm/engine/domain/02-domain-kind-cases.csv", numLinesToSkip = 1)
    void 도메인_종류_예시(String domain, String value, String extraVars, String evalTs, boolean valid, String step) {
        Map<String, Object> record = new HashMap<>();
        record.put(domain, value);
        record.putAll(extraVars(extraVars));
        Instant ts = evalTs == null ? DEFAULT_TS : Instant.parse(evalTs);

        ValidationResult r = VALIDATOR.validate(DomainFixtures.TABLE, domain, record, ts);

        List<Step> steps = r.failures().stream().map(Failure::step).toList();
        assertAll(
                () -> assertEquals(valid, r.valid(), r.toString()),
                () -> assertEquals(valid ? List.of() : List.of(Step.valueOf(step)), steps, r.toString()));
    }

    /** TEXT 식의 거짓 가지 — 공백만 있는 값은 1단계 정규화로 NULL 이 되어 validate 로는 닿지 않으므로 식 수준에서 본다. */
    @Test
    void TEXT_식의_거짓_가지는_식_수준에서_평가한다() {
        Map<String, Object> v = Map.of("value", "   ");
        assertEquals(Boolean.FALSE, EVALUATOR.evaluate(DomainFixtures.CUST_NM_OWN, v, DEFAULT_TS).getBooleanValue());
    }

    /** {@code NAME:N:19} = BigDecimal, {@code NAME:S:x} = 문자열, {@code NAME:NULL} = 키만 있음, 여럿은 {@code ;}. */
    private static Map<String, Object> extraVars(String spec) {
        Map<String, Object> out = new HashMap<>();
        if (spec == null || spec.isBlank()) {
            return out;
        }
        for (String item : spec.split(";")) {
            String[] parts = item.split(":", 3);
            switch (parts[1]) {
                case "N" -> out.put(parts[0], new BigDecimal(parts[2]));
                case "S" -> out.put(parts[0], parts[2]);
                case "NULL" -> out.put(parts[0], null);
                default -> throw new IllegalArgumentException("extraVars 표기 오류: " + item);
            }
        }
        return out;
    }
}
