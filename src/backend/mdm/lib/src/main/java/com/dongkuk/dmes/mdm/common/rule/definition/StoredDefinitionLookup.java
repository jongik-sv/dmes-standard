package com.dongkuk.dmes.mdm.common.rule.definition;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;

/**
 * 운영 정의 조회기(spec §6.1, 계획 Task 11) — MDM 앱 안에서 원장을 직접 읽는다. 룰은 판정 시각(KST 벽시계)에 적용되는 RELEASED 버전
 * ({@link RuleVersions#currentReleased}: {@code APPLY_FROM <= now < APPLY_TO}), 세트는 현재 행(FLOW_JSON 이 없으면 흐름 null = 한 줄 흐름).
 *
 * <p><b>스프링 빈이 아니다</b> — {@code MdmBusinessRuleMigrationTest} 가 {@code DefinitionLookup} 빈 0개를 요구한다. {@code RuleSetRunner} 가 호출마다
 * 만든다. 한 인스턴스 안에서 (룰, 판정 시각) 결과를 캐시한다. 컬럼 검증 정의는 이 조회기의 몫이 아니라 빈 값이다.
 *
 * <p>저장 데이터가 깨졌으면 판정하지 않고 던진다: 행 조립 실패는 {@code BusinessException}(MDM021), 저장된 AST 를 읽지 못하면
 * {@code IllegalStateException}(조립기), FLOW_JSON 을 읽지 못하면 {@code IllegalArgumentException}(코덱). OASIS 입구
 * {@code RuleSetRunner#execute} 가 뒤의 둘을 업무 예외로 감싼다.
 */
public final class StoredDefinitionLookup implements DefinitionLookup {

    private final RuleQueries queries;
    private final StoredRuleDefinitions stored;
    private final MdmRuleRepository rules;
    private final MdmRuleSetRepository sets;
    private final Map<String, Optional<RuleDefinition>> cache = new HashMap<>();

    public StoredDefinitionLookup(RuleQueries queries, StoredRuleDefinitions stored, MdmRuleRepository rules, MdmRuleSetRepository sets) {
        this.queries = queries;
        this.stored = stored;
        this.rules = rules;
        this.sets = sets;
    }

    @Override
    public Optional<ColumnDefinition> column(String table, String column) {
        return Optional.empty();
    }

    @Override
    public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
        return cache.computeIfAbsent(ruleId + "@" + evalTs, k -> load(ruleId, evalTs));
    }

    @Override
    public Optional<RuleSetDefinition> ruleSet(String setId) {
        return sets.findById(setId).map(StoredDefinitionLookup::toDefinition);
    }

    private Optional<RuleDefinition> load(String ruleId, Instant evalTs) {
        MdmRule rule = rules.findById(ruleId).orElse(null);
        if (rule == null) {
            return Optional.empty();
        }
        LocalDateTime now = LocalDateTime.ofInstant(evalTs, MdmClockConfig.KST);
        Optional<MdmRuleVer> ver = RuleVersions.currentReleased(queries.versions(ruleId), now);
        return ver.flatMap(v -> stored.read(ruleId, v.getVer())).map(s -> definition(ruleId, rule.getRuleKind(), s));
    }

    /**
     * 조립한 정의. 셀을 만들지 못한 행이 있으면 던진다 — 조립기는 그 행을 빼고({@code skippedRows}, 실패가 난 행과 같은 집합) 정의를 만들므로
     * 그대로 쓰면 운영 판정이 깨진 행을 조용히 건너뛰어 다른 행(기본 행 등)으로 넘어간다.
     */
    private RuleDefinition definition(String ruleId, String ruleKind, StoredRuleDefinitions.Stored s) {
        RuleDefinitionAssembler.Assembled a = stored.assemble(ruleId, ruleKind, s);
        if (!a.failures().isEmpty() || !a.skippedRows().isEmpty()) {
            String detail = a.failures().stream().map(f -> "row " + f.rowId() + " var_id " + f.varId() + ": " + f.message())
                    .collect(Collectors.joining("; "));
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "룰 " + ruleId + " 버전 " + s.version().getVer()
                    + " 의 저장된 행을 조립할 수 없어 판정하지 않습니다 — " + (detail.isEmpty() ? "행 " + a.skippedRows() : detail), List.of());
        }
        return a.definition();
    }

    private static RuleSetDefinition toDefinition(MdmRuleSet s) {
        List<String> ids = DomainJson.readList(s.getRuleIds()).stream().map(String::valueOf).toList();
        return new RuleSetDefinition(s.getMaruRuleSetId(), ids, SetStatus.valueOf(s.getStatus()),
                s.getFlowJson() == null ? null : RuleSetFlowJson.parse(s.getFlowJson()));
    }
}
