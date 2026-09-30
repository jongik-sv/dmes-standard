package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doReturn;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.RuleSetTestCaseQueries;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 세트 케이스 번호가 동시에 같은 값으로 발급된 경우(PK 충돌) — 조용히 덮어쓰지 않고 MDM001 로 거부한다. 최대 번호 조회를 스파이로 0 에 고정해
 * 충돌을 만든다. 스파이가 컨텍스트 캐시 키를 바꾸므로 {@code RuleSetCaseServiceTest} 와 따로 둔다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetCasePkConflictTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;
    @MockitoSpyBean
    RuleSetTestCaseQueries queries;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));
        DmeTestSupport.ruleSet(jdbc, "S_CASE", "케이스 세트", "[]", "INUSE", 0);
    }

    @AfterEach
    void clearAudit() {
        AuditHolder.remove();
        Mockito.reset(queries);
    }

    private static RuleSetSaveRequest newCase(String name) {
        RuleSetSaveRequest r = new RuleSetSaveRequest();
        r.setPart("CASE");
        r.setSetId("S_CASE");
        r.setCaseName(name);
        r.setInputJson("{\"A\":\"1\"}");
        return r;
    }

    @Test
    void 번호가_겹치면_MDM001_이고_기존_케이스는_그대로다() {
        assertEquals(1, service.save(newCase("먼저")).getCaseId());
        doReturn(0).when(queries).maxCaseId("S_CASE");

        BusinessException e = assertThrows(BusinessException.class, () -> service.save(newCase("동시")));
        assertTrue(e.getMessage().contains("동시에 저장"), e.getMessage());
        assertEquals(1, DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_SET_TEST_CASE WHERE MARU_RULE_SET_ID = 'S_CASE'"));
        assertEquals("먼저", jdbc.queryForObject("SELECT CASE_NAME FROM TB_MDM_RULE_SET_TEST_CASE WHERE CASE_ID = 1", String.class));
    }
}
