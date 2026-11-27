/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: CommRoleMngService 시험 — 퍼미션 모델 v2(TB_MCM_SEC_ROLE_PERM) 집계·저장·조회
 */
package com.dongkuk.dmes.mcm.csa.commRoleMng.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commObjMng.support.CommSecMngJpaTestBase;
import com.dongkuk.dmes.mcm.csa.commRoleMng.dto.CommRoleMngRoleRequest;
import com.dongkuk.dmes.mcm.csa.commRoleMng.dto.CommRoleMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commRoleMng.dto.CommRoleMngSearchRoleMapRequest;
import com.dongkuk.dmes.mcm.entity.SecRolePerm;
import com.dongkuk.dmes.mcm.entity.SecRolePermId;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRolePermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleRepository;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** {@link CommRoleMngService} 시험 — 역할 집계·저장 이벤트·삭제 검사·퍼미션 조회/저장·폴더 오브젝트·lov. */
class CommRoleMngServiceTest extends CommSecMngJpaTestBase {

    @Autowired CommRoleMngService service;
    @Autowired SecRolePermRepository rolePermRepo;
    @Autowired SecRoleMappingRepository legacyMappingRepo;
    @Autowired SecRoleRepository roleRepo;

    // ── search ──

    @Test
    void searchCmRole_addsCounts_sysadminMinusOne_overlappingGroupsCountedOnce() {
        fx.role("R1", "Y");
        fx.role("R2", "Y");
        fx.role("SYSADMIN", "Y");
        fx.obj("csa::a", "Y", "search,save", null);
        fx.group("G1", "Y");
        fx.group("G2", "Y");
        fx.groupRole("G1", "R1");
        fx.groupRole("G2", "R1");
        fx.userGroup("U1", "G1");
        fx.userGroup("U1", "G2"); // 두 그룹에 겹치는 사람
        fx.userGroup("U2", "G1");
        fx.rolePerm("R1", "csa::a", "search", null);

        Map<String, Object> out = inTx(() -> service.searchCmRole(new CommRoleMngSearchRequest()));

        Map<String, Map<String, Object>> byId = byKey(grid(out, "ds_main"), "ROLE_ID");
        assertThat(byId.get("R1")).containsEntry("GROUP_CNT", 2L).containsEntry("USER_CNT", 2L).containsEntry("PERM_CNT", 1L)
                .containsKey("ROLE_GROUP_ID").containsEntry("ID", "R1");
        assertThat(byId.get("R2")).containsEntry("GROUP_CNT", 0L).containsEntry("USER_CNT", 0L).containsEntry("PERM_CNT", 0L);
        assertThat(byId.get("SYSADMIN")).containsEntry("PERM_CNT", -1L);
    }

    // ── save ──

    @Test
    void saveCmRole_useTpChange_publishesRoleChangedEvent_insertDoesNot() {
        fx.role("R1", "Y");

        inTx(() -> service.saveCmRole(List.of(
                row("rowStatus", "updated", "ROLE_ID", "R1", "ROLE_NM", "역할 R1", "USE_TP", "N"),
                row("rowStatus", "inserted", "ROLE_ID", "R_NEW", "ROLE_NM", "새 역할", "USE_TP", "Y"))));

        assertThat(roleRepo.findById("R1")).get().extracting(r -> r.getUseTp()).isEqualTo("N");
        assertThat(roleRepo.existsById("R_NEW")).isTrue();
        assertThat(events.roleEvents()).extracting(RoleChangedEvent::getRoleIds).containsExactly(Set.of("R1"));
    }

    @Test
    void saveCmRole_blankRoleNm_rejected_nothingWritten() {
        fx.role("R1", "Y");

        // 맞는 줄이 앞에 있어도 하나라도 역할명이 비면 아무것도 쓰지 않는다(z2fix2 d)
        assertThatThrownBy(() -> inTx(() -> service.saveCmRole(List.of(
                row("rowStatus", "inserted", "ROLE_ID", "R_OK", "ROLE_NM", "새 역할", "USE_TP", "Y"),
                row("rowStatus", "inserted", "ROLE_ID", "R_NEW", "ROLE_NM", "  ", "USE_TP", "Y")))))
                .isInstanceOf(BusinessException.class).hasMessageStartingWith("ROLE_NM_REQUIRED: ").hasMessageContaining("R_NEW");
        assertThatThrownBy(() -> inTx(() -> service.saveCmRole(List.of(
                row("rowStatus", "updated", "ROLE_ID", "R1", "USE_TP", "N")))))
                .isInstanceOf(BusinessException.class).hasMessageStartingWith("ROLE_NM_REQUIRED: ");

        assertThat(roleRepo.existsById("R_OK")).isFalse();
        assertThat(roleRepo.existsById("R_NEW")).isFalse();
        assertThat(roleRepo.findById("R1")).get().extracting(r -> r.getUseTp()).isEqualTo("Y");
        assertThat(events.roleEvents()).isEmpty();
    }

    @Test
    void saveCmRole_existingRoleRename_updatesSameRoleId_noNewRow() {
        fx.role("role_MN_MPP_WORK_VIEW", "Y");
        long before = roleRepo.count();

        // 검색 줄 ID = ROLE_ID 전체를 그대로 실어 보내도 ROLE_ID 를 다시 합성하지 않는다(z2fix2 c)
        inTx(() -> service.saveCmRole(List.of(
                row("rowStatus", "updated", "ROLE_ID", "role_MN_MPP_WORK_VIEW", "ID", "role_MN_MPP_WORK_VIEW",
                        "MENU_ID", "MN_MPP", "ROLE_NM", "작업 조회(새 이름)", "USE_TP", "Y"))));

        assertThat(roleRepo.count()).isEqualTo(before);
        assertThat(roleRepo.findById("role_MN_MPP_WORK_VIEW")).get().extracting(r -> r.getRoleNm()).isEqualTo("작업 조회(새 이름)");
        assertThat(roleRepo.existsById("role_MN_MPP_role_MN_MPP_WORK_VIEW")).isFalse();
    }

    @Test
    void searchCmRole_idIsWholeRoleId() {
        fx.role("role_MN_MPP_WORK_VIEW", "Y");

        Map<String, Object> out = inTx(() -> service.searchCmRole(new CommRoleMngSearchRequest()));

        // 옛 「마지막 _ 이후」(VIEW) 가 아니라 ROLE_ID 전체(z2fix2 c)
        assertThat(byKey(grid(out, "ds_main"), "ROLE_ID").get("role_MN_MPP_WORK_VIEW")).containsEntry("ID", "role_MN_MPP_WORK_VIEW");
    }

    @Test
    void saveCmRole_delete_blockedByNewPerm_silentSkip() {
        fx.role("R1", "Y");
        fx.obj("csa::a", "Y", "search", null);
        fx.rolePerm("R1", "csa::a", "search", null);

        Map<String, Object> out = inTx(() -> service.saveCmRole(List.of(row("rowStatus", "deleted", "ROLE_ID", "R1"))));

        assertThat(out).containsEntry("cnt_merge", 0);
        assertThat(roleRepo.existsById("R1")).isTrue();
        assertThat(events.roleEvents()).isEmpty();
    }

    @Test
    void saveCmRole_delete_withoutReferences_deletesAndPublishes() {
        fx.role("R1", "Y");

        inTx(() -> service.saveCmRole(List.of(row("rowStatus", "deleted", "ROLE_ID", "R1"))));

        assertThat(roleRepo.existsById("R1")).isFalse();
        assertThat(events.roleEvents()).extracting(RoleChangedEvent::getRoleIds).containsExactly(Set.of("R1"));
    }

    // ── searchRoleGroups ──

    @Test
    void searchRoleGroups_returnsGroupsAndDistinctUserCount() {
        fx.role("R1", "Y");
        fx.group("G1", "Y");
        fx.group("G2", "N");
        fx.groupRole("G1", "R1");
        fx.groupRole("G2", "R1");
        fx.userGroup("U1", "G1");
        fx.userGroup("U2", "G1");
        fx.userGroup("U3", "G2"); // 사용 안 함 그룹 — 사람 수에서 빠진다

        Map<String, Object> out = inTx(() -> service.searchRoleGroups(roleReq("R1", null)));

        List<Map<String, Object>> groups = grid(out, "groups");
        assertThat(groups).extracting(g -> g.get("ROLE_GROUP_ID")).containsExactly("G1", "G2");
        assertThat(groups.get(0)).containsKeys("ROLE_GROUP_NM", "USE_TP").containsEntry("USER_CNT", 2L);
        assertThat(out).containsEntry("USER_CNT", 2L);
    }

    // ── searchCmRoleMap ──

    @Test
    void searchCmRoleMap_returnsPermColumns_sortedByMenuTree_noMenuLast() {
        menuTree();
        fx.obj("csa::c", "Y", "search", null); // 메뉴 없음
        fx.role("R1", "Y");
        fx.rolePerm("R1", "csa::c", "search", null);
        fx.rolePerm("R1", "csa::b", "save", null);
        fx.rolePerm("R1", "csa::a", "search,save", "pop");

        CommRoleMngSearchRoleMapRequest req = new CommRoleMngSearchRoleMapRequest();
        req.setRoleId("R1");
        Map<String, Object> out = inTx(() -> service.searchCmRoleMap(req));

        List<Map<String, Object>> perms = grid(out, "perms");
        assertThat(perms).extracting(p -> p.get("OBJECT_ID")).containsExactly("csa::a", "csa::b", "csa::c");
        assertThat(perms.get(0)).containsOnlyKeys("ROLE_ID", "OBJECT_ID", "OBJECT_NM", "MENU_FOLDER_ID", "MENU_PATH", "MENU_NM",
                        "OBJ_BTN_PERM", "OBJ_POPUP_PERM", "OBJ_READ_PERM", "BTN_PERM", "POPUP_PERM", "DATA_PERM")
                .containsEntry("ROLE_ID", "R1")
                .containsEntry("MENU_FOLDER_ID", "F1")
                .containsEntry("MENU_PATH", "폴더 M1 › 폴더 F1")
                .containsEntry("MENU_NM", "메뉴 MA")
                .containsEntry("OBJ_BTN_PERM", "search,save,listLov")
                .containsEntry("OBJ_READ_PERM", "search,listLov")
                .containsEntry("BTN_PERM", "search,save")
                .containsEntry("POPUP_PERM", "pop");
        assertThat(perms.get(2)).containsEntry("MENU_FOLDER_ID", null).containsEntry("MENU_PATH", null);
        assertThat(out).doesNotContainKey("ds_roleMap");
    }

    @Test
    void searchCmRoleMap_acceptsLegacyRoleIdKey() {
        fx.obj("csa::a", "Y", "search", null);
        fx.role("R1", "Y");
        fx.rolePerm("R1", "csa::a", "search", null);

        CommRoleMngSearchRoleMapRequest req = new CommRoleMngSearchRoleMapRequest();
        req.setROLE_ID("R1");
        Map<String, Object> out = inTx(() -> service.searchCmRoleMap(req));

        assertThat(grid(out, "perms")).hasSize(1);
    }

    // ── saveCmRoleMap ──

    @Test
    void saveCmRoleMap_mergeAndDelete_normalizes_publishes_noLegacyWrite() {
        fx.role("R1", "Y");
        fx.obj("csa::a", "Y", "search,save,delete", "pop1,pop2");
        fx.obj("csa::b", "Y", "search", null);
        fx.obj("csa::c", "Y", "search", null);
        fx.rolePerm("R1", "csa::b", "search", null);  // 갱신 대상
        fx.rolePerm("R1", "csa::c", "search", null);  // 삭제 대상

        Map<String, Object> out = inTx(() -> service.saveCmRoleMap(roleReq("R1", null), List.of(
                permRow("R1", "csa::a", " search , save,search", "pop2", " d1 ,d1", "MERGE"),
                permRow("R1", "csa::b", "search", "", "D9", "MERGE"),
                permRow("R1", "csa::c", "", "", "", "DEL"),
                permRow("R1", "csa::zz", "", "", "", "DEL")))); // 없는 줄 DEL = 건너뜀

        assertThat(out).containsEntry("cnt_merge", 2).containsEntry("cnt_delete", 1);
        SecRolePerm a = rolePermRepo.findById(new SecRolePermId("R1", "csa::a")).orElseThrow();
        assertThat(a.getBtnPerm()).isEqualTo("search,save");
        assertThat(a.getPopupPerm()).isEqualTo("pop2");
        assertThat(a.getDataPerm()).isEqualTo("d1");
        assertThat(rolePermRepo.findById(new SecRolePermId("R1", "csa::b")).orElseThrow().getDataPerm()).isEqualTo("D9");
        assertThat(rolePermRepo.existsById(new SecRolePermId("R1", "csa::c"))).isFalse();
        assertThat(legacyMappingRepo.count()).isZero();
        assertThat(events.roleEvents()).extracting(RoleChangedEvent::getRoleIds).containsExactly(Set.of("R1"));
    }

    // 거절 시험은 inTx 없이 부른다. 저장소 호출마다 바로 커밋되므로, 서비스가 검사 전에 앞 줄을 썼다면 DB 에 남는다
    // (= 「전부 검사 뒤 쓰기」를 실제로 확인한다). 맞는 줄을 앞에, 틀린 줄을 맨 뒤에 둔다.

    @Test
    void saveCmRoleMap_emptyBtn_rejected_nothingWritten() {
        fx.role("R1", "Y");
        fx.obj("csa::a", "Y", "search", null);
        fx.obj("csa::b", "Y", "search", null);

        assertThatThrownBy(() -> service.saveCmRoleMap(roleReq("R1", null), List.of(
                permRow("R1", "csa::a", "search", null, null, "MERGE"),   // 맞는 줄이 앞에 있어도
                permRow("R1", "csa::b", " , ", null, null, "MERGE"))))
                .isInstanceOf(BusinessException.class).hasMessageStartingWith("PERM_EMPTY_BTN");

        assertThat(rolePermRepo.count()).isZero();
        assertThat(events.roleEvents()).isEmpty();
    }

    @Test
    void saveCmRoleMap_badOpTp_rejected_nothingWritten() {
        fx.role("R1", "Y");
        fx.obj("csa::a", "Y", "search", null);
        fx.obj("csa::b", "Y", "search", null);

        assertThatThrownBy(() -> service.saveCmRoleMap(roleReq("R1", null), List.of(
                permRow("R1", "csa::a", "search", null, null, "MERGE"),
                permRow("R1", "csa::b", "search", null, null, "UPSERT"))))
                .isInstanceOf(BusinessException.class).hasMessageStartingWith("PERM_BAD_ROW").hasMessageContaining("UPSERT");

        assertThat(rolePermRepo.count()).isZero();
        assertThat(events.roleEvents()).isEmpty();
    }

    @Test
    void saveCmRoleMap_duplicatePk_rejected_nothingWritten() {
        fx.role("R1", "Y");
        fx.obj("csa::a", "Y", "search", null);

        // 공백을 지운 뒤 같은 PK 로 본다
        assertThatThrownBy(() -> service.saveCmRoleMap(roleReq(" R1 ", null), List.of(
                permRow("R1", "csa::a", "search", null, null, "MERGE"),
                permRow(" R1", "csa::a ", "", null, null, "DEL"))))
                .isInstanceOf(BusinessException.class).hasMessageStartingWith("PERM_BAD_ROW");

        assertThat(rolePermRepo.count()).isZero();
        assertThat(events.roleEvents()).isEmpty();
    }

    @Test
    void saveCmRoleMap_unknownRole_rejected() {
        fx.obj("csa::a", "Y", "search", null);

        assertThatThrownBy(() -> service.saveCmRoleMap(roleReq("R_NONE", null), List.of(
                permRow("R_NONE", "csa::a", "search", null, null, "MERGE"))))
                .isInstanceOf(BusinessException.class).hasMessageStartingWith("PERM_NO_ROLE");

        assertThat(rolePermRepo.count()).isZero();
        assertThat(events.roleEvents()).isEmpty();
    }

    @Test
    void saveCmRoleMap_valueOutsideObject_rejected() {
        fx.role("R1", "Y");
        fx.obj("csa::a", "Y", "search", "pop1");

        assertThatThrownBy(() -> inTx(() -> service.saveCmRoleMap(roleReq("R1", null), List.of(
                permRow("R1", "csa::a", "search", "pop1,popX", null, "MERGE")))))
                .isInstanceOf(BusinessException.class).hasMessageStartingWith("PERM_NOT_IN_OBJ").hasMessageContaining("popX");
        assertThatThrownBy(() -> inTx(() -> service.saveCmRoleMap(roleReq("R1", null), List.of(
                permRow("R1", "csa::a", "search,save", null, null, "MERGE")))))
                .isInstanceOf(BusinessException.class).hasMessageStartingWith("PERM_NOT_IN_OBJ").hasMessageContaining("save");
        assertThat(rolePermRepo.count()).isZero();
    }

    @Test
    void saveCmRoleMap_rowRoleMismatch_rejected() {
        fx.role("R1", "Y");
        fx.role("R2", "Y");
        fx.obj("csa::a", "Y", "search", null);

        assertThatThrownBy(() -> inTx(() -> service.saveCmRoleMap(roleReq("R1", null), List.of(
                permRow("R2", "csa::a", "search", null, null, "MERGE")))))
                .isInstanceOf(BusinessException.class).hasMessageStartingWith("PERM_ROLE_MISMATCH");
        assertThat(rolePermRepo.count()).isZero();
    }

    @Test
    void saveCmRoleMap_sysadmin_rejected() {
        fx.role("SYSADMIN", "Y");
        fx.obj("csa::a", "Y", "search", null);

        assertThatThrownBy(() -> inTx(() -> service.saveCmRoleMap(roleReq("SYSADMIN", null), List.of(
                permRow("SYSADMIN", "csa::a", "search", null, null, "MERGE")))))
                .isInstanceOf(BusinessException.class).hasMessageStartingWith("PERM_SYSADMIN");
        assertThat(rolePermRepo.count()).isZero();
    }

    // ── searchFolderObj ──

    @Test
    void searchFolderObj_subtreeObjects_hasPerm_sortedByMenuTree() {
        menuTree();
        fx.role("R1", "Y");
        fx.rolePerm("R1", "csa::a", "search", null);

        Map<String, Object> out = inTx(() -> service.searchFolderObj(roleReq("R1", "M1")));

        List<Map<String, Object>> objs = grid(out, "objs");
        assertThat(objs).extracting(o -> o.get("OBJECT_ID")).containsExactly("csa::a", "csa::b");
        assertThat(objs.get(0)).containsOnlyKeys("OBJECT_ID", "OBJECT_NM", "MENU_NM", "MENU_FOLDER_ID", "MENU_PATH",
                        "OBJ_BTN_PERM", "OBJ_POPUP_PERM", "OBJ_READ_PERM", "USE_TP", "HAS_PERM")
                .containsEntry("HAS_PERM", "Y")
                .containsEntry("MENU_NM", "메뉴 MA")
                .containsEntry("MENU_FOLDER_ID", "F1")
                .containsEntry("MENU_PATH", "폴더 M1 › 폴더 F1")
                .containsEntry("OBJ_READ_PERM", "search,listLov")
                .containsEntry("USE_TP", "Y");
        assertThat(objs.get(1)).containsEntry("HAS_PERM", "N");

        // 하위 폴더 하나만 고르면 그 폴더 오브젝트만
        assertThat(grid(inTx(() -> service.searchFolderObj(roleReq("R1", "F2"))), "objs"))
                .extracting(o -> o.get("OBJECT_ID")).containsExactly("csa::b");
        // 빈 폴더 = 빈 목록
        assertThat(grid(inTx(() -> service.searchFolderObj(roleReq("R1", ""))), "objs")).isEmpty();
    }

    // ── lov ──

    @Test
    void lov_keepsLegacyMenuIdLov_andAddsFolderMenus() {
        menuTree();

        Map<String, Object> out = inTx(() -> service.lov());

        assertThat(out).containsKey("ds_lovMenuId");
        List<Map<String, Object>> menus = grid(out, "menus");
        assertThat(menus).extracting(m -> m.get("MENU_ID")).containsExactly("M1", "F1", "F2");
        assertThat(menus.get(1)).containsEntry("MENU_PATH", "폴더 M1 › 폴더 F1").containsEntry("MENU_LV", 2);
    }

    // ── helpers ──

    /** 모듈 M1 ─ 폴더 F1(메뉴 MA → csa::a), F2(메뉴 MB → csa::b). */
    private void menuTree() {
        fx.folder("M1", null, "1");
        fx.folder("F1", "M1", "1");
        fx.folder("F2", "M1", "2");
        fx.obj("csa::a", "Y", "search,save,listLov", "pop");
        fx.obj("csa::b", "Y", "save", null);
        fx.menu("MB", "F2", "csa::b");
        fx.menu("MA", "F1", "csa::a");
    }

    private static CommRoleMngRoleRequest roleReq(String roleId, String menuFolderId) {
        CommRoleMngRoleRequest r = new CommRoleMngRoleRequest();
        r.setRoleId(roleId);
        r.setMenuFolderId(menuFolderId);
        return r;
    }

    private static Map<String, Object> permRow(String roleId, String objectId, String btn, String popup, String data, String opTp) {
        return row("ROLE_ID", roleId, "OBJECT_ID", objectId, "BTN_PERM", btn, "POPUP_PERM", popup, "DATA_PERM", data, "OP_TP", opTp);
    }

    private static Map<String, Map<String, Object>> byKey(List<Map<String, Object>> rows, String key) {
        return rows.stream().collect(Collectors.toMap(r -> String.valueOf(r.get(key)), Function.identity()));
    }
}
