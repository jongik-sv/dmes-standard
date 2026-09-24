package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.dmb.layout.LayoutFillKinds.Field;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 등록 검증 표 7행(TSK-05-03 design.md §6.2, html 등록 검증 표 — 불변 I12). 행 = 03:38 거부 조건 원문 순서. 코드 배정: #1 L01, #2 L12,
 * #3 L13, #4 L14, #5 L02(FILLER 가 아닌 항목의 {@code FILLER_LENGTH} 만), #6 L05, #7 L15. 나머지 이슈는 {@code otherIssues}.
 * {@code passed} 는 이슈(경고 제외)가 하나도 없을 때 참이다 — 저장이 거부하지 않는다는 뜻이다.
 */
public final class LayoutCheckTable {

    public static final String PASS = "PASS";
    public static final String FAIL = "FAIL";
    public static final String WARN = "WARN";

    /** 03:38 원문 7문장(F1). */
    public static final List<String> CONDITIONS = List.of("본문 항목의 컬럼이 컬럼 사전에 없음", "CONST 값이 도메인 유효 식 위반",
            "전송 단위의 차원 불일치", "숫자 표현 자리 부족", "FILLER 가 아닌 항목에 길이 직접 입력", "trans_unit 과 unit_item 동시 입력",
            "unit_item 이 같은 레이아웃의 항목을 가리키지 않음");

    private static final List<LayoutIssueCode> CODES = List.of(LayoutIssueCode.L01, LayoutIssueCode.L12, LayoutIssueCode.L13,
            LayoutIssueCode.L14, LayoutIssueCode.L02, LayoutIssueCode.L05, LayoutIssueCode.L15);

    public record Result(List<Map<String, Object>> checks, List<Map<String, Object>> otherIssues, boolean passed) {
    }

    private LayoutCheckTable() {
    }

    /** 이슈가 걸리는 표 행(1~7), 표 밖이면 0. */
    public static int row(LayoutIssue issue) {
        if (issue.code() == LayoutIssueCode.L02) {
            return Field.FILLER_LENGTH.key().equals(issue.field()) ? 5 : 0;
        }
        return CODES.indexOf(issue.code()) + 1;
    }

    public static Result build(List<LayoutIssue> issues, List<LayoutIssue> warnings) {
        List<Map<String, Object>> checks = new ArrayList<>();
        for (int i = 0; i < CONDITIONS.size(); i++) {
            int no = i + 1;
            List<String> fails = issues.stream().filter(x -> row(x) == no).map(LayoutIssue::summary).toList();
            List<String> warns = warnings.stream().filter(x -> row(x) == no).map(LayoutIssue::summary).toList();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("NO", no);
            row.put("CONDITION", CONDITIONS.get(i));
            row.put("CODE", CODES.get(i).name());
            row.put("RESULT", !fails.isEmpty() ? FAIL : !warns.isEmpty() ? WARN : PASS);
            List<String> messages = new ArrayList<>(fails);
            messages.addAll(warns);
            row.put("MESSAGES", messages);
            checks.add(row);
        }
        List<Map<String, Object>> other = new ArrayList<>();
        for (LayoutIssue x : issues) {
            if (row(x) == 0) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("CODE", x.code().name());
                m.put("SEQ", x.seq());
                m.put("FIELD", x.field());
                m.put("MESSAGE", x.message());
                other.add(m);
            }
        }
        return new Result(checks, other, issues.isEmpty());
    }
}
