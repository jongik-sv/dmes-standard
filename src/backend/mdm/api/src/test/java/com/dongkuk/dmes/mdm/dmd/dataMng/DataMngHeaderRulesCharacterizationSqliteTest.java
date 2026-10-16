package com.dongkuk.dmes.mdm.dmd.dataMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dmd.dataMng.dto.DataMngRegRequest;
import com.dongkuk.dmes.mdm.dmd.dataMng.service.DataMngService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.Map;
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
 * BE 리팩토링 2회차 C7 특성 시험 — 마루 데이터 등록({@code DataMngService.register})의 헤더 검사 문구·오류 코드·검사 순서를 글자
 * 그대로 고정한다. 문구는 마루 코드 등록과 명사(「마루 데이터」)만 다르다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataMngHeaderRulesCharacterizationSqliteTest extends AbstractMdmSharedDbTest {

    private static final String PATTERN = DmdSegmentTestSupport.DEFAULT_PATTERN;
    private static final String INVALID = "입력값이 올바르지 않습니다: ";
    private static final String ID_LENGTH = "마루 데이터 ID 는 1~50자여야 합니다";
    private static final String ID_FORBIDDEN = "마루 데이터 ID 에 점·콤마·공백을 쓸 수 없습니다";
    private static final String ID_FORMAT = "마루 데이터 ID 는 영문 대문자로 시작하고 영문 대문자·숫자·_ 만 쓸 수 있습니다";
    private static final String NAME = "이름은 1~100자여야 합니다";
    private static final String DESCRIPTION = "설명은 4000바이트(한글 약 1,333자)를 넘을 수 없습니다";
    private static final String PATTERN_REQUIRED = "키 패턴을 입력하세요";
    private static final String PATTERN_BYTES = "키 패턴은 4000바이트(한글 약 1,333자)를 넘을 수 없습니다";
    private static final String LVL_CNT = "계층 칸 수는 0~5 이어야 합니다";

    @Autowired
    DataMngService service;
    @Autowired
    DataSource dataSource;

    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        new MasterCodeSeeds(jdbc).clear();
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void ID_검사_문구는_길이_금지_문자_형식_순서다() {
        assertInvalid(ID_LENGTH, req(null, "이름", null, PATTERN, 0));
        assertInvalid(ID_LENGTH, req("   ", "이름", null, PATTERN, 0));
        assertInvalid(ID_LENGTH, req("A".repeat(51), "이름", null, PATTERN, 0));
        assertInvalid(ID_LENGTH, req("A.".repeat(26), "이름", null, PATTERN, 0));
        assertInvalid(ID_FORBIDDEN, req("PORT.X", "이름", null, PATTERN, 0));
        assertInvalid(ID_FORBIDDEN, req("PORT,X", "이름", null, PATTERN, 0));
        assertInvalid(ID_FORBIDDEN, req("PORT X", "이름", null, PATTERN, 0));
        assertInvalid(ID_FORBIDDEN, req("PORT\tX", "이름", null, PATTERN, 0));
        assertInvalid(ID_FORBIDDEN, req("port.x", "이름", null, PATTERN, 0));
        assertInvalid(ID_FORMAT, req("port", "이름", null, PATTERN, 0));
        assertInvalid(ID_FORMAT, req("1PORT", "이름", null, PATTERN, 0));
        assertInvalid(ID_FORMAT, req("PORT-X", "이름", null, PATTERN, 0));
        assertInvalid(ID_FORMAT, req("PORT__X", "이름", null, PATTERN, 0));
        assertEquals(0, DmdSegmentTestSupport.count(jdbc, "TB_MDM_DATA"));
    }

    @Test
    void ID_는_앞뒤_공백을_잘라_쓰고_50자까지_받는다() {
        service.register(req("  PORT  ", "이름", null, PATTERN, 0));
        service.register(req("A".repeat(50), "이름", null, PATTERN, 0));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'PORT'", Integer.class));
        assertEquals(2, DmdSegmentTestSupport.count(jdbc, "TB_MDM_DATA"));
    }

    @Test
    void 이름_설명_문구와_순서() {
        assertInvalid(NAME, req("PORT", null, null, PATTERN, 0));
        assertInvalid(NAME, req("PORT", "   ", null, PATTERN, 0));
        assertInvalid(NAME, req("PORT", "N".repeat(101), "a".repeat(4001), null, 9));
        assertInvalid(ID_FORMAT, req("bad", null, null, PATTERN, 0)); // ID 가 이름보다 먼저
        assertInvalid(DESCRIPTION, req("PORT", "이름", "a".repeat(4001), null, 9)); // 설명이 키 패턴보다 먼저
        assertInvalid(DESCRIPTION, req("PORT", "이름", "가".repeat(1334), PATTERN, 0));

        service.register(req("PORT", "  " + "N".repeat(100) + "  ", "  " + "a".repeat(4000) + "  ", PATTERN, 0));
        service.register(req("SHIP", "이름", "   ", PATTERN, 0));
        Map<String, Object> port = jdbc.queryForMap("SELECT MARU_DATA_NAME, DESCRIPTION FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'PORT'");
        assertEquals("N".repeat(100), port.get("MARU_DATA_NAME"));
        assertEquals("a".repeat(4000), port.get("DESCRIPTION"));
        assertNull(jdbc.queryForObject("SELECT DESCRIPTION FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'SHIP'", String.class));
    }

    @Test
    void 키_패턴_문구와_순서() {
        assertInvalid(PATTERN_REQUIRED, req("PORT", "이름", null, null, 0));
        assertInvalid(PATTERN_REQUIRED, req("PORT", "이름", null, "   ", 9)); // 키 패턴이 계층 칸 수보다 먼저
        assertInvalid(PATTERN_BYTES, req("PORT", "이름", null, "a".repeat(4001), 9));
        assertInvalid(PATTERN_BYTES, req("PORT", "이름", null, "가".repeat(1334), 0));

        service.register(req("PORT", "이름", null, "  ^[A-Z]{2}$  ", 0));
        assertEquals("^[A-Z]{2}$",
                jdbc.queryForObject("SELECT CODE_PATTERN FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'PORT'", String.class));
    }

    @Test
    void 계층_칸_수는_0에서_5이고_비면_0이다() {
        assertInvalid(LVL_CNT, req("PORT", "이름", null, PATTERN, 6));
        assertInvalid(LVL_CNT, req("PORT", "이름", null, PATTERN, -1));

        service.register(req("PORT", "이름", null, PATTERN, null));
        service.register(req("SHIP", "이름", null, PATTERN, 5));
        assertEquals(0, jdbc.queryForObject("SELECT LVL_CNT FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'PORT'", Integer.class));
        assertEquals(5, jdbc.queryForObject("SELECT LVL_CNT FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'SHIP'", Integer.class));
    }

    @Test
    void 요청_없음과_ID_충돌_문구() {
        assertInvalid("등록할 값이 없습니다", null);

        new MasterCodeSeeds(jdbc).seedCode("DUP_CD", "CREATED", "MDM");
        DmdSegmentTestSupport.insertMdm(jdbc, "DUP_DATA", 0);
        assertInvalid(LVL_CNT, req("DUP_CD", "이름", null, PATTERN, 9)); // 계층 칸 수가 ID 충돌보다 먼저
        for (String id : new String[] {"DUP_CD", "DUP_DATA"}) {
            BusinessException e = reject(MdmErrorCode.MARU_ID_NAMESPACE_CONFLICT, req(id, "이름", null, PATTERN, 0));
            assertEquals("마루 코드·마루 데이터에 같은 ID 가 있습니다", e.getMessage());
        }
    }

    // ── 도우미 ──

    private void assertInvalid(String detail, DataMngRegRequest r) {
        BusinessException e = reject(MdmErrorCode.INVALID_INPUT, r);
        assertEquals(INVALID + detail, e.getMessage());
    }

    private BusinessException reject(MdmErrorCode code, DataMngRegRequest r) {
        BusinessException e = assertThrows(BusinessException.class, () -> service.register(r));
        assertEquals(code.code(), e.getErrors().get(0).code(), e.getMessage());
        assertEquals(1, e.getErrors().size(), e.getMessage());
        return e;
    }

    private static DataMngRegRequest req(String id, String name, String desc, String codePattern, Integer lvlCnt) {
        DataMngRegRequest r = new DataMngRegRequest();
        r.setMaruDataId(id);
        r.setMaruDataName(name);
        r.setDescription(desc);
        r.setCodePattern(codePattern);
        r.setLvlCnt(lvlCnt);
        return r;
    }
}
