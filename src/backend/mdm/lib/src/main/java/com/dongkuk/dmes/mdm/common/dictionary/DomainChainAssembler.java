package com.dongkuk.dmes.mdm.common.dictionary;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import kr.dongkuk.maru.mdm.engine.domain.EffectiveExpressions;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionFailure;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.CodeRef;
import org.springframework.stereotype.Component;

/**
 * "원장에는 자기 행만 쓰고, 부모에 기대는 값은 쓸 때 조립한다"(02:103-134)의 조립기 하나(TSK-04-03 design.md §1·§3.3).
 * 조회·도메인검증·저장·미리보기·계약 구현체가 모두 이것을 불러 같은 답을 낸다. 순수 함수 — DB·트랜잭션을 모른다.
 * 식 조립은 엔진 {@link EffectiveExpressions} 를 부를 뿐 다시 구현하지 않는다. AST 는 다시 파싱하지 않는다(02:125).
 */
@Component
public class DomainChainAssembler {

    private static final String CODE = "CODE";

    private final MdmEvaluator evaluator;

    public DomainChainAssembler(MdmEvaluator evaluator) {
        this.evaluator = Objects.requireNonNull(evaluator, "evaluator");
    }

    /** @param chainRootFirst 최상위 조상부터 자신까지(비어 있으면 안 된다) */
    public EffectiveDomainView assemble(List<DomainNode> chainRootFirst) {
        if (chainRootFirst.isEmpty()) {
            throw new IllegalArgumentException("빈 체인");
        }
        DomainNode root = chainRootFirst.get(0);
        DomainNode self = chainRootFirst.get(chainRootFirst.size() - 1);
        TypeSpec type = typeOf(chainRootFirst);
        String unit = null;
        List<CodeRef> refs = new ArrayList<>();
        List<String> stdTexts = new ArrayList<>();
        List<Map<String, Object>> stdAsts = new ArrayList<>();
        List<String> bizTexts = new ArrayList<>();
        List<Map<String, Object>> bizAsts = new ArrayList<>();
        for (DomainNode n : chainRootFirst) {
            unit = n.unitCode() != null ? n.unitCode() : unit;
            // 쌍 단위 대체 — 마루 코드가 없는 행은 참조를 지정하지 않은 것이다(I4)
            refs.add(n.maruCodeId() == null ? null : new CodeRef(n.maruCodeId(), n.cateId()));
            stdTexts.add(n.stdRule());
            stdAsts.add(n.stdRule() == null ? null : n.stdAst());
            bizTexts.add(n.bizRule());
            bizAsts.add(n.bizRule() == null ? null : n.bizAst());
        }
        CodeRef codeRef = CODE.equals(root.domainKind()) ? EffectiveExpressions.effectiveCodeRef(refs) : null;
        String chainStd = EffectiveExpressions.text(stdTexts);
        List<String> stdWithCode = new ArrayList<>(stdTexts);
        List<Map<String, Object>> stdAstWithCode = new ArrayList<>(stdAsts);
        if (codeRef != null) {
            stdWithCode.add(EffectiveExpressions.codeRefText(codeRef));
            stdAstWithCode.add(EffectiveExpressions.codeRefAst(codeRef));
        }
        String biz = EffectiveExpressions.text(bizTexts);
        return new EffectiveDomainView(self.domainId(), root.domainKind(), type.dataType(), type.length(), type.scale(),
                unit, codeRef, chainStd, EffectiveExpressions.text(stdWithCode), EffectiveExpressions.ast(stdAstWithCode),
                biz, EffectiveExpressions.ast(bizAsts), requiredVars(biz));
    }

    /**
     * 체인의 유효 타입·길이·소수 — {@link #assemble} 과 같은 규칙이다. 타입은 최상위 값, 길이·소수는 최상위부터 자신까지 가장 가까운
     * non-null 이다. 식 조립 없이 이 셋만 필요한 쪽(ERD 사전)이 도메인마다 식을 파싱하지 않도록 따로 둔다.
     *
     * @param chainRootFirst 최상위 조상부터 자신까지(비어 있으면 안 된다)
     */
    public static TypeSpec typeOf(List<DomainNode> chainRootFirst) {
        if (chainRootFirst.isEmpty()) {
            throw new IllegalArgumentException("빈 체인");
        }
        Integer length = null;
        Integer scale = null;
        for (DomainNode n : chainRootFirst) {
            length = n.length() != null ? n.length() : length;
            scale = n.scale() != null ? n.scale() : scale;
        }
        return new TypeSpec(chainRootFirst.get(0).dataType(), length, scale);
    }

    /** {@link #typeOf} 의 결과 — 유효 데이터 타입·길이·소수 자릿수. */
    public record TypeSpec(String dataType, Integer length, Integer scale) {}

    /** 조립한 비즈니스식이 파싱되지 않으면(예: 비즈니스 함수가 빠졌다) 요구 변수를 알 수 없다 — 빈 목록. 판정은 검증기가 오류로 낸다. */
    private List<String> requiredVars(String biz) {
        try {
            return EffectiveExpressions.bizRequiredVars(biz, evaluator);
        } catch (ExpressionFailure | IllegalStateException e) {
            return List.of();
        }
    }
}
