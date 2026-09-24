package com.dongkuk.dmes.mdm.dma.domainMng.service;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.ezylang.evalex.parser.ParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker.Problem;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.springframework.stereotype.Component;

/**
 * 식 칸 검사와 AST 내보내기(TSK-04-03 design.md §2·§3.2). 판정은 엔진 {@link ExpressionChecker} 가 하고 여기서는 문제 종류를
 * 이슈 코드로 옮긴다 — PARSE→R01, FUNCTION→R02, VARIABLE→R04, RESERVED·MDM_ARGUMENT·REGEX→S05.
 *
 * <p>표준 칸 추가 제한(D3): 화면 평가기가 평가하지 못하는 {@code MASTER_AT} 와 attr 모양 {@code MASTER}(인자 4개)는 R02 다.
 * AST 는 자기 텍스트의 {@link AstExporter#export} 를 JSON 으로 쓴다(불변 I2).
 */
@Component
public class DomainExpressionCompiler {

    private final ExpressionChecker checker;
    private final MdmEvaluator evaluator;

    public DomainExpressionCompiler(ExpressionChecker checker, MdmEvaluator evaluator) {
        this.checker = checker;
        this.evaluator = evaluator;
    }

    /** null·공백 식은 검사하지 않는다. */
    public List<DomainIssue> check(String text, Slot slot, String field) {
        List<DomainIssue> out = new ArrayList<>();
        if (text == null || text.isBlank()) {
            return out;
        }
        for (Problem p : checker.check(text, slot)) {
            out.add(DomainIssue.of(codeOf(p.kind()), field, p.detail()));
        }
        if (slot == Slot.DOMAIN_STD) {
            Map<String, Object> ast = ast(text);
            if (ast != null) {
                standardSlotLimits(ast, field, out);
            }
        }
        return out;
    }

    /** 파싱되면 AST Map, 아니면(또는 null·공백) null. */
    public Map<String, Object> ast(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return AstExporter.export(text, evaluator.configuration());
        } catch (ParseException e) {
            return null;
        }
    }

    public String astJson(String text) {
        return DomainJson.write(ast(text));
    }

    /** 식이 쓰는 변수(파싱 실패면 빈 집합). */
    public Set<String> usedVariables(String text) {
        if (ast(text) == null) {
            return Set.of();
        }
        return evaluator.usedVariables(text);
    }

    private static DomainIssueCode codeOf(String kind) {
        return switch (kind) {
            case ExpressionChecker.PARSE -> DomainIssueCode.R01;
            case ExpressionChecker.FUNCTION -> DomainIssueCode.R02;
            case ExpressionChecker.VARIABLE -> DomainIssueCode.R04;
            default -> DomainIssueCode.S05;
        };
    }

    @SuppressWarnings("unchecked")
    private static void standardSlotLimits(Map<String, Object> node, String field, List<DomainIssue> out) {
        if ("FUNCTION".equals(node.get("type"))) {
            String name = String.valueOf(node.get("value")).toUpperCase(Locale.ROOT);
            List<?> params = node.get("params") instanceof List<?> l ? l : List.of();
            if (name.equals("MASTER_AT")) {
                out.add(DomainIssue.of(DomainIssueCode.R02, field, "표준 칸에서는 MASTER_AT 을 쓸 수 없다(화면 판정 불가)"));
            } else if (name.equals("MASTER") && params.size() > 3) {
                out.add(DomainIssue.of(DomainIssueCode.R02, field, "표준 칸에서는 attr 모양 MASTER 를 쓸 수 없다(화면 판정 불가)"));
            }
        }
        if (node.get("params") instanceof List<?> children) {
            for (Object c : children) {
                if (c instanceof Map<?, ?> m) {
                    standardSlotLimits((Map<String, Object>) m, field, out);
                }
            }
        }
    }
}
