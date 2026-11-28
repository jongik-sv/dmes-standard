/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 역할 그룹·역할·퍼미션 화면 — SYSADMIN 만 할 수 있는 일(m19 권한 올리기 막기)
 */
package com.dongkuk.dmes.mcm.csa.commRoleGrpMng.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.csa.commObjMng.support.CommSecMngJpaTestBase;
import com.dongkuk.dmes.mcm.csa.commObjMng.support.CommSecMngJpaTestConfig;
import com.dongkuk.dmes.mcm.csa.commPerm.SysadminGuard;
import com.dongkuk.dmes.mcm.csa.commPermMng.service.CommPermMngService;
import com.dongkuk.dmes.mcm.csa.commRoleMng.dto.CommRoleMngRoleRequest;
import com.dongkuk.dmes.mcm.csa.commRoleMng.service.CommRoleMngService;
import com.dongkuk.dmes.mcm.entity.SecRoleGroupMapping;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** GUARD_OP = SYSADMIN 이 아닌 운영자, GUARD_ADM = SYSADMIN 보유자. */
class CommSecSysadminOnlyTest extends CommSecMngJpaTestBase {

    @Autowired CommRoleGrpMngService grpService;
    @Autowired CommRoleMngService roleService;
    @Autowired CommPermMngService permService;
    @Autowired SysadminGuard guard;
    @Autowired SecRoleGroupMappingRepository groupRoleRepo;
    @Autowired SecRoleRepository roleRepo;
    @Autowired GuardUsers guardUsers;

    @BeforeEach
    void setUp() {
        guardUsers.clear();
        fx.role("SYSADMIN", "Y");
        fx.role("R1", "Y");
        fx.role("R_DB", "Y");
        fx.obj("o1", "Y", "search,save", null);
        fx.obj("dbViewer", "Y", "query", null);
        fx.rolePerm("R_DB", "dbViewer", "query", null);
        fx.group("G_SYS", "Y");
        fx.groupRole("G_SYS", "SYSADMIN");
        fx.group("G1", "Y");
        fx.groupRole("G1", "R1");
        fx.group("G_DB", "Y");
        fx.groupRole("G_DB", "R_DB");
        guardUsers.user("GUARD_ADM");
        guardUsers.user("GUARD_OP");
        fx.userGroup("GUARD_ADM", "G_SYS");
        fx.userGroup("GUARD_OP", "G1");
        CommSecMngJpaTestConfig.CURRENT_USER.set("GUARD_OP");
    }

    @AfterEach
    void tearDown() {
        CommSecMngJpaTestConfig.CURRENT_USER.set(null);
        guardUsers.clear();
        fx.clearAll(); // 퍼미션 행(ROLE_PERM → ROLE FK)을 남기지 않는다 — 다음 시험 컨텍스트의 행 지우기가 걸리지 않게
    }

    void assertOnly(Runnable r) {
        assertThatThrownBy(r::run).isInstanceOf(BusinessException.class).hasMessageStartingWith("SYSADMIN_ONLY: ");
    }

    @Test
    @DisplayName("판정: 보유자·민감한 역할·민감한 그룹·별칭 ID(대소문자 무시)")
    void predicates() {
        assertThat(inTx(() -> guard.currentUserIsSysadmin())).isFalse();
        CommSecMngJpaTestConfig.CURRENT_USER.set("guard_adm");
        assertThat(inTx(() -> guard.currentUserIsSysadmin())).isTrue();
        assertThat(inTx(() -> guard.sensitiveRoles(List.of("SYSADMIN", "R1", "R_DB", "role_sysadmin")))).containsExactly("SYSADMIN", "R_DB", "role_sysadmin");
        assertThat(inTx(() -> guard.sensitiveGroups(List.of("G_SYS", "G1", "G_DB")))).containsExactly("G_SYS", "G_DB");
        assertThat(SysadminGuard.isSysadminRoleId(" Role_SysAdmin ")).isTrue();
        assertThat(SysadminGuard.isSysadminOnlyObject("DBVIEWER")).isTrue();
    }

    @Test
    @DisplayName("그룹에 SYSADMIN·dbViewer 역할 넣기, SYSADMIN 그룹에 일반 역할 넣기 = SYSADMIN_ONLY. 일반 그룹·역할은 통과")
    void groupRoleMap() {
        assertOnly(() -> inTx(() -> grpService.saveCmRoleGrpMap(List.of(row("rowStatus", "inserted", "ROLE_GROUP_ID", "G1", "ROLE_ID", "SYSADMIN")))));
        assertOnly(() -> inTx(() -> grpService.saveCmRoleGrpMap(List.of(row("rowStatus", "inserted", "ROLE_GROUP_ID", "G1", "ROLE_ID", "R_DB")))));
        assertOnly(() -> inTx(() -> grpService.saveCmRoleGrpMap(List.of(row("rowStatus", "inserted", "ROLE_GROUP_ID", "G_SYS", "ROLE_ID", "R1")))));
        assertOnly(() -> inTx(() -> grpService.saveCmRoleGrp(List.of(row("rowStatus", "updated", "ROLE_GROUP_ID", "G_SYS", "ROLE_GROUP_NM", "바꿈", "USE_TP", "Y")))));
        assertThat(groupRoleRepo.existsById(new SecRoleGroupMapping.PK("G1", "SYSADMIN"))).isFalse();

        fx.role("R2", "Y");
        inTx(() -> grpService.saveCmRoleGrpMap(List.of(row("rowStatus", "inserted", "ROLE_GROUP_ID", "G1", "ROLE_ID", "R2"))));
        assertThat(groupRoleRepo.existsById(new SecRoleGroupMapping.PK("G1", "R2"))).isTrue();

        CommSecMngJpaTestConfig.CURRENT_USER.set("GUARD_ADM");
        inTx(() -> grpService.saveCmRoleGrpMap(List.of(row("rowStatus", "inserted", "ROLE_GROUP_ID", "G1", "ROLE_ID", "R_DB"))));
        assertThat(groupRoleRepo.existsById(new SecRoleGroupMapping.PK("G1", "R_DB"))).isTrue();
    }

    @Test
    @DisplayName("별칭 ROLE_SYSADMIN 역할 새로 만들기 = SYSADMIN_ONLY(소문자도). SYSADMIN 은 만든다")
    void aliasRole() {
        assertOnly(() -> inTx(() -> roleService.saveCmRole(List.of(row("rowStatus", "inserted", "ROLE_ID", "ROLE_SYSADMIN", "ROLE_NM", "가짜", "USE_TP", "Y")))));
        assertOnly(() -> inTx(() -> roleService.saveCmRole(List.of(row("rowStatus", "inserted", "ROLE_ID", "role_sysadmin", "ROLE_NM", "가짜", "USE_TP", "Y")))));
        assertThat(roleRepo.existsById("ROLE_SYSADMIN")).isFalse();

        CommSecMngJpaTestConfig.CURRENT_USER.set("GUARD_ADM");
        inTx(() -> roleService.saveCmRole(List.of(row("rowStatus", "inserted", "ROLE_ID", "ROLE_SYSADMIN", "ROLE_NM", "별칭", "USE_TP", "Y"))));
        assertThat(roleRepo.existsById("ROLE_SYSADMIN")).isTrue();
    }

    @Test
    @DisplayName("dbViewer 퍼미션 주기·빼기 = SYSADMIN_ONLY(commPermMng·commRoleMng). 다른 오브젝트는 통과")
    void sysadminOnlyObject() {
        assertOnly(() -> inTx(() -> permService.saveCmPerm(List.of(row("ROLE_ID", "R1", "OBJECT_ID", "dbViewer", "OP_TP", "MERGE", "BTN_PERM", "query")))));
        assertOnly(() -> inTx(() -> permService.saveCmPerm(List.of(row("ROLE_ID", "R_DB", "OBJECT_ID", "dbViewer", "OP_TP", "DEL")))));
        CommRoleMngRoleRequest req = new CommRoleMngRoleRequest();
        req.setRoleId("R1");
        assertOnly(() -> inTx(() -> roleService.saveCmRoleMap(req, List.of(row("ROLE_ID", "R1", "OBJECT_ID", "dbViewer", "OP_TP", "MERGE", "BTN_PERM", "query")))));

        inTx(() -> permService.saveCmPerm(List.of(row("ROLE_ID", "R1", "OBJECT_ID", "o1", "OP_TP", "MERGE", "BTN_PERM", "search"))));

        CommSecMngJpaTestConfig.CURRENT_USER.set("GUARD_ADM");
        inTx(() -> permService.saveCmPerm(List.of(row("ROLE_ID", "R1", "OBJECT_ID", "dbViewer", "OP_TP", "MERGE", "BTN_PERM", "query"))));
    }
}
