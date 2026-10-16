package com.dongkuk.dmes.mdm.dmc.codeEdit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeDeprecateRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeDraftRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditView;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeHeaderSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.service.CodeEditService;
import com.dongkuk.oasis.audit.AuditHolder;
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
 * BE 리팩토링 2회차 C7 특성 시험 — 마루 코드 헤더 저장({@code CodeEditService.saveHeader})·폐기·코드 삭제의 헤더 검사 문구·오류 코드·
 * 검사 순서와 라벨 저장 방식을 글자 그대로 고정한다. 코드 쪽은 auditVer 를 이름보다 먼저 본다(데이터 쪽과 다르다).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class CodeEditHeaderRulesCharacterizationSqliteTest extends AbstractMdmSharedDbTest {

    private static final String ID = "PROC_CD";
    private static final String INVALID = "입력값이 올바르지 않습니다: ";
    private static final String CONFLICT = "다른 사용자가 수정했습니다. 다시 불러오세요";
    private static final String NAME = "이름은 1~100자여야 합니다";
    private static final String DESCRIPTION = "설명은 4000바이트(한글 약 1,333자)를 넘을 수 없습니다";
    private static final String LVL_CNT = "계층 칸 수는 0~5 이어야 합니다";

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
        DmdSegmentTestSupport.clear(jdbc);
        seeds.clear();
        seeds.seedCode(ID, "CREATED", "MDM");
        currentUser.set("stw1", Set.of("MDM_STEWARD"));
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void auditVer_는_이름_설명_계층_라벨보다_먼저_본다() {
        CodeHeaderSaveRequest allBad = header(5L, " ", "a".repeat(4001), 9);
        allBad.setAttr01Name("L".repeat(101));
        assertConflict(() -> save(allBad));
        CodeHeaderSaveRequest nullVer = header(null, " ", null, 0);
        assertConflict(() -> save(nullVer));
        assertEquals("PROC_CD 이름", jdbc.queryForObject("SELECT MARU_CODE_NAME FROM TB_MDM_CODE", String.class));
    }

    @Test
    void 이름_설명_계층_칸_수_문구와_순서() {
        assertInvalid(NAME, () -> save(header(0L, null, null, 0)));
        assertInvalid(NAME, () -> save(header(0L, "  ", null, 0)));
        assertInvalid(NAME, () -> save(header(0L, "N".repeat(101), "a".repeat(4001), 9)));
        assertInvalid(DESCRIPTION, () -> save(header(0L, "이름", "a".repeat(4001), 9)));
        assertInvalid(DESCRIPTION, () -> save(header(0L, "이름", "가".repeat(1334), 0)));
        assertInvalid(LVL_CNT, () -> save(header(0L, "이름", null, 6)));
        assertInvalid(LVL_CNT, () -> save(header(0L, "이름", null, -1)));
        CodeHeaderSaveRequest lvlAndLabel = header(0L, "이름", null, 6);
        lvlAndLabel.setAttr01Name("L".repeat(101));
        assertInvalid(LVL_CNT, () -> save(lvlAndLabel)); // 계층 칸 수가 라벨보다 먼저

        CodeEditView v = save(header(0L, "  " + "N".repeat(100) + "  ", "  " + "a".repeat(4000) + "  ", null));
        assertEquals("N".repeat(100), v.getHeader().getMaruCodeName());
        Map<String, Object> row = jdbc.queryForMap("SELECT MARU_CODE_NAME, DESCRIPTION, LVL_CNT FROM TB_MDM_CODE");
        assertEquals("N".repeat(100), row.get("MARU_CODE_NAME"));
        assertEquals("a".repeat(4000), row.get("DESCRIPTION"));
        assertEquals(0, ((Number) row.get("LVL_CNT")).intValue(), "계층 칸 수가 비면 지금 값");

        save(header(1L, "이름", "   ", 5));
        assertNull(jdbc.queryForObject("SELECT DESCRIPTION FROM TB_MDM_CODE", String.class), "공백 설명은 NULL");
    }

    @Test
    void 라벨_문구는_번호를_두_자리로_쓰고_앞_번호부터_본다() {
        for (int slot = 1; slot <= 10; slot++) {
            CodeHeaderSaveRequest r = header(0L, "이름", null, 0);
            setLabel(r, slot, "L".repeat(101));
            assertInvalid(String.format("라벨 attr%02d 은 100자 이내여야 합니다", slot), () -> save(r));
        }
        CodeHeaderSaveRequest two = header(0L, "이름", null, 0);
        setLabel(two, 9, "L".repeat(101));
        setLabel(two, 2, "L".repeat(101));
        assertInvalid("라벨 attr02 은 100자 이내여야 합니다", () -> save(two));
        CodeHeaderSaveRequest padded = header(0L, "이름", null, 0);
        setLabel(padded, 3, "  " + "L".repeat(100) + "  ");
        save(padded);
        assertEquals("L".repeat(100), jdbc.queryForObject("SELECT ATTR03_NAME FROM TB_MDM_CODE", String.class));
    }

    @Test
    void 라벨은_번호대로_잘라_저장하고_공백은_NULL_이다() {
        jdbc.update("UPDATE TB_MDM_CODE SET ATTR04_NAME = '옛 라벨' WHERE MARU_CODE_ID = ?", ID);
        CodeHeaderSaveRequest r = header(0L, "이름", null, 0);
        for (int slot = 1; slot <= 10; slot++) {
            setLabel(r, slot, " 라벨" + slot + " ");
        }
        setLabel(r, 4, "   ");
        setLabel(r, 7, null);

        CodeEditView v = save(r);

        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM TB_MDM_CODE WHERE MARU_CODE_ID = ?", ID);
        for (int slot = 1; slot <= 10; slot++) {
            Object expected = slot == 4 || slot == 7 ? null : "라벨" + slot;
            assertEquals(expected, row.get(String.format("ATTR%02d_NAME", slot)), "slot " + slot);
        }
        assertEquals("라벨1", v.getHeader().getAttr01Name());
        assertNull(v.getHeader().getAttr04Name());
        assertEquals("라벨10", v.getHeader().getAttr10Name());
    }

    @Test
    void 라벨_검사는_계층_칸_수_줄이기_검사보다_먼저다() {
        seeds.setLvlCnt(ID, 2);
        seeds.draft(ID, "1.000", "stw1");
        seeds.seedItem(ID, "A", "1.000", "1.000", "a", 1, "L1", "L2");
        CodeHeaderSaveRequest r = header(0L, "이름", null, 1);
        setLabel(r, 10, "L".repeat(101));
        assertInvalid("라벨 attr10 은 100자 이내여야 합니다", () -> save(r));
        assertInvalid("LVL2 에 값이 있는 코드가 있어 계층 칸 수를 1 로 줄일 수 없습니다", () -> save(header(0L, "이름", null, 1)));
    }

    @Test
    void 폐기와_코드_삭제도_같은_auditVer_문구다() {
        CodeDeprecateRequest dep = new CodeDeprecateRequest();
        dep.setMaruCodeId(ID);
        dep.setAuditVer(3L);
        assertConflict(() -> tx.execute(s -> service.deprecate(dep)));
        dep.setAuditVer(null);
        assertConflict(() -> tx.execute(s -> service.deprecate(dep)));

        CodeDraftRequest del = new CodeDraftRequest();
        del.setMaruCodeId(ID);
        del.setTarget(CodeDraftRequest.TARGET_CODE);
        del.setAuditVer(7L);
        assertConflict(() -> tx.execute(s -> service.delete(del)));
        assertEquals("CREATED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE", String.class));
    }

    // ── 도우미 ──

    private CodeEditView save(CodeHeaderSaveRequest r) {
        return tx.execute(s -> service.saveHeader(r));
    }

    private static void assertInvalid(String detail, Supplier<?> call) {
        BusinessException e = assertThrows(BusinessException.class, call::get);
        assertEquals(MdmErrorCode.INVALID_INPUT.code(), e.getErrors().get(0).code(), e.getMessage());
        assertEquals(INVALID + detail, e.getMessage());
    }

    private static void assertConflict(Supplier<?> call) {
        BusinessException e = assertThrows(BusinessException.class, call::get);
        assertEquals(MdmErrorCode.ROW_VERSION_CONFLICT.code(), e.getErrors().get(0).code(), e.getMessage());
        assertEquals(CONFLICT, e.getMessage());
        assertEquals(1, e.getErrors().size());
    }

    private static CodeHeaderSaveRequest header(Long auditVer, String name, String desc, Integer lvlCnt) {
        CodeHeaderSaveRequest r = new CodeHeaderSaveRequest();
        r.setMaruCodeId(ID);
        r.setAuditVer(auditVer);
        r.setMaruCodeName(name);
        r.setDescription(desc);
        r.setLvlCnt(lvlCnt);
        return r;
    }

    private static void setLabel(CodeHeaderSaveRequest r, int slot, String value) {
        switch (slot) {
            case 1 -> r.setAttr01Name(value);
            case 2 -> r.setAttr02Name(value);
            case 3 -> r.setAttr03Name(value);
            case 4 -> r.setAttr04Name(value);
            case 5 -> r.setAttr05Name(value);
            case 6 -> r.setAttr06Name(value);
            case 7 -> r.setAttr07Name(value);
            case 8 -> r.setAttr08Name(value);
            case 9 -> r.setAttr09Name(value);
            case 10 -> r.setAttr10Name(value);
            default -> throw new IllegalArgumentException("slot " + slot);
        }
    }
}
