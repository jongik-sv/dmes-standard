package kr.dongkuk.maru.mdm.engine.code;

import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.OPEN_DT;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.OPEN_VER;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.PROC_CD;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.attrs;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.dt;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.lvl;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.ver;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import org.junit.jupiter.api.Test;

/**
 * D-152 — 메타 피드(CODE)가 업무 모듈 캐시에 싣는 RELEASED 투영({@link CodeRowsProjection#releasedOnly}). 규칙별 사례, 투영 전후
 * 판정이 같은지 보는 동등성 시험, 초안 전용 카테고리가 RELEASED 판정에 소급되던 결함을 고정하는 시험으로 나뉜다.
 *
 * <p>동등성은 "카테고리마다 가장 이른 정의가 어떤 RELEASED 버전에서 유효하다"는 조건에서만 성립한다. 가장 이른 정의가 초안·취소 버전에만
 * 있으면 투영 뒤 소급 대상이 남은 정의 가운데 가장 이른 것으로 바뀐다 — 그것이 결함 수정이고, {@link #소급_대상이_취소_정의에서_RELEASED_정의로_바뀐다}
 * 와 {@link #결함_고정_초안_전용_카테고리는_투영_뒤_RELEASED_판정에_새지_않는다} 가 그 차이를 못박는다.
 */
class CodeRowsProjectionTest {

    private static final String EQ = "EQ_CD";
    private static final BigDecimal V1_000 = ver("1.000");
    private static final BigDecimal V1_001 = ver("1.001");
    private static final BigDecimal V1_002 = ver("1.002");
    private static final BigDecimal V1_003 = ver("1.003");
    private static final BigDecimal V2_000 = ver("2.000");
    private static final BigDecimal V2_001 = ver("2.001");

    // ---- 규칙별 사례 ----

    @Test
    void DRAFT_버전과_초안_사본_행을_뺀다() {
        CodeRows rows = new CodeRows(new CodeHeader("D_CD", "INUSE"),
                List.of(released(V1_000, "2025-01-01T00:00", null), draft(V1_001)),
                List.of(item("A", V1_000, V1_001, "에이"), item("A", V1_001, OPEN_VER, "에이(초안)"), item("B", V1_001, OPEN_VER, "비"),
                        item("C", V1_000, OPEN_VER, "씨")),
                List.of(regex("BASE", V1_000, V1_001, ".*", "CODE"), regex("BASE", V1_001, OPEN_VER, ".*", "CODE")),
                List.of());

        CodeRows out = CodeRowsProjection.releasedOnly(rows);

        assertEquals(List.of(rows.versions().get(0)), out.versions());
        assertEquals(List.of(rows.items().get(0), rows.items().get(3)), out.items());
        assertEquals(List.of(rows.categories().get(0)), out.categories());
        assertSame(rows.header(), out.header());
    }

    @Test
    void CANCELLED_버전과_그_버전에서만_유효한_행을_뺀다() {
        CodeRows rows = new CodeRows(new CodeHeader("C_CD", "INUSE"),
                List.of(released(V1_000, "2025-01-01T00:00", "2026-01-01T00:00"), cancelled(V1_001),
                        released(V1_002, "2026-01-01T00:00", null)),
                List.of(item("A", V1_000, OPEN_VER, "에이"), item("X", V1_001, V1_002, "취소 전용"), item("Y", V1_001, OPEN_VER, "취소 뒤 유지")),
                List.of(regex("BASE", V1_000, OPEN_VER, ".*", "CODE"), regex("ONLY_CANCEL", V1_001, V1_002, "A", "CODE")),
                List.of(new CodeCateItemRow("T", "A", V1_001, V1_002)));

        CodeRows out = CodeRowsProjection.releasedOnly(rows);

        assertEquals(List.of(V1_000, V1_002), out.versions().stream().map(CodeVersionRow::ver).toList());
        assertEquals(List.of("A", "Y"), out.items().stream().map(CodeItemRow::code).toList());
        assertEquals(List.of("BASE"), out.categories().stream().map(CodeCateRow::cateId).toList());
        assertEquals(List.of(), out.cateItems(), "T 정의가 없으니 취소 버전에서만 유효한 소속 행은 남지 않는다");
    }

    /** 소급은 남은 정의 가운데 가장 이른 것으로 간다 — 취소 버전에만 유효한 정의는 더는 소급 대상이 아니다. */
    @Test
    void 소급_대상이_취소_정의에서_RELEASED_정의로_바뀐다() {
        CodeRows rows = new CodeRows(new CodeHeader("R_CD", "INUSE"),
                List.of(released(V1_000, "2025-01-01T00:00", "2026-01-01T00:00"), cancelled(V1_001),
                        released(V1_002, "2026-01-01T00:00", null)),
                List.of(item("A", V1_000, OPEN_VER, "에이"), item("B", V1_000, OPEN_VER, "비")),
                List.of(regex("BASE", V1_000, OPEN_VER, ".*", "CODE"), regex("K", V1_001, V1_002, "A", "CODE"),
                        regex("K", V1_002, OPEN_VER, "B", "CODE")),
                List.of());
        LocalDateTime atV1 = dt("2025-06-01T00:00");

        DefaultCodeResolver before = resolver(rows);
        DefaultCodeResolver after = resolver(CodeRowsProjection.releasedOnly(rows));

        assertTrue(before.isMember("R_CD", "K", "A", atV1), "투영 전: 취소 정의(A)가 1.000 에 소급된다");
        assertFalse(before.isMember("R_CD", "K", "B", atV1));
        assertFalse(after.isMember("R_CD", "K", "A", atV1));
        assertTrue(after.isMember("R_CD", "K", "B", atV1), "투영 뒤: 남은 가장 이른 정의(1.002, B)로 소급된다");
    }

    /** TABLE 소속은 effVer = max(정의 fromVer, ver) 로 읽는다 — 정의 fromVer 가 취소 버전이어도 소급 경로가 쓰는 행을 남긴다. */
    @Test
    void TABLE_소급_경로가_쓰는_소속_행은_남긴다() {
        CodeRows rows = new CodeRows(new CodeHeader("T_CD", "INUSE"),
                List.of(released(V1_000, "2025-01-01T00:00", "2026-01-01T00:00"), cancelled(V1_001),
                        released(V1_002, "2026-01-01T00:00", null)),
                List.of(item("A", V1_000, OPEN_VER, "에이"), item("B", V1_000, OPEN_VER, "비")),
                List.of(regex("BASE", V1_000, OPEN_VER, ".*", "CODE"), table("T", V1_001, OPEN_VER),
                        table("OTHER", V1_002, OPEN_VER)),
                List.of(new CodeCateItemRow("T", "A", V1_001, V1_002), new CodeCateItemRow("T", "B", V1_002, OPEN_VER),
                        new CodeCateItemRow("OTHER", "A", V1_001, V1_002)));

        CodeRows out = CodeRowsProjection.releasedOnly(rows);

        assertEquals(List.of(rows.cateItems().get(0), rows.cateItems().get(1)), out.cateItems(),
                "T 의 [1.001,1.002) 행은 T 정의 fromVer(1.001)에서 유효해 남고, OTHER 의 같은 구간 행은 OTHER 정의가 1.002 부터라 빠진다");
        LocalDateTime atV1 = dt("2025-06-01T00:00");
        assertTrue(resolver(rows).isMember("T_CD", "T", "A", atV1));
        assertTrue(resolver(out).isMember("T_CD", "T", "A", atV1));
    }

    @Test
    void RELEASED_가_없으면_헤더만_남는다() {
        CodeRows rows = new CodeRows(new CodeHeader("N_CD", "CREATED"),
                List.of(draft(V1_000)),
                List.of(item("A", V1_000, OPEN_VER, "에이")),
                List.of(regex("BASE", V1_000, OPEN_VER, ".*", "CODE"), table("T", V1_000, OPEN_VER)),
                List.of(new CodeCateItemRow("T", "A", V1_000, OPEN_VER)));

        CodeRows out = CodeRowsProjection.releasedOnly(rows);

        assertEquals(new CodeRows(rows.header(), List.of(), List.of(), List.of(), List.of()), out);
    }

    @Test
    void 입력_순서를_지킨다() {
        CodeRows rows = new CodeRows(new CodeHeader("O_CD", "INUSE"),
                List.of(released(V2_000, "2026-01-01T00:00", null), draft(V2_001), released(V1_000, "2025-01-01T00:00", "2026-01-01T00:00")),
                List.of(item("Z", V1_000, OPEN_VER, "제트"), item("D", V2_001, OPEN_VER, "초안"), item("M", V2_000, OPEN_VER, "엠"),
                        item("A", V1_000, V2_000, "에이")),
                List.of(regex("Q", V2_000, OPEN_VER, ".*", "CODE"), regex("BASE", V1_000, OPEN_VER, ".*", "CODE")),
                List.of(new CodeCateItemRow("T", "Z", V2_000, OPEN_VER), new CodeCateItemRow("T", "A", V1_000, V2_000)));
        rows = withCategories(rows, table("T", V1_000, OPEN_VER));

        CodeRows out = CodeRowsProjection.releasedOnly(rows);

        assertEquals(List.of(V2_000, V1_000), out.versions().stream().map(CodeVersionRow::ver).toList());
        assertEquals(List.of("Z", "M", "A"), out.items().stream().map(CodeItemRow::code).toList());
        assertEquals(List.of("Q", "BASE", "T"), out.categories().stream().map(CodeCateRow::cateId).toList());
        assertEquals(List.of("Z", "A"), out.cateItems().stream().map(CodeCateItemRow::code).toList());
    }

    /** 버전 비교는 compareTo — 2 와 2.000 은 같은 버전이고, 열린 끝 9999 도 일반 값으로 비교한다. */
    @Test
    void 버전_자리수가_달라도_수로_비교한다() {
        BigDecimal two = new BigDecimal("2");
        CodeRows rows = new CodeRows(new CodeHeader("S_CD", "INUSE"),
                List.of(released(two, "2025-01-01T00:00", null)),
                List.of(item("IN", new BigDecimal("2.000"), new BigDecimal("9999"), "들어감"),
                        item("TO_EXCL", new BigDecimal("1"), new BigDecimal("2.000"), "to 는 제외"),
                        item("FROM_EQ", new BigDecimal("2.0"), new BigDecimal("2.001"), "from 은 포함"),
                        item("AFTER", new BigDecimal("2.001"), OPEN_VER, "뒤")),
                List.of(regex("BASE", new BigDecimal("1.000"), new BigDecimal("9999.000"), ".*", "CODE")),
                List.of());

        CodeRows out = CodeRowsProjection.releasedOnly(rows);

        assertEquals(List.of("IN", "FROM_EQ"), out.items().stream().map(CodeItemRow::code).toList());
        assertEquals(1, out.categories().size());
    }

    // ---- 동등성 ----

    /**
     * PROC_CD 와 비슷한 고정 데이터 — RELEASED 셋(1.000·1.002·2.000), CANCELLED 1.001, DRAFT 2.001. 카테고리는 REGEX(CODE·LVL1·ATTR01)·TABLE 이
     * 섞이고, 초안·취소에만 있는 카테고리는 없다(초안 사본 정의는 있다). 소급 경로를 모두 지난다: 첫 적용 전 시각(버전 소급), 첫 정의가 2.000 인
     * ATTR_Y(카테고리 소급), 정의 fromVer 가 취소 1.001 인 TABLE TBL(소속 행 [1.001,1.002) 를 소급으로 읽음).
     */
    static CodeRows equivalenceFixture() {
        return new CodeRows(new CodeHeader(EQ, "INUSE"),
                List.of(released(V1_000, "2025-01-01T00:00", "2026-01-01T00:00"), cancelled(V1_001),
                        released(V1_002, "2026-01-01T00:00", "2026-07-01T00:00"), released(V2_000, "2026-07-01T00:00", null),
                        draft(V2_001)),
                List.of(
                        new CodeItemRow("10", V1_000, OPEN_VER, "십", null, 3, lvl("B"), attrs("X")),
                        new CodeItemRow("20", V1_000, V2_000, "이십", "20a", 1, lvl("A"), attrs("X", null, "p")),
                        new CodeItemRow("20", V2_000, V2_001, "이십(2)", null, 1, lvl("A"), attrs("Y", null, "q")),
                        new CodeItemRow("20", V2_001, OPEN_VER, "이십(초안)", null, 1, lvl("A"), attrs("Z")),
                        new CodeItemRow("30", V1_002, OPEN_VER, "삼십", null, 2, lvl("A"), attrs("Y")),
                        new CodeItemRow("40", V1_001, V1_002, "사십(취소)", null, 4, lvl("A"), attrs("Y")),
                        new CodeItemRow("50", V2_001, OPEN_VER, "오십(초안)", null, 0, lvl("A"), attrs("Y"))),
                List.of(
                        regex("BASE", V1_000, V2_001, ".*", "CODE"),
                        regex("BASE", V2_001, OPEN_VER, ".*", "CODE"),
                        regex("LVL_A", V1_000, OPEN_VER, "A", "LVL1"),
                        regex("ATTR_Y", V2_000, OPEN_VER, "Y", "ATTR01"),
                        table("TBL", V1_001, OPEN_VER),
                        table("TBL2", V1_000, V2_001),
                        table("TBL2", V2_001, OPEN_VER)),
                List.of(
                        new CodeCateItemRow("TBL", "10", V1_001, OPEN_VER),
                        new CodeCateItemRow("TBL", "20", V1_001, V1_002),
                        new CodeCateItemRow("TBL", "30", V1_002, OPEN_VER),
                        new CodeCateItemRow("TBL", "50", V2_001, OPEN_VER),
                        new CodeCateItemRow("TBL2", "10", V1_000, OPEN_VER),
                        new CodeCateItemRow("TBL2", "20", V2_000, OPEN_VER),
                        new CodeCateItemRow("TBL2", "30", V2_001, OPEN_VER)));
    }

    @Test
    void 동등성_모든_RELEASED_버전과_카테고리와_기준_시각에서_투영_전후_판정이_같다() {
        CodeRows full = equivalenceFixture();
        CodeRows projected = CodeRowsProjection.releasedOnly(full);
        // 투영이 실제로 무언가를 뺐는지(빈 시험 방지)
        assertEquals(3, projected.versions().size());
        assertEquals(List.of("10", "20", "20", "30"), projected.items().stream().map(CodeItemRow::code).toList());
        assertEquals(5, projected.categories().size());
        assertEquals(List.of("10", "20", "30", "10", "20"), projected.cateItems().stream().map(CodeCateItemRow::code).toList());

        DefaultCodeResolver before = resolver(full);
        DefaultCodeResolver after = resolver(projected);
        List<LocalDateTime> times = List.of(dt("2024-06-01T00:00"), dt("2025-01-01T00:00"), dt("2025-12-31T23:59:59"),
                dt("2026-01-01T00:00"), dt("2026-06-30T23:59:59"), dt("2026-07-01T00:00"), dt("2030-01-01T00:00"));
        List<String> cates = Arrays.asList(null, "", "BASE", "LVL_A", "ATTR_Y", "TBL", "TBL2", "NONE");
        List<String> codes = Arrays.asList("10", "20", "30", "40", "50", "99", null);
        int checks = 0;
        for (LocalDateTime t : times) {
            assertEquals(before.selectVersion(EQ, t), after.selectVersion(EQ, t), "selectVersion " + t);
            for (String cate : cates) {
                assertEquals(before.codeList(EQ, cate, t), after.codeList(EQ, cate, t), "codeList " + cate + " " + t);
                for (String code : codes) {
                    String at = cate + "/" + code + " " + t;
                    assertEquals(before.isMember(EQ, cate, code, t), after.isMember(EQ, cate, code, t), "isMember " + at);
                    for (int n = 1; n <= 10; n++) {
                        assertEquals(before.attr(EQ, cate, code, t, n), after.attr(EQ, cate, code, t, n), "attr" + n + " " + at);
                    }
                    checks++;
                }
            }
        }
        for (BigDecimal v : List.of(V1_000, V1_002, V2_000)) {
            for (String cate : cates) {
                assertEquals(before.effectiveCodes(EQ, v, cate), after.effectiveCodes(EQ, v, cate), "effectiveCodes " + v + " " + cate);
            }
        }
        assertEquals(times.size() * cates.size() * codes.size(), checks);
        // 소급 경로가 실제로 쓰였는지 — 1.000 에서 TBL 은 취소 1.001 의 소속 행([1.001,1.002) 의 20)으로 판정한다
        assertTrue(after.isMember(EQ, "TBL", "20", dt("2024-06-01T00:00")));
        assertTrue(after.isMember(EQ, "ATTR_Y", "30", dt("2026-01-01T00:00")), "ATTR_Y 는 2.000 정의를 1.002 에 소급한다");
    }

    // ---- 결함 고정 ----

    /**
     * 실데이터 PROC_CD 의 CCL·공정그룹구분·도금·소둔처럼 DRAFT 에만 정의가 있는 카테고리는, 투영 전에는 최초 소급으로 RELEASED 판정에 새고
     * (MASTER·CODE_LIST·허용 코드), 투영 뒤에는 새지 않는다.
     */
    @Test
    void 결함_고정_초안_전용_카테고리는_투영_뒤_RELEASED_판정에_새지_않는다() {
        CodeRows base = CodeFixtures.procCd();
        List<CodeVersionRow> versions = new ArrayList<>(base.versions());
        versions.add(draft(V1_003));
        CodeRows rows = withCategories(new CodeRows(base.header(), versions, base.items(), base.categories(), base.cateItems()),
                regex("PLATING", V1_003, OPEN_VER, "8[12]", "CODE"));
        LocalDateTime now = dt("2026-09-10T00:00"); // RELEASED 1.002

        DefaultCodeResolver before = resolver(rows);
        DefaultCodeResolver after = resolver(CodeRowsProjection.releasedOnly(rows));

        assertTrue(before.isMember(PROC_CD, "PLATING", "81", now), "투영 전: 초안 정의가 1.002 에 소급된다(결함)");
        assertEquals(List.of("81", "82"),
                before.codeList(PROC_CD, "PLATING", now).stream().map(CodeResolver.CodeListEntry::code).sorted().toList());
        assertFalse(after.isMember(PROC_CD, "PLATING", "81", now));
        assertEquals(List.of(), after.codeList(PROC_CD, "PLATING", now));
        assertEquals(before.codeList(PROC_CD, "COATING", now), after.codeList(PROC_CD, "COATING", now), "다른 카테고리는 그대로");
    }

    // ---- 보조 ----

    private static DefaultCodeResolver resolver(CodeRows rows) {
        return new DefaultCodeResolver(InMemoryLookups.codeLookup(rows), CodeEffLookup.NONE);
    }

    private static CodeRows withCategories(CodeRows rows, CodeCateRow... more) {
        List<CodeCateRow> categories = new ArrayList<>(rows.categories());
        categories.addAll(List.of(more));
        return new CodeRows(rows.header(), rows.versions(), rows.items(), categories, rows.cateItems());
    }

    private static CodeVersionRow released(BigDecimal v, String from, String to) {
        return new CodeVersionRow(v, "RELEASED", dt(from), to == null ? OPEN_DT : dt(to));
    }

    private static CodeVersionRow draft(BigDecimal v) {
        return new CodeVersionRow(v, "DRAFT", null, null);
    }

    private static CodeVersionRow cancelled(BigDecimal v) {
        return new CodeVersionRow(v, "CANCELLED", null, null);
    }

    private static CodeItemRow item(String code, BigDecimal from, BigDecimal to, String name) {
        return new CodeItemRow(code, from, to, name, null, null, lvl(), attrs());
    }

    private static CodeCateRow regex(String cateId, BigDecimal from, BigDecimal to, String expr, String target) {
        return new CodeCateRow(cateId, from, to, "REGEX", expr, target);
    }

    private static CodeCateRow table(String cateId, BigDecimal from, BigDecimal to) {
        return new CodeCateRow(cateId, from, to, "TABLE", null, null);
    }
}
