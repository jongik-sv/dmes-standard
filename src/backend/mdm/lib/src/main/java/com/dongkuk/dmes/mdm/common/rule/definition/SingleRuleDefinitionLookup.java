package com.dongkuk.dmes.mdm.common.rule.definition;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;

/**
 * 값 테스트용 정의 조회(06 「DRAFT와 시험 사본」, TSK-08-04 design §2.3·I20) — 정의 하나를 들고 그 룰 ID 에만 그 정의를 돌려준다.
 * 컬럼·세트 정의는 없다. <b>스프링 빈으로 등록하지 않는다</b> — 요청마다 {@code new} 로 만들어 {@code MdmRuleEngine} 에 넣는다
 * (운영 판정과 같은 엔진 경로, 06:1079).
 */
public final class SingleRuleDefinitionLookup implements DefinitionLookup {

    private final RuleDefinition definition;

    public SingleRuleDefinitionLookup(RuleDefinition definition) {
        this.definition = Objects.requireNonNull(definition, "definition");
    }

    @Override
    public Optional<ColumnDefinition> column(String table, String column) {
        return Optional.empty();
    }

    @Override
    public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
        return definition.ruleId().equals(ruleId) ? Optional.of(definition) : Optional.empty();
    }

    @Override
    public Optional<RuleSetDefinition> ruleSet(String setId) {
        return Optional.empty();
    }
}
