package com.dongkuk.dmes.mcm.security.perm.impl;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.menu.MenuCatalog;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.security.endpoint.UserPermCache;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermGraphLoader;
import com.dongkuk.dmes.mcm.security.service.SecUserService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.dongkuk.dmes.mcm.security.perm.impl.GraphFixture.NOW;
import static com.dongkuk.dmes.mcm.security.perm.impl.GraphFixture.graph;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * perm-bench r3 — 런타임 전환(perm-model=v2): UserPermCache 키·SecUserService 버튼·메뉴가 PermGraphLoader + PermResolver 로 나온다.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 옛 표 저장소는 부르지 않는다(v2). legacy 경로는 r0 특성 시험(UserPermCacheCurrentRuleTest·SecUserServiceCurrentRuleTest)이 지킨다.
 */
class RuntimeV2SwitchTest {

    private final DefaultPermResolver resolver = new DefaultPermResolver(
            Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault()));

    private final SecUserMappingRepository userMapping = mock(SecUserMappingRepository.class);
    private final SecRoleGroupMappingRepository groupMapping = mock(SecRoleGroupMappingRepository.class);
    private final SecRoleMappingRepository roleMapping = mock(SecRoleMappingRepository.class);
    private final SecObjRepository objRepo = mock(SecObjRepository.class);
    private final SecPermRepository permRepo = mock(SecPermRepository.class);
    private final MenuCatalog menuCatalog = mock(MenuCatalog.class);
    private final SecMenuFldLovRepository fldRepo = mock(SecMenuFldLovRepository.class);
    private final SecurityIdentity identity = mock(SecurityIdentity.class);

    static final class Loader implements PermGraphLoader {
        final PermGraph g;
        final List<Set<String>> calls = new ArrayList<>();
        Loader(PermGraph g) { this.g = g; }
        @Override public PermGraph loadForUsers(Set<String> userIds) { calls.add(userIds); return g; }
        @Override public PermGraph loadAll() { return g; }
    }

    /** u1 → G1(R1) · objA(SYSTEM_CODE " MDM ") · objB(mcm) · objOff(N) · objEmpty(빈 효과 행) · 퍼미션에서 빠진 값 gone. */
    private static PermGraph g() {
        return graph().user("u1", "G1").user("adm", "GA").group("G1", "R1").group("GA", "SYSADMIN")
                .obj("ObjA", " MDM ", "Y", null, null, "search,save", "openPop")
                .obj("objB", "search", "")
                .obj("objOff", "mcm", "N", null, null, "search", "")
                .obj("objEmpty", "search", "")
                .perm("R1", "ObjA", "search,gone", "openPop")
                .perm("R1", "objB", "search", "")
                .perm("R1", "objOff", "search", "")
                .perm("R1", "objEmpty", "", "")
                .build();
    }

    private UserPermCache cache(PermGraphLoader loader, String model) {
        return new UserPermCache(userMapping, groupMapping, roleMapping, objRepo, permRepo, false, model, loader, resolver);
    }

    private SecUserService svc(PermGraphLoader loader, String model) {
        return new SecUserService(userMapping, groupMapping, roleMapping, permRepo, menuCatalog, fldRepo, identity,
                false, model, loader, resolver);
    }

    @Test
    @DisplayName("키: lower(trim(SYSTEM_CODE) ?: mcm)/lower(OBJECT_ID)/action(PermKey 가 소문자로), 효과 = 교집합, 사용 안 함·빈 효과 = 키 없음")
    void keys() {
        Loader loader = new Loader(g());
        List<String> keys = cache(loader, "v2").toKeyStrings("u1");

        assertThat(keys).containsExactly("mcm/objb/search", "mdm/obja/openpop", "mdm/obja/search");
        assertThat(loader.calls).containsExactly(Set.of("u1"));
        verifyNoInteractions(roleMapping, permRepo, objRepo);
    }

    @Test
    @DisplayName("SYSADMIN = 쓰는 오브젝트 전부 × 허용 값(퍼미션 행 없이)")
    void sysadminKeys() {
        List<String> keys = cache(new Loader(g()), "v2").toKeyStrings("adm");
        assertThat(keys).contains("mdm/obja/save", "mcm/objb/search", "mcm/objempty/search").doesNotContain("mcm/objoff/search");
    }

    @Test
    @DisplayName("perm-model=legacy 면 로더를 부르지 않고 옛 계산(옛 저장소)")
    void legacyIgnoresLoader() {
        Loader loader = new Loader(g());
        when(userMapping.findRoleGroupIdsByUserId("u1")).thenReturn(List.of());
        assertThat(cache(loader, "legacy").toKeyStrings("u1")).isEmpty();
        assertThat(loader.calls).isEmpty();
    }

    @Test
    @DisplayName("버튼 목록: 오브젝트마다 효과 action 한 줄씩, 빈 효과·사용 안 함 오브젝트 없음")
    void buttons() {
        when(identity.requireUserId()).thenReturn("u1");
        List<Map<String, Object>> rows = svc(new Loader(g()), "v2").getMyButtonEndpoints(null);

        assertThat(rows).extracting(r -> r.get("objId") + "/" + r.get("action"))
                .containsExactlyInAnyOrder("ObjA/search", "ObjA/openPop", "objB/search");
        assertThat(rows).allSatisfy(r -> assertThat(r.get("endpoint")).isEqualTo("*"));
        verifyNoInteractions(roleMapping, permRepo);
    }

    @Test
    @DisplayName("메뉴: 퍼미션 행이 있는 쓰는 오브젝트(빈 효과 포함) — 사용 안 함 오브젝트는 이제 빠진다(D35), 조상 폴더 규칙은 그대로")
    void menus() {
        when(identity.requireUserId()).thenReturn("u1");
        when(menuCatalog.snapshot()).thenReturn(MenuCatalog.Snapshot.of(List.of(
                menu("m1", "cic", "ObjA"), menu("m2", "cic", "objOff"), menu("m3", "cic2", "objEmpty"),
                menu("m4", "cic3", "objNoPerm")), List.<SecObj>of()));
        when(fldRepo.findAllForMyMenus()).thenReturn(List.of(fld("cic"), fld("cic2"), fld("cic3")));

        List<Map<String, Object>> rows = svc(new Loader(g()), "v2").getMyMenus(null);

        assertThat(rows).extracting(r -> r.get("menuId")).containsExactlyInAnyOrder("cic", "cic2", "m1", "m3");
        verifyNoInteractions(roleMapping);
    }

    @Test
    @DisplayName("메뉴: freepass 켜짐 + DB 역할 SYSADMIN(권한 문자열 없음) = legacy 와 같게 전체 메뉴, 로더 안 부름")
    void menusFreepassByDbRole() {
        when(identity.requireUserId()).thenReturn("adm");
        when(userMapping.findRoleGroupIdsByUserId("adm")).thenReturn(List.of("GA"));
        when(groupMapping.findRoleIdsByRoleGroupIdIn(List.of("GA"))).thenReturn(List.of("SYSADMIN"));
        when(menuCatalog.snapshot()).thenReturn(MenuCatalog.Snapshot.of(List.of(
                menu("m1", "cic", "ObjA"), menu("m2", "cic", "objOff"), menu("m4", "cic", null)), List.<SecObj>of()));
        when(fldRepo.findAllForMyMenus()).thenReturn(List.of(fld("cic")));
        Loader loader = new Loader(g());

        List<Map<String, Object>> rows = new SecUserService(userMapping, groupMapping, roleMapping, permRepo, menuCatalog,
                fldRepo, identity, true, "v2", loader, resolver).getMyMenus(null);

        assertThat(rows).extracting(r -> r.get("menuId")).containsExactlyInAnyOrder("cic", "m1", "m2", "m4");
        assertThat(loader.calls).isEmpty();
    }

    @Test
    @DisplayName("캐시: 빌드 뒤 무효화하면 다음 조회가 다시 빌드한다")
    void invalidateRebuilds() {
        Loader loader = new Loader(g());
        UserPermCache c = cache(loader, "v2");
        c.getPermissions("u1");
        c.getPermissions("u1");
        c.invalidateAll();
        c.getPermissions("u1");
        assertThat(loader.calls).hasSize(2);
    }

    private static SecMenu menu(String id, String parent, String objectId) {
        SecMenu m = new SecMenu();
        m.setMenuId(id);
        m.setParentMenuId(parent);
        m.setObjectId(objectId);
        m.setUseTp("Y");
        m.setMenuViewYn("Y");
        m.setMenuSeq(id);
        return m;
    }

    private static Map<String, Object> fld(String id) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("MENU_ID", id);
        m.put("PARENT_MENU_ID", null);
        m.put("USE_TP", "Y");
        m.put("MENU_VIEW_YN", "Y");
        return m;
    }
}
