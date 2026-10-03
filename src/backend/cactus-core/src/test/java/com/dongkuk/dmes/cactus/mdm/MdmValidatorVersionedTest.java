package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.common.BusinessException;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** D-154 — 버전 경로의 저장 검증 미리 받기(스펙 §7.2). 세트 S: 1.000 [2026-01-01, 2026-06-01) 룰 R1, 2.000 [2026-06-01, 열린 끝) 룰 R2. */
class MdmValidatorVersionedTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z");
    private static final LocalDateTime B = LocalDateTime.parse("2026-06-01T00:00:00");
    private FakeMetaFeed feed;
    private MdmMetaService service;
    private MdmValidator validator;

    @BeforeEach
    void setUp() {
        MutableClock clock = new MutableClock(T0);
        feed = new FakeMetaFeed().versioned();
        feed.put(MdmTargetType.RULE_SET, "S", List.of(
                new RuleSetDefinition("S", new BigDecimal("1.000"), LocalDateTime.parse("2026-01-01T00:00:00"), B, List.of("R1"), SetStatus.INUSE, null),
                new RuleSetDefinition("S", new BigDecimal("2.000"), B, null, List.of("R2"), SetStatus.INUSE, null)));
        feed.put(MdmTargetType.RULE, "R1", List.of(MdmValidatorTest.contractRule("R1", "QTY", DataType.NUMBER)));
        feed.put(MdmTargetType.RULE, "R2", List.of(MdmValidatorTest.contractRule("R2", "QTY", DataType.NUMBER)));
        feed.put(MdmTargetType.COLUMN, "TB_COL", new MdmColumnMeta("TB_COL", "TB 컬럼", null, "TB", null, null, null, "STRING", 10, null, false,
                null, null, null, null, new MdmColumnMeta.DomainRef("8", "코드", "CODE"), null, null, List.of(),
                new MdmColumnMeta.CodeRefMeta("C", "TB"), null, null, null));
        feed.put(MdmTargetType.CODE, "C", MdmMetaServiceVersionedTest.codeRows());
        MdmMetaCache cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
        service = new MdmMetaService(feed, cache, clock, true);
        validator = new MdmValidator(service, FunctionProvider.NONE, MdmValidator.OnUnavailable.REJECT, clock);
    }

    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    @Test
    void 판정_시각에_적용되는_세트_버전의_룰만_미리_받는다() {
        validator.validate(MdmValidationRequest.rows("g", List.of(row("QTY", 1))).ruleSet("S").evalTs(Instant.parse("2026-03-01T00:00:00Z")).build());
        validator.validate(MdmValidationRequest.rows("g", List.of(row("QTY", 1))).ruleSet("S").evalTs(T0).build());

        assertThat(feed.tocKeys.stream().flatMap(List::stream).toList()).contains("R1", "R2");
        assertThat(feed.tocAts).contains(LocalDateTime.parse("2026-03-01T09:00:00"), LocalDateTime.parse("2026-10-03T00:00:00"));
    }

    @Test
    void CODE_도메인_TABLE_카테고리를_판정_시각_본문으로_검증한다() {
        MdmValidationResult ok = validator.validate(MdmValidationRequest.rows("g", List.of(row("TB_COL", "B"))).columns("TB_COL").build());
        MdmValidationResult bad = validator.validate(MdmValidationRequest.rows("g", List.of(row("TB_COL", "A"))).columns("TB_COL").build());

        assertThat(ok.errors()).isEmpty();
        assertThat(ok.unavailable()).isEmpty();
        assertThat(bad.errors()).hasSize(1);
    }

    @Test
    void 판정_시각_본문을_받을_수_없으면_검증_불가이고_REJECT_면_저장을_막는다() {
        feed.failedKeys.put("C", "깨진 코드 정의"); // 컬럼은 받고 코드 목차·본문만 받을 수 없다
        assertThat(validator.validate(MdmValidationRequest.rows("g", List.of(row("TB_COL", "B"))).columns("TB_COL").build()).unavailable())
                .containsExactly("CODE:C");
        MdmValidationRequest req = MdmValidationRequest.rows("g", List.of(row("TB_COL", "B"))).columns("TB_COL").build();
        assertThatThrownBy(() -> validator.check(req)).isInstanceOf(BusinessException.class);
    }
}
