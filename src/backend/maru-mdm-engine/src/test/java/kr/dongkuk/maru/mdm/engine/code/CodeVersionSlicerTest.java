package kr.dongkuk.maru.mdm.engine.code;

import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.OPEN_DT;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.OPEN_VER;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.attrs;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.dt;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.lvl;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.ver;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import kr.dongkuk.maru.mdm.engine.testsupport.CodeEquivalence;
import kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures;
import org.junit.jupiter.api.Test;

/**
 * D-154 — 코드 버전 본문 자르기(스펙 §3.3·§4.2)와 판정 동치(§6.1·§6.2 「엔진 단위」「엔진 데이터」 손 사례). 기준은 투영된 전 이력이고, 새 경로는
 * 색인({@code CodeEffLookup}) 있음·없음 두 벌이다.
 */
class CodeVersionSlicerTest {

    private static final BigDecimal V1 = ver("1.000");
    private static final BigDecimal V2 = ver("2.000");
    private static final BigDecimal V3 = ver("3.000");

    // ---- 동치 ----

    @Test
    void 동치_D152_동등성_고정_데이터의_모든_경계_시각_카테고리_코드에서_전_이력과_같다() {
        CodeRows full = CodeRowsProjectionTest.equivalenceFixture();
        int checks = CodeEquivalence.assertEquivalent(full, CodeEquivalence.boundaryTimes(full), CodeEquivalence.cates(full),
                CodeEquivalence.codes(full), CodeEquivalence.allAttrs());
        assertTrue(checks >= 500, "비교 수 " + checks);
    }

    @Test
    void 동치_PROC_CD_와_DEPRECATED_헤더() {
        for (CodeRows full : List.of(CodeFixtures.procCd(), CodeFixtures.withHeaderStatus(CodeFixtures.procCd(), "DEPRECATED"))) {
            int checks = CodeEquivalence.assertEquivalent(full, CodeEquivalence.boundaryTimes(full), CodeEquivalence.cates(full),
                    CodeEquivalence.codes(full), CodeEquivalence.allAttrs());
            assertTrue(checks > 0);
        }
    }

    @Test
    void 동치_손_사례_묶음() {
        CodeRows full = handCases();
        int checks = CodeEquivalence.assertEquivalent(full, CodeEquivalence.boundaryTimes(full), CodeEquivalence.cates(full),
                CodeEquivalence.codes(full), CodeEquivalence.allAttrs());
        assertTrue(checks >= 300, "비교 수 " + checks);
    }

    @Test
    void 동치_RELEASED_가_없는_코드는_새_경로도_모두_빈_판정이다() {
        CodeRows full = new CodeRows(new CodeHeader("NR_CD", "CREATED"), List.of(new CodeVersionRow(V1, "DRAFT", null, null)),
                List.of(new CodeItemRow("A", V1, OPEN_VER, "에이", null, 1, lvl(), attrs())),
                List.of(new CodeCateRow("BASE", V1, OPEN_VER, "REGEX", ".*", "CODE")), List.of());
        CodeEquivalence.assertEquivalent(full, List.of(dt("2026-01-01T00:00")), CodeEquivalence.cates(full),
                List.of("A"), new int[] {1});
    }

    // ---- 본문 모양 ----

    @Test
    void 본문은_그_버전에_유효한_items_만_담고_fromVer_toVer_는_원본_그대로다() {
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V2);
        assertEquals(List.of("A", "B", "C"), s.items().stream().map(CodeItemRow::code).toList());
        CodeItemRow a = s.items().get(0);
        assertEquals(0, a.fromVer().compareTo(V1));
        assertEquals(0, a.toVer().compareTo(OPEN_VER));
        assertEquals(0, s.ver().compareTo(V2));
        assertEquals("HC_CD", s.maruCodeId());
    }

    @Test
    void 뒤_버전에만_정의가_있는_카테고리도_최초_소급으로_고른_정의와_소속을_싣는다() {
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V1);
        CodeVersionSlice.SlicedCategory late = category(s, "LATE");
        assertEquals(0, late.fromVer().compareTo(V3), "정의 fromVer(3.000)가 본문 ver(1.000)보다 뒤");
        assertEquals(List.of("A"), late.members());
        assertFalse(late.all());
    }

    @Test
    void TABLE_소속은_effVer_max_정의_fromVer_v_기준으로_계산한다() {
        // TBL_LATE 정의는 2.000 부터, 소속 행 B 는 [2.000, 열린 끝) — 1.000 판정은 effVer 2.000 의 행을 읽는다
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V1);
        assertEquals(List.of("B"), category(s, "TBL_LATE").members());
    }

    @Test
    void 결과가_items_전체면_all_이고_members_는_null_이다_REGEX_와_TABLE_둘_다() {
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V2);
        assertTrue(category(s, "BASE").all());
        assertNull(category(s, "BASE").members());
        assertTrue(category(s, "TBL_ALL").all(), "TABLE 이 우연히 전부 담는 경우도 집합 비교로 전체다");
        assertNull(category(s, "TBL_ALL").members());
        assertEquals(Set.of("A", "B", "C"), s.membersOf("TBL_ALL"));
    }

    @Test
    void 정의는_있는데_소속이_없으면_all_false_members_빈_목록이고_정의가_없는_cateId_는_싣지_않는다() {
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V2);
        assertFalse(category(s, "NOPE").all());
        assertEquals(List.of(), category(s, "NOPE").members());
        assertTrue(s.categories().stream().noneMatch(c -> c.cateId().equals("CLOSED")), "2.000 을 덮지 않고 소급 대상도 아닌 정의");
        assertEquals(Set.of(), s.membersOf("CLOSED"));
        assertEquals(Set.of(), s.membersOf("NO_SUCH_CATE"));
    }

    @Test
    void REGEX_의_LVL_과_ATTR_대상() {
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V2);
        assertEquals(List.of("A", "C"), category(s, "LVL_P").members());
        assertEquals(List.of("B"), category(s, "ATTR_X").members());
    }

    @Test
    void rows_는_그_버전_1행_고른_정의_합성_cateItems_를_준다() {
        CodeRows projected = CodeRowsProjection.releasedOnly(handCases());
        CodeVersionRow v2 = projected.versions().stream().filter(v -> v.ver().compareTo(V2) == 0).findFirst().orElseThrow();
        CodeVersionSlice s = CodeVersionSlicer.slice(projected, V2);
        CodeRows rows = s.rows(projected.header(), v2);
        assertEquals(List.of(v2), rows.versions());
        assertEquals(s.items(), rows.items());
        assertEquals(s.categories().size(), rows.categories().size());
        Map<String, List<CodeCateItemRow>> byCate = rows.cateItems().stream().collect(Collectors.groupingBy(CodeCateItemRow::cateId));
        assertEquals(List.of("B"), byCate.get("TBL_LATE").stream().map(CodeCateItemRow::code).toList());
        assertEquals(0, byCate.get("TBL_LATE").get(0).fromVer().compareTo(V2), "effVer = max(2.000, 2.000)");
        assertTrue(rows.cateItems().stream().allMatch(ci -> ci.toVer().compareTo(OPEN_VER) == 0));

        // V1 슬라이스 — 정의 fromVer(2.000)가 본문 ver(1.000)보다 뒤라 effVer = max(2.000, 1.000) = 2.000. effVer 를 ver 로 바꾸는 변이가 여기서 잡힌다.
        CodeVersionRow v1 = projected.versions().stream().filter(v -> v.ver().compareTo(V1) == 0).findFirst().orElseThrow();
        CodeRows rows1 = CodeVersionSlicer.slice(projected, V1).rows(projected.header(), v1);
        List<CodeCateItemRow> late1 = rows1.cateItems().stream().filter(ci -> ci.cateId().equals("TBL_LATE")).toList();
        assertEquals(List.of("B"), late1.stream().map(CodeCateItemRow::code).toList());
        assertEquals(0, late1.get(0).fromVer().compareTo(V2), "effVer = max(정의 fromVer 2.000, ver 1.000) = 2.000");
    }

    @Test
    void RELEASED_가_아닌_버전은_자를_수_없다() {
        CodeRows projected = CodeRowsProjection.releasedOnly(CodeRowsProjectionTest.equivalenceFixture());
        assertThrows(IllegalArgumentException.class, () -> CodeVersionSlicer.slice(projected, ver("1.001"))); // CANCELLED
        assertThrows(IllegalArgumentException.class, () -> CodeVersionSlicer.slice(projected, ver("2.001"))); // DRAFT
        assertThrows(IllegalArgumentException.class, () -> CodeVersionSlicer.slice(projected, ver("7.000"))); // 없음
    }

    @Test
    void JSON_으로_직렬화하고_되읽어도_같다_스펙_3_3_칸_이름() throws Exception {
        ObjectMapper mapper = JsonMapper.builder().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).build();
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V2);
        String text = mapper.writeValueAsString(s);
        assertTrue(text.contains("\"maruCodeId\":\"HC_CD\""), text);
        assertTrue(text.contains("\"all\":true"), text);
        assertTrue(text.contains("\"members\":null"), text);
        assertFalse(text.contains("membersOf"), text);
        assertEquals(s, mapper.readValue(text, CodeVersionSlice.class));
    }

    // ---- 보조 ----

    /**
     * 손 사례 — RELEASED 1.000 [2026-01-01, 2026-04-01)·2.000 [2026-04-01, 2026-07-01)·3.000 [2026-07-01, 열린 끝), CANCELLED 2.500.
     * items: A(1.000~, LVL P), B(1.000~2.000 ATTR01 Y → 2.000~ ATTR01 X), C(2.000~, LVL P), D(2.500 취소 전용).
     * 카테고리: BASE(.*), LVL_P(REGEX LVL1 P), ATTR_X(REGEX ATTR01 X), LATE(3.000~ REGEX A — 최초 소급), TBL_LATE(TABLE 2.000~, 소속 B),
     * TBL_ALL(TABLE 1.000~, 소속 A·B·C), NOPE(REGEX 아무것도 맞지 않음), CLOSED(REGEX 1.000~2.000 — 2.000 이후 소급 대상 아님).
     */
    static CodeRows handCases() {
        BigDecimal v25 = ver("2.500");
        return new CodeRows(new CodeHeader("HC_CD", "INUSE"),
                List.of(new CodeVersionRow(V1, "RELEASED", dt("2026-01-01T00:00"), dt("2026-04-01T00:00")),
                        new CodeVersionRow(V2, "RELEASED", dt("2026-04-01T00:00"), dt("2026-07-01T00:00")),
                        new CodeVersionRow(v25, "CANCELLED", null, null),
                        new CodeVersionRow(V3, "RELEASED", dt("2026-07-01T00:00"), OPEN_DT)),
                List.of(new CodeItemRow("A", V1, OPEN_VER, "에이", null, 2, lvl("P"), attrs()),
                        new CodeItemRow("B", V1, V2, "비", "비옛", 1, lvl("Q"), attrs("Y")),
                        new CodeItemRow("B", V2, OPEN_VER, "비(2)", null, 1, lvl("Q"), attrs("X", "b2")),
                        new CodeItemRow("C", V2, OPEN_VER, "씨", null, null, lvl("P"), attrs()),
                        new CodeItemRow("D", v25, V3, "디(취소)", null, 4, lvl("P"), attrs("X"))),
                List.of(new CodeCateRow("BASE", V1, OPEN_VER, "REGEX", ".*", "CODE"),
                        new CodeCateRow("LVL_P", V1, OPEN_VER, "REGEX", "P", "LVL1"),
                        new CodeCateRow("ATTR_X", V1, OPEN_VER, "REGEX", "X", "ATTR01"),
                        new CodeCateRow("LATE", V3, OPEN_VER, "REGEX", "A", "CODE"),
                        new CodeCateRow("TBL_LATE", V2, OPEN_VER, "TABLE", null, null),
                        new CodeCateRow("TBL_ALL", V1, OPEN_VER, "TABLE", null, null),
                        new CodeCateRow("NOPE", V1, OPEN_VER, "REGEX", "ZZZ", "CODE"),
                        new CodeCateRow("CLOSED", V1, V2, "REGEX", ".*", "CODE")),
                List.of(new CodeCateItemRow("TBL_LATE", "B", V2, OPEN_VER),
                        new CodeCateItemRow("TBL_ALL", "A", V1, OPEN_VER),
                        new CodeCateItemRow("TBL_ALL", "B", V1, OPEN_VER),
                        new CodeCateItemRow("TBL_ALL", "C", V2, OPEN_VER),
                        new CodeCateItemRow("TBL_ALL", "D", v25, V3)));
    }

    private static CodeVersionSlice.SlicedCategory category(CodeVersionSlice s, String cateId) {
        return s.categories().stream().filter(c -> c.cateId().equals(cateId)).findFirst()
                .orElseThrow(() -> new AssertionError("카테고리 없음: " + cateId + " in " + s.categories().stream()
                        .map(CodeVersionSlice.SlicedCategory::cateId).collect(Collectors.toList())));
    }
}
