package com.dongkuk.dmes.mdm.common.rule.check;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput.DraftRow;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.rule.RuleIssueCode;

/**
 * {@link RuleSaveValidator} 결과(TSK-08-04 design §2.2·§6.2). 이슈 맵은 화면 {@code RuleIssueView} 와 같은 모양
 * {@code {code, severity, rowIds, varId?, message}} 이고, 값이 없는 칸은 싣지 않는다({@code RuleIssueMaps} 와 같다).
 *
 * <p>{@code issues} 에는 분석기 이슈(코드가 {@link RuleIssueCode} 이름)도 섞여 있다 — 거부 판단에 분석기 ERROR 가 들어가기 때문이다.
 * 응답에 분석 이슈를 따로 싣는 호출자는 {@link #nonAnalysisIssues()} 를 쓴다.
 *
 * @param normalizedRows 정규화한 행(입력 순서 그대로). 거부 대상이 아니면 호출자는 이 셀을 저장한다
 */
public record RuleCheckReport(List<DraftRow> normalizedRows, List<Map<String, Object>> issues) {

    public static final String ERROR = "ERROR";
    public static final String WARNING = "WARNING";

    private static final Set<String> ANALYSIS_CODES =
            Arrays.stream(RuleIssueCode.values()).map(Enum::name).collect(Collectors.toUnmodifiableSet());

    public boolean hasErrors() {
        return issues.stream().anyMatch(RuleCheckReport::isError);
    }

    public List<Map<String, Object>> errors() {
        return issues.stream().filter(RuleCheckReport::isError).toList();
    }

    /** ERROR 이슈가 가리키는 행 — 값 테스트 BODY 가 판정에서 뺀다(I22). */
    public Set<Integer> brokenRowIds() {
        Set<Integer> out = new LinkedHashSet<>();
        for (Map<String, Object> issue : errors()) {
            if (issue.get("rowIds") instanceof List<?> ids) {
                ids.forEach(id -> out.add((Integer) id));
            }
        }
        return out;
    }

    /** 분석기 코드가 아닌 이슈(저장 시 검사가 더한 것). */
    public List<Map<String, Object>> nonAnalysisIssues() {
        return issues.stream().filter(i -> !ANALYSIS_CODES.contains(String.valueOf(i.get("code")))).toList();
    }

    public static boolean isError(Map<String, Object> issue) {
        return ERROR.equals(issue.get("severity"));
    }

    /** 이슈 맵 하나. {@code varId} 가 null 이면 싣지 않는다. */
    public static Map<String, Object> issue(String code, String severity, List<Integer> rowIds, Integer varId, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", code);
        m.put("severity", severity);
        m.put("rowIds", List.copyOf(rowIds));
        if (varId != null) {
            m.put("varId", varId);
        }
        m.put("message", message);
        return m;
    }

    /** 셀 이슈 — message 앞에 "행 {row_id}·{열 라벨}: " 를 붙인다(§6.2). */
    public static Map<String, Object> cellIssue(RuleSaveIssueCode code, String severity, int rowId, ResolvedVar var, String message) {
        return issue(code.name(), severity, List.of(rowId), var.varId(), where(rowId, var) + ": " + message);
    }

    /** "행 3·코일 두께", 새 행은 "새 행 -1·코일 두께"(design §7.4). 라벨이 비면 변수명, 식 변수는 {@code _V<var_id>}. */
    public static String where(int rowId, ResolvedVar var) {
        return rowLabel(rowId) + "·" + label(var);
    }

    public static String rowLabel(int rowId) {
        return rowId < 0 ? "새 행 " + rowId : "행 " + rowId;
    }

    public static String label(ResolvedVar var) {
        if (var.label() != null && !var.label().isBlank()) {
            return var.label();
        }
        if (var.exprVar() || var.varName() == null) {
            return "_V" + var.varId();
        }
        return var.varName();
    }
}
