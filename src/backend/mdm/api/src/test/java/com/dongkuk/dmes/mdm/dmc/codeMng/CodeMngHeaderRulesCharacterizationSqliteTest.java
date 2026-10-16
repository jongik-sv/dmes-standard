package com.dongkuk.dmes.mdm.dmc.codeMng;

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
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeRegRequest;
import com.dongkuk.dmes.mdm.dmc.codeMng.service.CodeMngService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.Set;
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
 * BE 리팩토링 2회차 C7 특성 시험 — 마루 코드 등록({@code CodeMngService.register})의 헤더 검사 문구·오류 코드·검사 순서를 글자 그대로
 * 고정한다. 헤더 규칙을 공통으로 옮겨도 같은 결과가 나와야 한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class CodeMngHeaderRulesCharacterizationSqliteTest extends AbstractMdmSharedDbTest {

    private static final String INVALID = "입력값이 올바르지 않습니다: ";
    private static final String ID_LENGTH = "마루 코드 ID 는 1~50자여야 합니다";
    private static final String ID_FORBIDDEN = "마루 코드 ID 에 점·콤마·공백을 쓸 수 없습니다";
    private static final String ID_FORMAT = "마루 코드 ID 는 영문 대문자로 시작하고 영문 대문자·숫자·_ 만 쓸 수 있습니다";
    private static final String NAME = "이름은 1~100자여야 합니다";
    private static final String DESCRIPTION = "설명은 4000바이트(한글 약 1,333자)를 넘을 수 없습니다";
    private static final String LVL_CNT = "계층 칸 수는 0~5 이어야 합니다";

    @Autowired
    CodeMngService service;
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
        currentUser.set("stw1", Set.of("MDM_STEWARD"));
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void ID_검사_문구는_길이_금지_문자_형식_순서다() {
        assertInvalid(ID_LENGTH, req(null, "이름", null, 0));
        assertInvalid(ID_LENGTH, req("   ", "이름", null, 0));
        assertInvalid(ID_LENGTH, req("A".repeat(51), "이름", null, 0));
        assertInvalid(ID_LENGTH, req("A.".repeat(26), "이름", null, 0)); // 길이가 금지 문자보다 먼저
        assertInvalid(ID_FORBIDDEN, req("PROC.CD", "이름", null, 0));
        assertInvalid(ID_FORBIDDEN, req("PROC,CD", "이름", null, 0));
        assertInvalid(ID_FORBIDDEN, req("PROC CD", "이름", null, 0));
        assertInvalid(ID_FORBIDDEN, req("PROC\tCD", "이름", null, 0));
        assertInvalid(ID_FORBIDDEN, req("proc.cd", "이름", null, 0)); // 금지 문자가 형식보다 먼저
        assertInvalid(ID_FORMAT, req("proc_cd", "이름", null, 0));
        assertInvalid(ID_FORMAT, req("1PROC", "이름", null, 0));
        assertInvalid(ID_FORMAT, req("PROC-CD", "이름", null, 0));
        assertInvalid(ID_FORMAT, req("PROC__CD", "이름", null, 0));
        assertEquals(0, seeds.count("TB_MDM_CODE"));
    }

    @Test
    void ID_는_앞뒤_공백을_잘라_쓰고_50자까지_받는다() {
        register(req("  PROC_CD  ", "이름", null, 0));
        register(req("A".repeat(50), "이름", null, 0));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_CODE WHERE MARU_CODE_ID = 'PROC_CD'", Integer.class));
        assertEquals(2, seeds.count("TB_MDM_CODE"));
    }

    @Test
    void 이름_검사_문구와_경계() {
        assertInvalid(NAME, req("PROC_CD", null, null, 0));
        assertInvalid(NAME, req("PROC_CD", "   ", null, 0));
        assertInvalid(NAME, req("PROC_CD", "N".repeat(101), null, 0));
        assertInvalid(ID_FORMAT, req("bad", null, null, 0)); // ID 가 이름보다 먼저

        register(req("PROC_CD", "  " + "N".repeat(100) + "  ", null, 0));
        assertEquals("N".repeat(100), jdbc.queryForObject("SELECT MARU_CODE_NAME FROM TB_MDM_CODE", String.class));
    }

    @Test
    void 설명_검사는_4000바이트_경계이고_이름_다음이다() {
        assertInvalid(DESCRIPTION, req("PROC_CD", "이름", "a".repeat(4001), 0));
        assertInvalid(DESCRIPTION, req("PROC_CD", "이름", "가".repeat(1334), 0));
        assertInvalid(NAME, req("PROC_CD", " ", "a".repeat(4001), 0)); // 이름이 설명보다 먼저

        register(req("PROC_CD", "이름", "  " + "a".repeat(4000) + "  ", 0));
        register(req("GRADE_CD", "이름", "   ", 0));
        assertEquals("a".repeat(4000),
                jdbc.queryForObject("SELECT DESCRIPTION FROM TB_MDM_CODE WHERE MARU_CODE_ID = 'PROC_CD'", String.class));
        assertNull(jdbc.queryForObject("SELECT DESCRIPTION FROM TB_MDM_CODE WHERE MARU_CODE_ID = 'GRADE_CD'", String.class));
    }

    @Test
    void 계층_칸_수는_0에서_5이고_비면_0이다() {
        assertInvalid(LVL_CNT, req("PROC_CD", "이름", null, 6));
        assertInvalid(LVL_CNT, req("PROC_CD", "이름", null, -1));
        assertInvalid(DESCRIPTION, req("PROC_CD", "이름", "a".repeat(4001), 6)); // 설명이 계층 칸 수보다 먼저

        register(req("PROC_CD", "이름", null, null));
        register(req("GRADE_CD", "이름", null, 5));
        assertEquals(0, jdbc.queryForObject("SELECT LVL_CNT FROM TB_MDM_CODE WHERE MARU_CODE_ID = 'PROC_CD'", Integer.class));
        assertEquals(5, jdbc.queryForObject("SELECT LVL_CNT FROM TB_MDM_CODE WHERE MARU_CODE_ID = 'GRADE_CD'", Integer.class));
    }

    @Test
    void 요청_없음_원천_ID_충돌_문구() {
        assertInvalid("등록할 값이 없습니다", null);
        CodeRegRequest external = req("PROC_CD", "이름", null, 0);
        external.setSourceKind("EXTERNAL");
        assertInvalid("등록은 MDM 원천만 받습니다", external);
        CodeRegRequest badLvlExternal = req("PROC_CD", "이름", null, 9);
        badLvlExternal.setSourceKind("EXTERNAL");
        assertInvalid(LVL_CNT, badLvlExternal); // 계층 칸 수가 원천보다 먼저

        seeds.seedCode("DUP_CD", "CREATED", "MDM");
        DmdSegmentTestSupport.insertMdm(jdbc, "DUP_DATA", 0);
        for (String id : new String[] {"DUP_CD", "DUP_DATA"}) {
            BusinessException e = reject(MdmErrorCode.MARU_ID_NAMESPACE_CONFLICT, req(id, "이름", null, 0));
            assertEquals(MdmErrorCode.MARU_ID_NAMESPACE_CONFLICT.defaultMessage(), e.getMessage());
            assertEquals("마루 코드·마루 데이터에 같은 ID 가 있습니다", e.getMessage());
        }
    }

    // ── 도우미 ──

    private void register(CodeRegRequest r) {
        tx.execute(s -> service.register(r));
    }

    private void assertInvalid(String detail, CodeRegRequest r) {
        BusinessException e = reject(MdmErrorCode.INVALID_INPUT, r);
        assertEquals(INVALID + detail, e.getMessage());
    }

    private BusinessException reject(MdmErrorCode code, CodeRegRequest r) {
        BusinessException e = assertThrows(BusinessException.class, () -> register(r));
        assertEquals(code.code(), e.getErrors().get(0).code(), e.getMessage());
        assertEquals(1, e.getErrors().size(), e.getMessage());
        return e;
    }

    private static CodeRegRequest req(String id, String name, String desc, Integer lvlCnt) {
        CodeRegRequest r = new CodeRegRequest();
        r.setMaruCodeId(id);
        r.setMaruCodeName(name);
        r.setDescription(desc);
        r.setLvlCnt(lvlCnt);
        return r;
    }
}
