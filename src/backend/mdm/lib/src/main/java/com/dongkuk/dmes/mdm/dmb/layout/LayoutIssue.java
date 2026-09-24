package com.dongkuk.dmes.mdm.dmb.layout;

/**
 * 거부 이슈 한 건(TSK-05-02 design.md §6.2).
 *
 * @param seq   항목·헤더 행 순번(행과 무관하면 null)
 * @param field 행 키 이름(UPPER_SNAKE, 예 {@code DEFAULT_VALUE})
 */
public record LayoutIssue(LayoutIssueCode code, Integer seq, String field, String message) {

    public static LayoutIssue of(LayoutIssueCode code, Integer seq, String field, String message) {
        return new LayoutIssue(code, seq, field, message);
    }

    /** {@code L01[3] 컬럼 사전에 없는 컬럼이다: NOPE_X} */
    public String summary() {
        return code.name() + (seq == null ? "" : "[" + seq + "]") + " " + message;
    }
}
