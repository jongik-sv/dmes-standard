package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STD_ADMIN;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** D-144 2단계 — 세트 view 의 버전 선택·편집 가능·버튼 플래그. 시계는 DmeTestSupport.NOW(2026-06-15 09:00). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetVersionViewSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));
        DmeTestSupport.rule(jdbc, "R1", "R1", "DECISION", "INUSE");
        DmeTestSupport.ruleSet(jdbc, "S_V", "버전 세트", "[\"R1\"]", "INUSE", 2);                 // 1.000 RELEASED
        DmeTestSupport.ruleSetDraft(jdbc, "S_V", "1.001", "kim", "[\"R1\"]", 0);
    }

    @AfterEach
    void clearAudit() {
        AuditHolder.remove();
    }

    private RuleSetViewResult view(String setId, String ver) {
        RuleSetViewRequest r = new RuleSetViewRequest();
        r.setSetId(setId);
        r.setVer(ver);
        return service.view(r);
    }

    @Test
    void defaultSelectsMyDraftAndItIsEditable() {
        RuleSetViewResult v = view("S_V", null);
        assertThat(v.getSet().getVer()).isEqualTo("1.001");
        assertThat(v.getSet().getVerStatus()).isEqualTo("DRAFT");
        assertThat(v.getSet().getOwnerId()).isEqualTo("kim");
        assertThat(v.isEditable()).isTrue();
        assertThat(v.getSet().getRowVersion()).isZero();
        assertThat(v.getVersions()).extracting(RuleSetViewResult.VersionRow::getVer).containsExactly("1.001", "1.000");
        assertThat(v.getFlags().isCanNewMajor()).isFalse();   // 미적용 버전(DRAFT)이 있다
        assertThat(v.getFlags().isCanNewMinor()).isFalse();
        assertThat(v.getFlags().getUnappliedCount()).isEqualTo(1);
        assertThat(v.getFlags().getCurrentVer()).isEqualTo("1.000");
        assertThat(v.getFlags().isCanDeprecate()).isFalse();  // 미적용 버전이 있으면 폐기 불가
        assertThat(v.getMe()).isEqualTo("kim");
    }

    @Test
    void releasedIsReadOnlyAndOthersDraftIsReadOnly() {
        RuleSetViewResult released = view("S_V", "1.000");
        assertThat(released.getSet().getVerStatus()).isEqualTo("RELEASED");
        assertThat(released.getSet().getVerLabel()).isEqualTo("v1.000");
        assertThat(released.getSet().getApplyFrom()).isEqualTo("2000-01-01 00:00:00");
        assertThat(released.isEditable()).isFalse();
        assertThat(released.getSet().getRowVersion()).isEqualTo(2L);

        currentUser.set("lee", STEWARD);
        RuleSetViewResult other = view("S_V", null);
        assertThat(other.getSet().getVer()).isEqualTo("1.000");   // 내 DRAFT 가 없으면 지금 적용 중인 RELEASED
        assertThat(view("S_V", "1.001").isEditable()).isFalse();  // 남의 DRAFT
    }

    @Test
    void nonStewardCannotDeprecate() {   // Ruling P2-17
        jdbc.update("DELETE FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID = 'S_V' AND STATUS = 'DRAFT'");
        assertThat(view("S_V", null).getFlags().isCanDeprecate()).isTrue();   // 담당자·INUSE·미적용 없음
        currentUser.set("lee", STD_ADMIN);
        assertThat(view("S_V", null).getFlags().isCanDeprecate()).isFalse();  // 담당자가 아니면 폐기 불가
    }

    @Test
    void caseEditFollowsStewardAndNotDeprecatedRegardlessOfVersion() {   // Ruling P2-18
        assertThat(view("S_V", "1.000").getFlags().isCanEditCases()).isTrue();   // RELEASED 를 보고 있어도 담당자면 케이스 편집
        assertThat(view("S_V", "1.000").isEditable()).isFalse();
        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'DEPRECATED' WHERE MARU_RULE_SET_ID = 'S_V'");
        assertThat(view("S_V", "1.000").getFlags().isCanEditCases()).isFalse();  // 폐기 세트
        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'INUSE' WHERE MARU_RULE_SET_ID = 'S_V'");
        currentUser.set("lee", STD_ADMIN);
        assertThat(view("S_V", "1.000").getFlags().isCanEditCases()).isFalse();  // 담당자 아님
    }

    @Test
    void unknownVersionIsRejected() {
        assertThatThrownBy(() -> view("S_V", "9.000")).hasMessageContaining("버전이 없습니다: S_V v9.000");
    }

    @Test
    void noVersionsOpensEmptyReadOnly() {   // Review Focus 3
        jdbc.update("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS) VALUES ('S_EMPTY', '빈 세트', 'CREATED')");
        RuleSetViewResult v = view("S_EMPTY", null);
        assertThat(v.getSet().getVer()).isNull();
        assertThat(v.getSet().getRowVersion()).isZero();
        assertThat(v.getSet().getRuleIds()).isEmpty();
        assertThat(v.getSet().getFlow()).isNull();
        assertThat(v.isEditable()).isFalse();
        assertThat(v.getVersions()).isEmpty();
        assertThat(v.getFlags().isCanNewMajor()).isTrue();
        assertThat(v.getFlags().isCanNewMinor()).isFalse();
        assertThat(v.getFlags().getNextMajor()).isEqualTo("1.000");
        assertThat(v.getFlags().getNextMinor()).isNull();
    }

    @Test
    void createdParentWithAppliedReleasedShowsInuse() {
        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'CREATED' WHERE MARU_RULE_SET_ID = 'S_V'");
        assertThat(view("S_V", "1.000").getSet().getStatus()).isEqualTo("INUSE");
    }
}
