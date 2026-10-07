package com.dongkuk.dmes.mdm.common.mastercode;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSamples.labels;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSamples.values;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemChecks.Header;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary.VerRow;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckItemResult;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckStatus;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckReport;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeVersionView;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** TSK-06-05 design.md §3.1 CK1~CK8 — 확정 검사 10행 보고서(§6.3, 불변 규칙 I1~I11). */
class MasterCodeConfirmChecksTest {

    private static final BigDecimal V1_000 = new BigDecimal("1.000");
    private static final BigDecimal V1_001 = new BigDecimal("1.001");
    private static final BigDecimal V2_000 = new BigDecimal("2.000");
    private static final VersionRef DRAFT = ref(V1_001);
    private static final Header FLAT = new Header(0, labels());
    private static final List<VersionDiffEntry> SOME_DIFF =
            List.of(new VersionDiffEntry("ITEM:A", DiffKind.ADDED, null, Map.of()));
    private static final MasterCodeCateRow BASE = cate("BASE", CategoryKind.REGEX, ".*", CategoryDefTarget.CODE);

    // ── CK1 10행·순서 ───────────────────────────────────────────────────

    @Test
    void CK1_report_는_항목_enum_순서대로_10행() {
        MasterCodeConfirmCheckReport report = report(false, FLAT, clean(), SOME_DIFF);

        assertEquals(DRAFT, report.draft());
        assertEquals(10, report.results().size());
        assertEquals(Arrays.asList(MasterCodeConfirmCheckItem.values()),
                report.results().stream().map(MasterCodeCheckItemResult::item).toList());
    }

    // ── CK2 항목별 판정 ────────────────────────────────────────────────

    @Test
    void CK2_위반이_없으면_3항_공통_검사_5항_보류_나머지_통과() {
        MasterCodeConfirmCheckReport report = report(false, FLAT, clean(), SOME_DIFF);

        assertEquals(List.of("1=PASSED", "2=PASSED", "2-1=PASSED", "2-2=PASSED", "3=DELEGATED", "4=PASSED",
                "5=DEFERRED", "6=PASSED", "7=PASSED", "8=PASSED"), statuses(report));
        assertTrue(report.results().stream().allMatch(r -> r.issues().isEmpty()));
    }

    @Test
    void CK2_1항_계층_칸_값_콤마는_거부() {
        MasterCodeVersionView view = view(List.of(item("A", values("에이", 1, null, "G,1"))), List.of(BASE),
                List.of());

        MasterCodeConfirmCheckReport report = report(false, new Header(1, labels()), view, SOME_DIFF);

        assertEquals(MasterCodeCheckStatus.REJECTED, status(report, "1"));
        MdmCheckIssue issue = issues(report, "1").get(0);
        assertEquals("CODE_VALUE_CHARS", issue.code());
        assertEquals("ITEM:A", issue.itemKey());
        assertEquals("lvl1", issue.field());
        assertEquals("계층 칸 값에 콤마·공백을 쓸 수 없다", issue.message());
    }

    @Test
    void CK2_1항_코드값_공백도_거부() {
        MasterCodeVersionView view = view(List.of(item("A 1", values("에이", 1, null))), List.of(BASE), List.of());

        MasterCodeConfirmCheckReport report = report(false, FLAT, view, SOME_DIFF);

        assertEquals(MasterCodeCheckStatus.REJECTED, status(report, "1"));
        assertEquals("ITEM:A 1", issues(report, "1").get(0).itemKey());
    }

    @Test
    void CK2_2항_정규식_문법_오류는_거부() {
        MasterCodeVersionView view = view(List.of(item("A", values("에이", 1, null))),
                List.of(BASE, cate("BAD", CategoryKind.REGEX, "(", CategoryDefTarget.CODE)), List.of());

        MasterCodeConfirmCheckReport report = report(false, FLAT, view, SOME_DIFF);

        assertEquals(MasterCodeCheckStatus.REJECTED, status(report, "2"));
        MdmCheckIssue issue = issues(report, "2").get(0);
        assertEquals("CATEGORY_RESOLVE", issue.code());
        assertEquals("CATE:BAD", issue.itemKey());
        assertEquals("defExpr", issue.field());
    }

    @Test
    void CK2_2항_허용_밖_대상_칸은_거부() {
        MasterCodeVersionView view = view(List.of(item("A", values("에이", 1, null))),
                List.of(BASE, cate("KEYED", CategoryKind.REGEX, ".*", CategoryDefTarget.KEY)), List.of());

        MasterCodeConfirmCheckReport report = report(false, FLAT, view, SOME_DIFF);

        assertEquals(MasterCodeCheckStatus.REJECTED, status(report, "2"));
        assertEquals(List.of("CATE:KEYED defTarget"), keyAndField(issues(report, "2")));
    }

    @Test
    void CK2_2항은_BASE_도_검사한다() {
        MasterCodeCateRow brokenBase = cate("BASE", CategoryKind.REGEX, "[", CategoryDefTarget.CODE);
        MasterCodeVersionView view = view(List.of(item("A", values("에이", 1, null))), List.of(brokenBase),
                List.of());

        MasterCodeConfirmCheckReport report = report(false, FLAT, view, SOME_DIFF);

        assertEquals(List.of("CATE:BASE defExpr"), keyAndField(issues(report, "2")));
    }

    @Test
    void CK2_2_1_TABLE_소속_코드가_V_에_없으면_경고() {
        MasterCodeCateRow table = cate("T", CategoryKind.TABLE, null, null);
        MasterCodeVersionView view = view(List.of(item("A", values("에이", 1, null))), List.of(BASE, table),
                List.of(member("T", "A"), member("T", "Z")));

        MasterCodeConfirmCheckReport report = report(false, FLAT, view, SOME_DIFF);

        assertEquals(MasterCodeCheckStatus.WARNED, status(report, "2-1"));
        MdmCheckIssue issue = issues(report, "2-1").get(0);
        assertEquals("CATE_ITEM_CODE_MISSING", issue.code());
        assertEquals("CATE_ITEM:T,Z", issue.itemKey());
        assertEquals(MasterCodeCheckStatus.PASSED, status(report, "2-2"));
    }

    @Test
    void CK2_2_2_해당_코드가_없는_카테고리는_경고() {
        MasterCodeVersionView view = view(List.of(item("A", values("에이", 1, null))),
                List.of(BASE, cate("EMPTYC", CategoryKind.REGEX, "Z.*", CategoryDefTarget.CODE)), List.of());

        MasterCodeConfirmCheckReport report = report(false, FLAT, view, SOME_DIFF);

        assertEquals(MasterCodeCheckStatus.WARNED, status(report, "2-2"));
        MdmCheckIssue issue = issues(report, "2-2").get(0);
        assertEquals("CATEGORY_EMPTY", issue.code());
        assertEquals("CATE:EMPTYC", issue.itemKey());
        assertEquals(MasterCodeCheckStatus.PASSED, status(report, "2"));
    }

    @Test
    void CK2_4항_최초_버전이_아니고_diff_가_비면_거부() {
        MasterCodeConfirmCheckReport report = report(false, FLAT, clean(), List.of());

        assertEquals(MasterCodeCheckStatus.REJECTED, status(report, "4"));
        MdmCheckIssue issue = issues(report, "4").get(0);
        assertEquals("HAS_CHANGES", issue.code());
        assertNull(issue.itemKey());
        assertNull(issue.field());
    }

    @Test
    void CK2_6항_중간_칸이_빈_계층은_거부() {
        MasterCodeVersionView view = view(List.of(item("A", values("에이", 1, null, "G", null, "H"))),
                List.of(BASE), List.of());

        MasterCodeConfirmCheckReport report = report(false, new Header(3, labels()), view, SOME_DIFF);

        assertEquals(MasterCodeCheckStatus.REJECTED, status(report, "6"));
        assertEquals(List.of("ITEM:A lvl2"), keyAndField(issues(report, "6")));
        assertEquals("LVL_HIERARCHY", issues(report, "6").get(0).code());
    }

    @Test
    void CK2_6항_앞_칸_불일치는_거부() {
        MasterCodeVersionView view = view(List.of(item("A", values("에이", 1, null, "G")),
                item("B", values("비", 2, null, "H", "G"))), List.of(BASE), List.of());

        MasterCodeConfirmCheckReport report = report(false, new Header(2, labels()), view, SOME_DIFF);

        assertEquals(MasterCodeCheckStatus.REJECTED, status(report, "6"));
        assertEquals(List.of("ITEM:A lvl1", "ITEM:B lvl2"), keyAndField(issues(report, "6")));
    }

    @Test
    void CK2_7항_라벨_없는_추가_컬럼_값은_거부() {
        MasterCodeVersionView view = view(List.of(item("A", values("에이", 1, "270"))), List.of(BASE), List.of());

        MasterCodeConfirmCheckReport report = report(false, FLAT, view, SOME_DIFF);

        assertEquals(MasterCodeCheckStatus.REJECTED, status(report, "7"));
        assertEquals(List.of("ITEM:A attr01"), keyAndField(issues(report, "7")));
        assertEquals("ATTR_WITHOUT_LABEL", issues(report, "7").get(0).code());
    }

    @Test
    void CK2_8항_lvl_cnt_를_넘는_계층_칸_값은_거부() {
        MasterCodeVersionView view = view(List.of(item("A", values("에이", 1, null, "G"))), List.of(BASE),
                List.of());

        MasterCodeConfirmCheckReport report = report(false, FLAT, view, SOME_DIFF);

        assertEquals(MasterCodeCheckStatus.REJECTED, status(report, "8"));
        assertEquals(List.of("ITEM:A lvl1"), keyAndField(issues(report, "8")));
        assertEquals("LVL_BEYOND_CNT", issues(report, "8").get(0).code());
    }

    @Test
    void CK2_I7_diff_에_없는_바뀌지_않은_옛_행의_위반도_잡는다() {
        MasterCodeVersionView view = view(List.of(item("OLD", values("옛", 1, "270")),
                item("NEW", values("새", 2, null))), List.of(BASE), List.of());
        List<VersionDiffEntry> onlyNew = List.of(new VersionDiffEntry("ITEM:NEW", DiffKind.ADDED, null, Map.of()));

        MasterCodeConfirmCheckReport report = report(false, FLAT, view, onlyNew);

        assertEquals(List.of("ITEM:OLD attr01"), keyAndField(issues(report, "7")));
    }

    // ── CK3 최초 버전 ───────────────────────────────────────────────────

    @Test
    void CK3_최초_버전이면_3_4항_면제_5항은_보류() {
        MasterCodeConfirmCheckReport report = report(true, FLAT, clean(), List.of());

        assertEquals(List.of("1=PASSED", "2=PASSED", "2-1=PASSED", "2-2=PASSED", "3=EXEMPT", "4=EXEMPT",
                "5=DEFERRED", "6=PASSED", "7=PASSED", "8=PASSED"), statuses(report));
        assertEquals(List.of(), issues(report, "4"));
    }

    @Test
    void CK3_I3_RELEASED_없는_2_000_도_최초_버전이면_면제() {
        MasterCodeConfirmCheckReport report = MasterCodeConfirmChecks.report(ref(V2_000), true, FLAT, clean(),
                List.of());

        assertEquals(MasterCodeCheckStatus.EXEMPT, status(report, "3"));
        assertEquals(MasterCodeCheckStatus.EXEMPT, status(report, "4"));
    }

    @Test
    void CK3_I3_번호가_1_000_이어도_직전_RELEASED_가_있으면_면제하지_않는다() {
        MasterCodeConfirmCheckReport report = MasterCodeConfirmChecks.report(ref(V1_000), false, FLAT, clean(),
                List.of());

        assertEquals(MasterCodeCheckStatus.DELEGATED, status(report, "3"));
        assertEquals(MasterCodeCheckStatus.REJECTED, status(report, "4"));
    }

    @Test
    void CK3_최초_버전이어도_다른_항목의_거부는_남는다() {
        MasterCodeVersionView view = view(List.of(item("A", values("에이", 1, "270"))), List.of(BASE), List.of());

        MasterCodeConfirmCheckReport report = report(true, FLAT, view, List.of());

        assertEquals(MasterCodeCheckStatus.REJECTED, status(report, "7"));
    }

    // ── CK4 check() = report() 를 편 것 ─────────────────────────────────

    @Test
    void CK4_errors_는_거부_행_이슈_warnings_는_경고_행_이슈를_행_순서로() {
        MasterCodeCateRow emptyCate = cate("EMPTYC", CategoryKind.REGEX, "Z.*", CategoryDefTarget.CODE);
        MasterCodeVersionView view = view(List.of(item("A", values("에이", 1, "270", "G", null, "H")),
                item("B,1", values("비", 2, null))), List.of(BASE, emptyCate), List.of());

        ConfirmCheckResult result = MasterCodeConfirmChecks.flatten(
                report(false, new Header(3, labels()), view, List.of()));

        assertEquals(List.of("CODE_VALUE_CHARS ITEM:B,1", "HAS_CHANGES null", "LVL_HIERARCHY ITEM:A",
                "ATTR_WITHOUT_LABEL ITEM:A"), codeAndKey(result.errors()));
        assertEquals(List.of("CATEGORY_EMPTY CATE:EMPTYC"), codeAndKey(result.warnings()));
    }

    @Test
    void CK4_3항_면제_보류_행의_이슈는_어느_쪽에도_넣지_않는다() {
        MdmCheckIssue stray = new MdmCheckIssue("X", "x", null, null);
        List<MasterCodeCheckItemResult> rows = new ArrayList<>();
        for (MasterCodeConfirmCheckItem item : MasterCodeConfirmCheckItem.values()) {
            MasterCodeCheckStatus status = switch (item) {
                case APPLY_FROM_ORDER -> MasterCodeCheckStatus.DELEGATED;
                case HAS_CHANGES -> MasterCodeCheckStatus.EXEMPT;
                case DEPLOY_TARGET_EXISTS -> MasterCodeCheckStatus.DEFERRED;
                default -> MasterCodeCheckStatus.PASSED;
            };
            rows.add(new MasterCodeCheckItemResult(item, status, List.of(stray)));
        }

        ConfirmCheckResult result = MasterCodeConfirmChecks.flatten(new MasterCodeConfirmCheckReport(DRAFT, rows));

        assertEquals(List.of(), result.errors());
        assertEquals(List.of(), result.warnings());
    }

    @Test
    void CK4_모두_통과면_errors_warnings_가_비었다() {
        ConfirmCheckResult result = MasterCodeConfirmChecks.flatten(report(false, FLAT, clean(), SOME_DIFF));

        assertEquals(List.of(), result.errors());
        assertEquals(List.of(), result.warnings());
    }

    // ── CK6 이슈 코드 매핑 ──────────────────────────────────────────────

    @Test
    void CK6_저장_검사_이슈_코드는_항목으로_가고_나머지는_던진다() {
        Map<MasterCodeItemIssueCode, MasterCodeConfirmCheckItem> expected = Map.of(
                MasterCodeItemIssueCode.CODE_REQUIRED, MasterCodeConfirmCheckItem.CODE_VALUE_CHARS,
                MasterCodeItemIssueCode.CODE_FORBIDDEN_CHAR, MasterCodeConfirmCheckItem.CODE_VALUE_CHARS,
                MasterCodeItemIssueCode.LVL_GAP, MasterCodeConfirmCheckItem.LVL_HIERARCHY,
                MasterCodeItemIssueCode.LVL_PARENT_MISMATCH, MasterCodeConfirmCheckItem.LVL_HIERARCHY,
                MasterCodeItemIssueCode.ATTR_WITHOUT_LABEL, MasterCodeConfirmCheckItem.ATTR_WITHOUT_LABEL,
                MasterCodeItemIssueCode.LVL_BEYOND_CNT, MasterCodeConfirmCheckItem.LVL_BEYOND_CNT,
                MasterCodeItemIssueCode.KEY_TOO_LONG, MasterCodeConfirmCheckItem.CODE_VALUE_CHARS,
                MasterCodeItemIssueCode.TEXT_TOO_LONG, MasterCodeConfirmCheckItem.CODE_VALUE_CHARS);
        for (MasterCodeItemIssueCode code : MasterCodeItemIssueCode.values()) {
            if (expected.containsKey(code)) {
                assertEquals(expected.get(code), MasterCodeConfirmChecks.itemOf(code), code.name());
            } else {
                assertThrows(IllegalStateException.class, () -> MasterCodeConfirmChecks.itemOf(code), code.name());
            }
        }
    }

    @Test
    void CK6_길이_초과_행은_던지지_않고_1항에서_거부한다() {
        MasterCodeVersionView view = view(List.of(item("K".repeat(51), values("에이", 1, null)),
                item("B", values("a".repeat(4001), 1, null))), List.of(BASE), List.of());

        MasterCodeConfirmCheckReport report = report(false, FLAT, view, SOME_DIFF);

        assertEquals(MasterCodeCheckStatus.REJECTED, status(report, "1"));
        List<MdmCheckIssue> issues = MasterCodeConfirmChecks.flatten(report).errors();
        assertEquals(List.of("CODE_VALUE_CHARS", "CODE_VALUE_CHARS"), issues.stream().map(MdmCheckIssue::code).toList());
    }

    // ── CK7 2항 거부 카테고리는 2-2 를 내지 않는다 ──────────────────────

    @Test
    void CK7_정규식_문법_오류_카테고리는_2_2_경고를_내지_않는다() {
        MasterCodeVersionView view = view(List.of(item("A", values("에이", 1, null))),
                List.of(BASE, cate("BAD", CategoryKind.REGEX, "(", CategoryDefTarget.CODE)), List.of());

        MasterCodeConfirmCheckReport report = report(false, FLAT, view, SOME_DIFF);

        assertEquals(MasterCodeCheckStatus.REJECTED, status(report, "2"));
        assertEquals(MasterCodeCheckStatus.PASSED, status(report, "2-2"));
        assertEquals(List.of(), MasterCodeConfirmChecks.flatten(report).warnings());
    }

    // ── CK8 직전 RELEASED ───────────────────────────────────────────────

    @Test
    void CK8_직전_RELEASED_는_V_보다_작은_RELEASED_중_가장_큰_번호() {
        List<VerRow> rows = List.of(ver("2.001", "DRAFT"), ver("2.000", "RELEASED"), ver("1.001", "RELEASED"),
                ver("1.000", "RELEASED"), ver("3.000", "RELEASED"));

        assertEquals(new BigDecimal("2.000"),
                MasterCodeConfirmChecks.previousReleased(rows, new BigDecimal("2.001")).orElseThrow().ver());
        assertEquals(new BigDecimal("1.001"),
                MasterCodeConfirmChecks.previousReleased(rows, new BigDecimal("2")).orElseThrow().ver());
    }

    @Test
    void CK8_DRAFT_와_V_이상은_제외하고_없으면_empty() {
        List<VerRow> rows = List.of(ver("1.000", "DRAFT"), ver("2.000", "RELEASED"));

        assertEquals(Optional.empty(), MasterCodeConfirmChecks.previousReleased(rows, new BigDecimal("2.000")));
        assertEquals(Optional.empty(), MasterCodeConfirmChecks.previousReleased(List.of(), V1_000));
    }

    // ── 도우미 ──────────────────────────────────────────────────────────

    private static MasterCodeConfirmCheckReport report(boolean firstVersion, Header header, MasterCodeVersionView view,
                                                       List<VersionDiffEntry> diff) {
        return MasterCodeConfirmChecks.report(DRAFT, firstVersion, header, view, diff);
    }

    private static MasterCodeVersionView clean() {
        return view(List.of(item("A", values("에이", 1, null)), item("B", values("비", 2, null))), List.of(BASE),
                List.of());
    }

    private static MasterCodeVersionView view(List<MasterCodeItemRow> items, List<MasterCodeCateRow> cates,
                                              List<MasterCodeCateItemRow> members) {
        return new MasterCodeVersionView(DRAFT, items, cates, members);
    }

    private static MasterCodeItemRow item(String code, MasterCodeItemValues values) {
        return new MasterCodeItemRow(code, V1_000, MasterCodeConventions.OPEN_TO_VER, values);
    }

    private static MasterCodeCateRow cate(String id, CategoryKind kind, String expr, CategoryDefTarget target) {
        return new MasterCodeCateRow(new CategoryDefinition(id, id + " 이름", kind, expr, target, null), V1_000,
                MasterCodeConventions.OPEN_TO_VER);
    }

    private static MasterCodeCateItemRow member(String cateId, String code) {
        return new MasterCodeCateItemRow(cateId, code, V1_000, MasterCodeConventions.OPEN_TO_VER);
    }

    private static VerRow ver(String ver, String status) {
        boolean released = "RELEASED".equals(status);
        LocalDateTime from = released ? LocalDateTime.of(2026, 1, 1, 0, 0) : null;
        return new VerRow(new BigDecimal(ver), "MINOR", status, "kim", from, null, null, null, 0L, null);
    }

    private static VersionRef ref(BigDecimal ver) {
        return new VersionRef(VersionTarget.MASTER_CODE, "M", ver);
    }

    private static List<String> statuses(MasterCodeConfirmCheckReport report) {
        return report.results().stream().map(r -> r.item().no() + "=" + r.status()).toList();
    }

    private static MasterCodeCheckStatus status(MasterCodeConfirmCheckReport report, String no) {
        return row(report, no).status();
    }

    private static List<MdmCheckIssue> issues(MasterCodeConfirmCheckReport report, String no) {
        return row(report, no).issues();
    }

    private static MasterCodeCheckItemResult row(MasterCodeConfirmCheckReport report, String no) {
        return report.results().stream().filter(r -> r.item().no().equals(no)).findFirst().orElseThrow();
    }

    private static List<String> keyAndField(List<MdmCheckIssue> issues) {
        return issues.stream().map(i -> i.itemKey() + " " + i.field()).toList();
    }

    private static List<String> codeAndKey(List<MdmCheckIssue> issues) {
        return issues.stream().map(i -> i.code() + " " + i.itemKey()).toList();
    }
}
