package com.dongkuk.dmes.mdm.dma.domainMng.service;

import static com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures.node;
import static com.dongkuk.dmes.mdm.dma.domainMng.service.DomainDrafts.caseRow;
import static com.dongkuk.dmes.mdm.dma.domainMng.service.DomainDrafts.draft;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.dictionary.DomainChainAssembler;
import com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.common.engine.MdmCodeLookupAvailability;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** design.md §4.1 U3 — 메모리 스냅샷으로 거부 조건·경고를 모두 모은다(불변 I5·I7·I8). */
class DomainRuleCheckerTest {

    private final MdmEvaluator ev = DomainFixtures.evaluator();
    private final DomainRuleChecker checker = new DomainRuleChecker(
            new DomainExpressionCompiler(new ExpressionChecker(ev), ev), new DomainChainAssembler(ev),
            new CodeCategoryValidator(MdmCodeLookupAvailability.of(null)));
    private final DomainRuleChecker.DictionaryFacts facts =
            DomainRuleChecker.DictionaryFacts.of(Set.of("mm", "ton"), Set.of("COIL_NET_WGT"));

    private DomainTreeSnapshot tree() {
        return DomainTreeSnapshot.of(List.of(
                node(1).name("두께").std("THK").kind("QTY").type("NUMBER").unit("mm").length(20).scale(3)
                        .stdRule("value > 0").build(ev),
                node(2).name("코일 두께").std("COIL_THK").kind("QTY").type("NUMBER").parent(1L).length(10).build(ev),
                node(3).name("공정 코드").std("PROC_CD").kind("CODE").type("STRING").code("PROC_CD", "BASE").build(ev),
                node(4).name("허용값").std("YN").kind("FLAG").type("STRING").stdRule("value == \"Y\" || value == \"N\"")
                        .build(ev),
                node(5).name("중량").std("WGT").kind("QTY").type("NUMBER").unit("ton").length(30).build(ev),
                node(6).name("길이").std("LEN").kind("QTY").type("NUMBER").unit("mm").length(30).build(ev)));
    }

    private Set<String> codes(DomainDraft d) {
        return checker.check(d, tree(), facts).stream().map(i -> i.code().name()).collect(Collectors.toSet());
    }

    @Test
    void 통과하는_초안은_이슈가_없다() {
        assertEquals(Set.of(), codes(draft(r -> r.setStdRule("STR_LENGTH(value) <= 10"))));
        assertEquals(Set.of(), codes(draft(r -> {
            r.setParentDomainId(1L);
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setLength(15);
            r.setStdRule("value < 5");
        })));
    }

    @Test
    void R04_표준식은_value_만_쓴다() {
        assertTrue(codes(draft(r -> r.setStdRule("value > OTHER_COL"))).contains("R04"));
        assertFalse(codes(draft(r -> r.setBizRule("value > COIL_NET_WGT"))).contains("R04"));
    }

    @Test
    void R05_비즈니스식_변수는_컬럼_사전에_있어야_한다() {
        assertTrue(codes(draft(r -> r.setBizRule("value >= NO_SUCH_COL"))).contains("R05"));
        assertFalse(codes(draft(r -> r.setBizRule("value >= coil_net_wgt"))).contains("R05"), "대소문자 무시");
    }

    @Test
    void R06_길이_소수는_부모_유효값_이하() {
        Set<String> len = codes(draft(r -> {
            r.setParentDomainId(2L);
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setLength(11);
        }));
        assertTrue(len.contains("R06"), "부모 유효 길이 10 < 11");
        Set<String> eq = codes(draft(r -> {
            r.setParentDomainId(2L);
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setLength(10);
            r.setStdRule("value < 9");
        }));
        assertFalse(eq.contains("R06"), "같으면 통과");
        Set<String> scale = codes(draft(r -> {
            r.setParentDomainId(2L);
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setScale(4);
        }));
        assertTrue(scale.contains("R06"), "소수 3 은 조부모에서 상속된 유효값");
    }

    @Test
    void R07_상속_순환은_거부하고_부모_변경_자체는_구조_변경이_아니다() {
        Set<String> c = codes(draft(r -> {
            r.setDomainId(1L);
            r.setVer(0L);
            r.setDomainName("두께");
            r.setStdName("THK");
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("mm");
            r.setLength(20);
            r.setScale(3);
            r.setStdRule("value > 0");
            r.setParentDomainId(2L);
        }));
        assertTrue(c.contains("R07"), c.toString());
        assertFalse(c.contains("S01"), "부모 변경은 S01 이 아니다(D-132): " + c);
        Set<String> self = codes(draft(r -> {
            r.setDomainId(2L);
            r.setParentDomainId(2L);
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
        }));
        assertTrue(self.contains("R07"));
    }

    @Test
    void R09_CODE_는_체인에_참조가_있어야_한다() {
        assertTrue(codes(draft(r -> r.setDomainKind("CODE"))).contains("R09"));
        Set<String> child = codes(draft(r -> {
            r.setDomainKind("CODE");
            r.setParentDomainId(3L);
        }));
        assertFalse(child.contains("R09"), child.toString());
    }

    @Test
    void R10_코드_원장이_없으면_거부하지_않고_W02() {
        Set<String> c = codes(draft(r -> {
            r.setDomainKind("CODE");
            r.setMaruCodeId("PROC_CD");
            r.setCateId("COATING");
        }));
        assertFalse(c.contains("R10"));
        assertTrue(c.contains("W02"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"DOMAIN_KIND", "DATA_TYPE", "UNIT_CODE"})
    void S01_구조_칼럼을_바꾸면_거부한다(String column) {
        List<DomainIssue> issues = checker.check(draft(r -> {
            r.setDomainId(2L);
            r.setVer(0L);
            r.setDomainName("코일 두께");
            r.setStdName("COIL_THK");
            r.setParentDomainId(1L);
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setLength(10);
            switch (column) {
                case "DOMAIN_KIND" -> r.setDomainKind("TEXT");
                case "DATA_TYPE" -> r.setDataType("STRING");
                default -> r.setUnitCode("ton");
            }
        }), tree(), facts);
        assertTrue(issues.stream().anyMatch(i -> i.code() == DomainIssueCode.S01 && column.equals(i.field())),
                issues.toString());
    }

    @Test
    void S02_자식의_종류_타입_단위는_부모_유효값과_같다() {
        Set<String> kind = codes(draft(r -> {
            r.setParentDomainId(1L);
            r.setDomainKind("TEXT");
            r.setDataType("NUMBER");
        }));
        assertTrue(kind.contains("S02"));
        Set<String> unit = codes(draft(r -> {
            r.setParentDomainId(2L);
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("ton");
        }));
        assertTrue(unit.contains("S02"), "조부모 단위 mm 와 다르다");
        Set<String> same = codes(draft(r -> {
            r.setParentDomainId(2L);
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("mm");
            r.setStdRule("value < 1");
        }));
        assertFalse(same.contains("S02"));
    }

    /** D-132 — 부모 연결·교체·제거는 허용하되 종류·타입·유효 단위는 새 부모와 맞아야 한다. */
    private DomainDraft move(Long parent, String unit) {
        return draft(r -> {
            r.setDomainId(2L);
            r.setVer(0L);
            r.setDomainName("코일 두께");
            r.setStdName("COIL_THK");
            r.setParentDomainId(parent);
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode(unit);
            r.setLength(10);
        });
    }

    @Test
    void 부모_교체는_유효_단위가_같으면_통과한다() {
        Set<String> c = codes(move(6L, null));
        assertFalse(c.contains("S01") || c.contains("S02"), c.toString());
        assertTrue(c.stream().noneMatch(x -> x.startsWith("R") || x.startsWith("S")), c.toString());
    }

    @Test
    void 부모_교체로_상속_단위가_바뀌면_S02() {
        List<DomainIssue> issues = checker.check(move(5L, null), tree(), facts);
        assertTrue(issues.stream().anyMatch(i -> i.code() == DomainIssueCode.S02 && "UNIT_CODE".equals(i.field())
                && i.message().contains("mm → ton")), issues.toString());
        assertTrue(issues.stream().noneMatch(i -> i.code() == DomainIssueCode.S01), issues.toString());
    }

    @Test
    void 부모_연결은_종류_타입이_다르면_S02() {
        Set<String> c = codes(move(3L, null));
        assertTrue(c.contains("S02"), c.toString());
        assertFalse(c.contains("S01"), c.toString());
    }

    @Test
    void 연결_제거에서_단위를_구체화하면_S01_이_아니고_유효_단위도_같다() {
        Set<String> c = codes(move(null, "mm"));
        assertFalse(c.contains("S01") || c.contains("S02"), c.toString());
        Set<String> lost = codes(move(null, "ton"));
        assertTrue(lost.contains("S02"), "구체화한 단위가 상속 단위와 다르면 유효 단위가 바뀐다: " + lost);
    }

    @Test
    void S03_코드_참조_모양() {
        assertTrue(codes(draft(r -> {
            r.setDomainKind("CODE");
            r.setMaruCodeId("P");
            r.setCateId("BASE");
            r.setStdRule("value == \"A\"");
        })).contains("S03"));
        assertTrue(codes(draft(r -> {
            r.setMaruCodeId("P");
            r.setCateId("BASE");
        })).contains("S03"));
        assertTrue(codes(draft(r -> {
            r.setDomainKind("CODE");
            r.setMaruCodeId("P");
        })).contains("S03"));
    }

    @Test
    void S04_FLAG_최상위는_표준식이_있어야_한다() {
        assertTrue(codes(draft(r -> r.setDomainKind("FLAG"))).contains("S04"));
        assertFalse(codes(draft(r -> {
            r.setDomainKind("FLAG");
            r.setParentDomainId(4L);
        })).contains("S04"));
    }

    @Test
    void S06_필수_형식_존재() {
        assertTrue(codes(draft(r -> r.setDomainName(" "))).contains("S06"));
        assertTrue(codes(draft(r -> r.setStdName("bad-name"))).contains("S06"));
        assertTrue(codes(draft(r -> r.setStdName("A".repeat(51)))).contains("S06"));
        assertTrue(codes(draft(r -> r.setDataType(null))).contains("S06"));
        assertTrue(codes(draft(r -> r.setDomainKind("NOPE"))).contains("S06"));
        assertTrue(codes(draft(r -> r.setLength(-1))).contains("S06"));
        assertTrue(codes(draft(r -> {
            r.setLength(3);
            r.setScale(4);
        })).contains("S06"));
        assertTrue(codes(draft(r -> r.setParentDomainId(99L))).contains("S06"));
        assertTrue(codes(draft(r -> r.setDomainId(99L))).contains("S06"));
        assertTrue(codes(draft(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
        })).contains("S06"), "QTY 최상위는 단위 필수");
        assertTrue(codes(draft(r -> {
            r.setDomainKind("QTY");
            r.setDataType("STRING");
            r.setUnitCode("mm");
        })).contains("S06"), "QTY 는 NUMBER");
        assertTrue(codes(draft(r -> r.setUnitCode("furlong"))).contains("S06"), "단위 원장에 없음");
        assertTrue(codes(draft(r -> r.setStdRule("value == \"A\""), List.of(caseRow("A", "maybe")))).contains("S06"));
        assertTrue(codes(draft(r -> r.setStdRule("value == \"A\""), List.of(caseRow(" ", true)))).contains("S06"));
    }

    @Test
    void W01_부모와_같은_빈_말단은_경고다() {
        List<DomainIssue> issues = checker.check(draft(r -> {
            r.setParentDomainId(2L);
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setLength(10);
        }), tree(), facts);
        DomainIssue w01 = issues.stream().filter(i -> i.code() == DomainIssueCode.W01).findFirst().orElseThrow();
        assertFalse(w01.isError());
        assertEquals("부모와 정의가 같습니다. 컬럼이 부모를 직접 참조하면 됩니다.", w01.message());
        assertTrue(issues.stream().noneMatch(DomainIssue::isError), issues.toString());
    }

    @Test
    void 여러_위반을_한_번에_모두_모은다() {
        Set<String> c = codes(draft(r -> {
            r.setStdName("bad name");
            r.setStdRule("value > OTHER");
            r.setBizRule("value >= NO_SUCH_COL");
            r.setMaruCodeId("P");
        }));
        assertTrue(c.containsAll(Set.of("S06", "R04", "R05", "S03")), c.toString());
    }

    private List<String> fieldsOf(DomainDraft d, DomainIssueCode code) {
        return checker.check(d, tree(), facts).stream().filter(i -> i.code() == code).map(DomainIssue::field).toList();
    }

    @Test
    void S06_4000_바이트_칸은_UTF8_바이트로_잰다() {
        assertFalse(fieldsOf(draft(r -> r.setDescription("a".repeat(4000))), DomainIssueCode.S06).contains("DESCRIPTION"), "4000바이트 통과");
        assertTrue(fieldsOf(draft(r -> r.setDescription("a".repeat(4001))), DomainIssueCode.S06).contains("DESCRIPTION"), "4001바이트 거절");
        assertFalse(fieldsOf(draft(r -> r.setDomainName("가".repeat(1333))), DomainIssueCode.S06).contains("DOMAIN_NAME"), "한글 1333자 = 3999바이트");
        assertTrue(fieldsOf(draft(r -> r.setDomainName("가".repeat(1334))), DomainIssueCode.S06).contains("DOMAIN_NAME"), "한글 1334자 = 4002바이트");
    }

    @Test
    void S06_예시는_직렬화한_JSON_바이트로_잰다() {
        // ["…"] — 값 앞뒤 따옴표·대괄호 4바이트가 더해진다
        assertFalse(fieldsOf(DomainDraft.from(DomainDrafts.request(r -> { }), List.of(), DomainDrafts.examples("a".repeat(3996))),
                DomainIssueCode.S06).contains("EXAMPLES"));
        assertTrue(fieldsOf(DomainDraft.from(DomainDrafts.request(r -> { }), List.of(), DomainDrafts.examples("a".repeat(3997))),
                DomainIssueCode.S06).contains("EXAMPLES"));
    }

    @Test
    void S06_코드_참조_ID_는_50자까지() {
        assertTrue(fieldsOf(draft(r -> {
            r.setDomainKind("CODE");
            r.setMaruCodeId("C".repeat(51));
            r.setCateId("K".repeat(51));
        }), DomainIssueCode.S06).containsAll(List.of("MARU_CODE_ID", "CATE_ID")));
        assertFalse(fieldsOf(draft(r -> {
            r.setDomainKind("CODE");
            r.setMaruCodeId("C".repeat(50));
            r.setCateId("K".repeat(50));
        }), DomainIssueCode.S06).contains("MARU_CODE_ID"));
    }
}
