/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: commRoleGrpMng 저장 — 역할이 연결된 그룹 수정 허용(perm-crudfix c1)·사용 현황 칸·마지막 시스템관리자 막기(c5 d)
 */
package com.dongkuk.dmes.mcm.csa.commRoleGrpMng.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commObjMng.support.CommSecMngJpaTestBase;
import com.dongkuk.dmes.mcm.csa.commRoleGrpMng.dto.CommRoleGrpMngSearchRequest;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupRepository;
import com.dongkuk.dmes.mcm.entity.SecRoleGroupMapping;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CommRoleGrpMngSaveGuardTest extends CommSecMngJpaTestBase {

    @Autowired CommRoleGrpMngService service;
    @Autowired SecRoleGroupRepository groupRepo;
    @Autowired SecRoleGroupMappingRepository groupRoleRepo;
    @Autowired GuardUsers guardUsers;

    @BeforeEach
    void setUp() {
        guardUsers.clear();
        fx.role("R1", "Y");
        fx.role("SYSADMIN", "Y");
        fx.group("G1", "Y");
        fx.groupRole("G1", "R1");
        fx.group("G_SYS", "Y");
        fx.groupRole("G_SYS", "SYSADMIN");
    }

    @AfterEach
    void tearDown() {
        guardUsers.clear();
    }

    @Test
    void updateGroupWithRoles_allowed_publishesRolesOnUseTpChange() {
        inTx(() -> service.saveCmRoleGrp(List.of(row("rowStatus", "updated", "ROLE_GROUP_ID", "G1",
                "ROLE_GROUP_NM", "고친 그룹", "ROLE_GROUP_DESC", "설명", "USE_TP", "N",
                "START_ACTIVE_DATE", "2026-01-01", "END_ACTIVE_DATE", "2027-12-31"))));

        assertThat(groupRepo.findById("G1")).get().satisfies(g -> {
            assertThat(g.getRoleGroupNm()).isEqualTo("고친 그룹");
            assertThat(g.getUseTp()).isEqualTo("N");
        });
        assertThat(groupRoleRepo.existsById(new SecRoleGroupMapping.PK("G1", "R1"))).isTrue();
        assertThat(events.roleEvents()).extracting(RoleChangedEvent::getRoleIds).containsExactly(Set.of("R1"));
    }

    @Test
    void updateGroup_nameOnly_noEvent() {
        inTx(() -> service.saveCmRoleGrp(List.of(row("rowStatus", "updated", "ROLE_GROUP_ID", "G1",
                "ROLE_GROUP_NM", "이름만", "USE_TP", "Y"))));
        assertThat(groupRepo.findById("G1")).get().extracting(g -> g.getRoleGroupNm()).isEqualTo("이름만");
        assertThat(events.roleEvents()).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    void search_addsUserAndRoleCounts() {
        guardUsers.user("GUARD_A");
        guardUsers.user("GUARD_B");
        fx.userGroup("GUARD_A", "G1");
        fx.userGroup("GUARD_B", "G1");

        Map<String, Object> out = inTx(() -> service.searchCmRoleGrp(new CommRoleGrpMngSearchRequest()));
        Map<String, Object> g1 = ((List<Map<String, Object>>) out.get("ds_main")).stream()
                .filter(r -> "G1".equals(r.get("ROLE_GROUP_ID"))).findFirst().orElseThrow();
        assertThat(g1).containsEntry("USER_CNT", 2L).containsEntry("ROLE_CNT", 1L);
    }

    @Test
    void sysadminGroupOff_lastHolder_rejected() {
        guardUsers.user("GUARD_ADM");
        fx.userGroup("GUARD_ADM", "G_SYS");

        assertThatThrownBy(() -> inTx(() -> service.saveCmRoleGrp(List.of(row("rowStatus", "updated",
                "ROLE_GROUP_ID", "G_SYS", "ROLE_GROUP_NM", "SYS", "USE_TP", "N")))))
                .hasMessageStartingWith("LAST_SYSADMIN: ");
        assertThat(groupRepo.findById("G_SYS")).get().extracting(g -> g.getUseTp()).isEqualTo("Y");

        // 종료일을 어제로 = 같은 거절
        String yesterday = java.time.LocalDate.now().minusDays(1).toString();
        assertThatThrownBy(() -> inTx(() -> service.saveCmRoleGrp(List.of(row("rowStatus", "updated",
                "ROLE_GROUP_ID", "G_SYS", "ROLE_GROUP_NM", "SYS", "USE_TP", "Y", "END_ACTIVE_DATE", yesterday)))))
                .hasMessageStartingWith("LAST_SYSADMIN: ");
    }

    @Test
    void removeSysadminFromGroup_lastHolder_rejected_otherHolderAllowed() {
        guardUsers.user("GUARD_ADM");
        fx.userGroup("GUARD_ADM", "G_SYS");

        assertThatThrownBy(() -> inTx(() -> service.saveCmRoleGrpMap(List.of(row("rowStatus", "deleted",
                "ROLE_GROUP_ID", "G_SYS", "ROLE_ID", "SYSADMIN")))))
                .hasMessageStartingWith("LAST_SYSADMIN: ");
        assertThat(groupRoleRepo.existsById(new SecRoleGroupMapping.PK("G_SYS", "SYSADMIN"))).isTrue();

        // 다른 그룹으로 SYSADMIN 을 받은 사람이 있으면 통과
        fx.group("G_SYS2", "Y");
        fx.groupRole("G_SYS2", "SYSADMIN");
        guardUsers.user("GUARD_ADM2");
        fx.userGroup("GUARD_ADM2", "G_SYS2");
        inTx(() -> service.saveCmRoleGrpMap(List.of(row("rowStatus", "deleted", "ROLE_GROUP_ID", "G_SYS", "ROLE_ID", "SYSADMIN"))));
        assertThat(groupRoleRepo.existsById(new SecRoleGroupMapping.PK("G_SYS", "SYSADMIN"))).isFalse();
    }
}
