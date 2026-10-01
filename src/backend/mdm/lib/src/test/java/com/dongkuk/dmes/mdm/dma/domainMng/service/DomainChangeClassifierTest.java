package com.dongkuk.dmes.mdm.dma.domainMng.service;

import static com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures.node;
import static com.dongkuk.dmes.mdm.dma.domainMng.service.DomainDrafts.caseRow;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainDraftRequest;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;

/** design.md §4.1 U4 — 칼럼별 변경 분류·diff 방향(불변 I9). */
class DomainChangeClassifierTest {

    private final MdmEvaluator ev = DomainFixtures.evaluator();
    private final DomainChangeClassifier classifier = new DomainChangeClassifier();

    private final DomainNode before = node(5).name("코일 두께").std("COIL_THK").kind("QTY").type("NUMBER").parent(1L)
            .unit("mm").length(10).scale(2).code(null, null).stdRule("value > 0").bizRule("value < MAX_THK")
            .examples("[\"1.0\"]").testCases("[{\"value\":\"1.0\",\"expect\":true}]").build(ev);

    /** before 와 같은 값의 초안에 edit 만 더한다. */
    private DomainDraft same(Consumer<DomainDraftRequest> edit) {
        DomainDraftRequest r = new DomainDraftRequest();
        r.setDomainId(5L);
        r.setVer(0L);
        r.setDomainName("코일 두께");
        r.setStdName("COIL_THK");
        r.setParentDomainId(1L);
        r.setDomainKind("QTY");
        r.setDataType("NUMBER");
        r.setUnitCode("mm");
        r.setLength(10);
        r.setScale(2);
        r.setStdRule("value > 0");
        r.setBizRule("value < MAX_THK");
        edit.accept(r);
        return DomainDraft.from(r, List.of(caseRow("1.0", true)), List.of(Map.of("VALUE", "1.0")));
    }

    @Test
    void 값이_같으면_COMPATIBLE_이고_diff_는_비었다() {
        DomainChangeClassifier.Classification c = classifier.classify(before, same(r -> {
            r.setStdRule("  value > 0 ");
            r.setDescription("");
        }));
        assertEquals("COMPATIBLE", c.kind());
        assertEquals(List.of(), c.diff());
    }

    @Test
    void 신규는_NEW_다() {
        assertEquals("NEW", classifier.classify(null, same(r -> r.setDomainId(null))).kind());
    }

    @ParameterizedTest
    @CsvSource({
            "DOMAIN_KIND,STRUCTURAL,STRUCTURAL", "DATA_TYPE,STRUCTURAL,STRUCTURAL", "UNIT_CODE,STRUCTURAL,STRUCTURAL",
            "PARENT_DOMAIN_ID,PARENT_CHANGE,RELINK",
            "LENGTH,NARROW_OR_WIDEN,NARROW", "SCALE,NARROW_OR_WIDEN,WIDEN", "STD_RULE,NARROW_OR_WIDEN,CHANGE",
            "BIZ_RULE,NARROW_OR_WIDEN,CHANGE", "MARU_CODE_ID,NARROW_OR_WIDEN,CHANGE", "CATE_ID,NARROW_OR_WIDEN,CHANGE",
            "DOMAIN_NAME,COMPATIBLE,COMPATIBLE", "STD_NAME,COMPATIBLE,COMPATIBLE", "DESCRIPTION,COMPATIBLE,COMPATIBLE",
    })
    void 칼럼별_분류와_방향(String column, String kind, String direction) {
        DomainDraft d = same(r -> {
            switch (column) {
                case "DOMAIN_KIND" -> r.setDomainKind("TEXT");
                case "DATA_TYPE" -> r.setDataType("STRING");
                case "UNIT_CODE" -> r.setUnitCode("cm");
                case "PARENT_DOMAIN_ID" -> r.setParentDomainId(2L);
                case "LENGTH" -> r.setLength(8);
                case "SCALE" -> r.setScale(3);
                case "STD_RULE" -> r.setStdRule("value > 1");
                case "BIZ_RULE" -> r.setBizRule(null);
                case "MARU_CODE_ID" -> r.setMaruCodeId("X");
                case "CATE_ID" -> r.setCateId("Y");
                case "DOMAIN_NAME" -> r.setDomainName("다른 이름");
                case "STD_NAME" -> r.setStdName("OTHER");
                default -> r.setDescription("설명");
            }
        });
        DomainChangeClassifier.Classification c = classifier.classify(before, d);
        assertEquals(kind, c.kind(), column);
        assertEquals(1, c.diff().size(), c.diff().toString());
        assertEquals(column, c.diff().get(0).get("FIELD"));
        assertEquals(direction, c.diff().get(0).get("DIRECTION"));
    }

    @Test
    void 예시_값과_테스트_케이스_변경은_호환이다() {
        DomainChangeClassifier.Classification c = classifier.classify(before, DomainDraft.from(
                DomainDrafts.request(r -> {
                    r.setDomainId(5L);
                    r.setDomainName("코일 두께");
                    r.setStdName("COIL_THK");
                    r.setParentDomainId(1L);
                    r.setDomainKind("QTY");
                    r.setDataType("NUMBER");
                    r.setUnitCode("mm");
                    r.setLength(10);
                    r.setScale(2);
                    r.setStdRule("value > 0");
                    r.setBizRule("value < MAX_THK");
                }), List.of(caseRow("2.0", true)), List.of(Map.of("VALUE", "2.0"))));
        assertEquals("COMPATIBLE", c.kind());
        assertEquals(List.of("EXAMPLES", "TEST_CASES"), c.diff().stream().map(m -> m.get("FIELD")).toList());
    }

    @Test
    void 부모_연결과_제거는_방향이_LINK_UNLINK_다() {
        DomainNode top = node(7).name("두께").std("THK").kind("QTY").type("NUMBER").unit("mm").build(ev);
        DomainChangeClassifier.Classification link = classifier.classify(top, DomainDraft.from(DomainDrafts.request(r -> {
            r.setDomainId(7L);
            r.setDomainName("두께");
            r.setStdName("THK");
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("mm");
            r.setParentDomainId(1L);
        }), List.of(), List.of()));
        assertEquals("PARENT_CHANGE", link.kind());
        assertEquals("LINK", link.diff().get(0).get("DIRECTION"));
        DomainChangeClassifier.Classification unlink = classifier.classify(before, same(r -> r.setParentDomainId(null)));
        assertEquals("UNLINK", unlink.diff().get(0).get("DIRECTION"));
    }

    @Test
    void 부모가_바뀌면_단위_칸_변경은_구조_변경이_아니다() {
        DomainChangeClassifier.Classification c = classifier.classify(before, same(r -> {
            r.setParentDomainId(null);
            r.setUnitCode("cm");
            r.setLength(5);
        }));
        assertEquals("PARENT_CHANGE", c.kind());
        assertEquals(List.of("UNIT_CODE", "PARENT_DOMAIN_ID", "LENGTH"), c.diff().stream().map(m -> m.get("FIELD")).toList());
        assertEquals("CHANGE", c.diff().get(0).get("DIRECTION"));
    }

    @Test
    void 하위_재검사는_값_정의_변경과_부모_변경에서만_한다() {
        assertEquals(true, DomainChangeClassifier.rechecksDescendants("PARENT_CHANGE"));
        assertEquals(true, DomainChangeClassifier.rechecksDescendants("NARROW_OR_WIDEN"));
        assertEquals(false, DomainChangeClassifier.rechecksDescendants("COMPATIBLE"));
        assertEquals(false, DomainChangeClassifier.rechecksDescendants("NEW"));
        assertEquals(false, DomainChangeClassifier.rechecksDescendants("STRUCTURAL"));
    }

    @Test
    void 구조_변경이_섞이면_구조_변경이_이긴다() {
        assertEquals("STRUCTURAL", classifier.classify(before, same(r -> {
            r.setParentDomainId(2L);
            r.setDomainKind("TEXT");
        })).kind());
        assertEquals("STRUCTURAL", classifier.classify(before, same(r -> {
            r.setLength(5);
            r.setDataType("STRING");
        })).kind());
    }
}
