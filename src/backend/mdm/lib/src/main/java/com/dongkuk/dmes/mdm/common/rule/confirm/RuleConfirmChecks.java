package com.dongkuk.dmes.mdm.common.rule.confirm;

import com.dongkuk.dmes.mdm.common.rule.RuleCaseJudge;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleTestCaseQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput.DraftRow;
import com.dongkuk.dmes.mdm.common.rule.check.RuleDefinitionReads;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveValidator;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.Report;
import com.dongkuk.dmes.mdm.common.rule.definition.SingleRuleDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions.Stored;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleTestCase;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import org.springframework.stereotype.Component;

/**
 * 룰 버전 확정 검사 컴포넌트(TSK-08-05 design §6.1) — 원장을 읽어 순수 규칙({@link RuleConfirmReport}·{@link RuleVersionDiffs})에 넘긴다. SPI 가
 * 아니다: 화면 서비스는 이 컴포넌트를 주입받는다(시나리오 후처리기가 SPI 정의를 지워도 컨텍스트가 뜬다, I16). 확정 트랜잭션 안에서 불리므로
 * 쓰기를 하지 않는다(I14). 새 네이티브 SQL 이 없다(I15).
 *
 * <p>네 항목은 서로 독립으로 모두 돈다. 값 테스트·결과 변수 참조 실행 중 런타임 예외는 그 항목의 ERROR 이슈로 바꾸고 보고서는 4행을 돌려준다.
 */
@Component
public class RuleConfirmChecks {

    private final MdmRuleRepository rules;
    private final RuleQueries queries;
    private final StoredRuleDefinitions stored;
    private final RuleSaveValidator validator;
    private final RuleTestCaseQueries caseQueries;
    private final RuleConfirmQueries confirmQueries;
    private final RuleVarTypeResolver resolver;
    private final MdmEvaluator evaluator;
    private final Clock clock;

    public RuleConfirmChecks(MdmRuleRepository rules, RuleQueries queries, StoredRuleDefinitions stored, RuleSaveValidator validator,
                             RuleTestCaseQueries caseQueries, RuleConfirmQueries confirmQueries, RuleVarTypeResolver resolver,
                             MdmEvaluator evaluator, Clock clock) {
        this.rules = rules;
        this.queries = queries;
        this.stored = stored;
        this.validator = validator;
        this.caseQueries = caseQueries;
        this.confirmQueries = confirmQueries;
        this.resolver = resolver;
        this.evaluator = evaluator;
        this.clock = clock;
    }

    /** 4항목 보고서. 룰·버전이 없으면 {@link IllegalStateException}(공통 서비스가 DRAFT 를 먼저 읽으므로 확정 경로에서는 나지 않는다). */
    public Report report(VersionRef draft) {
        String id = draft.objectId();
        int ver = draft.ver().intValueExact();
        MdmRule rule = rules.findById(id).orElseThrow(() -> new IllegalStateException("룰이 없습니다: " + id));
        Stored s = stored.read(id, ver).orElseThrow(() -> new IllegalStateException("룰 " + id + " 에 버전 " + ver + " 이(가) 없습니다"));

        List<Map<String, Object>> saveIssues = validator.validate(new RuleCheckInput(id, ver, rule.getRuleKind(), s.version().getHitPolicy(),
                s.rawVars(), s.vars(), s.rows(), RuleSaveTarget.STORED)).issues();

        List<Map<String, Object>> cases = List.of();
        String caseFailure = null;
        try {
            cases = cases(id, rule.getRuleKind(), s);
        } catch (RuntimeException e) {
            caseFailure = String.valueOf(e.getMessage());
        }

        List<MdmCheckIssue> resultVar;
        try {
            resultVar = resultVarIssues(id, ver, s);
        } catch (RuntimeException e) {
            resultVar = List.of(RuleConfirmReport.producerCheckFailed(String.valueOf(e.getMessage())));
        }
        return RuleConfirmReport.report(draft, saveIssues, s.rawVars().size(), s.rows().size(), cases, caseFailure, resultVar);
    }

    /** row_id diff — base 는 {@link #previousReleased}(없으면 null, 최초 버전). */
    public VersionDiff diff(VersionRef draft) {
        String id = draft.objectId();
        int ver = draft.ver().intValueExact();
        Optional<MdmRuleVer> previous = previousReleased(id, ver);
        List<RuleVersionDiffs.Row> base = previous.map(p -> rows(id, p.getVer())).orElse(List.of());
        VersionRef baseRef = previous.map(p -> new VersionRef(VersionTarget.BUSINESS_RULE, id, BigDecimal.valueOf(p.getVer()))).orElse(null);
        return new VersionDiff(baseRef, draft, RuleVersionDiffs.diff(base, rows(id, ver)));
    }

    /** 직전 RELEASED = 같은 룰에서 STATUS RELEASED 이고 ver &lt; V 인 것 중 가장 큰 ver(I12). 공통 서비스의 판정과 같다. */
    public Optional<MdmRuleVer> previousReleased(String ruleId, int ver) {
        MdmRuleVer best = null;
        for (MdmRuleVer v : queries.versions(ruleId)) {
            if (VersionStatus.RELEASED.name().equals(v.getStatus()) && v.getVer() < ver && (best == null || v.getVer() > best.getVer())) {
                best = v;
            }
        }
        return Optional.ofNullable(best);
    }

    /** 값 테스트 VERSION 분기와 같은 조립·판정(I8). 케이스가 없으면 정의를 조립하지 않는다. */
    private List<Map<String, Object>> cases(String id, String ruleKind, Stored s) {
        List<MdmRuleTestCase> cases = caseQueries.cases(id);
        if (cases.isEmpty()) {
            return List.of();
        }
        RuleDefinition def = stored.assemble(id, ruleKind, s).definition();
        Integer defaultRowId = def.rows().stream().filter(r -> r.rowKind() == RowKind.DEFAULT).map(RuleRow::rowId).findFirst().orElse(null);
        MdmRuleEngine engine = new MdmRuleEngine(evaluator.configuration(), new SingleRuleDefinitionLookup(def));
        Instant ts = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        return cases.stream().map(c -> RuleCaseJudge.runCase(engine, id, c, ts, defaultRowId)).toList();
    }

    private List<MdmCheckIssue> resultVarIssues(String id, int ver, Stored s) {
        RuleDefinitionReads.Names names = RuleDefinitionReads.of(s.rawVars(), s.rows().stream().map(DraftRow::cells).toList());
        Set<String> candidates = new LinkedHashSet<>(names.reads());
        candidates.removeAll(names.produces());
        Map<String, Set<String>> producers = confirmQueries.producers(id, candidates);
        Set<String> producerIds = new LinkedHashSet<>();
        producers.values().forEach(producerIds::addAll);
        Set<String> released = queries.latestReleasedVers(producerIds).keySet();
        return RuleConfirmReport.resultVarIssues(names.reads(), names.produces(), columnNames(id, ver), producers, released);
    }

    /** 컬럼 사전 이름인가 — 해석기에 이름 하나짜리 COND 탐침을 물어 typeSource 가 COLUMN 인지 본다(한 호출 안에서 캐시). */
    private Predicate<String> columnNames(String id, int ver) {
        Map<String, Boolean> cache = new HashMap<>();
        return name -> cache.computeIfAbsent(name, n -> {
            MdmRuleVar probe = new MdmRuleVar(id, ver, 0, "COND", 1);
            probe.setDispType("Equal");
            probe.setVarName(n);
            return Optional.ofNullable(resolver.resolve(id, ver, List.of(probe))).filter(l -> !l.isEmpty())
                    .map(l -> RuleVarTypeResolver.COLUMN.equals(l.get(0).typeSource())).orElse(false);
        });
    }

    private List<RuleVersionDiffs.Row> rows(String id, int ver) {
        return queries.rows(id, ver).stream().map(r -> new RuleVersionDiffs.Row(r.getRowId(), r.getSeq(), r.getCells())).toList();
    }
}
