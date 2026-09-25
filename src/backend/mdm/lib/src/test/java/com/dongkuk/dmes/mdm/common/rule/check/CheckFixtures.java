package com.dongkuk.dmes.mdm.common.rule.check;

import com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures;
import com.dongkuk.dmes.mdm.common.engine.MdmEngineConfig;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput.DraftRow;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;

/** 검사기 순수 테스트 픽스처 — 변수·셀·행 만들기. 평가기는 비즈니스 함수 THK_OK 하나가 있는 테스트 평가기다. */
final class CheckFixtures {

    static final MdmEvaluator EVALUATOR = new MdmEvaluator(MdmEngineConfig.lookups(null, null, DomainFixtures.THK_OK));
    static final ExpressionChecker CHECKER = new ExpressionChecker(EVALUATOR);

    private CheckFixtures() {
    }

    static ResolvedVar cond(int id, String disp, String name, String dataType) {
        return new ResolvedVar(id, "COND", disp, id, name, false, null, dataType, null, false, null, null, null, "COLUMN", null);
    }

    /** 일자 String(YYYYMMDD) 도메인 변수. */
    static ResolvedVar date(int id, String disp, String name) {
        return new ResolvedVar(id, "COND", disp, id, name, false, null, "STRING", null, true, null, 1L, "일자", "COLUMN", null);
    }

    /** 코드 도메인 변수(마루 코드 {@code maruCodeId}). */
    static ResolvedVar code(int id, String disp, String name, String maruCodeId) {
        return new ResolvedVar(id, "COND", disp, id, name, false, null, "STRING", null, false, maruCodeId, 2L, "코드", "COLUMN", null);
    }

    /** Expression 조건 열(이름 없음). */
    static ResolvedVar exprColumn(int id, String label) {
        return new ResolvedVar(id, "COND", "Expression", id, null, false, label, "STRING", null, false, null, null, null, "EXPRESSION_COLUMN", null);
    }

    static ResolvedVar result(int id, int seq, String disp, String name, String dataType) {
        return new ResolvedVar(id, "RESULT", disp, seq, name, false, null, dataType, null, false, null, null, null, "DECLARED", null);
    }

    static Map<String, Object> cell(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    static Map<String, Object> op(String op, String left) {
        return cell("op", op, "left", left);
    }

    static Map<String, Object> range(String op, String left, String right) {
        return cell("op", op, "left", left, "right", right);
    }

    static Map<String, Object> list(String op, String... values) {
        return cell("op", op, "list", List.of(values));
    }

    static Map<String, Object> na() {
        return cell("op", "NA");
    }

    static Map<String, Object> val(String value) {
        return cell("val", value);
    }

    static Map<String, Object> expr(String text) {
        return cell("expr", text);
    }

    @SafeVarargs
    static DraftRow row(int rowId, int seq, String kind, Map.Entry<Integer, Map<String, Object>>... cells) {
        Map<Integer, Map<String, Object>> m = new LinkedHashMap<>();
        for (Map.Entry<Integer, Map<String, Object>> e : cells) {
            m.put(e.getKey(), e.getValue());
        }
        return new DraftRow(rowId, seq, kind, m);
    }

    static Map.Entry<Integer, Map<String, Object>> at(int varId, Map<String, Object> cell) {
        return Map.entry(varId, cell);
    }

    static List<String> codes(List<RuleCellRules.Problem> problems) {
        return problems.stream().map(p -> p.code().name()).toList();
    }

    static List<String> issueCodes(List<Map<String, Object>> issues) {
        return issues.stream().map(i -> (String) i.get("code")).toList();
    }
}
