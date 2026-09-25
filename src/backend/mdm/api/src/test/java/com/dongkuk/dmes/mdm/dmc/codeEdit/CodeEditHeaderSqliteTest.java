package com.dongkuk.dmes.mdm.dmc.codeEdit;

import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN_END;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.PAST;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.PAST2;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeDeprecateRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditSearchRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditView;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditViewRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeHeaderSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionRow;
import com.dongkuk.dmes.mdm.dmc.codeEdit.service.CodeEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-06-02 design.md §3.2 E1~E11 — 마루 코드 수정 헤더·라벨·폐기·계산 상태(불변 규칙 I6·I8·I12·I13·I18·I19).
 * 운영 경로처럼 서비스 호출을 {@link TransactionTemplate} 으로 감싸고, 커밋된 행을 JdbcTemplate 으로 읽는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class CodeEditHeaderSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    CodeEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager transactionManager;

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private MasterCodeSeeds seeds;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        seeds = new MasterCodeSeeds(jdbc);
        seeds.clear();
        currentUser.set("stw1", Set.of("MDM_STEWARD"));
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void E1_view_는_헤더_라벨_버전_목록_flags_me_steward_를_준다() {
        seeds.seedCode("PROC_CD", "INUSE", "MDM");
        jdbc.update("UPDATE TB_MDM_CODE SET ATTR01_NAME = '인장강도', ATTR10_NAME = '비고', DESCRIPTION = '설명' WHERE MARU_CODE_ID = 'PROC_CD'");
        seeds.released("PROC_CD", "1.000", PAST, PAST2);
        seeds.released("PROC_CD", "1.001", PAST2, OPEN_END);
        seeds.draft("PROC_CD", "2.000", "stw1");
        jdbc.update("UPDATE TB_MDM_CODE_VER SET RESTORED_FROM = 1.0 WHERE MARU_CODE_ID = 'PROC_CD' AND VER = 2.0");

        CodeEditView v = view("PROC_CD");

        assertEquals("PROC_CD", v.getHeader().getMaruCodeId());
        assertEquals("PROC_CD 이름", v.getHeader().getMaruCodeName());
        assertEquals("설명", v.getHeader().getDescription());
        assertEquals("인장강도", v.getHeader().getAttr01Name());
        assertNull(v.getHeader().getAttr02Name());
        assertEquals("비고", v.getHeader().getAttr10Name());
        assertEquals(0L, v.getHeader().getAuditVer());
        assertEquals("v1.001", v.getHeader().getCurrentVerLabel());
        assertEquals("v2.000 DRAFT", v.getHeader().getUnappliedLabel());

        List<CodeVersionRow> rows = v.getVersions();
        assertEquals(List.of("2.000", "1.001", "1.000"), rows.stream().map(CodeVersionRow::getVer).toList(), "ver 내림차순");
        CodeVersionRow draft = rows.get(0);
        assertEquals("v2.000", draft.getVerLabel());
        assertEquals("v1.000 복원", draft.getRestoredLabel());
        assertEquals("1.000", draft.getRestoredFrom());
        assertEquals("stw1", draft.getOwnerId());
        assertTrue(draft.isUnapplied());
        assertEquals(0L, draft.getRowVersion());
        CodeVersionRow cur = rows.get(1);
        assertEquals("2026-03-01 00:00:00", cur.getApplyFrom());
        assertEquals("9999-12-31 00:00:00", cur.getApplyTo());
        assertEquals("2026-03-01 00:00:00", cur.getReleasedAt());
        assertNull(cur.getRestoredLabel());
        assertFalse(cur.isUnapplied());

        assertEquals(1, v.getFlags().getUnappliedCount());
        assertFalse(v.getFlags().isCanNewMajor(), "미적용이 있으면 새 버전 불가");
        assertFalse(v.getFlags().isCanNewMinor());
        assertEquals("3.000", v.getFlags().getNextMajor());
        assertEquals("2.001", v.getFlags().getNextMinor());
        assertFalse(v.getFlags().isCanDeprecate());
        assertTrue(v.getFlags().isEditable());
        assertEquals(List.of("1.001", "1.000"), v.getRestoreSources());
        assertEquals("stw1", v.getMe());
        assertTrue(v.isSteward());

        currentUser.set("adm", Set.of("MDM_STD_ADMIN"));
        CodeEditView byAdmin = view("PROC_CD");
        assertFalse(byAdmin.isSteward());
        assertFalse(byAdmin.getFlags().isEditable(), "조회는 되지만 편집 가능 아님");
    }

    @Test
    void E1b_search_는_코드_선택_목록을_준다() {
        seeds.seedCode("PROC_CD", "CREATED", "MDM");
        seeds.seedCode("GRADE_CD", "INUSE", "MDM");
        CodeEditSearchRequest r = new CodeEditSearchRequest();
        Map<String, Object> all = tx.execute(s -> service.searchCodes(r));
        assertEquals(2, ((List<?>) all.get("rows")).size());
        r.setKeyword("proc");
        Map<String, Object> one = tx.execute(s -> service.searchCodes(r));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) one.get("rows");
        assertEquals(1, rows.size());
        assertEquals("PROC_CD", rows.get(0).get("maruCodeId"));
        assertEquals("PROC_CD 이름", rows.get(0).get("maruCodeName"));
    }

    @Test
    void E2_saveHeader_는_이름_설명_계층_칸_수_라벨을_저장하고_auditVer_를_올린다() {
        seeds.seedCode("PROC_CD", "CREATED", "MDM");
        jdbc.update("UPDATE TB_MDM_CODE SET ATTR02_NAME = '옛 라벨' WHERE MARU_CODE_ID = 'PROC_CD'");
        CodeHeaderSaveRequest r = header("PROC_CD", 0L, "새 이름", "새 설명", 3);
        r.setAttr01Name("인장강도");
        r.setAttr02Name("  ");

        CodeEditView v = tx.execute(s -> service.saveHeader(r));

        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM TB_MDM_CODE WHERE MARU_CODE_ID = 'PROC_CD'");
        assertEquals("새 이름", row.get("MARU_CODE_NAME"));
        assertEquals("새 설명", row.get("DESCRIPTION"));
        assertEquals(3, ((Number) row.get("LVL_CNT")).intValue());
        assertEquals("인장강도", row.get("ATTR01_NAME"));
        assertNull(row.get("ATTR02_NAME"), "공백 라벨은 NULL");
        assertEquals(1L, ((Number) row.get("VER")).longValue());
        assertEquals(1L, v.getHeader().getAuditVer(), "응답은 새 auditVer");
        assertEquals("새 이름", v.getHeader().getMaruCodeName());
    }

    @Test
    void E3_auditVer_가_다르면_MDM001() {
        seeds.seedCode("PROC_CD", "CREATED", "MDM");
        assertCode(MdmErrorCode.ROW_VERSION_CONFLICT, () -> tx.execute(s -> service.saveHeader(header("PROC_CD", 5L, "이름", null, 0))));
        assertCode(MdmErrorCode.ROW_VERSION_CONFLICT, () -> tx.execute(s -> service.saveHeader(header("PROC_CD", null, "이름", null, 0))));
        assertEquals("PROC_CD 이름", jdbc.queryForObject("SELECT MARU_CODE_NAME FROM TB_MDM_CODE", String.class));
        // 이름 필수·길이, 계층 칸 수 범위
        assertCode(MdmErrorCode.INVALID_INPUT, () -> tx.execute(s -> service.saveHeader(header("PROC_CD", 0L, " ", null, 0))));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> tx.execute(s -> service.saveHeader(header("PROC_CD", 0L, "가".repeat(101), null, 0))));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> tx.execute(s -> service.saveHeader(header("PROC_CD", 0L, "이름", null, 6))));
        CodeHeaderSaveRequest longLabel = header("PROC_CD", 0L, "이름", null, 0);
        longLabel.setAttr03Name("라".repeat(101));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> tx.execute(s -> service.saveHeader(longLabel)));
    }

    @Test
    void E4_계층_칸_수_줄이기는_열린_행과_현재_적용_이후에_닫힌_행의_값을_본다() {
        seeds.seedCode("PROC_CD", "INUSE", "MDM");
        seeds.setLvlCnt("PROC_CD", 3);
        seeds.released("PROC_CD", "1.000", PAST, PAST2);
        seeds.released("PROC_CD", "1.001", PAST2, OPEN_END);
        // 현재 적용 1.001 이전에 닫힌 행(to 1.001)의 LVL3 — 줄이기 허용
        seeds.seedItem("PROC_CD", "A", "1.000", "1.001", "a", 1, "L1", "L2", "L3");
        seeds.seedItem("PROC_CD", "A", "1.001", OPEN, "a", 1, "L1", "L2");

        CodeEditView v = tx.execute(s -> service.saveHeader(header("PROC_CD", 0L, "이름", null, 2)));
        assertEquals(2, v.getHeader().getLvlCnt());

        // 늘리기는 항상 허용
        tx.execute(s -> service.saveHeader(header("PROC_CD", 1L, "이름", null, 5)));
        // 열린 행 LVL2 값 → 1 로 줄이기 거부
        assertCode(MdmErrorCode.INVALID_INPUT, () -> tx.execute(s -> service.saveHeader(header("PROC_CD", 2L, "이름", null, 1))));

        // DRAFT 에서 닫힌(to_ver = DRAFT) 행에 LVL4 값 → 3 으로 줄이기 거부
        seeds.draft("PROC_CD", "1.002", "stw1");
        seeds.seedItem("PROC_CD", "B", "1.001", "1.002", "b", 2, "L1", "L2", "L3", "L4");
        assertCode(MdmErrorCode.INVALID_INPUT, () -> tx.execute(s -> service.saveHeader(header("PROC_CD", 2L, "이름", null, 3))));
        tx.execute(s -> service.saveHeader(header("PROC_CD", 2L, "이름", null, 4)));
        assertEquals(4, jdbc.queryForObject("SELECT LVL_CNT FROM TB_MDM_CODE", Integer.class));
    }

    @Test
    void E4b_현재_적용_버전이_없으면_모든_행을_본다() {
        seeds.seedCode("PROC_CD", "CREATED", "MDM");
        seeds.setLvlCnt("PROC_CD", 2);
        seeds.draft("PROC_CD", "1.000", "stw1");
        seeds.seedItem("PROC_CD", "A", "1.000", "1.000", "a", 1, "L1", "L2");
        assertCode(MdmErrorCode.INVALID_INPUT, () -> tx.execute(s -> service.saveHeader(header("PROC_CD", 0L, "이름", null, 1))));
    }

    @Test
    void E4c_버전_번호_비교는_수로_한다() {
        // 문자열 비교면 "9.500" > "10.000" 이라 닫힌 행을 열린 행처럼 본다(I20).
        seeds.seedCode("PROC_CD", "INUSE", "MDM");
        seeds.setLvlCnt("PROC_CD", 3);
        seeds.released("PROC_CD", "9.000", PAST, PAST2);
        seeds.released("PROC_CD", "10.000", PAST2, OPEN_END);
        seeds.seedItem("PROC_CD", "A", "9.000", "9.500", "a", 1, "L1", "L2", "L3");
        seeds.seedItem("PROC_CD", "A", "10.000", OPEN, "a", 1, "L1");
        CodeEditView v = tx.execute(s -> service.saveHeader(header("PROC_CD", 0L, "이름", null, 1)));
        assertEquals(1, v.getHeader().getLvlCnt());
    }

    @Test
    void E4d_늘리기는_값_검사를_하지_않는다() {
        // 저장된 칸 수보다 뒤 칸에 값이 있는 행(수신 등으로 생긴 불일치)이 있어도 늘리기는 막지 않는다.
        seeds.seedCode("PROC_CD", "CREATED", "MDM");
        seeds.setLvlCnt("PROC_CD", 1);
        seeds.draft("PROC_CD", "1.000", "stw1");
        seeds.seedItem("PROC_CD", "A", "1.000", OPEN, "a", 1, "L1", "L2", "L3");
        CodeEditView v = tx.execute(s -> service.saveHeader(header("PROC_CD", 0L, "이름", null, 2)));
        assertEquals(2, v.getHeader().getLvlCnt());
    }

    @Test
    void E5_미적용_2개면_saveHeader_와_deprecate_는_MDM007() {
        seeds.seedCode("PROC_CD", "CREATED", "MDM");
        seeds.draft("PROC_CD", "1.001", "stw1");
        seeds.draft("PROC_CD", "1.002", "stw2");
        assertCode(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS, () -> tx.execute(s -> service.saveHeader(header("PROC_CD", 0L, "이름", null, 0))));
        assertCode(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS, () -> tx.execute(s -> service.deprecate(deprecateReq("PROC_CD", 0L))));
        assertEquals(2, view("PROC_CD").getFlags().getUnappliedCount(), "조회는 된다");
    }

    @Test
    void E6_미적용_1개면_폐기는_MDM009_헤더_저장은_허용() {
        seeds.seedCode("PROC_CD", "CREATED", "MDM");
        seeds.draft("PROC_CD", "1.000", "stw1");
        BusinessException e = assertCode(MdmErrorCode.TRANSITION_NOT_ALLOWED,
                () -> tx.execute(s -> service.deprecate(deprecateReq("PROC_CD", 0L))));
        assertTrue(e.getMessage().contains("미적용 버전이 있어 폐기할 수 없습니다"), e.getMessage());
        tx.execute(s -> service.saveHeader(header("PROC_CD", 0L, "새 이름", null, 0)));
        assertEquals("CREATED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE", String.class));
    }

    @Test
    void E7_미적용_0개면_폐기는_STATUS_만_바꾸고_행을_보존하며_다시_폐기는_MDM009() {
        seeds.seedCode("PROC_CD", "INUSE", "MDM");
        seeds.released("PROC_CD", "1.000", PAST, OPEN_END);
        seeds.seedItem("PROC_CD", "A", "1.000", OPEN, "a", 1);
        seeds.seedBase("PROC_CD");

        CodeEditView v = tx.execute(s -> service.deprecate(deprecateReq("PROC_CD", 0L)));

        assertEquals("DEPRECATED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE", String.class));
        assertEquals("DEPRECATED", v.getHeader().getStatus());
        assertEquals(1, seeds.count("TB_MDM_CODE_VER"));
        assertEquals("RELEASED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE_VER", String.class));
        assertEquals(1, seeds.count("TB_MDM_CODE_ITEM"));
        assertEquals(1, seeds.count("TB_MDM_CODE_CATE"));
        assertFalse(v.getFlags().isCanNewMajor());
        assertFalse(v.getFlags().isCanDeprecate());

        assertCode(MdmErrorCode.TRANSITION_NOT_ALLOWED, () -> tx.execute(s -> service.deprecate(deprecateReq("PROC_CD", 1L))));
    }

    @Test
    void E7b_폐기도_auditVer_를_본다() {
        seeds.seedCode("PROC_CD", "INUSE", "MDM");
        assertCode(MdmErrorCode.ROW_VERSION_CONFLICT, () -> tx.execute(s -> service.deprecate(deprecateReq("PROC_CD", 3L))));
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE", String.class));
    }

    @Test
    void E8_버전이_없는_CREATED_코드도_폐기할_수_있다() {
        seeds.seedCode("PROC_CD", "CREATED", "MDM");
        tx.execute(s -> service.deprecate(deprecateReq("PROC_CD", 0L)));
        assertEquals("DEPRECATED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE", String.class));
    }

    @Test
    void E9_EXTERNAL_코드는_헤더_저장과_폐기가_MDM021() {
        seeds.seedCode("EXT_CD", "INUSE", "EXTERNAL");
        assertCode(MdmErrorCode.INVALID_INPUT, () -> tx.execute(s -> service.saveHeader(header("EXT_CD", 0L, "이름", null, 0))));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> tx.execute(s -> service.deprecate(deprecateReq("EXT_CD", 0L))));
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE", String.class));
        assertFalse(view("EXT_CD").getFlags().isEditable());
        assertCode(MdmErrorCode.INVALID_INPUT, () -> view("NOPE"));
    }

    @Test
    void E10_저장_CREATED_와_적용된_RELEASED_면_헤더_저장이_INUSE_를_저장한다() {
        seeds.seedCode("PROC_CD", "CREATED", "MDM");
        seeds.released("PROC_CD", "1.000", PAST, OPEN_END);
        assertEquals("INUSE", view("PROC_CD").getHeader().getStatus());
        assertEquals("CREATED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE", String.class), "조회는 쓰지 않는다");

        tx.execute(s -> service.saveHeader(header("PROC_CD", 0L, "이름", null, 0)));
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE", String.class));
    }

    @Test
    void E11_담당자_역할이_없으면_쓰기는_MDM013() {
        seeds.seedCode("PROC_CD", "CREATED", "MDM");
        for (Set<String> roles : List.of(Set.of("MDM_STD_ADMIN"), Set.of("SYSADMIN"))) {
            currentUser.set("u1", roles);
            assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> tx.execute(s -> service.saveHeader(header("PROC_CD", 0L, "이름", null, 0))));
            assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> tx.execute(s -> service.deprecate(deprecateReq("PROC_CD", 0L))));
        }
        assertEquals("CREATED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE", String.class));
    }

    // ── 도우미 ──

    private CodeEditView view(String id) {
        CodeEditViewRequest r = new CodeEditViewRequest();
        r.setMaruCodeId(id);
        return tx.execute(s -> service.view(r));
    }

    static CodeHeaderSaveRequest header(String id, Long auditVer, String name, String desc, Integer lvlCnt) {
        CodeHeaderSaveRequest r = new CodeHeaderSaveRequest();
        r.setMaruCodeId(id);
        r.setAuditVer(auditVer);
        r.setMaruCodeName(name);
        r.setDescription(desc);
        r.setLvlCnt(lvlCnt);
        return r;
    }

    static CodeDeprecateRequest deprecateReq(String id, Long auditVer) {
        CodeDeprecateRequest r = new CodeDeprecateRequest();
        r.setMaruCodeId(id);
        r.setAuditVer(auditVer);
        return r;
    }

    static BusinessException assertCode(MdmErrorCode expected, Supplier<?> call) {
        BusinessException e = assertThrows(BusinessException.class, call::get);
        assertEquals(expected.code(), e.getErrors().get(0).code(), e.getMessage());
        assertTrue(e.getMessage().startsWith(expected.defaultMessage()), e.getMessage());
        return e;
    }
}
