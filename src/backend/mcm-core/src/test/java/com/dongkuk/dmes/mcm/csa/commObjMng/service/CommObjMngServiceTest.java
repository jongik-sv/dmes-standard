package com.dongkuk.dmes.mcm.csa.commObjMng.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commObjMng.dto.CommObjMngObjRequest;
import com.dongkuk.dmes.mcm.csa.commObjMng.dto.CommObjMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commObjMng.support.CommSecMngJpaTestBase;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecRolePerm;
import com.dongkuk.dmes.mcm.entity.SecRolePermId;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRolePermRepository;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** {@link CommObjMngService} 시험 — 오브젝트 조회·저장·삭제 검사·이벤트·퍼미션 모델 v2 새 action. */
class CommObjMngServiceTest extends CommSecMngJpaTestBase {

    @Autowired CommObjMngService service;
    @Autowired SecObjRepository secObjRepository;
    @Autowired SecRolePermRepository secRolePermRepository;
    @Autowired SecRoleMappingRepository secRoleMappingRepository;

    @Test
    void searchCmObj_returnsObjectRowWithId() {
        fx.obj("csa::commObjMng", "Y");

        CommObjMngSearchRequest req = new CommObjMngSearchRequest();
        req.setEdtOBJECTID("commObjMng");
        Map<String, Object> out = inTx(() -> service.searchCmObj(req));

        List<Map<String, Object>> rows = grid(out, "ds_main");
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0)).containsEntry("OBJECT_ID", "csa::commObjMng")
                .containsEntry("ID", "commObjMng")
                .containsEntry("USE_TP", "Y");
    }

    @Test
    void searchCmObj_returnsAllowedValuesAndCounts() {
        fx.obj("csa::a", "Y", "search,save", "pop1");
        fx.obj("csa::b", "Y");
        fx.role("R1", "Y");
        fx.role("R2", "Y");
        fx.rolePerm("R1", "csa::a", "search", null);
        fx.rolePerm("R2", "csa::a", "save", null);
        fx.folder("mcm", null, "1");
        fx.folder("F1", "mcm", "1");
        fx.menu("M1", "F1", "csa::a");
        fx.menu("M2", "F1", "csa::a");

        Map<String, Object> out = inTx(() -> service.searchCmObj(new CommObjMngSearchRequest()));

        Map<String, Map<String, Object>> byId = byObjectId(grid(out, "ds_main"));
        assertThat(byId.get("csa::a")).containsEntry("BTN_PERM", "search,save")
                .containsEntry("POPUP_PERM", "pop1")
                .containsEntry("MENU_CNT", 2)
                .containsEntry("PERM_CNT", 2L);
        assertThat(byId.get("csa::b")).containsEntry("MENU_CNT", 0).containsEntry("PERM_CNT", 0L);
    }

    @Test
    void searchCmObj_filtersByMenuFolderSubtree() {
        fx.obj("csa::a", "Y");
        fx.obj("csa::b", "Y");
        fx.obj("csa::c", "Y");
        fx.folder("mcm", null, "1");
        fx.folder("F1", "mcm", "1");
        fx.folder("F2", "mcm", "2");
        fx.menu("M1", "F1", "csa::a");
        fx.menu("M2", "F2", "csa::b");
        fx.menu("M3", "F2", "csa::a"); // a 는 두 폴더에 걸친다 — 하나라도 맞으면 포함

        assertThat(searchIds("")).containsExactlyInAnyOrder("csa::a", "csa::b", "csa::c");
        assertThat(searchIds(null)).containsExactlyInAnyOrder("csa::a", "csa::b", "csa::c");
        assertThat(searchIds("F1")).containsExactly("csa::a");
        assertThat(searchIds("F2")).containsExactlyInAnyOrder("csa::a", "csa::b");
        assertThat(searchIds("mcm")).containsExactlyInAnyOrder("csa::a", "csa::b");
    }

    @Test
    void saveCmObj_insertStoresNormalizedTokens_noSysadminLegacyMapping_publishesSysadminRoleEvent() {
        Map<String, Object> out = inTx(() -> service.saveCmObj(List.of(
                objRow("inserted", "csa::new", "Y", " search , save,search", "pop1", "d1"))));

        assertThat(out).containsEntry("cnt_merge", 1);
        SecObj saved = secObjRepository.findById("csa::new").orElseThrow();
        assertThat(saved.getBtnPerm()).isEqualTo("search,save");
        assertThat(saved.getPopupPerm()).isEqualTo("pop1");
        assertThat(saved.getDataPerm()).isEqualTo("d1");
        assertThat(grid(out, "impacts")).isEmpty();
        assertThat(grid(out, "ds_main")).extracting(r -> r.get("BTN_PERM")).contains("search,save");
        // D13 — SYSADMIN 자동 매핑 없음
        assertThat(secRoleMappingRepository.findByObjectId("csa::new")).isEmpty();
        // D30·D13 — 새 오브젝트는 SYSADMIN 효과 퍼미션을 바꾼다 → 퍼미션 행 없이도 RoleChangedEvent(SYSADMIN)
        assertThat(events.roleEvents()).hasSize(1);
        assertThat(roleIdsOfEvents()).containsExactly("SYSADMIN");
    }

    @Test
    void saveCmObj_tooLongTokensRejected() {
        String longValue = "a".repeat(1001);
        assertThatThrownBy(() -> inTx(() -> service.saveCmObj(List.of(
                objRow("inserted", "csa::long", "Y", longValue, null, null)))))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void saveCmObj_tooLongOnSecondRow_writesNothing() {
        // 트랜잭션 없이 부른다 — 저장소 save 가 저마다 바로 커밋되므로, 첫 행이 남지 않아야 "모두 검증한 뒤 쓴다" 가 증명된다
        String longValue = "a".repeat(1001);
        assertThatThrownBy(() -> service.saveCmObj(List.of(
                objRow("inserted", "csa::first", "Y", "search", null, null),
                objRow("inserted", "csa::long", "Y", longValue, null, null))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("PERM_TOO_LONG");

        assertThat(secObjRepository.existsById("csa::first")).isFalse();
        assertThat(secObjRepository.existsById("csa::long")).isFalse();
        assertThat(events.roleEvents()).isEmpty();
        assertThat(events.menuEvents()).isEmpty();
    }

    @Test
    void saveCmObj_removedBtnAndPopupTokensReportImpacts_permRowsKept() {
        fx.obj("csa::a", "Y", "search,save,delete", "p1,p2");
        fx.role("R1", "Y");
        fx.role("R2", "Y");
        fx.role("R3", "Y");
        fx.rolePerm("R1", "csa::a", "search,save", "p1");
        fx.rolePerm("R2", "csa::a", "save", null);
        fx.rolePerm("R3", "csa::a", "search", null);
        fx.group("G1", "Y");
        fx.groupRole("G1", "R1");
        fx.groupRole("G1", "R2");
        fx.userGroup("u1", "G1");
        fx.userGroup("u2", "G1");

        // save, delete 와 p1 을 뺀다
        Map<String, Object> out = inTx(() -> service.saveCmObj(List.of(
                objRow("updated", "csa::a", "Y", "search", "p2", null))));

        List<Map<String, Object>> impacts = grid(out, "impacts");
        // delete 는 쓰는 직무가 없어 줄이 없다
        assertThat(impacts).hasSize(2);
        Map<String, Object> btn = impactOf(impacts, "BTN", "save");
        assertThat(btn).containsEntry("OBJECT_ID", "csa::a").containsEntry("PERM_CNT", 2L).containsEntry("USER_CNT", 2L);
        Map<String, Object> popup = impactOf(impacts, "POPUP", "p1");
        assertThat(popup).containsEntry("PERM_CNT", 1L).containsEntry("USER_CNT", 2L);
        // D15 — 퍼미션 행은 그대로
        assertThat(secRolePermRepository.findByObjectId("csa::a")).hasSize(3);
        assertThat(secRolePermRepository.findById(new SecRolePermId("R1", "csa::a")).orElseThrow().getBtnPerm())
                .isEqualTo("search,save");
        assertThat(roleIdsOfEvents()).containsExactlyInAnyOrder("SYSADMIN", "R1", "R2", "R3");
        assertThat(secObjRepository.findById("csa::a").orElseThrow().getBtnPerm()).isEqualTo("search");
    }

    @Test
    void saveCmObj_useTpYToNReportsAllPerms() {
        fx.obj("csa::a", "Y", "search", null);
        fx.role("R1", "Y");
        fx.role("R2", "Y");
        fx.rolePerm("R1", "csa::a", "search", null);
        fx.rolePerm("R2", "csa::a", "search", null);
        fx.group("G1", "Y");
        fx.groupRole("G1", "R1");
        fx.userGroup("u1", "G1");

        Map<String, Object> out = inTx(() -> service.saveCmObj(List.of(
                objRow("updated", "csa::a", "N", "search", null, null))));

        List<Map<String, Object>> impacts = grid(out, "impacts");
        assertThat(impacts).hasSize(1);
        assertThat(impacts.get(0)).containsEntry("KIND", "USE_TP").containsEntry("CODE", "N")
                .containsEntry("PERM_CNT", 2L).containsEntry("USER_CNT", 1L);
        assertThat(roleIdsOfEvents()).containsExactlyInAnyOrder("SYSADMIN", "R1", "R2");
    }

    @Test
    void saveCmObj_useTpChangeWithoutPermRows_publishesSysadminRoleEvent() {
        fx.obj("csa::a", "Y", "search", null);

        Map<String, Object> out = inTx(() -> service.saveCmObj(List.of(
                objRow("updated", "csa::a", "N", "search", null, null))));

        // 퍼미션 행이 없어 영향 줄은 없지만 SYSADMIN 효과 퍼미션은 바뀐다(D13)
        assertThat(grid(out, "impacts")).isEmpty();
        assertThat(events.roleEvents()).hasSize(1);
        assertThat(roleIdsOfEvents()).containsExactly("SYSADMIN");
    }

    @Test
    void saveCmObj_systemCodeChange_publishesRoleEventWithoutImpacts() {
        fx.obj("csa::a", "Y", "search", null);
        fx.role("R1", "Y");
        fx.rolePerm("R1", "csa::a", "search", null);

        Map<String, Object> row = new java.util.HashMap<>(objRow("updated", "csa::a", "Y", "search", null, null));
        row.put("SYSTEM_CODE", "mcs");
        Map<String, Object> out = inTx(() -> service.saveCmObj(List.of(row)));

        // SYSTEM_CODE = 실행 키 접두(D26) → 그 오브젝트를 가진 직무와 SYSADMIN 캐시를 비운다. 영향 줄은 없다
        assertThat(grid(out, "impacts")).isEmpty();
        assertThat(roleIdsOfEvents()).containsExactlyInAnyOrder("SYSADMIN", "R1");
        assertThat(secObjRepository.findById("csa::a").orElseThrow().getSystemCode()).isEqualTo("mcs");
    }

    @Test
    void saveCmObj_activeDateChange_publishesRoleEvent() {
        fx.obj("csa::a", "Y", "search", null);

        Map<String, Object> row = new java.util.HashMap<>(objRow("updated", "csa::a", "Y", "search", null, null));
        row.put("END_ACTIVE_DATE", "20301231");
        Map<String, Object> out = inTx(() -> service.saveCmObj(List.of(row)));

        assertThat(grid(out, "impacts")).isEmpty();
        assertThat(roleIdsOfEvents()).containsExactly("SYSADMIN");
    }

    @Test
    void saveCmObj_deleteFreeObject_publishesSysadminRoleEvent() {
        fx.obj("csa::free", "Y");

        Map<String, Object> out = inTx(() -> service.saveCmObj(List.of(
                row("rowStatus", "deleted", "OBJECT_ID", "csa::free"))));

        assertThat(out).containsEntry("cnt_merge", 1);
        assertThat(secObjRepository.existsById("csa::free")).isFalse();
        assertThat(events.roleEvents()).hasSize(1);
        assertThat(roleIdsOfEvents()).containsExactly("SYSADMIN");
    }

    @Test
    void saveCmObj_unchangedValuesPublishNoRoleEvent() {
        fx.obj("csa::a", "Y", "search", null);
        fx.role("R1", "Y");
        fx.rolePerm("R1", "csa::a", "search", null);

        Map<String, Object> out = inTx(() -> service.saveCmObj(List.of(
                objRow("updated", "csa::a", "Y", "search", null, null))));

        assertThat(grid(out, "impacts")).isEmpty();
        assertThat(events.roleEvents()).isEmpty();
    }

    @Test
    void saveCmObj_deleteBlockedByNewPermission() {
        fx.obj("csa::a", "Y", "search", null);
        fx.role("R1", "Y");
        fx.rolePerm("R1", "csa::a", "search", null);

        Map<String, Object> out = inTx(() -> service.saveCmObj(List.of(
                row("rowStatus", "deleted", "OBJECT_ID", "csa::a"))));

        assertThat(out).containsEntry("cnt_merge", 0);
        assertThat(secObjRepository.existsById("csa::a")).isTrue();
        assertThat(events.roleEvents()).isEmpty();
    }

    @Test
    void saveCmObj_deleteBlockedByMenuOrLegacyKept_andDeletesWhenFree() {
        fx.obj("csa::menu", "Y");
        fx.menu("M1", null, "csa::menu");
        fx.obj("csa::legacy", "Y");
        fx.role("R1", "Y");
        fx.legacyMapping("R1", "csa::legacy", "PERM_X");
        fx.obj("csa::free", "Y");
        fx.legacyMapping("SYSADMIN", "csa::free", "PERM_ALL");

        Map<String, Object> out = inTx(() -> service.saveCmObj(List.of(
                row("rowStatus", "deleted", "OBJECT_ID", "csa::menu"),
                row("rowStatus", "deleted", "OBJECT_ID", "csa::legacy"),
                row("rowStatus", "deleted", "OBJECT_ID", "csa::free"))));

        assertThat(out).containsEntry("cnt_merge", 1);
        assertThat(secObjRepository.existsById("csa::menu")).isTrue();
        assertThat(secObjRepository.existsById("csa::legacy")).isTrue();
        assertThat(secObjRepository.existsById("csa::free")).isFalse();
        // 옛 SYSADMIN 매핑 동반 삭제(그대로) + 이벤트
        assertThat(secRoleMappingRepository.findByObjectId("csa::free")).isEmpty();
        assertThat(roleIdsOfEvents()).contains("SYSADMIN");
    }

    @Test
    void searchObjPerm_returnsEffectiveValuesAndUserCounts() {
        fx.obj("csa::a", "Y", "search,save", "p1");
        fx.role("R1", "Y");
        fx.role("R2", "N");
        fx.rolePerm("R1", "csa::a", "save,zzz,search", "p1,p2");
        fx.rolePerm("R2", "csa::a", "search", null);
        fx.group("G1", "Y");
        fx.group("G2", "Y");
        fx.groupRole("G1", "R1");
        fx.groupRole("G2", "R1");
        fx.groupRole("G2", "R2");
        fx.userGroup("u1", "G1");
        fx.userGroup("u1", "G2");
        fx.userGroup("u2", "G2");

        CommObjMngObjRequest req = new CommObjMngObjRequest();
        req.setObjectId("csa::a");
        Map<String, Object> out = inTx(() -> service.searchObjPerm(req));

        List<Map<String, Object>> perms = grid(out, "perms");
        assertThat(perms).extracting(r -> r.get("ROLE_ID")).containsExactly("R1", "R2");
        assertThat(perms.get(0)).containsEntry("ROLE_NM", "역할 R1").containsEntry("ROLE_USE_TP", "Y")
                .containsEntry("BTN_PERM", "save,zzz,search").containsEntry("POPUP_PERM", "p1,p2")
                .containsEntry("EFF_BTN_PERM", "save,search").containsEntry("EFF_POPUP_PERM", "p1")
                .containsEntry("USER_CNT", 2L);
        assertThat(perms.get(1)).containsEntry("ROLE_USE_TP", "N").containsEntry("EFF_BTN_PERM", "search")
                .containsEntry("EFF_POPUP_PERM", "").containsEntry("USER_CNT", 0L); // 사용 안 함 역할 = 주는 권한 없음 → 0명
        assertThat(perms.get(1).get("DATA_PERM")).isNull();
        // 겹침 제외 — u1·u2 두 사람
        assertThat(out).containsEntry("USER_CNT", 2L);
    }

    @Test
    void searchObjPerm_noPermsGivesEmptyGridAndZero() {
        fx.obj("csa::a", "Y", "search", null);

        CommObjMngObjRequest req = new CommObjMngObjRequest();
        req.setObjectId("csa::a");
        Map<String, Object> out = inTx(() -> service.searchObjPerm(req));

        assertThat(grid(out, "perms")).isEmpty();
        assertThat(out).containsEntry("USER_CNT", 0L);
    }

    @Test
    void searchObjMenu_listsMenusWithFolderPath() {
        fx.obj("csa::a", "Y");
        fx.obj("csa::other", "Y");
        fx.folder("mcm", null, "1");
        fx.folder("F1", "mcm", "1");
        fx.menu("M2", "F1", "csa::a");
        fx.menu("M1", "mcm", "csa::a");
        fx.menu("M9", "F1", "csa::other");

        CommObjMngObjRequest req = new CommObjMngObjRequest();
        req.setObjectId("csa::a");
        Map<String, Object> out = inTx(() -> service.searchObjMenu(req));

        List<Map<String, Object>> menus = grid(out, "menus");
        assertThat(menus).extracting(r -> r.get("MENU_ID")).containsExactly("M1", "M2");
        assertThat(menus.get(1)).containsEntry("MENU_NM", "메뉴 M2").containsEntry("PARENT_MENU_ID", "F1")
                .containsEntry("MENU_PATH", "폴더 mcm › 폴더 F1").containsEntry("MENU_TP", "WEB")
                .containsEntry("MENU_VIEW_YN", "Y").containsEntry("USE_TP", "Y");
        assertThat(menus.get(0)).containsEntry("MENU_PATH", "폴더 mcm");
    }

    // ── helpers ──

    private List<String> searchIds(String folderId) {
        CommObjMngSearchRequest req = new CommObjMngSearchRequest();
        req.setMenuFolderId(folderId);
        Map<String, Object> out = inTx(() -> service.searchCmObj(req));
        return grid(out, "ds_main").stream().map(r -> (String) r.get("OBJECT_ID")).toList();
    }

    private static Map<String, Map<String, Object>> byObjectId(List<Map<String, Object>> rows) {
        Map<String, Map<String, Object>> out = new java.util.HashMap<>();
        for (Map<String, Object> r : rows) out.put((String) r.get("OBJECT_ID"), r);
        return out;
    }

    private static Map<String, Object> objRow(String status, String objectId, String useTp,
                                              String btn, String popup, String data) {
        return row("rowStatus", status, "OBJECT_ID", objectId, "OBJECT_NM", "오브젝트 " + objectId,
                "SYSTEM_CODE", "mcm", "USE_TP", useTp, "BTN_PERM", btn, "POPUP_PERM", popup, "DATA_PERM", data);
    }

    private static Map<String, Object> impactOf(List<Map<String, Object>> impacts, String kind, String code) {
        return impacts.stream()
                .filter(m -> kind.equals(m.get("KIND")) && code.equals(m.get("CODE")))
                .findFirst().orElseThrow(() -> new AssertionError("impact not found: " + kind + "/" + code));
    }

    private Set<String> roleIdsOfEvents() {
        Set<String> ids = new HashSet<>();
        for (RoleChangedEvent e : events.roleEvents()) ids.addAll(e.getRoleIds());
        return ids;
    }
}
