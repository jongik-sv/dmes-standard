package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunResult;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.springframework.stereotype.Service;

/**
 * 룰 세트 실행(spec §6.2, ADR 0005) — OASIS 업무 서비스와 룰 세트 편집 화면 디버거가 부른다. 호출마다 {@link StoredDefinitionLookup}(빈 아님)과
 * {@link MdmRuleEngine} 을 만들고 공유 {@link MdmEvaluator} 빈을 넘겨 컴파일 캐시를 같이 쓴다. 판정 시각이 없으면 서비스 시계(KST)로 채운다
 * (엔진은 시계를 읽지 않는다, decisions.md:161).
 *
 * <p>OASIS BPMN 은 {@code camunda:class="ruleSetRunner"} + {@code method=execute} serviceTask 하나로 부른다. 판정 오류는 {@link #run} 에서
 * {@link EngineEvaluationException} 으로 올라가고, {@link #execute} 는 {@link RuleErrorText} 문구로 바꾼 업무 예외를 던진다.
 * {@code @Transactional} 을 붙이지 않는다 — OASIS 파라미터 이름 바인딩이 깨진다(읽기만 한다).
 */
@Service("ruleSetRunner")
public class RuleSetRunner {

    static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

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

    /** 화면이 보낸 흐름(저장 전 포함)을 기록 실행한다. 던지지 않는다 — 오류는 기록에 담긴다. */
    public RunTrace trace(Map<String, Object> flow, Map<String, Object> record, Instant evalTs) {
        FlowDefinition def = RuleSetFlowJson.fromMap(flow);
        RuleSetDefinition set = new RuleSetDefinition("(저장 전)", RuleSetFlowJson.ruleIds(def), SetStatus.INUSE, def);
        return engine().traceSet(set, record, ts(evalTs));
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
                    .map(v -> RuleErrorText.describe(v.stage().name(), v.code().name(), v.rowId(), v.name(), v.message()))
                    .collect(Collectors.joining("; ")));
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
        return out;
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
