package kr.dongkuk.maru.mdm.engine.rule;

import java.util.List;

/**
 * 분석 이슈 — TS {@code RuleIssue}(m-mdm {@code src/evalex/rule-analysis.ts}) 대응. 비교 대상은 message 를 뺀 여섯 칸이다
 * (TSK-08-02 design I14·I15).
 *
 * @param rowIds 관련 행 번호. NULL_GAP 은 빈 목록
 * @param varId  열 단위 이슈(UNRESOLVED_CELL·VALUE_GAP·NULL_GAP)만 채운다
 * @param lower  VALUE_GAP 의 빈틈 아래 끝(격자 자리수 평문)
 * @param upper  VALUE_GAP 의 빈틈 위 끝(격자 자리수 평문)
 */
public record RuleIssue(
        RuleIssueCode code, Severity severity, List<Integer> rowIds, Integer varId, String lower, String upper, String message) {

    public enum Severity { ERROR, WARNING }
}
