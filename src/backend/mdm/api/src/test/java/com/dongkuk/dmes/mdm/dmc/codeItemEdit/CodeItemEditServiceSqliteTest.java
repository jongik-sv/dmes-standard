package com.dongkuk.dmes.mdm.dmc.codeItemEdit;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN_END;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.assertMdm;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.byCode;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.cateRow;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.codes;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.deleted;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.list;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.map;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.memberRow;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.patch;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.revert;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.row;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.save;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.view;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeTestConfig;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemSearchRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.service.CodeItemEditService;
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
 * TSK-06-03 design.md §4.5 S1~S17 — codeItemEdit 서비스(조회·모습·저장·되돌리기·검사·경미 수정)를 local(SQLite)
 * 컨텍스트로 돌린다. 서비스에는 {@code @Transactional} 이 없고 OASIS 가 프로세스 트랜잭션을 건다 — 이 시험은 트랜잭션
 * 없이 직접 불러, 검사가 {@code beginDraftWrite} 보다 먼저라는 것(S7, 불변 규칙 22)을 드러낸다.
 *
 * <p>기본 시드 {@code M}(lvl_cnt 2): 1.000 RELEASED(행 A·B·C, 경로 G/H), 1.001 DRAFT(소유자 kim, row_version 3).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class CodeItemEditServiceSqliteTest extends AbstractMdmSharedDbTest {

    private static final long RV = 3L;

    @Autowired
    CodeItemEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;

    private MasterCodeFixtures fx;
    private JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        fx = new MasterCodeFixtures(jdbc);
        fx.clear();
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
    }

    private void seedM() {
        fx.seedCode("M", "시험 코드", "MDM", 2, "라벨1");
        fx.seedVersion("M", "1.000", "RELEASED", "kim", "2026-01-01 00:00:00", OPEN_END, 0);
        fx.seedVersion("M", "1.001", "DRAFT", "kim", null, null, RV);
        fx.seedItem("M", "A", "1.000", OPEN, "에이", null, 1, "a1", "G");
        fx.seedItem("M", "B", "1.000", OPEN, "비", null, 2, null, "G");
        fx.seedItem("M", "C", "1.000", OPEN, "씨", null, 3, null, "H");
        fx.seedCate("M", "BASE", "1.000", OPEN, "전체", "REGEX", ".*", "CODE");
    }

    // ── S1 search ──────────────────────────────────────────────────────

    @Test
    void S1_검색은_ID_순이고_키워드는_ID_이름_부분_일치_대소문자_무시() {
        fx.seedProcCdBeforeDraftEdits();
        fx.seedSteelStd();
        fx.seedEqpCd();

        List<Map<String, Object>> all = list(service.search(new CodeItemSearchRequest()), "codes");
        assertEquals(List.of("EQP_CD", "PROC_CD", "STEEL_STD"), all.stream().map(r -> r.get("maruCodeId")).toList());
        Map<String, Object> steel = all.get(2);
        assertEquals("강종 규격", steel.get("maruCodeName"));
        assertEquals("MDM", steel.get("sourceKind"));
        assertEquals("INUSE", steel.get("status"));
        assertEquals(3, steel.get("lvlCnt"));

        CodeItemSearchRequest byId = new CodeItemSearchRequest();
        byId.setKeyword("steel");
        assertEquals(List.of("STEEL_STD"), list(service.search(byId), "codes").stream().map(r -> r.get("maruCodeId")).toList());
        CodeItemSearchRequest byName = new CodeItemSearchRequest();
        byName.setKeyword("공정");
        assertEquals(List.of("PROC_CD"), list(service.search(byName), "codes").stream().map(r -> r.get("maruCodeId")).toList());
    }

    // ── S2~S6 view ─────────────────────────────────────────────────────

    @Test
    void S2_기본_버전은_DRAFT_없으면_CANCELLED_아닌_최대_버전은_내림차순_v_표시() {
        fx.seedProcCdBeforeDraftEdits();
        Map<String, Object> proc = service.view(view("PROC_CD", null));
        assertEquals("2.000", map(proc, "selected").get("ver"));
        assertEquals(List.of("2.000", "1.001", "1.000"), list(proc, "versions").stream().map(v -> v.get("ver")).toList());
        assertEquals(List.of("v2.000", "v1.001", "v1.000"),
                list(proc, "versions").stream().map(v -> v.get("display")).toList());

        fx.seedCode("N", "초안 없음", "MDM", 0);
        fx.seedVersion("N", "1.000", "RELEASED", "kim", "2026-01-01 00:00:00", OPEN_END, 0);
        fx.seedVersion("N", "1.001", "CANCELLED", "kim", "2026-08-01 00:00:00", "2026-09-01 00:00:00", 0);
        assertEquals("1.000", map(service.view(view("N", "")), "selected").get("ver"));

        fx.seedCode("E", "버전 없음", "MDM", 0);
        Map<String, Object> empty = service.view(view("E", null));
        assertNull(empty.get("selected"));
        assertEquals(List.of(), empty.get("rows"));
    }

    @Test
    void S3_DRAFT_소유자만_편집_가능하고_미적용_2개면_경고() {
        seedM();
        Map<String, Object> mine = map(service.view(view("M", "1.001")), "selected");
        assertEquals(true, mine.get("editable"));
        assertEquals(RV, ((Number) mine.get("rowVersion")).longValue());
        assertEquals("kim", mine.get("ownerId"));
        assertNull(mine.get("warning"));

        currentUser.set("lee", Set.of(MdmRoles.STEWARD));
        assertEquals(false, map(service.view(view("M", "1.001")), "selected").get("editable"));

        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
        fx.seedVersion("M", "1.002", "RELEASED", "kim", "2026-12-01 00:00:00", OPEN_END, 0);
        Map<String, Object> two = map(service.view(view("M", "1.001")), "selected");
        assertEquals(false, two.get("editable"));
        assertEquals("MULTIPLE_UNAPPLIED", two.get("warning"));
    }

    @Test
    void S4_RELEASED_CANCELLED_는_읽기_전용이고_행마다_변경_표시() {
        seedM();
        fx.seedVersion("M", "1.002", "CANCELLED", "kim", "2026-08-01 00:00:00", "2026-09-01 00:00:00", 0);
        service.save(save("M", "1.001", RV), List.of(
                row("CHANGED", "A", "새 에이", 1, "G"), deleted("B"), row("ADDED", "D", "디", 4, "H")), List.of(), List.of());

        Map<String, Object> draft = service.view(view("M", "1.001"));
        List<Map<String, Object>> rows = list(draft, "rows");
        assertEquals("CHANGED", byCode(rows, "A").get("change"));
        assertEquals("에이", map(byCode(rows, "A"), "prev").get("name"));
        assertEquals("ADDED", byCode(rows, "D").get("change"));
        assertEquals("NONE", byCode(rows, "C").get("change"));
        assertEquals(List.of("B"), codes(list(draft, "closed")), "수정의 옛 행은 닫힌 행 목록에 넣지 않는다");

        Map<String, Object> released = map(service.view(view("M", "1.000")), "selected");
        assertEquals(false, released.get("editable"));
        assertEquals(true, released.get("patchable"));
        assertEquals("RELEASED", released.get("status"));
        Map<String, Object> cancelled = map(service.view(view("M", "1.002")), "selected");
        assertEquals(false, cancelled.get("editable"));
        assertEquals(false, cancelled.get("patchable"));
    }

    @Test
    void S5_행마다_열린_소속_카테고리와_경미_수정_차단_여부() {
        seedM();
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);
        fx.seedCateItem("M", "T1", "A", "1.000", OPEN);
        fx.seedCateItem("M", "T1", "B", "1.000", OPEN);
        service.save(save("M", "1.001", RV), List.of(row("CHANGED", "A", "새 에이", 1, "G")), List.of(), List.of());

        List<Map<String, Object>> rows = list(service.view(view("M", "1.000")), "rows");
        assertEquals(List.of("T1"), byCode(rows, "A").get("tableCategories"));
        assertEquals(List.of(), byCode(rows, "C").get("tableCategories"));
        assertEquals(true, byCode(rows, "A").get("patchBlocked"));
        assertEquals(false, byCode(rows, "B").get("patchBlocked"));
        assertEquals("1.000", byCode(rows, "A").get("fromVer"));
    }

    @Test
    void S6_헤더는_lvlCnt_라벨_있는_추가_컬럼_V_에_유효한_카테고리() {
        fx.seedSteelStd();

        Map<String, Object> v = service.view(view("STEEL_STD", null));

        Map<String, Object> header = map(v, "header");
        assertEquals(3, header.get("lvlCnt"));
        assertEquals(List.of(Map.of("no", 1, "label", "인장강도")), header.get("attrLabels"));
        assertEquals(List.of(Map.of("cateId", "BASE", "cateName", "전체", "defKind", "REGEX")), v.get("categories"));
    }

    // ── S7~S12 save·revert·validate ─────────────────────────────────────

    @Test
    void S7_검사에_걸린_저장은_ROW_VERSION_과_행을_바꾸지_않는다() {
        fx.seedSteelStd();
        List<String> before = fx.itemSegments("STEEL_STD");

        assertMdm(MdmErrorCode.CODE_SAVE_REJECTED, () -> service.save(save("STEEL_STD", "1.001", 0L),
                List.of(row("ADDED", "X-2", "x", 1, "JIS", "KS-3")), List.of(), List.of()));

        assertEquals(0L, fx.rowVersion("STEEL_STD", "1.001"));
        assertEquals(before, fx.itemSegments("STEEL_STD"));
    }

    @Test
    void S8_정상_저장은_ROW_VERSION_을_정확히_1_올린다() {
        seedM();

        Map<String, Object> r = service.save(save("M", "1.001", RV), List.of(row("ADDED", "D", "디", 4, "H"),
                row("CHANGED", "A", "새 에이", 1, "G")), List.of(), List.of());

        assertEquals(RV + 1, ((Number) r.get("rowVersion")).longValue());
        assertEquals(RV + 1, fx.rowVersion("M", "1.001"));
    }

    @Test
    void S9_저장_전제_소유자_row_version_DRAFT_미적용_빈_요청() {
        seedM();
        List<Map<String, Object>> add = List.of(row("ADDED", "D", "디", 4, "H"));

        currentUser.set("lee", Set.of(MdmRoles.STEWARD));
        assertMdm(MdmErrorCode.NOT_DRAFT_OWNER, () -> service.save(save("M", "1.001", RV), add, List.of(), List.of()));
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
        assertMdm(MdmErrorCode.ROW_VERSION_CONFLICT, () -> service.save(save("M", "1.001", RV - 1), add, List.of(), List.of()));
        assertMdm(MdmErrorCode.NOT_DRAFT, () -> service.save(save("M", "1.000", 0L), add, List.of(), List.of()));
        assertMdm(MdmErrorCode.INVALID_INPUT, () -> service.save(save("M", "1.001", RV), List.of(), List.of(), List.of()));
        fx.seedVersion("M", "1.002", "RELEASED", "kim", "2026-12-01 00:00:00", OPEN_END, 0);
        assertMdm(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS, () -> service.save(save("M", "1.001", RV), add, List.of(), List.of()));

        assertEquals(RV, fx.rowVersion("M", "1.001"));
        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
    }

    @Test
    void S10_되돌리기는_전제를_거쳐_ROW_VERSION_을_1_올린다() {
        seedM();
        service.save(save("M", "1.001", RV), List.of(row("CHANGED", "A", "새 에이", 1, "G")), List.of(), List.of());

        currentUser.set("lee", Set.of(MdmRoles.STEWARD));
        assertMdm(MdmErrorCode.NOT_DRAFT_OWNER, () -> service.revert(revert("M", "1.001", RV + 1, "A")));
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
        assertMdm(MdmErrorCode.ROW_VERSION_CONFLICT, () -> service.revert(revert("M", "1.001", RV, "A")));

        Map<String, Object> r = service.revert(revert("M", "1.001", RV + 1, "A"));

        assertEquals(RV + 2, ((Number) r.get("rowVersion")).longValue());
        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
    }

    @Test
    void S10b_되돌린_결과가_계층_검사에_걸리면_MDM022() {
        seedM();
        fx.seedItem("M", "Q", "1.000", "1.001", "큐", null, 5, null, "X", "Z");
        fx.seedItem("M", "R", "1.001", OPEN, "알", null, 6, null, "Y", "Z");

        BusinessException e = assertMdm(MdmErrorCode.CODE_SAVE_REJECTED,
                () -> service.revert(revert("M", "1.001", RV, "Q")));

        assertTrue(e.getMessage().contains("LVL_PARENT_MISMATCH"), e.getMessage());
    }

    @Test
    void S11_validate_는_이슈를_성공_응답으로_주고_아무것도_바꾸지_않는다() {
        seedM();
        currentUser.set("lee", Set.of(MdmRoles.STD_ADMIN));

        Map<String, Object> r = service.validate(save("M", "1.001", null), List.of(row("ADDED", "A B", "x", 9, "G")), List.of(), List.of());

        List<Map<String, Object>> issues = list(r, "issues");
        assertEquals(List.of("CODE_FORBIDDEN_CHAR"), issues.stream().map(i -> i.get("code")).toList());
        assertEquals("A B", issues.get(0).get("itemKey"));
        assertEquals("code", issues.get(0).get("field"));
        assertEquals(RV, fx.rowVersion("M", "1.001"));
        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
    }

    @Test
    void S12_계층_검사의_비교_기준은_V_에_유효한_행이다() {
        seedM();
        fx.seedItem("M", "Q", "1.000", "1.001", "큐", null, 5, null, "X", "Z");

        Map<String, Object> r = service.validate(save("M", "1.001", null), List.of(row("ADDED", "N", "엔", 7, "Y", "Z")), List.of(), List.of());

        assertEquals(List.of(), r.get("issues"));
    }

    // ── S13~S17 경미 수정 ───────────────────────────────────────────────

    @Test
    void S13_경미_수정은_이름_약칭_순서_설명만_바꾼다() {
        seedM();
        String before = lockedColumns("A");

        Map<String, Object> r = service.patch(patch("M", "A", "1.000", "고친 에이", "약칭", 11, "설명"));

        assertEquals(before, lockedColumns("A"));
        assertEquals("고친 에이|약칭|11|설명", jdbc.queryForObject("SELECT NAME || '|' || ALTER_NAME || '|' || SEQ || '|' "
                + "|| DESCRIPTION FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = 'M' AND CODE = 'A'", String.class));
        assertEquals(RV, fx.rowVersion("M", "1.001"));
        assertEquals(0L, fx.rowVersion("M", "1.000"));
        assertEquals(0, jdbc.queryForObject("SELECT LAST_CHG_SEQ FROM TB_MDM_CODE WHERE MARU_CODE_ID = 'M'", Integer.class));
        assertEquals("고친 에이", map(r, "row").get("name"));
    }

    @Test
    void S14_DRAFT_가_같은_키를_고쳤으면_거부_닫기만_했으면_허용() {
        seedM();
        service.save(save("M", "1.001", RV), List.of(row("CHANGED", "A", "새 에이", 1, "G"), deleted("B")), List.of(), List.of());

        BusinessException e = assertMdm(MdmErrorCode.CODE_PATCH_REJECTED,
                () -> service.patch(patch("M", "A", "1.000", "x", null, 1, null)));
        assertTrue(e.getMessage().contains("DRAFT에서 고치세요"), e.getMessage());
        assertTrue(e.getMessage().contains("PATCH_KEY_CHANGED_IN_UNAPPLIED"), e.getMessage());

        service.patch(patch("M", "B", "1.000", "고친 비", null, 2, null));
        assertEquals("고친 비", jdbc.queryForObject("SELECT NAME FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = 'M' AND CODE = 'B'",
                String.class));
    }

    @Test
    void S15_RELEASED_가_아닌_행과_없는_키() {
        seedM();
        service.save(save("M", "1.001", RV), List.of(row("ADDED", "D", "디", 4, "H")), List.of(), List.of());

        BusinessException e = assertMdm(MdmErrorCode.CODE_PATCH_REJECTED,
                () -> service.patch(patch("M", "D", "1.001", "x", null, 1, null)));
        assertTrue(e.getMessage().contains("PATCH_NOT_RELEASED"), e.getMessage());
        assertMdm(MdmErrorCode.INVALID_INPUT, () -> service.patch(patch("M", "ZZ", "1.000", "x", null, 1, null)));
    }

    @Test
    void S16_미적용_2개면_MDM007_이고_적용_시작이_지금이면_적용된_것으로_본다() {
        seedM();
        fx.seedVersion("M", "1.002", "RELEASED", "kim", "2026-09-03 00:00:00", OPEN_END, 0);
        service.patch(patch("M", "A", "1.000", "경계 통과", null, 1, null));

        fx.seedVersion("M", "1.003", "RELEASED", "kim", "2026-09-03 00:00:01", OPEN_END, 0);
        assertMdm(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS,
                () -> service.patch(patch("M", "A", "1.000", "x", null, 1, null)));
    }

    @Test
    void S17_경미_수정은_담당자만() {
        seedM();
        currentUser.set("kim", Set.of(MdmRoles.STD_ADMIN));

        assertMdm(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> service.patch(patch("M", "A", "1.000", "x", null, 1, null)));
    }

    // ── S18~S22 코드 행·카테고리 합친 저장(2026-09-28 화면 합치기) ─────────────

    @Test
    void S18_새_코드를_같은_저장에서_TABLE_소속으로_넣으면_한_번에_저장되고_ROW_VERSION_은_1_오른다() {
        seedM();
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);

        Map<String, Object> r = service.save(save("M", "1.001", RV), List.of(row("ADDED", "D", "디", 4, "H")),
                List.of(), List.of(memberRow("ADDED", "T1", "D")));

        assertEquals(RV + 1, ((Number) r.get("rowVersion")).longValue());
        assertEquals(RV + 1, fx.rowVersion("M", "1.001"));
        assertTrue(fx.itemSegments("M").contains("D@1.001-9999"), fx.itemSegments("M").toString());
        assertEquals(List.of("T1 D@1.001-9999"), fx.cateItemSegments("M"));
        assertEquals(Map.of(), r.get("closedCategories"));
    }

    @Test
    void S19_새_TABLE_카테고리_새_코드_소속을_한_번에_넣으면_코드_카테고리_소속_순으로_쓴다() {
        seedM();

        Map<String, Object> r = service.save(save("M", "1.001", RV), List.of(row("ADDED", "D", "디", 4, "H")),
                List.of(cateRow("ADDED", "T2", "표2", "TABLE", null, null)),
                List.of(memberRow("ADDED", "T2", "D"), memberRow("ADDED", "T2", "A")));

        assertEquals(RV + 1, ((Number) r.get("rowVersion")).longValue());
        assertEquals(List.of("BASE@1.000-9999", "T2@1.001-9999"), fx.cateSegments("M"));
        assertEquals(List.of("T2 A@1.001-9999", "T2 D@1.001-9999"), fx.cateItemSegments("M"));
    }

    @Test
    void S20_카테고리_이슈가_있으면_코드_행도_쓰지_않고_코드_행_이슈와_함께_거부한다() {
        seedM();
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);
        List<String> items = fx.itemSegments("M");

        BusinessException e = assertMdm(MdmErrorCode.CODE_SAVE_REJECTED, () -> service.save(save("M", "1.001", RV),
                List.of(row("ADDED", "D", "디", 4, "H"), deleted("B"), row("ADDED", "A B", "x", 9, "G")),
                List.of(cateRow("ADDED", "R1", "정규식", "REGEX", "[", "CODE")),
                List.of(memberRow("ADDED", "T1", "B"), memberRow("ADDED", "BASE", "D"))));

        assertTrue(e.getMessage().contains("CODE_FORBIDDEN_CHAR"), e.getMessage());
        assertTrue(e.getMessage().contains("B[code] MEMBER_CODE_NOT_FOUND"), "같은 저장에서 지운 코드는 소속으로 못 넣는다: "
                + e.getMessage());
        assertTrue(e.getMessage().contains("INVALID_REGEX"), e.getMessage());
        assertEquals(RV, fx.rowVersion("M", "1.001"));
        assertEquals(items, fx.itemSegments("M"));
        assertEquals(List.of("BASE@1.000-9999", "T1@1.000-9999"), fx.cateSegments("M"));
        assertEquals(List.of(), fx.cateItemSegments("M"));
    }

    @Test
    void S21_BASE_소속_변경은_검사가_깨끗해도_쓰기_전에_MDM012() {
        seedM();

        assertMdm(MdmErrorCode.RESERVED_CATEGORY, () -> service.save(save("M", "1.001", RV),
                List.of(row("ADDED", "D", "디", 4, "H")),
                List.of(cateRow("CHANGED", "BASE", "전체 바꿈", "REGEX", ".*", "CODE")), List.of()));

        assertEquals(RV, fx.rowVersion("M", "1.001"));
        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));

        // validate 도 같은 판정을 cateIssues 로 알린다(save 만 거부하고 validate 는 깨끗하면 화면이 이유를 못 보인다).
        Map<String, Object> r = service.validate(save("M", "1.001", null),
                List.of(row("ADDED", "D", "디", 4, "H")),
                List.of(cateRow("CHANGED", "BASE", "전체 바꿈", "REGEX", ".*", "CODE")), List.of());
        assertEquals(List.of(), r.get("issues"));
        List<Map<String, Object>> cateIssues = list(r, "cateIssues");
        assertEquals(List.of("RESERVED_CATEGORY"), cateIssues.stream().map(i -> i.get("code")).toList());
        assertEquals("BASE", cateIssues.get(0).get("itemKey"));
    }

    @Test
    void S22_validate_는_코드_행_이슈와_카테고리_이슈를_나눠_주고_save_와_같은_모습_위에서_판정한다() {
        seedM();
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);

        Map<String, Object> r = service.validate(save("M", "1.001", null),
                List.of(row("ADDED", "D", "디", 4, "H"), deleted("B")), List.of(),
                List.of(memberRow("ADDED", "T1", "D"), memberRow("ADDED", "T1", "B"), memberRow("ADDED", "NOPE", "A")));

        assertEquals(List.of(), r.get("issues"));
        List<Map<String, Object>> cateIssues = list(r, "cateIssues");
        assertEquals(List.of("MEMBER_CODE_NOT_FOUND", "CATE_NOT_FOUND"), cateIssues.stream().map(i -> i.get("code")).toList());
        assertEquals("B", cateIssues.get(0).get("itemKey"));
        assertEquals("NOPE", cateIssues.get(1).get("itemKey"));
        assertEquals(RV, fx.rowVersion("M", "1.001"));
        assertEquals(List.of(), fx.cateItemSegments("M"));

        Map<String, Object> clean = service.validate(save("M", "1.001", null), List.of(row("ADDED", "D", "디", 4, "H")),
                List.of(), List.of(memberRow("ADDED", "T1", "D")));
        assertEquals(List.of(), clean.get("issues"));
        assertEquals(List.of(), clean.get("cateIssues"), "같은 저장에서 넣은 코드는 소속으로 받는다");
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private String lockedColumns(String code) {
        return jdbc.queryForObject("SELECT CODE || '|' || FROM_VER || '|' || TO_VER || '|' || NVL(LVL1, '-') || '|' "
                + "|| NVL(LVL2, '-') || '|' || NVL(ATTR01, '-') FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = 'M' AND CODE = ?",
                String.class, code);
    }

    @Test
    void META_경미_수정은_코드를_기록한다() {
        seedM();
        MetaRevTestSupport.clear(jdbc);
        service.patch(patch("M", "A", "1.000", "고친 에이", "약칭", 11, "설명"));
        assertEquals(List.of("CODE:M:SAVE"), MetaRevTestSupport.rows(jdbc));
    }
}
