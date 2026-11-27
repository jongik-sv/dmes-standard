/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: CommPermMngService 시험 — 퍼미션 모델 v2(역할×오브젝트 한 건) lov·search·searchPermOne·save
 */
package com.dongkuk.dmes.mcm.csa.commPermMng.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commObjMng.support.CommSecMngJpaTestBase;
import com.dongkuk.dmes.mcm.csa.commPermMng.dto.CommPermMngPermOneRequest;
import com.dongkuk.dmes.mcm.csa.commPermMng.dto.CommPermMngSearchRequest;
import com.dongkuk.dmes.mcm.entity.SecRolePerm;
import com.dongkuk.dmes.mcm.entity.SecRolePermId;
import com.dongkuk.dmes.mcm.repository.SecRolePermRepository;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@link CommPermMngService} 시험.
 *
 * <p>자료: 폴더 MOD_A(순서 1) › FLD_A1, MOD_B(순서 2). 메뉴 M1(FLD_A1 → o1), M2(MOD_B → o2). o3 은 메뉴 없음.
 * 퍼미션: R_A/o1·R_A/o2·R_B/o2·R_B/o3·SYSADMIN/o1(조회에서 빠져야 함).
 */
class CommPermMngServiceTest extends CommSecMngJpaTestBase {

    private static final String O1 = "csa::o1";
    private static final String O2 = "csa::o2";
    private static final String O3 = "csa::o3";

    @Autowired CommPermMngService service;
    @Autowired SecRolePermRepository secRolePermRepository;

    @BeforeEach
    void seed() {
        fx.folder("MOD_A", null, "1");
        fx.folder("FLD_A1", "MOD_A", "1");
        fx.folder("MOD_B", null, "2");

        fx.obj(O1, "Y", "search,save,delete", "popA");
        fx.obj(O2, "Y", "search,save", null);
        fx.obj(O3, "N", "search,excel", null);
        fx.menu("M1", "FLD_A1", O1);
        fx.menu("M2", "MOD_B", O2);

        fx.role("SYSADMIN", "Y");
        fx.role("R_A", "Y");
        fx.role("R_B", "Y");

        fx.rolePerm("R_A", O1, "search,save", "popA");
        fx.rolePerm("R_A", O2, "search", null);
        fx.rolePerm("R_B", O2, "search,save", null);
        fx.rolePerm("R_B", O3, "excel", null);
        fx.rolePerm("SYSADMIN", O1, "search", null);
    }

    // ── lov ──

    @Test
    void lov_excludesSysadmin_andReturnsFolders() {
        Map<String, Object> out = inTx(() -> service.lov());

        assertThat(grid(out, "roles")).extracting(r -> r.get("ROLE_ID")).containsExactly("R_A", "R_B");
        assertThat(grid(out, "roles").get(0)).containsKeys("ROLE_NM", "USE_TP");
        assertThat(grid(out, "menus")).extracting(r -> r.get("MENU_ID"))
                .containsExactly("MOD_A", "FLD_A1", "MOD_B");
    }

    // ── search ──

    @Test
    void search_all_excludesSysadmin_sortedByRoleThenMenuTree() {
        Map<String, Object> out = inTx(() -> service.searchCmPerm(req(null, null, null, null, null)));

        List<Map<String, Object>> rows = grid(out, "perms");
        assertThat(rows).extracting(r -> r.get("ROLE_ID") + "/" + r.get("OBJECT_ID"))
                .containsExactly("R_A/" + O1, "R_A/" + O2, "R_B/" + O2, "R_B/" + O3);
        assertThat(out).containsEntry("TOTAL_CNT", 4);

        Map<String, Object> first = rows.get(0);
        assertThat(first).containsEntry("ROLE_NM", "역할 R_A")
                .containsEntry("OBJECT_NM", "오브젝트 " + O1)
                .containsEntry("MENU_PATH", "폴더 MOD_A › 폴더 FLD_A1")
                .containsEntry("MENU_NM", "메뉴 M1")
                .containsEntry("OBJ_BTN_PERM", "search,save,delete")
                .containsEntry("OBJ_POPUP_PERM", "popA")
                .containsEntry("OBJ_READ_PERM", "search")
                .containsEntry("BTN_PERM", "search,save")
                .containsEntry("POPUP_PERM", "popA")
                .containsEntry("HAS_PERM", "Y");
        assertThat(rows.get(3)).containsEntry("MENU_PATH", null);
    }

    @Test
    void search_filtersByRoleMenuObjectAndCode() {
        assertThat(keys(inTx(() -> service.searchCmPerm(req("R_B", null, null, null, null)))))
                .containsExactly("R_B/" + O2, "R_B/" + O3);
        // 모듈 MOD_A = 하위 폴더 FLD_A1 의 메뉴 M1 → o1
        assertThat(keys(inTx(() -> service.searchCmPerm(req(null, "MOD_A", null, null, null)))))
                .containsExactly("R_A/" + O1);
        // objectQ 대소문자 무시
        assertThat(keys(inTx(() -> service.searchCmPerm(req(null, null, "O3", null, null)))))
                .containsExactly("R_B/" + O3);
        // codeQ = 퍼미션 BTN·POPUP 토큰 부분 일치
        assertThat(keys(inTx(() -> service.searchCmPerm(req(null, null, null, "SAV", null)))))
                .containsExactly("R_A/" + O1, "R_B/" + O2);
        assertThat(keys(inTx(() -> service.searchCmPerm(req(null, null, null, "popa", null)))))
                .containsExactly("R_A/" + O1);
    }

    @Test
    void search_showEmpty_addsObjectsWithoutPermForRole() {
        Map<String, Object> out = inTx(() -> service.searchCmPerm(req("R_B", null, null, null, "Y")));

        List<Map<String, Object>> rows = grid(out, "perms");
        assertThat(keys(out)).containsExactly("R_B/" + O1, "R_B/" + O2, "R_B/" + O3);
        assertThat(rows.get(0)).containsEntry("HAS_PERM", "N")
                .containsEntry("BTN_PERM", "")
                .containsEntry("POPUP_PERM", "")
                .containsEntry("DATA_PERM", "")
                .containsEntry("OBJ_BTN_PERM", "search,save,delete");
        assertThat(rows.get(1)).containsEntry("HAS_PERM", "Y");

        // N 줄의 codeQ = 오브젝트 허용 값에서 찾는다
        assertThat(keys(inTx(() -> service.searchCmPerm(req("R_B", null, null, "delete", "Y")))))
                .containsExactly("R_B/" + O1);
        // 역할 없이 showEmpty 는 무시
        assertThat(keys(inTx(() -> service.searchCmPerm(req(null, null, null, null, "Y"))))).hasSize(4);
    }

    @Test
    void search_paging_keepsTotalCount() {
        CommPermMngSearchRequest r = req(null, null, null, null, null);
        r.setPageNo("2");
        r.setPageSize("3");
        Map<String, Object> out = inTx(() -> service.searchCmPerm(r));
        assertThat(keys(out)).containsExactly("R_B/" + O3);
        assertThat(out).containsEntry("TOTAL_CNT", 4);

        r.setPageNo("3");
        Map<String, Object> beyond = inTx(() -> service.searchCmPerm(r));
        assertThat(grid(beyond, "perms")).isEmpty();
        assertThat(beyond).containsEntry("TOTAL_CNT", 4);
    }

    // ── searchPermOne ──

    @Test
    void searchPermOne_returnsOtherRolesGroupsAndUserCount() {
        fx.group("G1", "Y");
        fx.group("G2", "Y");
        fx.groupRole("G1", "R_A");
        fx.groupRole("G2", "R_A");
        fx.userGroup("u1", "G1");
        fx.userGroup("u2", "G1");
        fx.userGroup("u2", "G2");

        CommPermMngPermOneRequest r = new CommPermMngPermOneRequest();
        r.setRoleId("R_A");
        r.setObjectId(O2);
        Map<String, Object> out = inTx(() -> service.searchPermOne(r));

        assertThat(grid(out, "others")).hasSize(1);
        assertThat(grid(out, "others").get(0)).containsEntry("ROLE_ID", "R_B")
                .containsEntry("ROLE_NM", "역할 R_B")
                .containsEntry("BTN_PERM", "search,save");
        assertThat(grid(out, "groups")).extracting(g -> g.get("ROLE_GROUP_ID") + ":" + g.get("USER_CNT"))
                .containsExactly("G1:2", "G2:1");
        assertThat(grid(out, "groups").get(0)).containsOnlyKeys("ROLE_GROUP_ID", "ROLE_GROUP_NM", "USER_CNT");
        assertThat(out).containsEntry("USER_CNT", 2L);
    }

    // ── save ──

    @Test
    void save_merge_insertsAndUpdates_normalized_andPublishesEvent() {
        Map<String, Object> out = inTx(() -> service.saveCmPerm(List.of(
                row("ROLE_ID", "R_B", "OBJECT_ID", O1, "BTN_PERM", " save , search,save", "POPUP_PERM", "popA",
                        "DATA_PERM", "", "OP_TP", "MERGE"),
                row("ROLE_ID", "R_A", "OBJECT_ID", O1, "BTN_PERM", "search", "POPUP_PERM", "",
                        "DATA_PERM", "d1", "OP_TP", "MERGE"))));

        assertThat(out).containsEntry("cnt_merge", 2).containsEntry("cnt_delete", 0);
        SecRolePerm inserted = secRolePermRepository.findById(new SecRolePermId("R_B", O1)).orElseThrow();
        assertThat(inserted.getBtnPerm()).isEqualTo("save,search");
        assertThat(inserted.getPopupPerm()).isEqualTo("popA");
        SecRolePerm updated = secRolePermRepository.findById(new SecRolePermId("R_A", O1)).orElseThrow();
        assertThat(updated.getBtnPerm()).isEqualTo("search");
        assertThat(updated.getPopupPerm()).isNull();
        assertThat(updated.getDataPerm()).isEqualTo("d1");

        assertThat(events.roleEvents()).hasSize(1);
        assertThat(events.roleEvents().get(0).getRoleIds()).containsExactlyInAnyOrder("R_B", "R_A");
    }

    @Test
    void save_del_removesExistingRow_andCountsOnlyExisting() {
        Map<String, Object> out = inTx(() -> service.saveCmPerm(List.of(
                row("ROLE_ID", "R_A", "OBJECT_ID", O2, "OP_TP", "DEL"),
                row("ROLE_ID", "R_A", "OBJECT_ID", O3, "OP_TP", "DEL"))));

        assertThat(out).containsEntry("cnt_merge", 0).containsEntry("cnt_delete", 1);
        assertThat(secRolePermRepository.existsById(new SecRolePermId("R_A", O2))).isFalse();
        assertThat(events.roleEvents()).extracting(RoleChangedEvent::getRoleIds).containsExactly(Set.of("R_A"));
    }

    // 거절 시험은 inTx 없이 부른다. 저장소 호출마다 바로 커밋되므로, 서비스가 검사 전에 앞 줄을 썼다면 DB 에 남는다
    // (= 「전부 검사 뒤 쓰기」를 실제로 확인한다). 맞는 줄을 앞에, 틀린 줄을 맨 뒤에 둔다.

    @Test
    void save_emptyBtn_rejected_andNothingWritten() {
        assertThatThrownBy(() -> service.saveCmPerm(List.of(
                row("ROLE_ID", "R_B", "OBJECT_ID", O1, "BTN_PERM", "search", "OP_TP", "MERGE"),
                row("ROLE_ID", "R_A", "OBJECT_ID", O2, "BTN_PERM", " , ", "OP_TP", "MERGE"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageStartingWith("PERM_EMPTY_BTN");

        assertThat(secRolePermRepository.existsById(new SecRolePermId("R_B", O1))).isFalse();
        assertThat(secRolePermRepository.findById(new SecRolePermId("R_A", O2)).orElseThrow().getBtnPerm())
                .isEqualTo("search");
        assertThat(events.roleEvents()).isEmpty();
    }

    @Test
    void save_valueNotInObject_rejected_andNothingWritten() {
        assertThatThrownBy(() -> service.saveCmPerm(List.of(
                row("ROLE_ID", "R_B", "OBJECT_ID", O2, "OP_TP", "DEL"),
                row("ROLE_ID", "R_A", "OBJECT_ID", O2, "BTN_PERM", "search,delete", "OP_TP", "MERGE"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageStartingWith("PERM_NOT_IN_OBJ")
                .hasMessageContaining("delete");

        assertThatThrownBy(() -> service.saveCmPerm(List.of(
                row("ROLE_ID", "R_A", "OBJECT_ID", O1, "BTN_PERM", "search", "POPUP_PERM", "popZ",
                        "OP_TP", "MERGE"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageStartingWith("PERM_NOT_IN_OBJ");

        assertThat(secRolePermRepository.existsById(new SecRolePermId("R_B", O2))).isTrue();
        assertThat(secRolePermRepository.findById(new SecRolePermId("R_A", O2)).orElseThrow().getBtnPerm())
                .isEqualTo("search");
        assertThat(events.roleEvents()).isEmpty();
    }

    @Test
    void save_duplicatePk_rejected_andNothingWritten() {
        assertThatThrownBy(() -> service.saveCmPerm(List.of(
                row("ROLE_ID", "R_B", "OBJECT_ID", O1, "BTN_PERM", "search", "OP_TP", "MERGE"),
                row("ROLE_ID", " R_B ", "OBJECT_ID", O1 + " ", "OP_TP", "DEL"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageStartingWith("PERM_BAD_ROW");

        assertThat(secRolePermRepository.existsById(new SecRolePermId("R_B", O1))).isFalse();
        assertThat(events.roleEvents()).isEmpty();
    }

    @Test
    void save_sysadminRow_rejected() {
        assertThatThrownBy(() -> inTx(() -> service.saveCmPerm(List.of(
                row("ROLE_ID", "SYSADMIN", "OBJECT_ID", O2, "BTN_PERM", "search", "OP_TP", "MERGE")))))
                .isInstanceOf(BusinessException.class)
                .hasMessageStartingWith("PERM_SYSADMIN");
        assertThat(secRolePermRepository.existsById(new SecRolePermId("SYSADMIN", O2))).isFalse();
    }

    // ── helpers ──

    private static CommPermMngSearchRequest req(String roleId, String menuId, String objectQ, String codeQ,
                                                String showEmpty) {
        CommPermMngSearchRequest r = new CommPermMngSearchRequest();
        r.setRoleId(roleId);
        r.setMenuId(menuId);
        r.setObjectQ(objectQ);
        r.setCodeQ(codeQ);
        r.setShowEmpty(showEmpty);
        return r;
    }

    private static List<String> keys(Map<String, Object> out) {
        return grid(out, "perms").stream().map(r -> r.get("ROLE_ID") + "/" + r.get("OBJECT_ID")).toList();
    }
}
