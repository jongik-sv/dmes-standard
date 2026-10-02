package com.dongkuk.dmes.mdm.dmc.codeConfirm;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN_END;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.assertMdm;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.checkRow;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.confirm;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.list;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.map;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.search;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.status;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.validate;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.view;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeConfirmCheck;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeTestConfig;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.common.version.VersionSpiRegistry;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.codeConfirm.service.CodeConfirmService;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeMngRow;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeMngSearchRequest;
import com.dongkuk.dmes.mdm.dmc.codeMng.service.CodeMngService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-06-05 design.md §3.2 S1~S9 — codeConfirm 서비스(목록·모습·검사·확정)를 local(SQLite) 컨텍스트로 돌린다. 서비스에는
 * {@code @Transactional} 이 없다 — 트랜잭션 없이 직접 부르고 표를 JdbcTemplate 으로 단언한다.
 *
 * <p>{@code MasterCodeTestConfig} 만 import 한다. {@code VersionScenarioTestConfig} 를 import 하면 후처리기가 운영 SPI 를
 * 가짜로 바꿔 확정 시험이 실제 검사 없이 초록이 된다(I28) — 그래서 레지스트리의 SPI 가 운영 빈인지 먼저 단언한다.
 *
 * <p>시드(모두 MDM 원천, lvl_cnt 0, 시계 2026-09-03 00:00 KST, 사용자 kim 담당자):
 * <ul>
 *   <li>{@code M} — 1.000 RELEASED(2026-01-01~), 1.001 DRAFT(kim, rv 3), A@1.000·B@1.001(추가), BASE</li>
 *   <li>{@code N} — {@code M} 과 같되 1.001 에 바뀐 행이 없다(4항 거부)</li>
 *   <li>{@code W} — {@code M} 에 빈 카테고리 EMPTYC(REGEX {@code Z.*}) — 2-2 경고</li>
 *   <li>{@code F} — CREATED, 1.000 DRAFT(kim, rv 0), A, BASE — 최초 버전</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class CodeConfirmServiceSqliteTest extends AbstractMdmSharedDbTest {

    private static final long RV = 3L;
    private static final String PREV_FROM = "2026-01-01 00:00:00";

    @Autowired
    CodeConfirmService service;
    @Autowired
    CodeMngService codeMngService;
    @Autowired
    VersionSpiRegistry registry;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    MutableClock clock;
    @Autowired
    DataSource dataSource;

    private JdbcTemplate jdbc;
    private MasterCodeFixtures fx;

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        fx = new MasterCodeFixtures(jdbc);
        fx.clear();
        clock.setLocal(MasterCodeTestConfig.SAMPLE_DAY);
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
    }

    private void seedDraft(String id, String name, boolean changed) {
        fx.seedCode(id, name, "MDM", 0);
        fx.seedVersion(id, "1.000", "RELEASED", "kim", PREV_FROM, OPEN_END, 0);
        fx.seedVersion(id, "1.001", "DRAFT", "kim", null, null, RV);
        fx.seedItem(id, "A", "1.000", OPEN, "에이", null, 1, null);
        if (changed) {
            fx.seedItem(id, "B", "1.001", OPEN, "비", null, 2, null);
        }
        fx.seedCate(id, "BASE", "1.000", OPEN, "전체", "REGEX", ".*", "CODE");
    }

    private void seedM() {
        seedDraft("M", "변경 있음", true);
    }

    private void seedW() {
        seedDraft("W", "경고 있음", true);
        fx.seedCate("W", "EMPTYC", "1.000", OPEN, "빈 카테고리", "REGEX", "Z.*", "CODE");
    }

    private void seedFirst(String id) {
        fx.seedCode(id, "최초 버전", "MDM", 0);
        jdbc.update("UPDATE TB_MDM_CODE SET STATUS = 'CREATED' WHERE MARU_CODE_ID = ?", id);
        fx.seedVersion(id, "1.000", "DRAFT", "kim", null, null, 0);
        fx.seedItem(id, "A", "1.000", OPEN, "에이", null, 1, null);
        fx.seedCate(id, "BASE", "1.000", OPEN, "전체", "REGEX", ".*", "CODE");
    }

    /** VER 표 전체 모습 — "ver|status|applyFrom|applyTo|rowVersion". 거부 뒤 불변 단언(I19). */
    private List<String> verState(String id) {
        return jdbc.query("SELECT VER, STATUS, APPLY_FROM, APPLY_TO, ROW_VERSION FROM TB_MDM_CODE_VER "
                        + "WHERE MARU_CODE_ID = ? ORDER BY VER",
                (rs, i) -> MasterCodeFixtures.fmt(rs.getBigDecimal(1)) + "|" + rs.getString(2) + "|" + rs.getString(3)
                        + "|" + rs.getString(4) + "|" + rs.getLong(5), id);
    }

    private Map<String, Object> verRow(String id, String ver) {
        return jdbc.queryForList("SELECT * FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = ?", id).stream()
                .filter(r -> MasterCodeFixtures.fmt(new java.math.BigDecimal(r.get("VER").toString())).equals(ver))
                .findFirst().orElseThrow();
    }

    private String storedStatus(String id) {
        return jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE WHERE MARU_CODE_ID = ?", String.class, id);
    }

    private int rowCount(String id) {
        int n = 0;
        for (String t : List.of("TB_MDM_CODE_VER", "TB_MDM_CODE_ITEM", "TB_MDM_CODE_CATE", "TB_MDM_CODE_CATE_ITEM")) {
            n += jdbc.queryForObject("SELECT COUNT(*) FROM " + t + " WHERE MARU_CODE_ID = ?", Integer.class, id);
        }
        return n;
    }

    // ── I28 ──────────────────────────────────────────────────────────────

    @Test
    void 레지스트리의_MASTER_CODE_확정_검사는_운영_빈이다() {
        assertInstanceOf(MasterCodeConfirmCheck.class, registry.confirmCheck(VersionTarget.MASTER_CODE));
    }

    // ── S1 search ────────────────────────────────────────────────────────

    @Test
    void S1_search_는_DRAFT_가_있는_MDM_원천_코드만_ID_순으로() {
        seedM();
        seedDraft("N", "변경 없음", false);
        fx.seedCode("R", "확정만", "MDM", 0);
        fx.seedVersion("R", "1.000", "RELEASED", "kim", PREV_FROM, OPEN_END, 0);
        fx.seedCode("X", "외부", "EXTERNAL", 0);
        fx.seedVersion("X", "1.000", "DRAFT", null, null, null, 0);

        List<Map<String, Object>> rows = list(service.search(search(null)), "rows");

        assertEquals(List.of("M", "N"), rows.stream().map(r -> r.get("maruCodeId")).toList());
        Map<String, Object> m = rows.get(0);
        assertEquals("변경 있음", m.get("maruCodeName"));
        assertEquals("1.001", m.get("ver"));
        assertEquals("v1.001", m.get("verLabel"));
        assertEquals("MINOR", m.get("verKind"));
        assertEquals("kim", m.get("ownerId"));
        assertEquals("INUSE", m.get("codeStatus"));
        assertEquals(List.of("N"), list(service.search(search("n")), "rows").stream().map(r -> r.get("maruCodeId")).toList());
        assertTrue(list(service.search(search("NO_SUCH")), "rows").isEmpty());
    }

    @Test
    void S1_최초_버전_ver_는_소수_세_자리_문자열이다() {
        seedFirst("F");

        Map<String, Object> row = list(service.search(search(null)), "rows").get(0);

        assertEquals("1.000", row.get("ver"));
        assertEquals("CREATED", row.get("codeStatus"));
    }

    // ── S2 view ──────────────────────────────────────────────────────────

    @Test
    void S2_view_는_헤더_대상_직전_diff_카테고리_요약_serverNow_를_준다() {
        seedM();

        Map<String, Object> v = service.view(view("M", null));

        Map<String, Object> header = map(v, "header");
        assertEquals("M", header.get("maruCodeId"));
        assertEquals("INUSE", header.get("status"));
        assertEquals("MDM", header.get("sourceKind"));
        Map<String, Object> version = map(v, "version");
        assertEquals("1.001", version.get("ver"));
        assertEquals("v1.001", version.get("verLabel"));
        assertEquals("DRAFT", version.get("status"));
        assertEquals("kim", version.get("ownerId"));
        assertEquals(RV, ((Number) version.get("rowVersion")).longValue());
        assertNull(version.get("applyFrom"));
        Map<String, Object> previous = map(v, "previous");
        assertEquals("1.000", previous.get("ver"));
        assertEquals(PREV_FROM, previous.get("applyFrom"));
        assertEquals(false, v.get("firstVersion"));
        List<Map<String, Object>> diff = list(v, "diff");
        assertEquals(1, diff.size(), diff.toString());
        assertEquals("ITEM", diff.get(0).get("table"));
        assertEquals("ITEM:B", diff.get(0).get("key"));
        assertEquals("ADDED", diff.get(0).get("kind"));
        assertNull(diff.get(0).get("oldValues"));
        assertEquals("비", ((Map<?, ?>) diff.get(0).get("newValues")).get("NAME"));
        List<Map<String, Object>> changes = list(v, "categoryChanges");
        assertEquals(1, changes.size(), changes.toString());
        assertEquals("BASE", changes.get(0).get("cateId"));
        assertEquals(List.of("B"), changes.get(0).get("addedCodes"));
        assertEquals(false, changes.get(0).get("reduced"));
        assertEquals(List.of(), v.get("unchangedCategories"));
        assertEquals("2026-09-03 00:00:00", v.get("serverNow"));
    }

    @Test
    void S2_ver_를_주면_그_버전을_보고_최초_버전은_previous_가_null() {
        seedM();
        seedFirst("F");

        Map<String, Object> released = service.view(view("M", "1.000"));
        Map<String, Object> first = service.view(view("F", ""));

        assertEquals("RELEASED", map(released, "version").get("status"));
        assertEquals(PREV_FROM, map(released, "version").get("applyFrom"));
        assertNull(first.get("previous"));
        assertEquals(true, first.get("firstVersion"));
        assertEquals("1.000", map(first, "version").get("ver"));
    }

    // ── S3 validate ──────────────────────────────────────────────────────

    @Test
    void S3_validate_는_10행이고_3항은_직전_apply_from_보다_엄격히_뒤여야_통과() {
        seedM();

        Map<String, Object> same = service.validate(validate("M", "1.001", PREV_FROM));
        Map<String, Object> after = service.validate(validate("M", "1.001", "2026-01-01 00:00:01"));

        assertEquals(10, list(after, "rows").size());
        assertEquals(List.of("1", "2", "2-1", "2-2", "3", "4", "5", "6", "7", "8"),
                list(after, "rows").stream().map(r -> r.get("no")).toList());
        assertEquals("REJECTED", status(same, "3"));
        assertEquals("MDM008", ((List<Map<String, Object>>) checkRow(same, "3").get("issues")).get(0).get("code"));
        assertEquals(1, ((Number) same.get("rejectedCount")).intValue());
        assertEquals("PASSED", status(after, "3"));
        assertEquals("PASSED", status(after, "4"));
        assertEquals("DEFERRED", status(after, "5"));
        assertEquals(0, ((Number) after.get("rejectedCount")).intValue());
        assertEquals(0, ((Number) after.get("warnedCount")).intValue());
        assertEquals("APPLY_FROM_ORDER", checkRow(after, "3").get("item"));
        assertEquals("REJECT", checkRow(after, "3").get("severity"));
    }

    @Test
    void S3_최초_버전은_3_4항_면제이고_futureApplyFrom_은_서버_시계_기준() {
        seedFirst("F");

        Map<String, Object> past = service.validate(validate("F", "1.000", "2026-09-03 00:00:00"));
        Map<String, Object> future = service.validate(validate("F", "1.000", "2026-09-03 00:00:01"));

        assertEquals("EXEMPT", status(past, "3"));
        assertEquals("EXEMPT", status(past, "4"));
        assertEquals(false, past.get("futureApplyFrom"));
        assertEquals(true, future.get("futureApplyFrom"));
        assertEquals("2026-09-03 00:00:01", future.get("applyFrom"));
        assertEquals("2026-09-03 00:00:00", future.get("serverNow"));
    }

    @Test
    void S3_경고는_WARNED_로_세고_apply_from_형식_오류와_빈_값은_공통_오류() {
        seedW();

        Map<String, Object> r = service.validate(validate("W", "1.001", "2026-02-01 00:00:00"));

        assertEquals("WARNED", status(r, "2-2"));
        assertEquals(1, ((Number) r.get("warnedCount")).intValue());
        BusinessException bad = assertThrows(BusinessException.class,
                () -> service.validate(validate("W", "1.001", "2026/02/01")));
        assertEquals(ErrorCode.INVALID_VALUE.getCode(), bad.getErrors().get(0).code());
        BusinessException empty = assertThrows(BusinessException.class,
                () -> service.validate(validate("W", "1.001", " ")));
        assertEquals(ErrorCode.REQUIRED_VALUE.getCode(), empty.getErrors().get(0).code());
    }

    // ── S4 validate 쓰기 없음 ────────────────────────────────────────────

    @Test
    void S4_validate_는_쓰기가_없고_DRAFT_가_아니면_MDM002() {
        seedW();
        List<String> before = verState("W");
        int rows = rowCount("W");

        service.validate(validate("W", "1.001", "2026-02-01 00:00:00"));

        assertEquals(before, verState("W"));
        assertEquals(rows, rowCount("W"));
        assertMdm(MdmErrorCode.NOT_DRAFT, () -> service.validate(validate("W", "1.000", "2026-02-01 00:00:00")));
    }

    // ── S5 confirm 거부 경로(I19·I20·I21·I23) ─────────────────────────────

    @Test
    void S5_담당자_역할이_없으면_입력을_보기_전에_MDM013() {
        seedM();
        List<String> before = verState("M");
        currentUser.set("kim", Set.of(MdmRoles.STD_ADMIN));

        assertMdm(MdmErrorCode.STEWARD_ROLE_REQUIRED,
                () -> service.confirm(confirm("M", "1.001", RV, "2026-02-01 00:00:00", false)));
        assertMdm(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> service.confirm(confirm("M", "1.001", RV, null, false)));
        assertMdm(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> service.confirm(confirm(null, null, null, null, null)));
        assertEquals(before, verState("M"));
    }

    @Test
    void S5_소유자가_아니면_MDM003_row_version_불일치면_MDM001() {
        seedM();
        List<String> before = verState("M");

        currentUser.set("lee", Set.of(MdmRoles.STEWARD));
        assertMdm(MdmErrorCode.NOT_DRAFT_OWNER,
                () -> service.confirm(confirm("M", "1.001", RV, "2026-02-01 00:00:00", false)));
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
        assertMdm(MdmErrorCode.ROW_VERSION_CONFLICT,
                () -> service.confirm(confirm("M", "1.001", RV + 1, "2026-02-01 00:00:00", false)));
        assertEquals(before, verState("M"));
    }

    @Test
    void S5_변경_없는_DRAFT_는_MDM010() {
        seedDraft("N", "변경 없음", false);
        List<String> before = verState("N");

        assertMdm(MdmErrorCode.CONFIRM_CHECK_FAILED,
                () -> service.confirm(confirm("N", "1.001", RV, "2026-02-01 00:00:00", true)));
        assertEquals(before, verState("N"));
    }

    @Test
    void S5_경고를_확인하지_않으면_MDM014() {
        seedW();
        List<String> before = verState("W");

        assertMdm(MdmErrorCode.CONFIRM_WARNINGS_NOT_ACKNOWLEDGED,
                () -> service.confirm(confirm("W", "1.001", RV, "2026-02-01 00:00:00", false)));
        assertMdm(MdmErrorCode.CONFIRM_WARNINGS_NOT_ACKNOWLEDGED,
                () -> service.confirm(confirm("W", "1.001", RV, "2026-02-01 00:00:00", null)));
        assertEquals(before, verState("W"));
    }

    @Test
    void S5_apply_from_이_직전과_같으면_MDM008() {
        seedM();
        List<String> before = verState("M");

        assertMdm(MdmErrorCode.APPLY_FROM_NOT_AFTER_PREVIOUS,
                () -> service.confirm(confirm("M", "1.001", RV, PREV_FROM, false)));
        assertEquals(before, verState("M"));
    }

    // ── S6·S9 confirm 성공 ───────────────────────────────────────────────

    @Test
    void S6_S9_확정은_RELEASED_D5_칸_직전_닫기_row_version_정확히_1_증가() {
        seedM();

        Map<String, Object> result = service.confirm(confirm("M", "1.001", RV, "2026-08-01 00:00:00", false));

        Map<String, Object> row = verRow("M", "1.001");
        assertEquals("RELEASED", row.get("STATUS"));
        assertEquals("2026-08-01 00:00:00", row.get("APPLY_FROM"));
        assertEquals(OPEN_END, row.get("APPLY_TO"));
        assertEquals(RV + 1, ((Number) row.get("ROW_VERSION")).longValue());
        assertEquals("kim", row.get("REQUESTED_BY"));
        assertEquals("2026-09-03 00:00:00", row.get("REQUESTED_AT"));
        assertEquals("2026-09-03 00:00:00", row.get("RELEASED_AT"));
        assertNull(row.get("APPROVED_BY"));
        assertNull(row.get("APPROVED_AT"));
        assertEquals("N", row.get("EMERGENCY_YN"));
        assertNull(row.get("EMERGENCY_REASON"));
        assertNull(row.get("REJECT_REASON"));
        assertEquals("2026-08-01 00:00:00", verRow("M", "1.000").get("APPLY_TO"));

        Map<String, Object> confirmed = map(result, "confirmed");
        assertEquals("1.001", confirmed.get("ver"));
        assertEquals(RV + 1, ((Number) confirmed.get("rowVersion")).longValue());
        assertEquals("1.000", result.get("closedPreviousVer"));
        assertEquals(List.of(), result.get("warnings"));
        assertEquals("RELEASED", map(result, "version").get("status"));
        assertEquals("kim", map(result, "version").get("requestedBy"));
        assertEquals(RV + 1, ((Number) map(result, "version").get("rowVersion")).longValue());
    }

    @Test
    void S6_경고를_확인하면_확정하고_경고를_돌려준다() {
        seedW();

        Map<String, Object> result = service.confirm(confirm("W", "1.001", RV, "2026-02-01 00:00:00", true));

        assertEquals("RELEASED", verRow("W", "1.001").get("STATUS"));
        List<Map<String, Object>> warnings = list(result, "warnings");
        assertEquals(1, warnings.size(), warnings.toString());
        assertEquals("CATEGORY_EMPTY", warnings.get(0).get("code"));
        assertEquals("CATE:EMPTYC", warnings.get(0).get("itemKey"));
    }

    // ── S7 CREATED→INUSE(I24) ────────────────────────────────────────────

    @Test
    void S7_apply_from_이_확정_시각과_같으면_저장_상태를_INUSE_로_올린다() {
        seedFirst("F");

        service.confirm(confirm("F", "1.000", 0L, "2026-09-03 00:00:00", false));

        assertEquals("INUSE", storedStatus("F"));
        assertTrue(list(service.search(search("F")), "rows").isEmpty(), "확정 뒤 확정 대기 목록에서 빠진다");
    }

    @Test
    void S7_미래_apply_from_이면_저장_CREATED_이고_시각이_지나면_계산_상태가_INUSE() {
        seedFirst("F");

        Map<String, Object> result = service.confirm(confirm("F", "1.000", 0L, "2026-10-01 00:00:00", false));

        assertEquals("CREATED", storedStatus("F"));
        assertEquals("CREATED", map(result, "header").get("status"));
        assertEquals("CREATED", map(service.view(view("F", "1.000")), "header").get("status"));
        assertEquals("CREATED", codeMngRow("F").getStatus());

        clock.setLocal(LocalDateTime.of(2026, 10, 1, 0, 0, 0));

        assertEquals("INUSE", map(service.view(view("F", "1.000")), "header").get("status"));
        assertEquals("INUSE", codeMngRow("F").getStatus());
        assertEquals("CREATED", storedStatus("F"));
    }

    private CodeMngRow codeMngRow(String id) {
        CodeMngSearchRequest r = new CodeMngSearchRequest();
        r.setKeyword(id);
        return codeMngService.search(r).getRows().stream().filter(row -> id.equals(row.getMaruCodeId())).findFirst()
                .orElseThrow();
    }

    // ── S8 직전 RELEASED 정의 공유(I8) ────────────────────────────────────

    @Test
    void S8_validate_3항과_confirm_MDM008_이_같은_직전_RELEASED_를_쓴다() {
        fx.seedCode("P", "직전 둘", "MDM", 0);
        fx.seedVersion("P", "1.000", "RELEASED", "kim", "2025-01-01 00:00:00", PREV_FROM, 0);
        fx.seedVersion("P", "1.001", "RELEASED", "kim", PREV_FROM, OPEN_END, 0);
        fx.seedVersion("P", "1.002", "DRAFT", "kim", null, null, 0);
        fx.seedItem("P", "A", "1.000", OPEN, "에이", null, 1, null);
        fx.seedItem("P", "B", "1.002", OPEN, "비", null, 2, null);
        fx.seedCate("P", "BASE", "1.000", OPEN, "전체", "REGEX", ".*", "CODE");
        String between = "2025-06-01 00:00:00";

        Map<String, Object> v = service.validate(validate("P", "1.002", between));

        assertEquals("REJECTED", status(v, "3"));
        assertEquals("1.001", map(service.view(view("P", "1.002")), "previous").get("ver"));
        assertMdm(MdmErrorCode.APPLY_FROM_NOT_AFTER_PREVIOUS,
                () -> service.confirm(confirm("P", "1.002", 0L, between, false)));
        assertEquals("PASSED", status(service.validate(validate("P", "1.002", "2026-01-01 00:00:01")), "3"));
        service.confirm(confirm("P", "1.002", 0L, "2026-01-01 00:00:01", false));
        assertEquals("RELEASED", verRow("P", "1.002").get("STATUS"));
        assertEquals("2026-01-01 00:00:01", verRow("P", "1.001").get("APPLY_TO"));
    }

    @Test
    void META_코드_확정은_코드를_기록한다() {
        seedM();
        MetaRevTestSupport.clear(jdbc);
        service.confirm(confirm("M", "1.001", RV, "2026-08-01 00:00:00", false));
        assertEquals(List.of("CODE:M:SAVE"), MetaRevTestSupport.rows(jdbc));
    }
}
