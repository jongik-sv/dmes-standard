package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import static com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures.node;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ApplyOutcome;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.AddColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.AddTable;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommandEngine;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdNaming;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** ERD 사전의 도메인 스펙 — 타입·길이·소수는 상속 체인으로 조립한 유효값이다(F1). */
class ErdDictionaryLoaderSpecsTest {

    private final MdmEvaluator ev = DomainFixtures.evaluator();

    private List<DomainNode> tree() {
        return List.of(
                node(10).name("아이디").std("ID").kind("TEXT").type("STRING").length(30).build(ev),
                node(11).name("역할 아이디").std("ROLE_ID").kind("TEXT").type("STRING").parent(10L).build(ev),
                node(20).name("금액").std("AMT").kind("QTY").type("NUMBER").length(18).scale(4).build(ev),
                node(21).name("단가").std("PRC").kind("QTY").type("NUMBER").parent(20L).scale(2).build(ev),
                node(22).name("짧은 단가").std("S_PRC").kind("QTY").type("NUMBER").parent(21L).length(10).build(ev));
    }

    @Test
    void 부모가_없는_도메인은_자기_행_값이다() {
        Map<Long, ErdDomainSpec> specs = ErdDictionaryLoader.specs(tree());

        assertThat(specs.get(10L)).isEqualTo(new ErdDomainSpec(10L, "아이디", "STRING", 30, null));
        assertThat(specs.get(20L)).isEqualTo(new ErdDomainSpec(20L, "금액", "NUMBER", 18, 4));
        assertThat(specs).hasSize(5);
    }

    @Test
    void 자식_도메인은_비운_길이_소수를_가장_가까운_조상에서_물려받는다() {
        Map<Long, ErdDomainSpec> specs = ErdDictionaryLoader.specs(tree());

        assertThat(specs.get(11L)).isEqualTo(new ErdDomainSpec(11L, "역할 아이디", "STRING", 30, null));
        assertThat(specs.get(21L)).isEqualTo(new ErdDomainSpec(21L, "단가", "NUMBER", 18, 2));
        assertThat(specs.get(22L)).isEqualTo(new ErdDomainSpec(22L, "짧은 단가", "NUMBER", 10, 2));
    }

    @Test
    void 타입은_최상위_도메인_값이다() {
        Map<Long, ErdDomainSpec> specs = ErdDictionaryLoader.specs(List.of(
                node(1).name("아이디").std("ID").kind("TEXT").type("STRING").length(30).build(ev),
                node(2).name("번호 아이디").std("NO_ID").kind("TEXT").type("NUMBER").parent(1L).build(ev)));

        assertThat(specs.get(2L)).isEqualTo(new ErdDomainSpec(2L, "번호 아이디", "STRING", 30, null));
    }

    @Test
    void 상속받은_길이로_물리_타입을_정한다() {
        ErdDomainSpec child = ErdDictionaryLoader.specs(tree()).get(11L);

        // 길이를 잃으면 STRING 이 CLOB 이 됐다.
        assertThat(ErdTypeMapping.physicalOf(child)).isEqualTo(new ErdTypeMapping.PhysType("VARCHAR2", 30, null));
    }

    @Test
    void 상속받은_소수로_DATE_가_TIMESTAMP_가_된다() {
        ErdDomainSpec child = ErdDictionaryLoader.specs(List.of(
                node(30).name("일시").std("DTM").kind("DATE").type("DATE").scale(6).build(ev),
                node(31).name("등록 일시").std("REG_DTM").kind("DATE").type("DATE").parent(30L).build(ev))).get(31L);

        assertThat(child).isEqualTo(new ErdDomainSpec(31L, "등록 일시", "DATE", null, 6));
        assertThat(ErdTypeMapping.physicalOf(child)).isEqualTo(new ErdTypeMapping.PhysType("TIMESTAMP(6)", null, null));
    }

    @Test
    void 도메인_행을_타입_판정_노드로_옮긴다() {
        MdmDomain d = new MdmDomain("단가", "PRC", "QTY", "NUMBER");
        ReflectionTestUtils.setField(d, "domainId", 21L);
        d.setParentDomainId(20L);
        d.setLength(12);
        d.setScale(2);
        d.setStdAst("{not json");

        DomainNode n = ErdDictionaryLoader.typeNode(d);

        assertThat(List.of(n.domainId(), n.parentDomainId(), n.domainName(), n.stdName(), n.domainKind(), n.dataType(),
                n.length(), n.scale())).containsExactly(21L, 20L, "단가", "PRC", "QTY", "NUMBER", 12, 2);
        assertThat(n.stdAst()).isNull(); // 깨진 AST JSON 을 읽지 않는다
    }

    @Test
    void 순환한_체인은_그_도메인_행_값을_쓰고_적재를_실패시키지_않는다() {
        Map<Long, ErdDomainSpec> specs = ErdDictionaryLoader.specs(List.of(
                node(1).name("가").std("A").kind("TEXT").type("STRING").parent(2L).length(5).build(ev),
                node(2).name("나").std("B").kind("TEXT").type("STRING").parent(1L).build(ev),
                node(3).name("다").std("C").kind("TEXT").type("STRING").parent(2L).build(ev),
                node(4).name("라").std("D").kind("TEXT").type("STRING").length(7).build(ev)));

        assertThat(specs.get(1L)).isEqualTo(new ErdDomainSpec(1L, "가", "STRING", 5, null));
        assertThat(specs.get(2L)).isEqualTo(new ErdDomainSpec(2L, "나", "STRING", null, null));
        assertThat(specs.get(3L)).isEqualTo(new ErdDomainSpec(3L, "다", "STRING", null, null));
        assertThat(specs.get(4L)).isEqualTo(new ErdDomainSpec(4L, "라", "STRING", 7, null));
    }

    @Test
    void 부모가_사전에_없으면_체인이_거기서_끝난다() {
        Map<Long, ErdDomainSpec> specs = ErdDictionaryLoader.specs(List.of(
                node(5).name("고아").std("ORPHAN").kind("TEXT").type("STRING").parent(999L).length(12).build(ev)));

        assertThat(specs.get(5L)).isEqualTo(new ErdDomainSpec(5L, "고아", "STRING", 12, null));
    }

    @Test
    void 상속_도메인에_맞는_컬럼은_도메인_위반이_아니다() {
        ErdDictionary d = new ErdDictionary(TermDictionary.of(List.of()), Set.of("UNIT_PRC"), Set.of(),
                ErdDictionaryLoader.specs(tree()), List.of());
        var out = new ErdCommandEngine(ErdNaming.NONE).apply(ErdModel.empty("mcm", "S"), 0, 1, "s", List.of(
                new AddTable("t-1", "TB_A", "에이", "", false),
                new AddColumn("c-1", "t-1", "UNIT_PRC", "단가", 22L, "NUMBER", 10, 2, false, null, "", null)));
        ErdModel m = ((ApplyOutcome.Applied) out).next();

        // 자기 행 값(NUMBER(10,null) = NUMBER(10,0))으로 비교하면 소수 2 가 어긋나 DOMAIN 이 났다.
        assertThat(ErdStandardJudge.judge(m, d).get("c-1")).isEqualTo(ErdColumnStatus.OK);
    }
}
