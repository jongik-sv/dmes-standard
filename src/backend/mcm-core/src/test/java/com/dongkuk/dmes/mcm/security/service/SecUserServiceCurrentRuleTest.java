package com.dongkuk.dmes.mcm.security.service;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecPerm;
import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import com.dongkuk.dmes.mcm.menu.MenuCatalog;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * perm-bench r0 — 옛 모델(legacy) {@link SecUserService} 의 메뉴·버튼 거르기 규칙을 시험으로 고정한다.
 *
 * <p>고정하는 사실(2026-11-27, 기준 6dfcf8c3c):
 * <ul>
 *   <li>메뉴 = SEC_MENU USE_TP='Y' 이고, 사람 역할 매핑에 그 OBJECT_ID 가 있으면 보인다. 퍼미션 내용(토큰)은 보지 않는다.</li>
 *   <li>숨김 메뉴(MENU_VIEW_YN='N') 는 빼지 않고 {@code hiddenYn='Y'} 로 내려 준다.</li>
 *   <li>오브젝트 USE_TP=N 은 메뉴를 숨기지 않는다. 역할·그룹 USE_TP·유효 기간도 보지 않는다.</li>
 *   <li>폴더 = USE_TP='N' 이면 빼고, 보이는 leaf 의 조상만 남긴다.</li>
 *   <li>버튼 목록 = 매핑 줄마다 퍼미션 네 칸 토큰. 매핑 줄 사이 중복은 지우지 않는다.</li>
 *   <li>SYSADMIN 특례 = freepass=true 이고 권한(ROLE_SYSADMIN·SYSADMIN)이 있을 때만 와일드카드 1줄·메뉴 전체.</li>
 * </ul>
 *
 * <p>결정 D35: v2 는 역할·그룹·오브젝트 USE_TP=N·유효 기간 밖을 뺀다. 이 시험은 legacy 동작 기준이다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SecUserServiceCurrentRuleTest {

    @Mock SecUserMappingRepository userMapping;
    @Mock SecRoleGroupMappingRepository groupMapping;
    @Mock SecRoleMappingRepository roleMapping;
    @Mock SecPermRepository permRepo;
    @Mock MenuCatalog menuCatalog;
    @Mock SecMenuFldLovRepository fldRepo;
    @Mock SecurityIdentity identity;

    private SecUserService service(boolean freepass) {
        return new SecUserService(userMapping, groupMapping, roleMapping, permRepo,
                menuCatalog, fldRepo, identity, freepass);
    }

    private static SecRoleMapping rm(String roleId, String objectId, String permissionId) {
        SecRoleMapping m = new SecRoleMapping();
        m.setRoleId(roleId);
        m.setObjectId(objectId);
        m.setPermissionId(permissionId);
        return m;
    }

    private static SecMenu menu(String menuId, String parent, String objectId, String useTp, String viewYn, String seq) {
        SecMenu m = new SecMenu();
        m.setMenuId(menuId);
        m.setParentMenuId(parent);
        m.setObjectId(objectId);
        m.setUseTp(useTp);
        m.setMenuViewYn(viewYn);
        m.setMenuSeq(seq);
        return m;
    }

    private static SecObj obj(String objectId, String useTp) {
        SecObj o = new SecObj();
        o.setObjectId(objectId);
        o.setSystemCode("mcm");
        o.setUseTp(useTp);
        return o;
    }

    private static Map<String, Object> fld(String menuId, String parent, String useTp) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("MENU_ID", menuId);
        m.put("PARENT_MENU_ID", parent);
        m.put("USE_TP", useTp);
        m.put("MENU_VIEW_YN", "Y");
        return m;
    }

    private static SecPerm perm(String id, String common, String popup, String action) {
        SecPerm p = new SecPerm();
        p.setPermissionId(id);
        p.setPermissionCommon(common);
        p.setPopupBtn(popup);
        p.setPermissionAction(action);
        return p;
    }

    private void login(String userId, String groupId, String... roleIds) {
        when(identity.requireUserId()).thenReturn(userId);
        when(identity.currentUserId()).thenReturn(userId);
        when(userMapping.findRoleGroupIdsByUserId(userId)).thenReturn(List.of(groupId));
        when(groupMapping.findRoleIdsByRoleGroupIdIn(List.of(groupId))).thenReturn(List.of(roleIds));
    }

    private static List<Object> menuIds(List<Map<String, Object>> rows) {
        return rows.stream().map(r -> r.get("menuId")).toList();
    }

    private void catalog(List<SecMenu> menus, List<SecObj> objs) {
        when(menuCatalog.snapshot()).thenReturn(MenuCatalog.Snapshot.of(menus, objs));
    }

    @Test
    @DisplayName("메뉴: 매핑 있는 오브젝트만, 메뉴 USE_TP=N 은 뺀다, 오브젝트 USE_TP=N 은 빼지 않는다")
    void menus_filterByMappingAndMenuUseTp_only() {
        login("u1", "G1", "R1");
        catalog(List.of(
                        menu("m1", "cic", "objA", "Y", "Y", "001"),
                        menu("m2", "cic", "objOff", "Y", "Y", "002"),   // 오브젝트 USE_TP=N
                        menu("m3", "cic", "objMenuOff", "N", "Y", "003"), // 메뉴 USE_TP=N
                        menu("m4", "cic", "objNoPerm", "Y", "Y", "004")), // 매핑 없음
                List.of(obj("objA", "Y"), obj("objOff", "N"), obj("objMenuOff", "Y"), obj("objNoPerm", "Y")));
        when(roleMapping.findByRoleIdIn(any())).thenReturn(List.of(
                rm("R1", "objA", "P1"), rm("R1", "objOff", "P1"), rm("R1", "objMenuOff", "P1")));
        when(fldRepo.findAllForMyMenus()).thenReturn(List.of(fld("cic", null, "Y")));

        List<Map<String, Object>> rows = service(false).getMyMenus(null);

        assertThat(menuIds(rows)).containsExactly("cic", "m1", "m2");
    }

    @Test
    @DisplayName("메뉴: 퍼미션 토큰 내용을 보지 않는다 — 토큰이 빈 퍼미션이어도 매핑만 있으면 보인다")
    void menus_ignorePermContent() {
        login("u1", "G1", "R1");
        catalog(List.of(menu("m1", "cic", "objA", "Y", "Y", "001")), List.of(obj("objA", "Y")));
        when(roleMapping.findByRoleIdIn(any())).thenReturn(List.of(rm("R1", "objA", "P_EMPTY")));
        when(fldRepo.findAllForMyMenus()).thenReturn(List.of(fld("cic", null, "Y")));

        assertThat(menuIds(service(false).getMyMenus(null))).containsExactly("cic", "m1");
        verify(permRepo, never()).findAllById(any());
    }

    @Test
    @DisplayName("메뉴: 숨김(MENU_VIEW_YN=N) 은 빼지 않고 hiddenYn=Y 로 내린다")
    void menus_hiddenKeptWithFlag() {
        login("u1", "G1", "R1");
        catalog(List.of(menu("m1", "cic", "objA", "Y", "N", "001")), List.of(obj("objA", "Y")));
        when(roleMapping.findByRoleIdIn(any())).thenReturn(List.of(rm("R1", "objA", "P1")));
        when(fldRepo.findAllForMyMenus()).thenReturn(List.of(fld("cic", null, "Y")));

        List<Map<String, Object>> rows = service(false).getMyMenus(null);

        Map<String, Object> leaf = rows.stream().filter(r -> "m1".equals(r.get("menuId"))).findFirst().orElseThrow();
        assertThat(leaf.get("hiddenYn")).isEqualTo("Y");
    }

    @Test
    @DisplayName("폴더: USE_TP=N 은 빼고, 보이는 leaf 가 없는 폴더도 뺀다")
    void folders_useTpAndAncestorOnly() {
        login("u1", "G1", "R1");
        catalog(List.of(menu("m1", "cic", "objA", "Y", "Y", "001"),
                        menu("m2", "cma", "objB", "Y", "Y", "002")),
                List.of(obj("objA", "Y"), obj("objB", "Y")));
        when(roleMapping.findByRoleIdIn(any())).thenReturn(List.of(rm("R1", "objA", "P1"), rm("R1", "objB", "P1")));
        when(fldRepo.findAllForMyMenus()).thenReturn(List.of(
                fld("MOD", null, "Y"), fld("cic", "MOD", "Y"), fld("cma", "MOD", "N"), fld("cia", "MOD", "Y")));

        List<Object> ids = menuIds(service(false).getMyMenus(null));

        assertThat(ids).contains("MOD", "cic", "m1", "m2");
        assertThat(ids).doesNotContain("cma", "cia");
    }

    @Test
    @DisplayName("메뉴: 역할 없음 → leaf 없음, 폴더도 없음")
    void menus_noRole_empty() {
        login("u1", "G1");
        catalog(List.of(menu("m1", "cic", "objA", "Y", "Y", "001")), List.of(obj("objA", "Y")));
        when(fldRepo.findAllForMyMenus()).thenReturn(List.of(fld("cic", null, "Y")));

        assertThat(service(false).getMyMenus(null)).isEmpty();
    }

    @Test
    @DisplayName("메뉴: SYSADMIN 기본(freepass=false) 은 매핑 그대로 — 매핑 없는 메뉴는 안 보인다")
    void menus_sysadminDefault_mappingOnly() {
        login("admin", "ROLE_GROUP_SYSADMIN", "SYSADMIN");
        when(identity.hasAuthority(anyString())).thenReturn(true);
        catalog(List.of(menu("m1", "cic", "objA", "Y", "Y", "001"), menu("m2", "cic", "objB", "Y", "Y", "002")),
                List.of(obj("objA", "Y"), obj("objB", "Y")));
        when(roleMapping.findByRoleIdIn(any())).thenReturn(List.of(rm("SYSADMIN", "objA", "PERM_ALL")));
        when(fldRepo.findAllForMyMenus()).thenReturn(List.of(fld("cic", null, "Y")));

        assertThat(menuIds(service(false).getMyMenus(null))).containsExactly("cic", "m1");
    }

    @Test
    @DisplayName("메뉴: freepass=true + SYSADMIN 역할 → USE_TP=Y 메뉴 전체(권한 문자열 없어도 역할 ID 로)")
    void menus_freepassSysadmin_all() {
        login("admin", "ROLE_GROUP_SYSADMIN", "SYSADMIN");
        when(identity.hasAuthority(anyString())).thenReturn(false);
        catalog(List.of(menu("m1", "cic", "objA", "Y", "Y", "001"), menu("m2", "cic", "objB", "Y", "Y", "002"),
                        menu("m3", "cic", "objC", "N", "Y", "003")),
                List.of(obj("objA", "Y"), obj("objB", "Y"), obj("objC", "Y")));
        when(fldRepo.findAllForMyMenus()).thenReturn(List.of(fld("cic", null, "Y")));

        assertThat(menuIds(service(true).getMyMenus(null))).containsExactly("cic", "m1", "m2");
        verify(roleMapping, never()).findByRoleIdIn(any());
    }

    @Test
    @DisplayName("버튼: 매핑 줄마다 네 칸 토큰, 줄 사이 중복은 그대로, endpoint·httpMethod = *")
    void buttons_perMappingRow_noCrossDedup() {
        login("u1", "G1", "R1", "R2");
        when(roleMapping.findByRoleIdIn(any())).thenReturn(List.of(
                rm("R1", "objA", "P1"), rm("R2", "objA", "P2"), rm("R1", "objA", "GHOST")));
        when(permRepo.findAllById(any())).thenReturn(List.of(
                perm("P1", "search, save", "openPop", null),
                perm("P2", "search", null, "")));

        List<Map<String, Object>> rows = service(false).getMyButtonEndpoints(null);

        assertThat(rows).extracting(r -> r.get("objId") + "/" + r.get("action"))
                .containsExactly("objA/search", "objA/save", "objA/openPop", "objA/search");
        assertThat(rows).allSatisfy(r -> {
            assertThat(r.get("endpoint")).isEqualTo("*");
            assertThat(r.get("httpMethod")).isEqualTo("*");
        });
    }

    @Test
    @DisplayName("버튼: objId 는 대소문자를 그대로 둔다(키와 다름)")
    void buttons_objIdCaseKept() {
        login("u1", "G1", "R1");
        when(roleMapping.findByRoleIdIn(any())).thenReturn(List.of(rm("R1", "commObjMng", "P1")));
        when(permRepo.findAllById(any())).thenReturn(List.of(perm("P1", "searchCmObj", null, null)));

        assertThat(service(false).getMyButtonEndpoints(null))
                .extracting(r -> r.get("objId") + "/" + r.get("action"))
                .containsExactly("commObjMng/searchCmObj");
    }

    @Test
    @DisplayName("버튼: freepass=true 는 권한(ROLE_SYSADMIN·SYSADMIN) 이 있을 때만 와일드카드 1줄")
    void buttons_freepass_byAuthority() {
        login("admin", "G_ADM", "SYSADMIN");
        when(identity.hasAuthority("ROLE_SYSADMIN")).thenReturn(false);
        when(identity.hasAuthority("SYSADMIN")).thenReturn(true);

        List<Map<String, Object>> rows = service(true).getMyButtonEndpoints(null);

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0)).containsEntry("objId", "*").containsEntry("action", "*");
    }

    @Test
    @DisplayName("버튼: freepass=true 라도 권한 문자열이 없으면 역할 ID 가 SYSADMIN 이어도 매핑 그대로(메뉴와 다름)")
    void buttons_freepass_roleIdNotEnough() {
        login("admin", "G_ADM", "SYSADMIN");
        when(identity.hasAuthority(anyString())).thenReturn(false);
        when(roleMapping.findByRoleIdIn(any())).thenReturn(List.of(rm("SYSADMIN", "objA", "P1")));
        when(permRepo.findAllById(any())).thenReturn(List.of(perm("P1", "search", null, null)));

        assertThat(service(true).getMyButtonEndpoints(null))
                .extracting(r -> r.get("objId") + "/" + r.get("action"))
                .containsExactly("objA/search");
    }

    @Test
    @DisplayName("버튼: SYSADMIN 기본(freepass=false) 은 권한이 있어도 매핑 그대로")
    void buttons_sysadminDefault_mappingOnly() {
        login("admin", "G_ADM", "SYSADMIN");
        when(identity.hasAuthority(anyString())).thenReturn(true);
        when(roleMapping.findByRoleIdIn(any())).thenReturn(List.of());

        assertThat(service(false).getMyButtonEndpoints(null)).isEmpty();
    }
}
