package com.dongkuk.dmes.mdm.dma.domainMng.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.junit.jupiter.api.Test;

/** design.md §4.1 U7 — 칸별 문제 → R01/R02/R04/S05, 표준 칸 추가 제한(D3), AST JSON(불변 I2·I14). */
class DomainExpressionCompilerTest {

    private final MdmEvaluator ev = DomainFixtures.evaluator();
    private final DomainExpressionCompiler compiler = new DomainExpressionCompiler(new ExpressionChecker(ev), ev);

    private List<String> codes(String text, Slot slot) {
        return compiler.check(text, slot, "STD_RULE").stream().map(i -> i.code().name()).distinct().toList();
    }

    @Test
    void 칸별_문제를_이슈_코드로_옮긴다() {
        assertEquals(List.of("R01"), codes("value >=", Slot.DOMAIN_STD));
        assertEquals(List.of("R02"), codes("THK_OK(value)", Slot.DOMAIN_STD));
        assertEquals(List.of(), codes("THK_OK(value)", Slot.DOMAIN_BIZ));
        assertEquals(List.of("R04"), codes("value > OTHER_COL", Slot.DOMAIN_STD));
        assertEquals(List.of(), codes("value > OTHER_COL", Slot.DOMAIN_BIZ));
        assertEquals(List.of("S05"), codes("value > _HIDDEN", Slot.DOMAIN_BIZ));
        assertEquals(List.of("S05"), codes("MASTER(value, \"BASE\", value)", Slot.DOMAIN_STD));
        assertEquals(List.of(), codes("MASTER(\"PROC_CD\", \"BASE\", value)", Slot.DOMAIN_STD));
        assertEquals(List.of(), codes(null, Slot.DOMAIN_STD));
        assertEquals(List.of(), codes("  ", Slot.DOMAIN_STD));
    }

    @Test
    void 표준_칸은_MASTER_AT_과_attr_MASTER_를_거부한다_D3() {
        assertEquals(List.of("R02"), codes("MASTER_AT(\"PROC_CD\", \"BASE\", value, \"20260101\")", Slot.DOMAIN_STD));
        assertEquals(List.of("R02"), codes("MASTER(\"PROC_CD\", \"BASE\", value, \"attr01\") == \"Y\"", Slot.DOMAIN_STD));
        assertEquals(List.of(), codes("MASTER(\"PROC_CD\", \"BASE\", value, \"attr01\") == \"Y\"", Slot.DOMAIN_BIZ));
    }

    @Test
    void AST_JSON_은_자기_텍스트의_내보내기다() throws Exception {
        String json = compiler.astJson("value > 0 && value < 10");
        Map<?, ?> parsed = new ObjectMapper().readValue(json, Map.class);
        assertEquals(DomainFixtures.ast(ev, "value > 0 && value < 10"), parsed);
        assertEquals("INFIX_OPERATOR", parsed.get("type"));
        assertTrue(parsed.containsKey("params"));
        assertNull(compiler.astJson(null));
        assertNull(compiler.astJson(" "));
        assertNull(compiler.astJson("value >="), "파싱되지 않으면 AST 없음(R01 이 따로 막는다)");
    }
}
