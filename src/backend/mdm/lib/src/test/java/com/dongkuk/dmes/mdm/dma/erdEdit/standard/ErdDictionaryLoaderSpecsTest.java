package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import static com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures.node;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.junit.jupiter.api.Test;

/** ERD 사전의 도메인 스펙 — 도메인 행 하나가 스펙 하나가 된다. */
class ErdDictionaryLoaderSpecsTest {

    private final MdmEvaluator ev = DomainFixtures.evaluator();

    private List<DomainNode> tree() {
        return List.of(
                node(10).name("아이디").std("ID").kind("TEXT").type("STRING").length(30).build(ev),
                node(11).name("역할 아이디").std("ROLE_ID").kind("TEXT").type("STRING").parent(10L).build(ev),
                node(20).name("금액").std("AMT").kind("QTY").type("NUMBER").length(18).scale(2).build(ev),
                node(21).name("단가").std("PRC").kind("QTY").type("NUMBER").parent(20L).scale(4).build(ev));
    }

    @Test
    void 부모가_없는_도메인은_자기_행_값이다() {
        Map<Long, ErdDomainSpec> specs = ErdDictionaryLoader.specs(tree());

        assertThat(specs.get(10L)).isEqualTo(new ErdDomainSpec(10L, "아이디", "STRING", 30, null));
        assertThat(specs.get(20L)).isEqualTo(new ErdDomainSpec(20L, "금액", "NUMBER", 18, 2));
        assertThat(specs).hasSize(4);
    }

    @Test
    void 자식_도메인은_지금은_자기_행_값_그대로다() {
        Map<Long, ErdDomainSpec> specs = ErdDictionaryLoader.specs(tree());

        // 현재 동작(F1 결함): 부모에서 물려받는 길이·소수를 보지 않는다.
        assertThat(specs.get(11L)).isEqualTo(new ErdDomainSpec(11L, "역할 아이디", "STRING", null, null));
        assertThat(specs.get(21L)).isEqualTo(new ErdDomainSpec(21L, "단가", "NUMBER", null, 4));
    }
}
