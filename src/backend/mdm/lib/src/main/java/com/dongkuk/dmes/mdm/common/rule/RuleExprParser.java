package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleExprParseResult;
import com.ezylang.evalex.parser.ParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker.Problem;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.springframework.stereotype.Component;

/**
 * 식 입력 칸 파싱(서버 EvalEx 단일 진원, 불변 9) — 룰 편집 {@code parseExpr}(TSK-08-03)과 룰 세트 편집 조건식 IO(P-D1)가 같이 쓴다.
 * 결과는 AST Map·참조 변수·화면 평가 가능 여부·검사 문제다. 화면은 파싱 결과만 해석한다.
 *
 * <p>BE 리팩토링 2회차 C5 로 {@code dme/ruleEdit/service/RuleEditService.parseExpr} 본문을 옮겼다 — 룰 세트 편집 화면이 룰 편집 화면
 * 서비스를 부르지 않게 한다.
 */
@Component
public class RuleExprParser {

    private final ExpressionChecker checker;
    private final MdmEvaluator evaluator;

    public RuleExprParser(ExpressionChecker checker, MdmEvaluator evaluator) {
        this.checker = checker;
        this.evaluator = evaluator;
    }

    /**
     * 식 텍스트를 식 칸 종류({@link Slot} 이름, 대소문자 무시)로 파싱한다. 빈 식·칸 종류 없음·모르는 칸 종류·파싱 오류는
     * {@code INVALID_VALUE}. 참조 변수 문제는 {@code refVars} 로 주고 {@code problems} 에는 싣지 않는다.
     */
    public RuleExprParseResult parse(String rawText, String rawSlot) {
        String text = RuleScreenSupport.blankToNull(rawText);
        if (text == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "식이 비었습니다.");
        }
        if (rawSlot == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "식 칸 종류(slot)가 필요합니다.");
        }
        Slot slot;
        try {
            slot = Slot.valueOf(rawSlot.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "모르는 식 칸 종류입니다: " + rawSlot);
        }
        List<Map<String, Object>> problems = new ArrayList<>();
        for (Problem p : checker.check(text, slot)) {
            if (ExpressionChecker.PARSE.equals(p.kind())) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "식을 파싱할 수 없습니다: " + p.detail());
            }
            if (ExpressionChecker.VARIABLE.equals(p.kind())) {
                continue; // 참조 변수는 refVars 로 준다 — 해결 여부는 저장 검사(RuleColumnsService)가 잰다
            }
            problems.add(Map.of("kind", p.kind(), "detail", p.detail()));
        }
        Map<String, Object> ast;
        try {
            ast = AstExporter.export(text, evaluator.configuration());
        } catch (ParseException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "식을 파싱할 수 없습니다: " + text);
        }
        boolean supported = functions(ast).stream().allMatch(FunctionSets.BASE::contains);
        return new RuleExprParseResult(ast, List.copyOf(evaluator.usedVariables(text)), supported, problems);
    }

    private static List<String> functions(Map<String, Object> node) {
        List<String> out = new ArrayList<>();
        collectFunctions(node, out);
        return out;
    }

    /** AST Map(type·value·params) 에서 함수 이름을 모은다 — BASE 밖이면 화면이 평가하지 못 한다(evalex-guide §8.5). */
    @SuppressWarnings("unchecked")
    private static void collectFunctions(Map<String, Object> node, List<String> out) {
        if (node == null) {
            return;
        }
        if ("FUNCTION".equals(node.get("type")) && node.get("value") != null) {
            out.add(String.valueOf(node.get("value")).toUpperCase(Locale.ROOT));
        }
        if (node.get("params") instanceof List<?> list) {
            for (Object p : list) {
                if (p instanceof Map) {
                    collectFunctions((Map<String, Object>) p, out);
                }
            }
        }
    }
}
