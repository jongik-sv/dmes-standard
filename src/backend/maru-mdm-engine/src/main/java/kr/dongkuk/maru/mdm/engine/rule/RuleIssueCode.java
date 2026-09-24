package kr.dongkuk.maru.mdm.engine.rule;

/** 분석 이슈 코드 — TS {@code RuleIssueCode} 와 같은 이름·순서(TSK-08-02 design §2.1-E). */
public enum RuleIssueCode {
    ALL_NA_ROW,
    UNRESOLVED_CELL,
    OVERLAP,
    OVERLAP_UNRESOLVED,
    UNREACHABLE,
    VALUE_GAP,
    NULL_GAP
}
