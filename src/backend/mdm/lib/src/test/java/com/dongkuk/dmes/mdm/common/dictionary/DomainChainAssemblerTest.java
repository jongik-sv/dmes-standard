package com.dongkuk.dmes.mdm.common.dictionary;

import static com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures.ast;
import static com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures.node;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.contract.dictionary.MdmCodeRef;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomain;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.junit.jupiter.api.Test;

/**
 * design.md §4.1 U1 — 02 예시 트리로 유효 식·AST·길이·단위·코드 참조 조립(불변 I1·I3·I4·I5).
 * 중량(WGT) → 코일 중량 → GROSS 중량·포장 중량, 두께 → 원재료 코일 두께, 공정 코드(CODE) → 도금 공정 코드.
 */
class DomainChainAssemblerTest {

    private final MdmEvaluator ev = DomainFixtures.evaluator();
    private final DomainChainAssembler assembler = new DomainChainAssembler(ev);

    private DomainTreeSnapshot tree() {
        return DomainTreeSnapshot.of(List.of(
                node(1).name("중량").std("WGT").kind("QTY").type("NUMBER").length(12).scale(3).unit("ton")
                        .stdRule("value >= 0").build(ev),
                node(2).name("코일 중량").std("COIL_WGT").kind("QTY").type("NUMBER").parent(1L).length(8)
                        .stdRule("value <= 40").build(ev),
                node(3).name("GROSS 중량").std("GROSS_WGT").kind("QTY").type("NUMBER").parent(2L).scale(1)
                        .bizRule("value >= COIL_NET_WGT").build(ev),
                node(4).name("포장 중량").std("PKG_WGT").kind("QTY").type("NUMBER").parent(2L).build(ev),
                node(5).name("두께").std("THK").kind("QTY").type("NUMBER").unit("mm").stdRule("value > 0").build(ev),
                node(6).name("원재료 코일 두께").std("RAW_COIL_THK").kind("QTY").type("NUMBER").parent(5L)
                        .stdRule("value % 0.1 == 0").build(ev),
                node(7).name("공정 코드").std("PROC_CD").kind("CODE").type("STRING").code("PROC_CD", "BASE").build(ev),
                node(8).name("도금 공정 코드").std("COAT_PROC_CD").kind("CODE").type("STRING").parent(7L)
                        .code("PROC_CD", "COATING").build(ev),
                node(9).name("도금 공정 코드 사본").std("COAT_PROC_CD2").kind("CODE").type("STRING").parent(8L).build(ev),
                node(10).name("반쪽 참조").std("HALF").kind("CODE").type("STRING").parent(8L).code(null, "OTHER").build(ev)));
    }

    private EffectiveDomainView view(long id) {
        return assembler.assemble(tree().chainRootFirst(id));
    }

    @Test
    void 유효_표준식은_최상위부터_자신까지_AND_로_잇는다() {
        EffectiveDomainView v = view(3);
        assertEquals("(value >= 0) && (value <= 40)", v.stdExpr());
        assertEquals("(value >= 0) && (value <= 40)", v.chainStdExpr());
        assertEquals(ast(ev, v.stdExpr()), v.stdAst(), "유효 AST = 유효 텍스트를 다시 파싱한 AST");
        assertEquals("value >= 0", view(1).stdExpr());
        assertEquals("(value > 0) && (value % 0.1 == 0)", view(6).stdExpr());
        assertEquals(ast(ev, "(value > 0) && (value % 0.1 == 0)"), view(6).stdAst());
    }

    @Test
    void 유효_길이_소수_단위는_가장_가까운_non_null_이다() {
        EffectiveDomainView v = view(3);
        assertEquals(8, v.length());
        assertEquals(1, v.scale());
        assertEquals("ton", v.unitCode());
        assertEquals("QTY", v.domainKind());
        assertEquals("NUMBER", v.dataType());
        EffectiveDomainView pkg = view(4);
        assertEquals(8, pkg.length());
        assertEquals(3, pkg.scale());
    }

    @Test
    void 비즈니스식과_요구_변수를_조립한다() {
        EffectiveDomainView v = view(3);
        assertEquals("value >= COIL_NET_WGT", v.bizExpr());
        assertEquals(ast(ev, "value >= COIL_NET_WGT"), v.bizAst());
        assertEquals(List.of("COIL_NET_WGT"), v.bizRequiredVars());
        assertNull(view(4).bizExpr());
        assertEquals(List.of(), view(4).bizRequiredVars());
    }

    @Test
    void CODE_는_가장_가까운_참조_쌍으로_MASTER_식을_만든다() {
        EffectiveDomainView coat = view(8);
        assertEquals("MASTER(\"PROC_CD\", \"COATING\", value)", coat.stdExpr());
        assertNull(coat.chainStdExpr(), "CODE 의 조상 식은 비어 있다 — 검증기가 MASTER 를 스스로 붙인다");
        assertEquals(ast(ev, coat.stdExpr()), coat.stdAst());
        assertEquals("COATING", coat.codeRef().cateId());
        assertEquals("COATING", view(9).codeRef().cateId(), "비우면 부모 참조를 쓴다");
        assertEquals("BASE", view(7).codeRef().cateId());
        // 쌍 단위 대체 — 마루 코드가 빈 행은 참조를 지정하지 않은 것이다. 카테고리만 따로 가져오지 않는다(I4)
        assertEquals("PROC_CD", view(10).codeRef().maruCodeId());
        assertEquals("COATING", view(10).codeRef().cateId());
    }

    @Test
    void 계약_레코드로_옮긴다() {
        MdmEffectiveDomain c = view(8).toContract();
        assertEquals(8L, c.domainId());
        assertEquals("MASTER(\"PROC_CD\", \"COATING\", value)", c.effectiveStdExpr());
        assertEquals(new MdmCodeRef("PROC_CD", "COATING"), c.effectiveCodeRef());
        assertEquals(DomainJson.write(ast(ev, c.effectiveStdExpr())), c.effectiveStdAstJson());
        MdmEffectiveDomain g = view(3).toContract();
        assertEquals(List.of("COIL_NET_WGT"), g.bizRequiredVars());
        assertNull(g.effectiveCodeRef());
    }
}
