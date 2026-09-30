package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunResult;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 룰 세트 실행(spec §6.2, ADR 0005) — OASIS 업무 서비스와 룰 세트 편집 화면 디버거가 부른다. 호출마다 {@link StoredDefinitionLookup}(빈 아님)과
 * {@link MdmRuleEngine} 을 만들고 공유 {@link MdmEvaluator} 빈을 넘겨 컴파일 캐시를 같이 쓴다. 판정 시각이 없으면 서비스 시계(KST)로 채운다
 * (엔진은 시계를 읽지 않는다, decisions.md:161).
 *
 * <p>OASIS BPMN 은 {@code camunda:class="ruleSetRunner"} + {@code method=execute} serviceTask 하나로 부른다. 판정 오류는 {@link #run} 에서
 * {@link EngineEvaluationException} 으로 올라가고, {@link #execute} 는 {@link RuleErrorText} 문구(룰이 있으면 앞에 {@code [ruleId] })로 바꾼
 * 업무 예외를 던진다. 저장 데이터 손상(행 조립 실패·FLOW_JSON·AST 읽기 실패)도 {@link #execute} 에서는 업무 예외다.
 * {@code @Transactional} 을 붙이지 않는다 — OASIS 파라미터 이름 바인딩이 깨진다(읽기만 한다).
 */
@Service("ruleSetRunner")
public class RuleSetRunner {

    private static final Logger log = LoggerFactory.getLogger(RuleSetRunner.class);

    /** 폐기(DEPRECATED) 룰이 든 세트를 판정할 때 경고 코드. */
    public static final String RULE_DEPRECATED = "RULE_DEPRECATED";

    static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 저장 전 흐름 기록의 세트 표시 이름(Ruling 10: 호출자가 정한다). */
    static final String UNSAVED = "(저장 전)";

    private final RuleQueries queries;
    private final StoredRuleDefinitions stored;
    private final MdmRuleRepository rules;
    private final MdmRuleSetRepository sets;
    private final MdmEvaluator evaluator;
    private final Clock clock;

    public RuleSetRunner(RuleQueries queries, StoredRuleDefinitions stored, MdmRuleRepository rules, MdmRuleSetRepository sets,
                         MdmEvaluator evaluator, Clock clock) {
        this.queries = queries;
        this.stored = stored;
        this.rules = rules;
        this.sets = sets;
        this.evaluator = evaluator;
        this.clock = clock;
    }

    /** 저장된 세트를 판정한다. 판정 오류는 {@link EngineEvaluationException}. */
    public RuleSetResult run(String setId, Map<String, Object> record, Instant evalTs) {
        return engine().evaluateSet(setId, record, ts(evalTs));
    }

    /**
     * 화면이 보낸 흐름(저장 전 포함)을 기록 실행한다. 흐름·판정 오류로는 던지지 않는다 — 오류는 기록에 담긴다. 흐름 맵이 null 이거나 모양이 깨져
     * 읽지 못하면 노드 없는 기록({@code nodes=[]}, {@code finalValues={}})에 {@code SET_CHECK/FLOW_INVALID} 위반 한 건을 담는다. 저장된 룰 정의 자체가
     * 깨진 경우(행 조립 실패 {@code BusinessException}, AST 읽기 실패 {@code IllegalStateException})는 기록 대상이 아니라 그대로 올라간다.
     */
    public RunTrace trace(Map<String, Object> flow, Map<String, Object> record, Instant evalTs) {
        Instant ts = ts(evalTs);
        FlowDefinition def;
        try {
            def = RuleSetFlowJson.fromMap(flow);
        } catch (IllegalArgumentException e) {
            return new RunTrace(UNSAVED, ts, Collections.unmodifiableMap(new LinkedHashMap<>(record)), List.of(), Map.of(),
                    List.of(new Violation(Stage.SET_CHECK, Code.FLOW_INVALID, null, null, null, "흐름을 읽을 수 없다: " + e.getMessage())));
        }
        RuleSetDefinition set = new RuleSetDefinition(UNSAVED, RuleSetFlowJson.ruleIds(def), SetStatus.INUSE, def);
        return engine().traceSet(set, record, ts);
    }

    /** OASIS serviceTask 입구 — 레코드 JSON·KST 시각 문자열을 받고, 판정 오류를 업무 예외로 바꾼다. */
    public RuleSetRunResult execute(RuleSetRunRequest request) {
        if (request == null || request.getSetId() == null || request.getSetId().isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 세트 ID 는 필수입니다.");
        }
        Map<String, Object> record = request.getRecordJson() == null || request.getRecordJson().isBlank()
                ? Map.of() : RuleCaseJudge.object(request.getRecordJson());
        if (record == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "레코드 JSON 은 객체여야 합니다: " + request.getRecordJson());
        }
        Instant ts = request.getEvalTs() == null || request.getEvalTs().isBlank() ? null : parseKst(request.getEvalTs());
        RuleSetResult r;
        try {
            r = run(request.getSetId(), record, ts);
        } catch (EngineEvaluationException e) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, e.violations().stream()
                    .map(v -> (v.ruleId() == null ? "" : "[" + v.ruleId() + "] ")
                            + RuleErrorText.describe(v.stage().name(), v.code().name(), v.rowId(), v.name(), v.message()))
                    .collect(Collectors.joining("; ")));
        } catch (IllegalArgumentException | IllegalStateException e) {
            // 저장된 FLOW_JSON(코덱)·AST(조립기)를 읽지 못함 — 데이터 손상. 날것으로 내보내지 않고 업무 예외로 감싼다.
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "룰 세트 " + request.getSetId() + " 의 저장된 정의를 읽을 수 없어 판정하지 않습니다 — "
                    + e.getMessage(), List.of());
        }
        RuleSetRunResult out = new RuleSetRunResult();
        out.setSetId(r.setId());
        out.setEvalTs(LocalDateTime.ofInstant(r.evalTs(), MdmClockConfig.KST).format(TS));
        out.setFinalValues(new LinkedHashMap<>(r.finalValues()));
        out.setPath(r.path().stream().map(p -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("nodeId", p.nodeId());
            m.put("kind", p.kind().name());
            m.put("chosenEdgeId", p.chosenEdgeId());
            m.put("stepIndex", p.stepIndex());
            return m;
        }).toList());
        out.setWarnings(warnings(request.getSetId(), r));
        return out;
    }

    /**
     * 응답 경고 — 폐기 룰 경고(세트 흐름에서 룰 ID 가 처음 나온 순서) 다음에 엔진 경고(세트 경고, 이어서 실행한 룰의 경고를 실행 순서로).
     * 폐기 룰이라도 판정은 막지 않는다(효력 시각이 없어 과거 시각 재판정까지 깨지므로). 룰 헤더는 한 번에 읽는다.
     */
    private List<Map<String, Object>> warnings(String setId, RuleSetResult r) {
        List<Map<String, Object>> out = new ArrayList<>();
        List<String> ids = sets.findById(setId).map(RuleSetRunner::ruleIdsOf).orElse(List.of());
        Map<String, MdmRule> byId = new LinkedHashMap<>();
        rules.findAllById(ids).forEach(x -> byId.put(x.getMaruRuleId(), x));
        List<String> deprecated = ids.stream().filter(id -> byId.get(id) != null && "DEPRECATED".equals(byId.get(id).getStatus())).toList();
        for (String id : deprecated) {
            out.add(warning(RULE_DEPRECATED, id, id + "는 폐기된 룰이지만 판정 시각에 유효한 RELEASED 버전으로 판정했다"));
        }
        if (!deprecated.isEmpty()) {
            log.warn("폐기된 룰이 든 세트를 판정했다 setId={} ruleIds={}", setId, deprecated);
        }
        List<EngineWarning> engine = new ArrayList<>(r.warnings());
        r.steps().forEach(s -> engine.addAll(s.warnings()));
        for (EngineWarning w : engine) {
            out.add(warning(w.code().name(), w.ruleId(), w.message()));
        }
        return out;
    }

    private static Map<String, Object> warning(String code, String ruleId, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", code);
        m.put("ruleId", ruleId);
        m.put("message", message);
        return m;
    }

    private static List<String> ruleIdsOf(MdmRuleSet s) {
        if (s.getFlowJson() != null) {
            return RuleSetFlowJson.ruleIds(RuleSetFlowJson.parse(s.getFlowJson()));
        }
        return DomainJson.readList(s.getRuleIds()).stream().map(String::valueOf).distinct().toList();
    }

    private MdmRuleEngine engine() {
        return new MdmRuleEngine(evaluator, new StoredDefinitionLookup(queries, stored, rules, sets));
    }

    private Instant ts(Instant evalTs) {
        return (evalTs == null ? clock.instant() : evalTs).truncatedTo(ChronoUnit.SECONDS);
    }

    private static Instant parseKst(String text) {
        try {
            return LocalDateTime.parse(text, TS).atZone(MdmClockConfig.KST).toInstant();
        } catch (DateTimeParseException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "판정 시각은 yyyy-MM-dd HH:mm:ss 여야 합니다: " + text);
        }
    }
}
