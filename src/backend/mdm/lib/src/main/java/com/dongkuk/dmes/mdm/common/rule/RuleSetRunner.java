package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionException;
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
import java.util.HashMap;
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
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
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
 * 룰 세트 실행(spec §6.2, ADR 0005) — OASIS 업무 서비스와 룰 세트 편집 화면 디버거가 부른다. 호출마다(한 요청에서 여러 번 실행하면
 * {@link #session} 하나에) {@link StoredDefinitionLookup}(빈 아님)과 {@link MdmRuleEngine} 을 만들고 공유 {@link MdmEvaluator} 빈을 넘겨 컴파일
 * 캐시를 같이 쓴다. 판정 시각이 없으면 서비스 시계(KST)로 채운다
 * (엔진은 시계를 읽지 않는다, decisions.md:161).
 *
 * <p>OASIS BPMN 은 {@code camunda:class="ruleSetRunner"} + {@code method=execute} serviceTask 하나로 부른다. 판정 오류는 {@link #run} 에서
 * {@link EngineEvaluationException} 으로 올라가고, {@link #execute} 는 {@link RuleErrorText} 문구(룰이 있으면 앞에 {@code [ruleId] })로 바꾼
 * 업무 예외를 던진다. 저장 데이터 손상(행 조립 실패·FLOW_JSON·AST 읽기 실패, {@link StoredDefinitionException})은 {@link #execute} 에서 MDM026 이다.
 * 받는 노드로 받은 실패는 던지지 않고 {@code RuleSetRunResult.endedBy}·{@code caught} 로 싣는다.
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
     * 화면이 보낸 흐름 JSON(저장 전 포함)을 기록 실행한다. 흐름·판정 오류로는 던지지 않는다 — 오류는 기록에 담긴다. 흐름 JSON 이 null 이거나 코덱이
     * 읽지 못하면({@link RuleSetFlowJson#parse}) 노드 없는 기록({@code nodes=[]}, {@code finalValues={}})에 {@code SET_CHECK/FLOW_INVALID} 위반 한 건을
     * 담는다. 레코드가 null 이면 {@code REQUIRED_VALUE}. 저장된 룰 정의 자체가 깨진 경우는 기록 대상이 아니라 {@link StoredDefinitionException} 으로
     * 올라간다(P-D9). 판정 시각이 null 이면 서비스 시계.
     */
    public RunTrace trace(String flowJson, Map<String, Object> record, Instant evalTs) {
        return trace(flowJson, record, evalTs, List.of());
    }

    /** 4단계 E4 — 고친 값을 끼워 기록 실행한다. 흐름을 읽지 못한 기록에도 받은 고친 값을 되돌려 준다(비었으면 null). */
    public RunTrace trace(String flowJson, Map<String, Object> record, Instant evalTs, List<RunTrace.TraceEdit> edits) {
        return session().trace(flowJson, record, evalTs, edits);
    }

    /**
     * 한 요청 안에서 기록 실행을 여러 번 하거나(테스트 케이스 일괄 실행) 기록 실행 뒤 폐기 룰 경고를 만들 때 쓰는 실행 묶음. 룰 정의 조회기
     * ({@link StoredDefinitionLookup}) 하나를 같이 써 같은 룰 정의를 다시 읽지 않는다. 판정 시각은 호출마다 따로 정하고, 조회기는 판정 시각마다
     * 그 시각의 RELEASED 버전을 고르므로 결과는 호출마다 새로 실행한 것과 같다. 요청을 넘겨 들고 있지 않는다(원장을 고치는 요청에서 쓰지 않는다).
     */
    public Session session() {
        return new Session(new StoredDefinitionLookup(queries, stored, rules, sets));
    }

    /** {@link #session} 이 돌려주는 실행 묶음 — 정의 조회기·엔진과 흐름 JSON 파싱 결과를 같이 쓴다. */
    public final class Session {
        private final StoredDefinitionLookup lookup;
        private final MdmRuleEngine engine;
        private final Map<String, Object> flows = new HashMap<>();             // 흐름 JSON → Parsed 또는 읽지 못한 IllegalArgumentException

        private Session(StoredDefinitionLookup lookup) {
            this.lookup = lookup;
            this.engine = new MdmRuleEngine(evaluator, lookup);
        }

        /** {@link RuleSetRunner#trace(String, Map, Instant)} 와 같다. */
        public RunTrace trace(String flowJson, Map<String, Object> record, Instant evalTs) {
            return trace(flowJson, record, evalTs, List.of());
        }

        /** {@link RuleSetRunner#trace(String, Map, Instant, List)} 와 같다. */
        public RunTrace trace(String flowJson, Map<String, Object> record, Instant evalTs, List<RunTrace.TraceEdit> edits) {
            if (record == null) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, "레코드는 필수입니다.");
            }
            Instant ts = ts(evalTs);
            List<RunTrace.TraceEdit> echo = edits.isEmpty() ? null : List.copyOf(edits);
            Object known = parsed(flowJson);
            if (known instanceof IllegalArgumentException e) {
                return new RunTrace(UNSAVED, ts, Collections.unmodifiableMap(new LinkedHashMap<>(record)), List.of(), Map.of(),
                        List.of(new Violation(Stage.SET_CHECK, Code.FLOW_INVALID, null, null, null, "흐름을 읽을 수 없다: " + e.getMessage())), echo, null);
            }
            Parsed flow = (Parsed) known;
            if (flow.parse().tree() != null) {
                // 엔진은 구조가 올바른 흐름에서만 트리의 룰 정의를 차례로 묻는다 — 그 룰들을 미리 한 번에 읽어 둔다(구조 오류면 묻지 않으니 읽지 않는다).
                lookup.prefetch(flow.parse().tree().ruleIds(), ts);
            }
            RuleSetDefinition set = new RuleSetDefinition(UNSAVED, flow.ruleIds(), SetStatus.INUSE, flow.def());
            return engine.traceSet(set, record, ts, edits);
        }

        /** 흐름의 룰 ID({@link RuleSetFlowJson#ruleIds}). 흐름을 읽지 못하면 {@link IllegalArgumentException}. */
        public List<String> ruleIds(String flowJson) {
            Object known = parsed(flowJson);
            if (known instanceof IllegalArgumentException e) {
                throw e;
            }
            return ((Parsed) known).ruleIds();
        }

        /** {@link RuleSetRunner#deprecatedWarnings(List)} 와 같되 판정 때 읽은 룰 헤더를 다시 읽지 않는다. */
        public List<Map<String, Object>> deprecatedWarnings(List<String> ruleIds) {
            return RuleSetRunner.deprecatedWarnings(ruleIds, lookup.headers(ruleIds));
        }

        /**
         * 흐름 JSON → {@link Parsed}, 코덱이 읽지 못하면 그 {@link IllegalArgumentException}(던지지 않고 돌려준다). 같은 문자열은 한 번만 읽는다.
         * 정의는 불변이다.
         */
        private Object parsed(String flowJson) {
            Object known = flows.get(flowJson);
            if (known == null) {
                FlowDefinition def = null;
                try {
                    def = RuleSetFlowJson.parse(flowJson);
                } catch (IllegalArgumentException e) {
                    known = e;
                }
                if (def != null) {
                    // 구조 파싱은 코덱 바깥 — 예전처럼 여기서 난 예외는 FLOW_INVALID 기록으로 바꾸지 않는다.
                    FlowParse parse = FlowParser.parse(def);
                    known = new Parsed(def, parse, RuleSetFlowJson.ruleIds(def, parse));
                }
                if (flowJson != null) {
                    flows.put(flowJson, known);
                }
            }
            return known;
        }
    }

    /** 읽은 흐름 — 정의, 엔진과 같은 구조 파싱 결과, 룰 ID({@link RuleSetFlowJson#ruleIds}). */
    private record Parsed(FlowDefinition def, FlowParse parse, List<String> ruleIds) {
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
        } catch (StoredDefinitionException e) {
            // 저장된 행·FLOW_JSON(코덱)·AST(조립기)를 읽지 못함 — 데이터 손상(P-D9). 엔진 안의 IAE·ISE 는 여기서 잡지 않는다.
            throw MdmErrors.of(MdmErrorCode.STORED_DEFINITION_CORRUPT, "룰 세트 " + request.getSetId() + " 의 저장된 정의를 읽을 수 없어 판정하지 않습니다 — "
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
        out.setEndedBy(r.endedBy());
        out.setCaught(r.caught().stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ruleNodeId", c.ruleNodeId());
            m.put("ruleId", c.ruleId());
            m.put("catchNodeId", c.catchNodeId());
            m.put("kind", c.kind().name());
            m.put("code", c.code());
            m.put("message", c.message());
            return m;
        }).toList());
        return out;
    }

    /**
     * 응답 경고 — 폐기 룰 경고(세트 흐름에서 룰 ID 가 처음 나온 순서) 다음에 엔진 경고(세트 경고, 이어서 실행한 룰의 경고를 실행 순서로).
     * 폐기 룰이라도 판정은 막지 않는다(효력 시각이 없어 과거 시각 재판정까지 깨지므로). 룰 헤더는 한 번에 읽는다.
     */
    private List<Map<String, Object>> warnings(String setId, RuleSetResult r) {
        List<String> ids = sets.findById(setId).map(RuleSetRunner::ruleIdsOf).orElse(List.of());
        List<Map<String, Object>> out = new ArrayList<>(deprecatedWarnings(ids));
        if (!out.isEmpty()) {
            log.warn("폐기된 룰이 든 세트를 판정했다 setId={} ruleIds={}", setId, out.stream().map(w -> w.get("ruleId")).toList());
        }
        List<EngineWarning> engine = new ArrayList<>(r.warnings());
        r.steps().forEach(s -> engine.addAll(s.warnings()));
        for (EngineWarning w : engine) {
            out.add(warning(w.code().name(), w.ruleId(), w.message()));
        }
        return out;
    }

    /** 룰 헤더를 한 번에 읽어 {@link #deprecatedWarnings(List, Map)} 를 만든다(저장 세트 {@link #execute}·저장 전 흐름 기록 실행이 같이 쓴다). */
    public List<Map<String, Object>> deprecatedWarnings(List<String> ruleIds) {
        Map<String, MdmRule> byId = new LinkedHashMap<>();
        rules.findAllById(ruleIds).forEach(x -> byId.put(x.getMaruRuleId(), x));
        return deprecatedWarnings(ruleIds, byId);
    }

    /**
     * 폐기 룰 경고(D-110, P5) — 룰 ID 가 흐름에서 처음 나온 순서대로, 상태가 DEPRECATED 인 룰마다 {@code RULE_DEPRECATED} 한 건. 같은 ID 가 두 번
     * 있어도 한 건이다. 탄 갈래와 무관하다.
     */
    public static List<Map<String, Object>> deprecatedWarnings(List<String> ruleIds, Map<String, MdmRule> byId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String id : ruleIds.stream().distinct().toList()) {
            MdmRule rule = byId.get(id);
            if (rule != null && "DEPRECATED".equals(rule.getStatus())) {
                out.add(warning(RULE_DEPRECATED, id, id + "는 폐기된 룰이지만 판정 시각에 유효한 RELEASED 버전으로 판정했다"));
            }
        }
        return out;
    }

    /** 응답 경고 한 건 {@code {code, ruleId, message}}(D-110 모양). */
    public static Map<String, Object> warning(String code, String ruleId, String message) {
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

    /** KST {@code yyyy-MM-dd HH:mm:ss} → 시각. 형식 오류는 INVALID_VALUE. */
    public static Instant parseKst(String text) {
        try {
            return LocalDateTime.parse(text, TS).atZone(MdmClockConfig.KST).toInstant();
        } catch (DateTimeParseException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "판정 시각은 yyyy-MM-dd HH:mm:ss 여야 합니다: " + text);
        }
    }
}
