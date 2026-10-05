package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeStewardDirectory;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetVersionResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** D-144 2단계 — 세트 버전 조작이 룰과 같은 공통 흐름을 탄다. 시계 NOW = 2026-06-15 09:00. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetVersionOpsSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    FakeStewardDirectory stewards;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        currentUser.set("kim", STEWARD);
        stewards.set(Set.of("kim", "lee"));
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));
        DmeTestSupport.ruleSet(jdbc, "S_O", "조작 세트", "[\"R1\",\"R2\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "S_O", "{\"version\":1,\"nodes\":[],\"edges\":[]}");
        DmeTestSupport.ruleSetCalls(jdbc, "S_O", "[\"S_B\"]");
    }

    @AfterEach
    void clearAudit() {
        AuditHolder.remove();
    }

    private static RuleSetVersionRequest req(String ver, String kind, Long rv, String target) {
        RuleSetVersionRequest r = new RuleSetVersionRequest();
        r.setSetId("S_O");
        r.setVer(ver);
        r.setVerKind(kind);
        r.setRowVersion(rv);
        r.setTarget(target);
        return r;
    }

    private static String mdm(Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    private int versionCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID = 'S_O'", Integer.class);
    }

    @Test
    void minorCopiesLatestReleasedFlowAndRecordsKindAndOwner() {
        RuleSetVersionResult r = service.copy(req(null, "MINOR", null, null));
        assertThat(r.getSetId()).isEqualTo("S_O");
        assertThat(r.getVer()).isEqualTo("1.001");
        assertThat(r.getVerKind()).isEqualTo("MINOR");
        assertThat(r.getRowVersion()).isZero();
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.001", "STATUS")).isEqualTo("DRAFT");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.001", "VER_KIND")).isEqualTo("MINOR");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.001", "OWNER_ID")).isEqualTo("kim");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.001", "RULE_IDS")).isEqualTo("[\"R1\",\"R2\"]");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.001", "FLOW_JSON")).isEqualTo("{\"version\":1,\"nodes\":[],\"edges\":[]}");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.001", "CALL_SET_IDS")).isEqualTo("[\"S_B\"]");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.001", "BASE_VER")).startsWith("1");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.001", "APPLY_FROM")).isNull();
    }

    @Test
    void majorFloorsAndSecondNewVersionIsRejectedWhileUnapplied() {
        assertThat(service.copy(req(null, null, null, null)).getVer()).isEqualTo("2.000");   // 빈 종류 = MAJOR
        assertThatThrownBy(() -> service.copy(req(null, "MINOR", null, null))).hasMessageContaining("미적용");   // MDM006
        assertThat(mdm(() -> service.copy(req(null, "PATCH", null, null)))).isEqualTo("MDM021");
    }

    @Test
    void deleteDraftLockUnlockAndCancelConfirm() {
        service.copy(req(null, "MAJOR", null, null));                                    // 2.000 DRAFT kim, rv 0
        assertThat(service.unlock(req("2.000", null, 0L, null)).getRowVersion()).isEqualTo(1L);
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "2.000", "OWNER_ID")).isNull();
        assertThat(service.lock(req("2.000", null, 1L, null)).getRowVersion()).isEqualTo(2L);
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "2.000", "OWNER_ID")).isEqualTo("kim");
        assertThat(mdm(() -> service.delete(req("2.000", null, 1L, RuleSetVersionRequest.TARGET_VERSION)))).isEqualTo("MDM001");
        RuleSetVersionResult deleted = (RuleSetVersionResult) service.delete(req("2.000", null, 2L, RuleSetVersionRequest.TARGET_VERSION));
        assertThat(deleted.getSetId()).isEqualTo("S_O");
        assertThat(deleted.getVer()).isEqualTo("2.000");
        assertThat(versionCount()).isEqualTo(1);

        // 확정 취소 — 아직 적용되지 않은 내 RELEASED(apply_from 미래)만
        DmeTestSupport.ruleSetVersion(jdbc, "S_O", "3.000", "MAJOR", "RELEASED", "kim", "[]", "2026-07-01 00:00:00", "9999-12-31 00:00:00", 0);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_SET_ID = 'S_O' AND VER = 1");
        service.delete(req("3.000", null, 0L, RuleSetVersionRequest.TARGET_CONFIRM));
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "3.000", "STATUS")).isEqualTo("DRAFT");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.000", "APPLY_TO")).isEqualTo("9999-12-31 00:00:00");
    }

    @Test
    void handoverNeedsOwnerAndStewardTarget() {
        service.copy(req(null, "MAJOR", null, null));                                    // 2.000 DRAFT kim, rv 0
        RuleSetVersionRequest h = req("2.000", null, 0L, null);
        h.setNewOwnerId("park");
        assertThat(mdm(() -> service.handover(h))).isEqualTo("MDM005");
        h.setNewOwnerId("lee");
        assertThat(service.handover(h).getRowVersion()).isEqualTo(1L);
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "2.000", "OWNER_ID")).isEqualTo("lee");
        // 이제 소유자가 아니므로 해제·넘기기·삭제는 MDM003
        assertThat(mdm(() -> service.unlock(req("2.000", null, 1L, null)))).isEqualTo("MDM003");
        assertThat(mdm(() -> service.delete(req("2.000", null, 1L, RuleSetVersionRequest.TARGET_VERSION)))).isEqualTo("MDM003");
    }

    @Test
    void deleteOnlyDraftLeavesNoVersion() {   // Review Focus 3
        jdbc.update("DELETE FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID = 'S_O'");
        DmeTestSupport.ruleSetDraft(jdbc, "S_O", "1.000", "kim", "[]", 0);
        service.delete(req("1.000", null, 0L, RuleSetVersionRequest.TARGET_VERSION));
        assertThat(versionCount()).isZero();
        assertThat(mdm(() -> service.copy(req(null, "MINOR", null, null)))).isEqualTo("MDM021");   // 버전이 없으면 major 만
        assertThat(service.copy(req(null, "MAJOR", null, null)).getVer()).isEqualTo("1.000");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.000", "RULE_IDS")).isEqualTo("[]");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.000", "BASE_VER")).isNull();
        assertThatThrownBy(() -> service.copy(req(null, "MINOR", null, null))).isNotNull();
    }

    @Test
    void deleteNeedsKnownTarget() {
        assertThatThrownBy(() -> service.delete(req("1.000", null, 0L, null))).hasMessageContaining("SET·VERSION·CONFIRM");
        assertThatThrownBy(() -> service.delete(req("1.000", null, 0L, "RULE"))).hasMessageContaining("SET·VERSION·CONFIRM");
    }

    @Test
    void deprecateWithTargetSet() {
        RuleSetStatusResult r = (RuleSetStatusResult) service.delete(req(null, null, null, RuleSetVersionRequest.TARGET_SET));
        assertThat(r.getSetId()).isEqualTo("S_O");
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'S_O'", String.class)).isEqualTo("DEPRECATED");
        assertThatThrownBy(() -> service.copy(req(null, "MAJOR", null, null))).hasMessageContaining("폐기한 룰 세트");
    }

    @Test
    void nonStewardCannotCreateVersion() {
        currentUser.set("lee", DmeTestSupport.STD_ADMIN);
        assertThat(mdm(() -> service.copy(req(null, "MAJOR", null, null)))).isEqualTo("MDM013");
        assertThat(versionCount()).isEqualTo(1);
    }

    /**
     * MDM 메타 캐시(spec 2026-10-02 §3.3) — RELEASED 를 바꾸는 확정 취소는 RULE_SET 을 한 번 기록하고(공통 버전 상태 서비스), DRAFT 만 바꾸는
     * 새 버전·해제·선점·DRAFT 삭제는 기록하지 않는다.
     */
    @Test
    void META_확정_취소만_기록하고_DRAFT_조작은_기록하지_않는다() {
        MetaRevTestSupport.clear(jdbc);
        service.copy(req(null, "MAJOR", null, null));                                    // 2.000 DRAFT kim, rv 0
        service.unlock(req("2.000", null, 0L, null));
        service.lock(req("2.000", null, 1L, null));
        service.delete(req("2.000", null, 2L, RuleSetVersionRequest.TARGET_VERSION));
        assertThat(MetaRevTestSupport.rows(jdbc)).isEmpty();

        DmeTestSupport.ruleSetVersion(jdbc, "S_O", "3.000", "MAJOR", "RELEASED", "kim", "[]", "2026-07-01 00:00:00", "9999-12-31 00:00:00", 0);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_SET_ID = 'S_O' AND VER = 1");
        service.delete(req("3.000", null, 0L, RuleSetVersionRequest.TARGET_CONFIRM));
        assertThat(MetaRevTestSupport.rows(jdbc)).containsExactly("RULE_SET:S_O:SAVE");
    }
}
