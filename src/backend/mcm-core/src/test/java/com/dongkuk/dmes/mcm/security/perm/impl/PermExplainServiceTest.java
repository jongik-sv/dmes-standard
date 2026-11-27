package com.dongkuk.dmes.mcm.security.perm.impl;

import com.dongkuk.dmes.mcm.security.perm.DenyReason;
import com.dongkuk.dmes.mcm.security.perm.Explain;
import com.dongkuk.dmes.mcm.security.perm.MenuNode;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.dongkuk.dmes.mcm.security.perm.PermExplainService;
import com.dongkuk.dmes.mcm.security.perm.PermExplainService.MenuTreeRow;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermGraphLoader;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static com.dongkuk.dmes.mcm.security.perm.impl.GraphFixture.NOW;
import static com.dongkuk.dmes.mcm.security.perm.impl.GraphFixture.graph;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * perm-bench r4 — {@link PermExplainService} 시험(가짜 로더, DB 없음).
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 */
class PermExplainServiceTest {

    /** 어떤 읽기를 불렀는지 남기는 가짜 로더. 범위와 무관하게 같은 그래프를 준다. */
    static final class FakeLoader implements PermGraphLoader {
        final PermGraph graph;
        final List<String> calls = new ArrayList<>();
        FakeLoader(PermGraph graph) { this.graph = graph; }
        @Override public PermGraph loadForUsers(Set<String> userIds) { calls.add("users" + userIds); return graph; }
        @Override public PermGraph loadAll() { calls.add("all"); return graph; }
        @Override public PermGraph loadForRoles(Set<String> roleIds) { calls.add("roles" + roleIds); return graph; }
    }

    private static final DefaultPermResolver RESOLVER = new DefaultPermResolver(
            Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault()));

    private static PermExplainService service(PermGraphLoader loader) {
        return service(loader, Map.of("F_ROOT", new PermExplainService.MenuLabel("루트", "1", true),
                "M_A", new PermExplainService.MenuLabel("화면A", "2", false)));
    }

    private static PermExplainService service(PermGraphLoader loader, Map<String, PermExplainService.MenuLabel> labels) {
        return new PermExplainService(loader, RESOLVER) {
            @Override
            protected Map<String, MenuLabel> menuLabels() {
                return labels;
            }
        };
    }

    /**
     * F_ROOT ─ F_SUB ─ M_A(objA) · M_B(objB, 퍼미션 없음) · M_HID(objH, 숨김)
     * F_ROOT ─ F_EMPTY ─ M_C(objC, 퍼미션 없음) · F_OFF(USE_TP=N) ─ M_D(objA) · M_OFF(objA, USE_TP=N)
     */
    private static List<MenuNode> menus() {
        return List.of(
                new MenuNode("F_ROOT", null, null, true, "Y"),
                new MenuNode("F_SUB", "F_ROOT", null, false, "Y"),
                new MenuNode("F_EMPTY", "F_ROOT", null, true, "Y"),
                new MenuNode("F_OFF", "F_ROOT", null, true, "N"),
                new MenuNode("M_A", "F_SUB", "objA", true, "Y"),
                new MenuNode("M_B", "F_SUB", "objB", true, "Y"),
                new MenuNode("M_HID", "F_SUB", "objH", false, "Y"),
                new MenuNode("M_C", "F_EMPTY", "objC", true, "Y"),
                new MenuNode("M_D", "F_OFF", "objA", true, "Y"),
                new MenuNode("M_OFF", "F_SUB", "objA", true, "N"));
    }

    private static PermGraph withMenus(PermGraph g) {
        return new PermGraph(g.userGroups(), g.groupRoles(), g.roles(), g.groups(), g.objects(), g.rolePerms(), menus());
    }

    private static PermGraph base() {
        return withMenus(graph().user("u1", "G1").group("G1", "R1").group("G_OFF", "R_OFF")
                .roleMeta("R_OFF", "N", null, null)
                .obj("objA", "search", "").obj("objB", "search", "").obj("objH", "search", "").obj("objC", "search", "")
                .perm("R1", "objA", "search", "").perm("R1", "objH", "search", "")
                .perm("R_OFF", "objB", "search", "").build());
    }

    private static Map<String, MenuTreeRow> byId(List<MenuTreeRow> rows) {
        return rows.stream().collect(Collectors.toMap(MenuTreeRow::menuId, r -> r));
    }

    @Test
    @DisplayName("사람 트리 = 런타임 getMyMenus 규칙: 화면 USE_TP=Y·오브젝트 보임, 폴더 USE_TP≠N·보이는 화면의 조상")
    void userTree() {
        FakeLoader loader = new FakeLoader(base());
        List<MenuTreeRow> rows = service(loader).userMenuTree("u1", null);
        Map<String, MenuTreeRow> m = byId(rows);

        assertThat(loader.calls).containsExactly("users[u1]");
        assertThat(rows).extracting(MenuTreeRow::menuId).containsExactly(
                "F_ROOT", "F_SUB", "F_EMPTY", "F_OFF", "M_A", "M_B", "M_HID", "M_C", "M_D", "M_OFF");
        assertThat(rows.stream().filter(MenuTreeRow::visible).map(MenuTreeRow::menuId))
                .containsExactly("F_ROOT", "F_SUB", "M_A", "M_HID", "M_D");

        assertThat(m.get("F_ROOT").menuNm()).isEqualTo("루트");
        assertThat(m.get("F_ROOT").folder()).isTrue();
        assertThat(m.get("F_ROOT").reason()).isNull();
        assertThat(m.get("F_SUB").hidden()).isTrue();
        assertThat(m.get("F_SUB").reason()).isEqualTo(DenyReason.MENU_HIDDEN);
        assertThat(m.get("F_EMPTY").reason()).isEqualTo(DenyReason.NO_PERM);
        assertThat(m.get("F_OFF").visible()).isFalse();
        assertThat(m.get("F_OFF").reason()).isEqualTo(DenyReason.MENU_HIDDEN);
        assertThat(m.get("M_A").sortSeq()).isEqualTo("2");
        assertThat(m.get("M_A").reason()).isNull();
        assertThat(m.get("M_HID").reason()).isEqualTo(DenyReason.MENU_HIDDEN);
        assertThat(m.get("M_B").reason()).isEqualTo(DenyReason.NO_PERM);
        assertThat(m.get("M_OFF").reason()).isEqualTo(DenyReason.MENU_HIDDEN);
        // 폴더가 USE_TP=N 이어도 그 아래 화면 줄 자체는 보인다(런타임과 같다 — 폴더 줄만 빠진다)
        assertThat(m.get("M_D").visible()).isTrue();
    }

    @Test
    @DisplayName("사람 트리: 역할 사용 안 함 경로만 있는 화면 = ROLE_UNUSED")
    void userTreeRoleUnused() {
        PermGraph g = withMenus(graph().user("u2", "G_OFF").group("G_OFF", "R_OFF").roleMeta("R_OFF", "N", null, null)
                .obj("objA", "search", "").obj("objB", "search", "").obj("objH", "search", "").obj("objC", "search", "")
                .perm("R_OFF", "objB", "search", "").build());
        Map<String, MenuTreeRow> m = byId(service(new FakeLoader(g)).userMenuTree("u2", null));
        assertThat(m.get("M_B").reason()).isEqualTo(DenyReason.ROLE_UNUSED);
        assertThat(m.get("M_A").reason()).isEqualTo(DenyReason.NO_PERM);
    }

    @Test
    @DisplayName("역할 트리: 보이는 화면 = objectsOfRole, 사용 안 함 역할 = ROLE_UNUSED, loadForRoles 로 읽는다")
    void roleTree() {
        FakeLoader loader = new FakeLoader(base());
        PermExplainService svc = service(loader);

        Map<String, MenuTreeRow> r1 = byId(svc.roleMenuTree("R1", null));
        assertThat(loader.calls).containsExactly("roles[R1]");
        assertThat(r1.get("M_A").visible()).isTrue();
        assertThat(r1.get("M_HID").visible()).isTrue();
        assertThat(r1.get("M_B").reason()).isEqualTo(DenyReason.NO_PERM);
        assertThat(r1.get("F_SUB").visible()).isTrue();

        Map<String, MenuTreeRow> off = byId(svc.roleMenuTree("R_OFF", null));
        assertThat(off.get("M_B").visible()).isFalse();
        assertThat(off.get("M_B").reason()).isEqualTo(DenyReason.ROLE_UNUSED);
    }

    @Test
    @DisplayName("역할 트리: SYSADMIN = 사용 중인 오브젝트 전부, 사용 안 함 오브젝트 = OBJ_UNUSED")
    void sysadminTree() {
        PermGraph g = withMenus(graph().group("GA", "SYSADMIN")
                .obj("objA", "search", "").obj("objB", "mcm", "N", null, null, "search", "")
                .obj("objH", "search", "").obj("objC", "search", "").build());
        Map<String, MenuTreeRow> m = byId(service(new FakeLoader(g)).roleMenuTree("SYSADMIN", null));
        assertThat(m.get("M_A").visible()).isTrue();
        assertThat(m.get("M_C").visible()).isTrue();
        assertThat(m.get("M_B").reason()).isEqualTo(DenyReason.OBJ_UNUSED);
    }

    @Test
    @DisplayName("로더가 loadForRoles 를 덮어쓰지 않으면 계약 기본(loadAll)으로 읽는다")
    void roleTreeFallback() {
        PermGraph g = base();
        List<String> calls = new ArrayList<>();
        PermGraphLoader plain = new PermGraphLoader() {
            @Override public PermGraph loadForUsers(Set<String> userIds) { calls.add("users"); return g; }
            @Override public PermGraph loadAll() { calls.add("all"); return g; }
        };
        assertThat(byId(service(plain).roleMenuTree("R1", null)).get("M_A").visible()).isTrue();
        assertThat(calls).containsExactly("all");
    }

    @Test
    @DisplayName("DRAFT = loadAll 에 초안 변경을 얹는다(원본 불변). 빈 초안 = CUR")
    void draft() {
        FakeLoader loader = new FakeLoader(base());
        PermExplainService svc = service(loader);
        List<PermChange> draft = List.of(PermChange.roleObj("R1", "objB", PermChange.ADD, "search", null));

        Explain cur = svc.explain("u1", "objB", List.of());
        Explain drf = svc.explain("u1", "objB", draft);
        assertThat(cur.objectReason()).isEqualTo(DenyReason.NO_PERM);
        assertThat(cur.paths()).isEmpty();
        // 초안에서 권한 경로가 생긴다. objB 메뉴는 숨김 폴더(F_SUB) 아래지만 explain 은 줄 자신만 본다 → 트리와 같은 답
        assertThat(drf.paths()).extracting(p -> p.roleId()).containsExactly("R1");
        assertThat(drf.visible()).isTrue();
        assertThat(byId(svc.userMenuTree("u1", draft)).get("M_B").visible()).isTrue();
        assertThat(byId(svc.roleMenuTree("R1", draft)).get("M_B").visible()).isTrue();
        assertThat(loader.calls).containsExactly("users[u1]", "all", "all", "all");
        assertThat(loader.graph.rolePerms().get("R1")).doesNotContainKey("objB");
    }

    @Test
    @DisplayName("DRAFT: 초안이 새 그룹을 사람에게 붙이면 그 그룹의 역할까지 계산된다")
    void draftNewGroup() {
        PermGraph g = withMenus(graph().user("u1").group("G9", "R9")
                .obj("objA", "search", "").obj("objB", "search", "").obj("objH", "search", "").obj("objC", "search", "")
                .perm("R9", "objC", "search", "").build());
        PermExplainService svc = service(new FakeLoader(g));
        List<PermChange> draft = List.of(PermChange.link(PermChange.USER_GRP, "u1", "G9", PermChange.ADD));
        assertThat(byId(svc.userMenuTree("u1", draft)).get("M_C").visible()).isTrue();
        assertThat(byId(svc.userMenuTree("u1", draft)).get("F_EMPTY").visible()).isTrue();
    }

    @Test
    @DisplayName("메뉴 모양(getMyMenus 와 같게): 화면 아래 화면 = 부모 화면도 보임, 화면 아래 폴더 = 거기서 멈춤, 없는 부모 = 끝")
    void menuShapes() {
        PermGraph base = graph().user("u1", "G1").group("G1", "R1")
                .obj("objP", "search", "").obj("objK", "search", "").obj("objX", "search", "")
                .perm("R1", "objK", "search", "").perm("R1", "objX", "search", "").build();
        List<MenuNode> menus = List.of(
                new MenuNode("F_TOP", null, null, true, null),        // 폴더 USE_TP 비어도 보임
                new MenuNode("F_MID", "M_P", null, true, "Y"),        // 화면 아래 폴더
                new MenuNode("M_P", "F_TOP", "objP", true, "Y"),      // 퍼미션 없는 부모 화면
                new MenuNode("M_K", "M_P", "objK", true, "Y"),        // 화면 아래 화면
                new MenuNode("M_X", "F_GONE", "objX", true, "Y"),     // 없는 부모
                new MenuNode("M_NOOBJ", "F_TOP", null, true, "Y"));   // SEC_MENU 줄인데 OBJECT_ID 없음
        PermGraph g = new PermGraph(base.userGroups(), base.groupRoles(), base.roles(), base.groups(),
                base.objects(), base.rolePerms(), menus);
        Map<String, PermExplainService.MenuLabel> labels = Map.of(
                "F_TOP", new PermExplainService.MenuLabel("top", "1", true),
                "F_MID", new PermExplainService.MenuLabel("mid", "2", true),
                "M_P", new PermExplainService.MenuLabel("p", "3", false),
                "M_K", new PermExplainService.MenuLabel("k", "4", false),
                "M_X", new PermExplainService.MenuLabel("x", "5", false),
                "M_NOOBJ", new PermExplainService.MenuLabel("n", "6", false));

        Map<String, MenuTreeRow> m = byId(service(new FakeLoader(g), labels).userMenuTree("u1", null));
        assertThat(m.get("M_K").visible()).isTrue();
        assertThat(m.get("M_P").visible()).isTrue();          // 보이는 자식 화면의 부모 화면
        assertThat(m.get("M_P").reason()).isNull();
        assertThat(m.get("F_TOP").visible()).isTrue();
        assertThat(m.get("F_MID").visible()).isFalse();       // 화면 아래 폴더 — 보이는 화면의 조상이 아님
        assertThat(m.get("M_X").visible()).isTrue();          // 없는 부모여도 화면은 보임
        assertThat(m.get("M_NOOBJ").folder()).isFalse();
        assertThat(m.get("M_NOOBJ").visible()).isFalse();
    }

    @Test
    @DisplayName("모르는 역할 = 안 보이는 이유 NO_ROLE, null 입력 = 예외 없이 빈 답 또는 거절")
    void unknownRoleAndNulls() {
        PermExplainService svc = service(new FakeLoader(base()));
        Map<String, MenuTreeRow> m = byId(svc.roleMenuTree("NOPE", null));
        assertThat(m.get("M_A").visible()).isFalse();
        assertThat(m.get("M_A").reason()).isEqualTo(DenyReason.NO_ROLE);
        assertThat(byId(svc.roleMenuTree(null, null)).get("M_A").reason()).isEqualTo(DenyReason.NO_ROLE);
        assertThat(byId(svc.userMenuTree(null, null)).values()).noneMatch(MenuTreeRow::visible);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> svc.explain("u1", null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
