package kr.dongkuk.maru.mdm.engine.rule.fixture;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;

/**
 * 메모리 정의 조회(TSK-03-03 design §2.2). 룰 ID → 버전 목록, 세트 ID → 세트. {@code rule(id, evalTs)} 는 KST 로 바꿔
 * {@code applyFrom ≤ t < applyTo} 인 버전을 돌려준다. 폐기 세트 검증을 위해 호출을 기록한다.
 */
public final class InMemoryDefinitionLookup implements DefinitionLookup {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final Map<String, List<RuleDefinition>> rules = new LinkedHashMap<>();
    private final Map<String, RuleSetDefinition> sets = new LinkedHashMap<>();
    private final List<String> ruleCalls = new ArrayList<>();
    private final List<Instant> ruleEvalTs = new ArrayList<>();
    private int ruleSetCalls;

    public InMemoryDefinitionLookup add(RuleDefinition... defs) {
        for (RuleDefinition d : defs) {
            rules.computeIfAbsent(d.ruleId(), k -> new ArrayList<>()).add(d);
        }
        return this;
    }

    public InMemoryDefinitionLookup addSet(RuleSetDefinition... defs) {
        for (RuleSetDefinition d : defs) {
            sets.put(d.setId(), d);
        }
        return this;
    }

    /** {@code rule()} 을 부른 룰 ID(순서대로). */
    public List<String> ruleCalls() {
        return ruleCalls;
    }

    /** {@code rule()} 에 넘어온 평가 시각(순서대로). */
    public List<Instant> ruleEvalTs() {
        return ruleEvalTs;
    }

    public int ruleSetCalls() {
        return ruleSetCalls;
    }

    @Override
    public Optional<ColumnDefinition> column(String table, String column) {
        return Optional.empty();
    }

    @Override
    public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
        ruleCalls.add(ruleId);
        ruleEvalTs.add(evalTs);
        LocalDateTime t = LocalDateTime.ofInstant(evalTs, KST);
        return rules.getOrDefault(ruleId, List.of()).stream()
                .filter(d -> !t.isBefore(d.applyFrom()) && t.isBefore(d.applyTo()))
                .findFirst();
    }

    private final List<Instant> ruleSetEvalTs = new ArrayList<>();

    /** {@code ruleSet()} 에 넘어온 평가 시각(순서대로). */
    public List<Instant> ruleSetEvalTs() {
        return ruleSetEvalTs;
    }

    @Override
    public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
        ruleSetCalls++;
        ruleSetEvalTs.add(evalTs);
        return Optional.ofNullable(sets.get(setId));
    }
}
