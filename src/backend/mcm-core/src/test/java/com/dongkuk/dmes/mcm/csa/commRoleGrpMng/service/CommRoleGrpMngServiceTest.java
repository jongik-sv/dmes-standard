package com.dongkuk.dmes.mcm.csa.commRoleGrpMng.service;

import com.dongkuk.dmes.mcm.csa.commObjMng.support.CommSecMngJpaTestBase;
import com.dongkuk.dmes.mcm.csa.commRoleGrpMng.dto.CommRoleGrpMngSearchMapRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** {@link CommRoleGrpMngService#searchCmRoleGrpMenu} 시험 — 메뉴 미리보기가 새 퍼미션 표(TB_MCM_SEC_ROLE_PERM)를 읽는다. */
class CommRoleGrpMngServiceTest extends CommSecMngJpaTestBase {

    @Autowired CommRoleGrpMngService service;

    @BeforeEach
    void setUpMenus() {
        // 모듈 MOD > 폴더 FLD > 화면 메뉴 M_A(O_A)·M_B(O_B)
        fx.folder("MOD", null, "1");
        fx.folder("FLD", "MOD", "1");
        fx.obj("O_A", "Y");
        fx.obj("O_B", "Y");
        fx.menu("M_A", "FLD", "O_A");
        fx.menu("M_B", "FLD", "O_B");
        fx.group("G1", "Y");
    }

    @Test
    void searchCmRoleGrpMenu_readsNewPermAndClimbsFolders() {
        fx.role("R1", "Y");
        fx.groupRole("G1", "R1");
        fx.rolePerm("R1", "O_A", "search", null);
        fx.legacyMapping("R1", "O_B", "PERM_X"); // 옛 매핑만 있는 화면은 안 보인다

        List<Map<String, Object>> rows = search("G1");

        assertThat(rows).extracting(r -> r.get("MENU_ID")).containsExactlyInAnyOrder("M_A", "FLD", "MOD");
        Map<String, Object> leaf = byId(rows, "M_A");
        assertThat(leaf.get("OBJECT_ID")).isEqualTo("O_A");
        // LEV = treelevel: 뿌리 0, 깊을수록 크다
        assertThat(((Number) byId(rows, "MOD").get("LEV")).intValue()).isZero();
        assertThat(((Number) byId(rows, "FLD").get("LEV")).intValue()).isEqualTo(1);
        assertThat(((Number) leaf.get("LEV")).intValue()).isEqualTo(2);
        assertThat(byId(rows, "FLD").get("OBJECT_ID")).isNull();
    }

    @Test
    void searchCmRoleGrpMenu_sysadminSeesAllUsedObjectsWithoutPermRows() {
        fx.role("SYSADMIN", "Y");
        fx.groupRole("G1", "SYSADMIN");
        fx.obj("O_OFF", "N");
        fx.menu("M_OFF", "FLD", "O_OFF");

        List<Map<String, Object>> rows = search("G1");

        assertThat(rows).extracting(r -> r.get("MENU_ID")).containsExactlyInAnyOrder("M_A", "M_B", "FLD", "MOD");
    }

    @Test
    void searchCmRoleGrpMenu_unusedRoleOrGroupGivesNothing() {
        fx.role("R_OFF", "N");
        fx.groupRole("G1", "R_OFF");
        fx.rolePerm("R_OFF", "O_A", "search", null);

        assertThat(search("G1")).isEmpty();
    }

    @Test
    void searchCmRoleGrpMenu_normalRoleWithPermOnUnusedObjectShowsNothing() {
        fx.role("R1", "Y");
        fx.groupRole("G1", "R1");
        fx.obj("O_OFF", "N");
        fx.menu("M_OFF", "FLD", "O_OFF");
        fx.rolePerm("R1", "O_OFF", "search", null); // 퍼미션은 있어도 사용 안 함 오브젝트 — 런타임이 버린다

        assertThat(search("G1")).isEmpty();
    }

    private List<Map<String, Object>> search(String roleGroupId) {
        CommRoleGrpMngSearchMapRequest req = new CommRoleGrpMngSearchMapRequest();
        req.setROLE_GROUP_ID(roleGroupId);
        return grid(inTx(() -> service.searchCmRoleGrpMenu(req)), "ds_menuTreeList");
    }

    private static Map<String, Object> byId(List<Map<String, Object>> rows, String menuId) {
        return rows.stream().filter(r -> menuId.equals(r.get("MENU_ID"))).findFirst().orElseThrow();
    }
}
