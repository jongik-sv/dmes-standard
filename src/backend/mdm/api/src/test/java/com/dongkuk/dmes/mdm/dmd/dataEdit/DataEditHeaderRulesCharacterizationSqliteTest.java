package com.dongkuk.dmes.mdm.dmd.dataEdit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.DataEditDeprecateRequest;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.DataEditHeaderSaveRequest;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.DataEditView;
import com.dongkuk.dmes.mdm.dmd.dataEdit.service.DataEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * BE 리팩토링 2회차 C7 특성 시험 — 마루 데이터 헤더 저장({@code DataEditService.save})·폐기의 헤더 검사 문구·오류 코드·검사 순서와
 * 라벨 저장 방식을 글자 그대로 고정한다. 데이터 쪽은 auditVer 를 맨 끝(라벨·계층 칸 수 줄이기 검사 뒤)에 본다(코드 쪽과 다르다).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataEditHeaderRulesCharacterizationSqliteTest extends AbstractMdmSharedDbTest {

    private static final String MD = "PORT";
    private static final String PATTERN = DmdSegmentTestSupport.DEFAULT_PATTERN;
    private static final String INVALID = "입력값이 올바르지 않습니다: ";
    private static final String CONFLICT = "다른 사용자가 수정했습니다. 다시 불러오세요";
    private static final String NAME = "이름은 1~100자여야 합니다";
    private static final String DESCRIPTION = "설명은 4000바이트(한글 약 1,333자)를 넘을 수 없습니다";
    private static final String PATTERN_REQUIRED = "키 패턴을 입력하세요";
    private static final String PATTERN_BYTES = "키 패턴은 4000바이트(한글 약 1,333자)를 넘을 수 없습니다";
    private static final String LVL_CNT = "계층 칸 수는 0~5 이어야 합니다";

    @Autowired
    DataEditService service;
    @Autowired
    DataSource dataSource;

    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        DmdSegmentTestSupport.insertMdm(jdbc, MD, 2, "옛 라벨");
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void 이름_설명_키_패턴_계층_칸_수_문구와_순서() {
        assertInvalid(NAME, () -> save(req(0L, null, null, PATTERN, 2)));
        assertInvalid(NAME, () -> save(req(0L, "   ", null, PATTERN, 2)));
        assertInvalid(NAME, () -> save(req(0L, "N".repeat(101), "a".repeat(4001), null, 9)));
        assertInvalid(DESCRIPTION, () -> save(req(0L, "이름", "a".repeat(4001), null, 9)));
        assertInvalid(DESCRIPTION, () -> save(req(0L, "이름", "가".repeat(1334), PATTERN, 2)));
        assertInvalid(PATTERN_REQUIRED, () -> save(req(0L, "이름", null, null, 9)));
        assertInvalid(PATTERN_REQUIRED, () -> save(req(0L, "이름", null, "   ", 2)));
        assertInvalid(PATTERN_BYTES, () -> save(req(0L, "이름", null, "[".repeat(4001), 9)));
        assertInvalid(PATTERN_BYTES, () -> save(req(0L, "이름", null, "가".repeat(1334), 2)));
        assertInvalid("키 패턴 정규식이 올바르지 않습니다: [", () -> save(req(0L, "이름", null, "  [  ", 9)));
        assertInvalid("키 패턴 정규식이 올바르지 않습니다: ^(A", () -> save(req(0L, "이름", null, "^(A", 2)));
        assertInvalid(LVL_CNT, () -> save(req(0L, "이름", null, PATTERN, 6)));
        assertInvalid(LVL_CNT, () -> save(req(0L, "이름", null, PATTERN, -1)));
        DataEditHeaderSaveRequest lvlAndLabel = req(0L, "이름", null, PATTERN, 6);
        lvlAndLabel.setAttr01Name("L".repeat(101));
        assertInvalid(LVL_CNT, () -> save(lvlAndLabel)); // 계층 칸 수가 라벨보다 먼저
        assertEquals("PORT 이름", jdbc.queryForObject("SELECT MARU_DATA_NAME FROM TB_MDM_DATA", String.class));
    }

    @Test
    void 저장은_이름_설명_키_패턴을_잘라_쓰고_계층_칸_수가_비면_지금_값이다() {
        DataEditView v = save(req(0L, "  " + "N".repeat(100) + "  ", "  " + "a".repeat(4000) + "  ", "  ^[A-Z]{2}$  ",
                null));

        Map<String, Object> row = jdbc.queryForMap(
                "SELECT MARU_DATA_NAME, DESCRIPTION, CODE_PATTERN, LVL_CNT FROM TB_MDM_DATA WHERE MARU_DATA_ID = ?", MD);
        assertEquals("N".repeat(100), row.get("MARU_DATA_NAME"));
        assertEquals("a".repeat(4000), row.get("DESCRIPTION"));
        assertEquals("^[A-Z]{2}$", row.get("CODE_PATTERN"));
        assertEquals(2, ((Number) row.get("LVL_CNT")).intValue());
        assertEquals("N".repeat(100), v.getMaruDataName());

        save(req(1L, "이름", "   ", PATTERN, 5));
        assertNull(jdbc.queryForObject("SELECT DESCRIPTION FROM TB_MDM_DATA", String.class), "공백 설명은 NULL");
    }

    @Test
    void 라벨_문구는_번호를_두_자리로_쓰고_앞_번호부터_본다() {
        for (int slot = 1; slot <= 10; slot++) {
            DataEditHeaderSaveRequest r = req(0L, "이름", null, PATTERN, 2);
            setLabel(r, slot, "L".repeat(101));
            assertInvalid(String.format("라벨 attr%02d 은 100자 이내여야 합니다", slot), () -> save(r));
        }
        DataEditHeaderSaveRequest two = req(0L, "이름", null, PATTERN, 2);
        setLabel(two, 9, "L".repeat(101));
        setLabel(two, 2, "L".repeat(101));
        assertInvalid("라벨 attr02 은 100자 이내여야 합니다", () -> save(two));
        DataEditHeaderSaveRequest padded = req(0L, "이름", null, PATTERN, 2);
        setLabel(padded, 3, "  " + "L".repeat(100) + "  ");
        save(padded);
        assertEquals("L".repeat(100), jdbc.queryForObject("SELECT ATTR03_NAME FROM TB_MDM_DATA", String.class));
    }

    @Test
    void 라벨은_번호대로_잘라_저장하고_공백은_NULL_이다() {
        DataEditHeaderSaveRequest r = req(0L, "이름", null, PATTERN, 2);
        for (int slot = 1; slot <= 10; slot++) {
            setLabel(r, slot, " 라벨" + slot + " ");
        }
        setLabel(r, 1, "   ");
        setLabel(r, 7, null);

        DataEditView v = save(r);

        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM TB_MDM_DATA WHERE MARU_DATA_ID = ?", MD);
        for (int slot = 1; slot <= 10; slot++) {
            Object expected = slot == 1 || slot == 7 ? null : "라벨" + slot;
            assertEquals(expected, row.get(String.format("ATTR%02d_NAME", slot)), "slot " + slot);
        }
        assertNull(v.getAttr01Name(), "옛 라벨도 공백 요청이면 지운다");
        assertEquals("라벨2", v.getAttr02Name());
        assertEquals("라벨10", v.getAttr10Name());
    }

    @Test
    void auditVer_는_라벨과_계층_칸_수_줄이기_검사_뒤에_본다() {
        DmdSegmentTestSupport.insertItemRow(jdbc, MD, "A", "a", DmdSegmentTestSupport.T0, DmdSegmentTestSupport.OPEN, 0,
                List.of("L1", "L2"), null);

        DataEditHeaderSaveRequest badName = req(5L, " ", null, PATTERN, 2);
        assertInvalid(NAME, () -> save(badName));
        DataEditHeaderSaveRequest labelAndVer = req(5L, "이름", null, PATTERN, 2);
        setLabel(labelAndVer, 10, "L".repeat(101));
        assertInvalid("라벨 attr10 은 100자 이내여야 합니다", () -> save(labelAndVer));
        DataEditHeaderSaveRequest reduceAndLabel = req(5L, "이름", null, PATTERN, 1);
        setLabel(reduceAndLabel, 4, "L".repeat(101));
        assertInvalid("라벨 attr04 은 100자 이내여야 합니다", () -> save(reduceAndLabel)); // 라벨이 줄이기보다 먼저
        assertInvalid("LVL2 에 값이 있는 코드가 있어 계층 칸 수를 1 로 줄일 수 없습니다",
                () -> save(req(5L, "이름", null, PATTERN, 1)));

        assertConflict(() -> save(req(5L, "이름", null, PATTERN, 2)));
        assertConflict(() -> save(req(null, "이름", null, PATTERN, 2)));
        assertEquals("PORT 이름", jdbc.queryForObject("SELECT MARU_DATA_NAME FROM TB_MDM_DATA", String.class));
    }

    @Test
    void 폐기도_같은_auditVer_문구다() {
        DataEditDeprecateRequest dep = new DataEditDeprecateRequest();
        dep.setMaruDataId(MD);
        dep.setAuditVer(3L);
        assertConflict(() -> service.deprecate(dep));
        dep.setAuditVer(null);
        assertConflict(() -> service.deprecate(dep));
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_DATA", String.class));
    }

    // ── 도우미 ──

    private DataEditView save(DataEditHeaderSaveRequest r) {
        return service.save(r);
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

    private static DataEditHeaderSaveRequest req(Long auditVer, String name, String desc, String codePattern,
                                                 Integer lvlCnt) {
        DataEditHeaderSaveRequest r = new DataEditHeaderSaveRequest();
        r.setMaruDataId(MD);
        r.setAuditVer(auditVer);
        r.setMaruDataName(name);
        r.setDescription(desc);
        r.setCodePattern(codePattern);
        r.setLvlCnt(lvlCnt);
        return r;
    }

    private static void setLabel(DataEditHeaderSaveRequest r, int slot, String value) {
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
