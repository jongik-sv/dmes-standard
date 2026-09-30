package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;

/**
 * 룰 판정·정의 조회 입구(06-business-rule.md:394-430 엔진 골격, 06:473-498 정의 조회 입구).
 *
 * <p>{@code evalTs} 는 필수다. 엔진은 시계를 읽지 않는다. 원천의 "주지 않으면 현재 시각"(06:401·422)은
 * 엔진을 부르는 서버 API 층이 채운다(TSK-02-02 design §6.2 이탈 1). 엔진은 초 미만을 잘라 {@code EVAL_TS} 로 ctx 에 넣는다.
 *
 * <p>레코드 값은 {@code BigDecimal}·{@code String}·{@code Boolean}·null(또는 변환 가능한 Number·String)이고,
 * 엔진이 입력 계약의 데이터 타입으로 바꾼다(06:198 엔진 계약 2). 키는 표준 물리명 그대로다(EvalEx 변수 조회는 대소문자를 가리지 않는다, evalex-guide §1).
 */
public interface RuleEngine {

    /** 룰 하나 판정. 판정 오류는 {@code EngineEvaluationException}. */
    RuleResult evaluate(String ruleId, Map<String, Object> record, Instant evalTs);

    /**
     * 룰 세트 판정 — 세트 흐름(IF·병렬, flow 가 null 이면 ruleIds 한 줄)대로 실행한다. 세트 입력 키(06:420)는 첫 룰 전에 반드시
     * 실행되는 부분을 한꺼번에, IF 갈래에 들어갈 때 그 갈래를, IF 일부 갈래에서만 만든 이름은 읽는 룰 실행 직전에 본다.
     * 폐기 세트는 판정 오류(06:419).
     */
    RuleSetResult evaluateSet(String setId, Map<String, Object> record, Instant evalTs);

    /**
     * 세트 실행 기록(룰 세트 흐름도 spec §4.2). 저장된 ID 가 아니라 정의를 받으므로 저장하지 않은 흐름도 실행한다.
     * 판정 오류를 던지지 않고 기록에 담는다. 운영 경로({@link #evaluateSet})는 기록을 모으지 않는다.
     */
    RunTrace traceSet(RuleSetDefinition set, Map<String, Object> record, Instant evalTs);

    /**
     * 고친 값을 끼워 처음부터 다시 실행한 기록(4단계 spec §2.2, E4). {@code edits} 가 비면 3인자와 같다. 받은 고친 값은 {@link RunTrace#edits}
     * 로 되돌려 준다(비었으면 null). 고친 값 자리가 어긋나거나, 실행이 오류 없이 끝났는데 쓰이지 않은 고친 값이 남으면 {@code EDIT_POINT_MISMATCH}
     * 위반을 기록에 담는다. 운영 경로({@link #evaluateSet})는 고친 값을 받지 않는다.
     */
    RunTrace traceSet(RuleSetDefinition set, Map<String, Object> record, Instant evalTs, List<RunTrace.TraceEdit> edits);

    /** 정의 조회(06:480). 계산하지 않고 스냅샷의 것을 꺼낸다. */
    RuleView view(String ruleId, Instant evalTs, EnumSet<Part> parts);

    /** 세트 안 룰마다 차례로(06:483). */
    List<RuleView> setView(String setId, Instant evalTs, EnumSet<Part> parts);

    default RuleView text(String ruleId, Instant evalTs) {
        return view(ruleId, evalTs, EnumSet.of(Part.TEXT));
    }

    default RuleView textAndAst(String ruleId, Instant evalTs) {
        return view(ruleId, evalTs, EnumSet.of(Part.TEXT, Part.AST));
    }

    enum Part { TEXT, AST, CONTRACT }
}
