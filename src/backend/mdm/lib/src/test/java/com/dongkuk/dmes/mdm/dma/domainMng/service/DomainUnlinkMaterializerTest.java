package com.dongkuk.dmes.mdm.dma.domainMng.service;

import static com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures.node;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import com.dongkuk.dmes.mdm.common.dictionary.DomainChainAssembler;
import com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import java.util.List;
import java.util.function.Consumer;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.junit.jupiter.api.Test;

/** D-132 — 부모 연결 제거 때 상속받던 값을 자기 행에 복사한다(대체 상속은 빈 칸만, 누적 상속 식은 && 로 잇는다). */
class DomainUnlinkMaterializerTest {

    private final MdmEvaluator ev = DomainFixtures.evaluator();
    private final DomainUnlinkMaterializer materializer = new DomainUnlinkMaterializer(new DomainChainAssembler(ev));

    private final DomainTreeSnapshot tree = DomainTreeSnapshot.of(List.of(
            node(1).name("두께").std("THK").kind("QTY").type("NUMBER").unit("mm").length(20).scale(3)
                    .stdRule("value > 0").bizRule("value <= MAX_THK").build(ev),
            node(2).name("코일 두께").std("COIL_THK").kind("QTY").type("NUMBER").parent(1L).length(10)
                    .stdRule("value < 9").build(ev),
            node(3).name("GROSS 두께").std("GROSS_THK").kind("QTY").type("NUMBER").parent(2L).build(ev),
            node(4).name("공정 코드").std("PROC_CD").kind("CODE").type("STRING").code("PROC_CD", "BASE").build(ev),
            node(5).name("냉연 공정").std("CR_PROC").kind("CODE").type("STRING").parent(4L).build(ev),
            node(6).name("허용값").std("YN").kind("FLAG").type("STRING").stdRule("value == \"Y\" || value == \"N\"").build(ev),
            node(7).name("사용 여부").std("USE_YN").kind("FLAG").type("STRING").parent(6L).build(ev)));

    /** 저장 행 그대로의 초안에 edit 만 더한다. */
    private DomainDraft draftOf(long id, Consumer<com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainDraftRequest> edit) {
        DomainNode n = tree.find(id).orElseThrow();
        return DomainDrafts.draft(r -> {
            r.setDomainId(n.domainId());
            r.setVer(0L);
            r.setDomainName(n.domainName());
            r.setStdName(n.stdName());
            r.setParentDomainId(n.parentDomainId());
            r.setDomainKind(n.domainKind());
            r.setDataType(n.dataType());
            r.setLength(n.length());
            r.setScale(n.scale());
            r.setUnitCode(n.unitCode());
            r.setMaruCodeId(n.maruCodeId());
            r.setCateId(n.cateId());
            r.setStdRule(n.stdRule());
            r.setBizRule(n.bizRule());
            edit.accept(r);
        });
    }

    private DomainUnlinkMaterializer.Result unlink(long id) {
        return materializer.materialize(tree.find(id).orElseThrow(), draftOf(id, r -> r.setParentDomainId(null)), tree);
    }

    @Test
    void QTY_는_빈_칸만_부모_유효값으로_채우고_식은_이어_붙인다() {
        DomainUnlinkMaterializer.Result r = unlink(2);
        DomainDraft d = r.draft();
        assertNull(d.parentDomainId());
        assertEquals(10, d.length(), "자기 길이는 그대로");
        assertEquals(3, d.scale());
        assertEquals("mm", d.unitCode());
        assertEquals("(value > 0) && (value < 9)", d.stdRule());
        assertEquals("value <= MAX_THK", d.bizRule());
        assertEquals(List.of("SCALE", "UNIT_CODE", "STD_RULE", "BIZ_RULE"), r.fields());
    }

    @Test
    void 여러_단_조상의_식을_모두_잇는다() {
        DomainDraft d = unlink(3).draft();
        assertEquals(10, d.length());
        assertEquals("(value > 0) && (value < 9)", d.stdRule());
        assertEquals("mm", d.unitCode());
    }

    @Test
    void CODE_는_코드_참조_쌍을_복사하고_표준식은_두지_않는다() {
        DomainUnlinkMaterializer.Result r = unlink(5);
        assertEquals("PROC_CD", r.draft().maruCodeId());
        assertEquals("BASE", r.draft().cateId());
        assertNull(r.draft().stdRule(), "MASTER 식을 표준식으로 복사하지 않는다(S03)");
        assertEquals(List.of("MARU_CODE_ID", "CATE_ID"), r.fields());
    }

    @Test
    void FLAG_는_허용_값_목록을_복사해_최상위_조건을_채운다() {
        assertEquals("value == \"Y\" || value == \"N\"", unlink(7).draft().stdRule());
    }

    @Test
    void 연결_제거가_아니면_그대로_돌려준다() {
        DomainDraft keep = draftOf(2, r -> { });
        assertSame(keep, materializer.materialize(tree.find(2L).orElseThrow(), keep, tree).draft());
        DomainDraft relink = draftOf(2, r -> r.setParentDomainId(6L));
        assertSame(relink, materializer.materialize(tree.find(2L).orElseThrow(), relink, tree).draft());
        DomainDraft top = draftOf(1, r -> { });
        assertSame(top, materializer.materialize(tree.find(1L).orElseThrow(), top, tree).draft());
        assertEquals(List.of(), materializer.materialize(null, top, tree).fields());
    }
}
