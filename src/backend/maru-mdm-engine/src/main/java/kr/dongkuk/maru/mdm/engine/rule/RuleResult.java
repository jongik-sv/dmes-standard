package kr.dongkuk.maru.mdm.engine.rule;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 룰 하나의 판정 결과(06-business-rule.md:92 적중 행 번호 반환, 06:69 그룹별 고른 열, 06:319 첫 거짓 셀,
 * 06:200·425 경고).
 *
 * @param hits           적중 행. FIRST·UNIQUE 는 0-1개, PRIORITY·COLLECT·ANY 는 적중한 행 전부(06:216). DERIVE 는 행 하나
 * @param defaultApplied 적중이 없어 기본 행을 썼는가(기본 행이 없으면 false 이고 결과 변수는 NULL, 06:31)
 * @param results        결과 변수 → 값(BigDecimal·String·Boolean·null, COLLECT LIST 면 List). 키는 있고 값이 null 일 수 있다
 * @param trace          평가한 행마다 적중 여부와 첫 거짓 셀. FIRST 는 적중 행 뒤를 평가하지 않는다(evaluated=false)
 */
public record RuleResult(
        String ruleId,
        BigDecimal ver,
        Instant evalTs,
        List<Hit> hits,
        boolean defaultApplied,
        Map<String, Object> results,
        List<RowTrace> trace,
        List<EngineWarning> warnings) {

    /**
     * @param groupChoices res_grp → 고른 열의 var_id. 고른 열이 없으면(참인 열도 기본 열도 없음) 값이 null(06:69)
     */
    public record Hit(int rowId, int seq, Map<String, Integer> groupChoices) {}

    /**
     * @param firstFalseVarId 거짓이 된 첫 조건 셀의 var_id(열 seq 순). 적중·미평가 행은 null
     */
    public record RowTrace(int rowId, int seq, boolean evaluated, boolean hit, @Nullable Integer firstFalseVarId) {}
}
