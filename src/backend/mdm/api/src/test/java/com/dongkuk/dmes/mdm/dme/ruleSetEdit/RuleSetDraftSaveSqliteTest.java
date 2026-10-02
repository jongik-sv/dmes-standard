package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** D-144 2단계 — 저장은 내 DRAFT 에만. RELEASED 는 그대로 남는다(편집 중 운영 보호, 스펙 목적 1). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetDraftSaveSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));
        // 입력 이름이 컬럼 사전에 없으면 세트 검사가 UNKNOWN_INPUT 으로 저장을 거부한다(MDM024)
        DmeTestSupport.column(jdbc, "IN_A", DmeTestSupport.domain(jdbc, "IN_A_D", "QTY", "NUMBER", 0));
        DmeTestSupport.rule(jdbc, "R1", "R1", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R1", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R1", 1, 1, "COND", "1", "IN_A", 1);
        DmeTestSupport.var(jdbc, "R1", 1, 2, "RESULT", "Value", "OUT_A", 1, "STRING");
        DmeTestSupport.ruleSet(jdbc, "S_D", "초안 세트", "[]", "INUSE", 5);                         // 1.000 RELEASED, 빈 목록
        DmeTestSupport.ruleSetDraft(jdbc, "S_D", "2.000", "kim", "[]", 0);
    }

    @AfterEach
    void clearAudit() {
        AuditHolder.remove();
    }

    private RuleSetSaveRequest req(String ver, long rv) {
        RuleSetSaveRequest r = new RuleSetSaveRequest();
        r.setSetId("S_D");
        r.setVer(ver);
        r.setRowVersion(rv);
        r.setSetName("새 이름");
        r.setRules(List.of(Map.of("ruleId", "R1")));
        return r;
    }

    /** 거부 코드 — MDM 코드는 첫 detail 의 code, 없으면 cactus ErrorCode 이름(RuleSetEditServiceTest.code 와 같다). */
    private static String code(Runnable call) {
        try {
            call.run();
        } catch (BusinessException e) {
            return RuleSetEditServiceTest.code(e);
        }
        return null;
    }

    @Test
    void savesIntoMyDraftOnlyAndKeepsReleasedUntouched() {
        RuleSetSaveResult r = service.save(req("2.000", 0));
        assertThat(r.getRowVersion()).isEqualTo(1L);
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_D", "2.000", "RULE_IDS")).isEqualTo("[\"R1\"]");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_D", "2.000", "ROW_VERSION")).isEqualTo("1");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_D", "1.000", "RULE_IDS")).isEqualTo("[]");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_D", "1.000", "ROW_VERSION")).isEqualTo("5");
        assertThat(jdbc.queryForObject("SELECT MARU_RULE_SET_NAME FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'S_D'", String.class))
                .isEqualTo("새 이름");
    }

    @Test
    void releasedOthersDraftStaleRowVersionAndMissingVerAreRejected() {
        assertThat(code(() -> service.save(req("1.000", 5)))).isEqualTo("MDM003");   // RELEASED 는 소유자가 없어 소유자 검사가 먼저 거부
        assertThat(code(() -> service.save(req("2.000", 7)))).isEqualTo("MDM001");
        assertThat(code(() -> service.save(req(null, 0)))).isEqualTo("REQUIRED_VALUE");   // 공통 VersionRules.requireVer — 빈 값은 필수 오류
        assertThat(code(() -> service.save(req("2.0001", 0)))).isEqualTo("MDM021");      // 형식 오류
        assertThat(code(() -> service.save(req("3.000", 0)))).isEqualTo("MDM001");       // 없는 버전 — 공통 가드가 행을 못 읽음
        currentUser.set("lee", STEWARD);
        assertThat(code(() -> service.save(req("2.000", 0)))).isEqualTo("MDM003");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_D", "2.000", "RULE_IDS")).isEqualTo("[]");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_D", "2.000", "ROW_VERSION")).isEqualTo("0");
        assertThat(jdbc.queryForObject("SELECT MARU_RULE_SET_NAME FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'S_D'", String.class))
                .isEqualTo("초안 세트");
    }
}
