/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench 1단계 action 4개 단위 시험 — DB·로더는 시험 안 가짜, 메뉴 트리·설명은 실제 PermExplainService(r4)·DefaultPermResolver(r1)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchExplainRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchSearchBenchRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchSearchMenuTreeRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchSearchRolePermRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchGroupRolesRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchGroupsRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchRolesRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchUserGroupsRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchUsersRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.repository.CommPermBenchQueryRepository;
import com.dongkuk.dmes.mcm.csa.commPermBench.repository.CommPermBenchQueryRepository.MenuRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.repository.CommPermBenchQueryRepository.ObjRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.repository.CommPermBenchQueryRepository.UserFilter;
import com.dongkuk.dmes.mcm.csa.commPermBench.repository.CommPermBenchQueryRepository.UserStatus;
import com.dongkuk.dmes.mcm.security.perm.ButtonVerdict;
import com.dongkuk.dmes.mcm.security.perm.DenyReason;
import com.dongkuk.dmes.mcm.security.perm.Explain;
import com.dongkuk.dmes.mcm.security.perm.ExplainPath;
import com.dongkuk.dmes.mcm.security.perm.GrantReason;
import com.dongkuk.dmes.mcm.security.perm.MenuNode;
import com.dongkuk.dmes.mcm.security.perm.ObjMeta;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.dongkuk.dmes.mcm.security.perm.PermExplainService;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermGraphLoader;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;
import com.dongkuk.dmes.mcm.security.perm.RoleMeta;
import com.dongkuk.dmes.mcm.security.perm.RolePerm;
import com.dongkuk.dmes.mcm.security.perm.impl.DefaultPermResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CommPermBenchServiceTest {

    // ── 가짜(시험 전용) ─────────────────────────────────────────────

    /** DB 대신. 오브젝트·역할 조회는 시험 그래프({@code base}, 기본 {@link #graph()})에서 꺼낸다(r2 계약: objects 는 전부). */
    static class FakeQuery extends CommPermBenchQueryRepository {
        PermGraph base = graph();
        List<PermBenchUsersRow> users = new ArrayList<>();
        List<PermBenchGroupsRow> groups = new ArrayList<>();
        List<PermBenchRolesRow> roles = new ArrayList<>();
        List<PermBenchUserGroupsRow> userGroups = new ArrayList<>();
        List<PermBenchGroupRolesRow> groupRoles = new ArrayList<>();
        List<MenuRow> menus = new ArrayList<>();
        Map<String, String> names = new LinkedHashMap<>();
        /** 사용자 상태. 기본 u1 = 사용 중(기간 없음). */
        Map<String, UserStatus> statuses = new LinkedHashMap<>(Map.of("u1", new UserStatus("Y", null, null)));

        UserFilter lastFilter;
        int lastLimit = -1;
        Collection<String> lastUserIds;

        @Override public Optional<UserStatus> findUserStatus(String userId) { return Optional.ofNullable(statuses.get(userId)); }
        @Override public List<PermBenchUsersRow> searchUsers(UserFilter f, int limit) {
            lastFilter = f; lastLimit = limit; return users;
        }
        @Override public List<PermBenchGroupsRow> searchGroups() { return groups; }
        @Override public List<PermBenchRolesRow> searchRoles() { return roles; }
        @Override public List<PermBenchUserGroupsRow> searchUserGroups(Collection<String> userIds) {
            lastUserIds = List.copyOf(userIds);
            return userGroups.stream().filter(r -> userIds.contains(r.userId())).toList();
        }
        @Override public List<PermBenchGroupRolesRow> searchGroupRoles() { return groupRoles; }
        @Override public List<MenuRow> searchMenus() { return menus; }
        @Override public Map<String, String> objectNames() { return names; }
        @Override public Map<String, String> objectUseTps() {
            Map<String, String> out = new LinkedHashMap<>();
            base.objects().forEach((k, v) -> out.put(k, v.useTp()));
            return out;
        }
        @Override public Optional<ObjRow> findObject(String objectId) {
            ObjMeta o = base.objects().get(objectId);
            return o == null ? Optional.empty()
                    : Optional.of(new ObjRow(objectId, o.useTp(), PermTokens.join(o.btnPerm()), PermTokens.join(o.popupPerm())));
        }
        @Override public boolean roleExists(String roleId) { return base.roles().containsKey(roleId); }
    }

    /** 계약 PermGraphLoader 만 단다(loadForRoles 는 계약 메서드를 덮어쓴다). */
    static class FakeLoader implements PermGraphLoader {
        PermGraph graph;
        final List<Set<String>> forUsersCalls = new ArrayList<>();
        final List<Set<String>> forRolesCalls = new ArrayList<>();
        int allCalls;

        @Override public PermGraph loadForUsers(Set<String> userIds) { forUsersCalls.add(userIds); return graph; }
        @Override public PermGraph loadForRoles(Set<String> roleIds) { forRolesCalls.add(roleIds); return graph; }
        @Override public PermGraph loadAll() { allCalls++; return graph; }
    }

    /** 답을 미리 넣어 두는 계산기(버튼 칸 옮기기·호출 안 함 확인용). 받은 그래프를 남긴다. */
    static class FakeResolver implements PermResolver {
        final Map<String, Explain> explains = new LinkedHashMap<>();
        final List<PermGraph> seen = new ArrayList<>();
        int explainCalls;

        @Override public Map<String, Set<String>> actionsOf(PermGraph g, String userId) { throw new UnsupportedOperationException(); }
        @Override public Explain explain(PermGraph g, String userId, String objectId) {
            seen.add(g); explainCalls++;
            return explains.get(userId + "/" + objectId);
        }
        @Override public Set<String> visibleObjects(PermGraph g, String userId) { seen.add(g); return Set.of(); }
        @Override public Set<String> objectsOfRole(PermGraph g, String roleId) { seen.add(g); return Set.of(); }
    }

    FakeQuery query;
    FakeLoader loader;
    FakeResolver resolver;
    /** PermExplainService 에 넣을 계산기. 기본 = 실제 DefaultPermResolver(r1). */
    PermResolver explainResolver;
    PermGraph base;
    StaticListableBeanFactory beans;
    List<PermChange> draft;

    @BeforeEach
    void setUp() {
        query = new FakeQuery();
        loader = new FakeLoader();
        resolver = new FakeResolver();
        explainResolver = new DefaultPermResolver();
        base = graph();
        beans = new StaticListableBeanFactory();
        draft = null;
        query.menus = List.of(
                folder("MOD", null, "모듈", "Y", "Y"),
                folder("FLD", "MOD", "폴더", "Y", "Y"),
                folder("EMPTY", "MOD", "빈 폴더", "Y", "Y"),
                leaf("M_A", "FLD", "화면A", "objA", "Y", "Y"),
                leaf("M_B", "FLD", "화면B", "objB", "Y", "Y"),
                leaf("M_H", "FLD", "숨김화면", "objA", "N", "Y"),
                leaf("M_C", "EMPTY", "화면C", "objC", "Y", "Y"));
        query.names.putAll(Map.of("objA", "오브젝트A", "objB", "오브젝트B", "objC", "오브젝트C", "objZ", "오브젝트Z"));
    }

    static MenuRow folder(String id, String parent, String nm, String show, String use) {
        return new MenuRow(id, parent, nm, null, "1", show, use, true);
    }

    static MenuRow leaf(String id, String parent, String nm, String obj, String show, String use) {
        return new MenuRow(id, parent, nm, obj, "1", show, use, false);
    }

    /**
     * 시험 그래프. u1 → G1 → R1(objA·objZ 퍼미션). R_OFF(사용 안 함 역할) → objB 퍼미션. objC 는 사용 안 함 오브젝트.
     * menus 는 {@link #service()} 가 query.menus 에서 채운다.
     */
    static PermGraph graph() {
        Map<String, ObjMeta> objs = new LinkedHashMap<>();
        objs.put("objA", new ObjMeta("objA", "mcm", "Y", List.of("search", "save", "excelDown"), List.of("popUser"), null, null));
        objs.put("objB", new ObjMeta("objB", "mcm", "Y", List.of("search", "save"), List.of(), null, null));
        objs.put("objC", new ObjMeta("objC", "mcm", "N", List.of("list"), List.of(), null, null));
        objs.put("objZ", new ObjMeta("objZ", "mcm", "Y", List.of("search"), List.of(), null, null));
        Map<String, Map<String, RolePerm>> perms = new LinkedHashMap<>();
        Map<String, RolePerm> r1 = new LinkedHashMap<>();
        r1.put("objZ", new RolePerm("R1", "objZ", List.of("search"), List.of(), null));
        r1.put("objA", new RolePerm("R1", "objA", List.of("search", "save"), List.of("popUser"), "D1"));
        perms.put("R1", r1);
        perms.put("R_OFF", Map.of("objB", new RolePerm("R_OFF", "objB", List.of("search"), List.of(), null)));
        Map<String, RoleMeta> roles = Map.of("R1", new RoleMeta("R1", "Y", null, null), "R2", new RoleMeta("R2", "Y", null, null),
                "R_OFF", new RoleMeta("R_OFF", "N", null, null));
        return new PermGraph(Map.of("u1", Set.of("G1")), Map.of("G1", Set.of("R1")), roles, Map.of(), objs, perms, List.of());
    }

    /** 그래프 메뉴 = query.menus 와 같은 줄(폴더 먼저, 적은 순서). */
    PermGraph withMenus(PermGraph g) {
        List<MenuNode> nodes = new ArrayList<>();
        for (MenuRow m : query.menus) {
            nodes.add(new MenuNode(m.menuId(), m.parentMenuId(), m.objectId(), !"N".equals(m.showTp()), m.useTp()));
        }
        return new PermGraph(g.userGroups(), g.groupRoles(), g.roles(), g.groups(), g.objects(), g.rolePerms(), nodes);
    }

    CommPermBenchService service() {
        query.base = base;
        loader.graph = withMenus(base);
        Map<String, PermExplainService.MenuLabel> labels = new LinkedHashMap<>();
        for (MenuRow m : query.menus) {
            labels.put(m.menuId(), new PermExplainService.MenuLabel(m.menuNm(), m.sortSeq(), m.folder()));
        }
        PermExplainService explainer = new PermExplainService(loader, explainResolver) {
            @Override protected Map<String, MenuLabel> menuLabels() { return labels; }
        };
        beans.addBean("loader", loader);
        beans.addBean("explainer", explainer);
        if (draft != null) {
            List<PermChange> d = draft;
            beans.addBean("draft", (PermBenchDraftReader) () -> d);
        }
        return new CommPermBenchService(query, graphSource(beans));
    }

    static PermBenchGraphSource graphSource(StaticListableBeanFactory b) {
        return new PermBenchGraphSource(
                b.getBeanProvider(PermGraphLoader.class),
                b.getBeanProvider(PermBenchDraftReader.class),
                b.getBeanProvider(PermExplainService.class));
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> grid(Map<String, Object> out, String key) {
        return (List<Map<String, Object>>) out.get(key);
    }

    static Map<String, Object> rowOf(List<Map<String, Object>> rows, String key, String value) {
        return rows.stream().filter(r -> value.equals(r.get(key))).findFirst().orElseThrow();
    }

    static void assertNoVisibleNWithoutReason(List<Map<String, Object>> menus) {
        assertThat(menus).allSatisfy(m -> {
            if ("N".equals(m.get("VISIBLE"))) {
                assertThat(m.get("REASON")).as("VISIBLE=N 이면 REASON 이 있다: %s", m.get("MENU_ID")).isNotNull();
            }
        });
    }

    // ── searchBench ─────────────────────────────────────────────

    @Nested
    class SearchBench {

        @Test
        @DisplayName("조건을 대문자·LIKE 이스케이프로 넘기고, 상한 200명, 돌려준 사람의 연결만 주며, grid 6개를 §0.3 칸 이름으로 준다")
        void gridsAndFilter() {
            query.users = List.of(new PermBenchUsersRow("u1", "홍길동", "생산", "Y"), new PermBenchUsersRow("u2", "김", null, "N"));
            query.groups = List.of(new PermBenchGroupsRow("G1", "그룹1", "Y", 2));
            query.roles = List.of(new PermBenchRolesRow("R1", "역할1", "FLD", "Y", 1, 2, 3));
            query.userGroups = List.of(new PermBenchUserGroupsRow("u1", "G1"), new PermBenchUserGroupsRow("u9", "G1"));
            query.groupRoles = List.of(new PermBenchGroupRolesRow("G1", "R1"));
            CommPermBenchSearchBenchRequest req = new CommPermBenchSearchBenchRequest();
            req.setUserQ(" a_b% ");
            req.setRoleGroupId("G1");
            req.setRoleId(" ");

            Map<String, Object> out = service().searchBench(req);

            assertThat(out.keySet()).containsExactly("users", "groups", "roles", "userGroups", "groupRoles", "me");
            assertThat(query.lastFilter).isEqualTo(new UserFilter("%A\\_B\\%%", "G1", null));
            assertThat(query.lastLimit).isEqualTo(200);
            assertThat(query.lastUserIds).containsExactly("u1", "u2");
            assertThat(grid(out, "users").get(0)).containsExactly(
                    Map.entry("USER_ID", "u1"), Map.entry("USER_NM", "홍길동"), Map.entry("DEPT_NM", "생산"), Map.entry("USE_TP", "Y"));
            assertThat(grid(out, "groups").get(0).keySet()).containsExactly("ROLE_GROUP_ID", "ROLE_GROUP_NM", "USE_TP", "USER_CNT");
            assertThat(grid(out, "roles").get(0).keySet())
                    .containsExactly("ROLE_ID", "ROLE_NM", "MENU_ID", "USE_TP", "GROUP_CNT", "USER_CNT", "PERM_CNT");
            assertThat(grid(out, "userGroups")).hasSize(1);
            assertThat(grid(out, "groupRoles").get(0)).containsExactly(Map.entry("ROLE_GROUP_ID", "G1"), Map.entry("ROLE_ID", "R1"));
        }

        @Test
        @DisplayName("설명 서비스·로더 빈이 없어도 searchBench 는 된다(DB 목록만 쓴다)")
        void worksWithoutPermBeans() {
            CommPermBenchService svc = new CommPermBenchService(query, graphSource(new StaticListableBeanFactory()));
            assertThat(svc.searchBench(new CommPermBenchSearchBenchRequest())).containsKey("users");
        }
    }

    // ── searchMenuTree ─────────────────────────────────────────────

    @Nested
    class SearchMenuTree {

        CommPermBenchSearchMenuTreeRequest req(String userId, String roleId, String source) {
            CommPermBenchSearchMenuTreeRequest r = new CommPermBenchSearchMenuTreeRequest();
            r.setUserId(userId);
            r.setRoleId(roleId);
            r.setSource(source);
            return r;
        }

        @Test
        @DisplayName("사람 기준 CUR — r4 결과를 §0.3 칸으로: 사람 범위 그래프, 보이는 화면 Y, 숨김 화면은 Y·MENU_HIDDEN(SHOW_TP=N), "
                + "퍼미션 없음 NO_PERM, 사용 안 함 오브젝트 OBJ_UNUSED, 폴더는 보이는 화면의 조상이면 Y")
        void byUser() {
            List<Map<String, Object>> menus = service().searchMenuTree(req("u1", null, null));

            assertThat(loader.forUsersCalls).containsExactly(Set.of("u1"));
            assertThat(loader.allCalls).isZero();
            assertThat(menus).extracting(m -> m.get("MENU_ID")).containsExactly("MOD", "FLD", "EMPTY", "M_A", "M_B", "M_H", "M_C");
            assertThat(menus.get(0).keySet()).containsExactly(
                    "MENU_ID", "PARENT_MENU_ID", "MENU_NM", "OBJECT_ID", "SORT_SEQ", "SHOW_TP", "USE_TP", "VISIBLE", "REASON",
                    "OBJ_USE_TP");
            assertThat(rowOf(menus, "MENU_ID", "M_A")).containsEntry("VISIBLE", "Y").containsEntry("REASON", null)
                    .containsEntry("MENU_NM", "화면A").containsEntry("SORT_SEQ", "1").containsEntry("SHOW_TP", "Y");
            assertThat(rowOf(menus, "MENU_ID", "M_H")).containsEntry("VISIBLE", "Y").containsEntry("REASON", "MENU_HIDDEN")
                    .containsEntry("SHOW_TP", "N");
            assertThat(rowOf(menus, "MENU_ID", "M_B")).containsEntry("VISIBLE", "N").containsEntry("REASON", "NO_PERM");
            assertThat(rowOf(menus, "MENU_ID", "M_C")).containsEntry("VISIBLE", "N").containsEntry("REASON", "OBJ_UNUSED");
            assertThat(rowOf(menus, "MENU_ID", "FLD")).containsEntry("VISIBLE", "Y").containsEntry("REASON", null);
            assertThat(rowOf(menus, "MENU_ID", "MOD")).containsEntry("VISIBLE", "Y");
            assertThat(rowOf(menus, "MENU_ID", "EMPTY")).containsEntry("VISIBLE", "N").containsEntry("REASON", "NO_PERM");
            assertNoVisibleNWithoutReason(menus);
        }

        @Test
        @DisplayName("화면 줄 — 사용 안 함 화면은 퍼미션이 있어도 N·MENU_HIDDEN, OBJECT_ID 없는 화면은 N·NO_PERM, 그래프에 없는 오브젝트는 N·OBJ_UNUSED")
        void leafRows() {
            query.menus = List.of(folder("F", null, "폴더", "Y", "Y"),
                    leaf("M_OFF", "F", "사용 안 함", "objA", "Y", "N"),
                    leaf("M_NOOBJ", "F", "오브젝트 없음", null, "Y", "Y"),
                    leaf("M_GONE", "F", "없는 오브젝트", "objGone", "Y", "Y"));
            List<Map<String, Object>> menus = service().searchMenuTree(req("u1", null, null));
            assertThat(rowOf(menus, "MENU_ID", "M_OFF")).containsEntry("VISIBLE", "N").containsEntry("REASON", "MENU_HIDDEN");
            assertThat(rowOf(menus, "MENU_ID", "M_NOOBJ")).containsEntry("VISIBLE", "N").containsEntry("REASON", "NO_PERM")
                    .containsEntry("OBJ_USE_TP", null);
            assertThat(rowOf(menus, "MENU_ID", "M_GONE")).containsEntry("VISIBLE", "N").containsEntry("REASON", "OBJ_UNUSED")
                    .containsEntry("OBJ_USE_TP", null);
            assertThat(rowOf(menus, "MENU_ID", "F")).containsEntry("VISIBLE", "N").containsEntry("REASON", "NO_PERM")
                    .containsEntry("OBJ_USE_TP", null);
            assertNoVisibleNWithoutReason(menus);
        }

        @Test
        @DisplayName("폴더 — 숨김 폴더도 보이는 화면의 조상이면 Y·MENU_HIDDEN(SHOW_TP=N), 사용 안 함 폴더는 N·MENU_HIDDEN 이고 그 위 사슬은 이어진다")
        void folderRows() {
            query.menus = List.of(
                    folder("ROOT", null, "루트", "Y", "Y"),
                    folder("HID", "ROOT", "숨김 폴더", "N", "Y"),
                    folder("OFF", "ROOT", "사용 안 함 폴더", "Y", "N"),
                    leaf("M1", "HID", "화면1", "objA", "Y", "Y"),
                    leaf("M2", "OFF", "화면2", "objA", "Y", "Y"));
            List<Map<String, Object>> menus = service().searchMenuTree(req("u1", null, null));
            assertThat(rowOf(menus, "MENU_ID", "HID")).containsEntry("VISIBLE", "Y").containsEntry("SHOW_TP", "N")
                    .containsEntry("REASON", "MENU_HIDDEN");
            assertThat(rowOf(menus, "MENU_ID", "OFF")).containsEntry("VISIBLE", "N").containsEntry("REASON", "MENU_HIDDEN");
            assertThat(rowOf(menus, "MENU_ID", "ROOT")).containsEntry("VISIBLE", "Y").containsEntry("REASON", null);
            assertThat(rowOf(menus, "MENU_ID", "M1")).containsEntry("VISIBLE", "Y");
            assertThat(rowOf(menus, "MENU_ID", "M2")).containsEntry("VISIBLE", "Y");
        }

        @Test
        @DisplayName("역할 기준 CUR — 계약 loadForRoles({R1}) 범위(loadAll 아님), 이유는 r4(사용 안 함 역할 ROLE_UNUSED·사용 안 함 오브젝트 OBJ_UNUSED·NO_PERM), 없는 roleId 는 PERM_BAD_VALUE")
        void byRole() {
            CommPermBenchService svc = service();
            List<Map<String, Object>> menus = svc.searchMenuTree(req(null, "R1", "cur"));
            assertThat(loader.forRolesCalls).containsExactly(Set.of("R1"));
            assertThat(loader.allCalls).isZero();
            assertThat(rowOf(menus, "MENU_ID", "M_A")).containsEntry("VISIBLE", "Y");
            assertThat(rowOf(menus, "MENU_ID", "M_B")).containsEntry("VISIBLE", "N").containsEntry("REASON", "NO_PERM");
            assertThat(rowOf(menus, "MENU_ID", "M_C")).containsEntry("REASON", "OBJ_UNUSED").containsEntry("OBJ_USE_TP", "N");
            assertNoVisibleNWithoutReason(menus);

            List<Map<String, Object>> off = svc.searchMenuTree(req(null, "R_OFF", null));
            assertThat(rowOf(off, "MENU_ID", "M_B")).containsEntry("VISIBLE", "N").containsEntry("REASON", "ROLE_UNUSED");

            assertThatThrownBy(() -> svc.searchMenuTree(req(null, "R_NONE", null))).hasMessageStartingWith("PERM_BAD_VALUE:");
        }

        @Test
        @DisplayName("OBJ_USE_TP = 오브젝트 USE_TP(끝 칸), 폴더는 null")
        void objUseTp() {
            List<Map<String, Object>> menus = service().searchMenuTree(req(null, "R1", null));
            assertThat(rowOf(menus, "MENU_ID", "M_A")).containsEntry("OBJ_USE_TP", "Y");
            assertThat(rowOf(menus, "MENU_ID", "M_C")).containsEntry("OBJ_USE_TP", "N");
            assertThat(rowOf(menus, "MENU_ID", "FLD")).containsEntry("OBJ_USE_TP", null);
            assertThat(new ArrayList<>(menus.get(0).keySet())).last().isEqualTo("OBJ_USE_TP");
        }

        @Test
        @DisplayName("DRAFT — 저장된 변경이 있으면 전체 그래프에 겹쳐 계산한다(ROLE_OBJ 추가로 화면B 가 보인다)")
        void draft() {
            draft = List.of(PermChange.roleObj("R1", "objB", PermChange.ADD, "search", null));
            List<Map<String, Object>> menus = service().searchMenuTree(req("u1", null, "DRAFT"));
            assertThat(loader.allCalls).isEqualTo(1);
            assertThat(loader.forUsersCalls).isEmpty();
            assertThat(rowOf(menus, "MENU_ID", "M_B")).containsEntry("VISIBLE", "Y");
        }

        @Test
        @DisplayName("DRAFT 인데 저장된 변경이 없으면 CUR 과 같은 사람 범위 그래프")
        void emptyDraftUsesCurPath() {
            draft = List.of();
            service().searchMenuTree(req("u1", null, "DRAFT"));
            assertThat(loader.forUsersCalls).containsExactly(Set.of("u1"));
            assertThat(loader.allCalls).isZero();
        }

        @Test
        @DisplayName("Q-022 사용 안 함 사용자(USE_TP=N) — 설명 서비스·계산기를 부르지 않고 모든 행 N·NO_ROLE(보이는 화면 없음)")
        void inactiveUserByUseTp() {
            explainResolver = resolver;
            query.statuses.put("u1", new UserStatus("N", null, null));
            List<Map<String, Object>> menus = service().searchMenuTree(req("u1", null, null));
            assertThat(menus).hasSize(7).allSatisfy(m ->
                    assertThat(m).containsEntry("VISIBLE", "N").containsEntry("REASON", "NO_ROLE"));
            assertThat(rowOf(menus, "MENU_ID", "M_C")).containsEntry("OBJ_USE_TP", "N");
            assertThat(resolver.seen).isEmpty();
            assertThat(loader.forUsersCalls).isEmpty();
        }

        @Test
        @DisplayName("Q-022 유효 기간이 끝난 사용자 — 모든 화면 N·NO_ROLE, 없는 userId 는 PERM_BAD_VALUE")
        void inactiveUserByExpiredPeriod() {
            query.statuses.put("u1", new UserStatus("Y", LocalDateTime.of(2000, 1, 1, 0, 0), LocalDateTime.of(2001, 1, 1, 0, 0)));
            CommPermBenchService svc = service();
            List<Map<String, Object>> menus = svc.searchMenuTree(req("u1", null, null));
            assertThat(rowOf(menus, "MENU_ID", "M_A")).containsEntry("VISIBLE", "N").containsEntry("REASON", "NO_ROLE");
            assertThat(menus).noneMatch(m -> "Y".equals(m.get("VISIBLE")));
            assertThatThrownBy(() -> svc.searchMenuTree(req("nobody", null, null))).hasMessageStartingWith("PERM_BAD_VALUE:");
        }

        @Test
        @DisplayName("오늘 자정으로 끝나는 사용자는 그날 끝까지 사용 중 — r4 결과 그대로")
        void activeUntilEndOfToday() {
            query.statuses.put("u1", new UserStatus("Y", null, LocalDate.now().atStartOfDay()));
            List<Map<String, Object>> menus = service().searchMenuTree(req("u1", null, null));
            assertThat(rowOf(menus, "MENU_ID", "M_A")).containsEntry("VISIBLE", "Y");
            assertThat(loader.forUsersCalls).containsExactly(Set.of("u1"));
        }

        @Test
        @DisplayName("입력 오류·빈 없음 — 둘 다 없음 PERM_REQUIRED, 둘 다 있음·source 이상 PERM_BAD_*, 초안 이음매 없음 PERM_DRAFT_NOT_READY(그래프 읽기 전), 설명 서비스 없음 PERM_NOT_READY")
        void errors() {
            CommPermBenchService svc = service();
            assertThatThrownBy(() -> svc.searchMenuTree(req(" ", null, null))).hasMessageStartingWith("PERM_REQUIRED:");
            assertThatThrownBy(() -> svc.searchMenuTree(req("u1", "R1", null))).hasMessageStartingWith("PERM_BAD_VALUE:");
            assertThatThrownBy(() -> svc.searchMenuTree(req("u1", null, "OLD"))).hasMessageStartingWith("PERM_BAD_SOURCE:");
            assertThatThrownBy(() -> svc.searchMenuTree(req("u1", null, "DRAFT"))).hasMessageStartingWith("PERM_DRAFT_NOT_READY:");
            assertThat(loader.forUsersCalls).isEmpty();
            assertThat(loader.allCalls).isZero();

            CommPermBenchService noBeans = new CommPermBenchService(query, graphSource(new StaticListableBeanFactory()));
            assertThatThrownBy(() -> noBeans.searchMenuTree(req("u1", null, null)))
                    .isInstanceOf(BusinessException.class).hasMessageContaining("PERM_NOT_READY").hasMessageContaining("PermExplainService");
        }
    }

    // ── explain ─────────────────────────────────────────────

    @Nested
    class ExplainAction {

        CommPermBenchExplainRequest req(String userId, String objectId) {
            CommPermBenchExplainRequest r = new CommPermBenchExplainRequest();
            r.setUserId(userId);
            r.setObjectId(objectId);
            return r;
        }

        @Test
        @DisplayName("버튼 판정을 칸으로 옮긴다 — ALLOWED 는 종류별 오브젝트 허용 값, REASON 은 켜짐/잠김 사유, 목록은 쉼표, 빈 목록은 null")
        void buttonsAndPaths() {
            explainResolver = resolver;
            resolver.explains.put("u1/objA", new Explain("u1", "objA", true, null, List.of(
                    new ButtonVerdict("search", ButtonVerdict.Kind.BTN, true, GrantReason.PERM, null, List.of("R1", "R2"), List.of("G1")),
                    new ButtonVerdict("delete", ButtonVerdict.Kind.BTN, false, null, DenyReason.NOT_IN_OBJ, List.of(), List.of()),
                    new ButtonVerdict("popUser", ButtonVerdict.Kind.POPUP, false, null, DenyReason.NO_PERM, null, null)),
                    List.of(new ExplainPath("G1", "R1", List.of("search", "save"), List.of()))));

            Map<String, Object> out = service().explain(req("u1", "objA"));

            assertThat(loader.forUsersCalls).containsExactly(Set.of("u1"));
            List<Map<String, Object>> buttons = grid(out, "buttons");
            assertThat(buttons.get(0)).containsExactly(Map.entry("CODE", "search"), Map.entry("KIND", "BTN"),
                    Map.entry("ALLOWED", "Y"), Map.entry("GRANTED", "Y"), Map.entry("REASON", "PERM"),
                    Map.entry("ROLES", "R1,R2"), Map.entry("GROUPS", "G1"));
            assertThat(buttons.get(1)).containsEntry("ALLOWED", "N").containsEntry("GRANTED", "N").containsEntry("REASON", "NOT_IN_OBJ")
                    .containsEntry("ROLES", null).containsEntry("GROUPS", null);
            assertThat(buttons.get(2)).containsEntry("KIND", "POPUP").containsEntry("ALLOWED", "Y").containsEntry("REASON", "NO_PERM");
            assertThat(grid(out, "paths")).hasSize(1);
            assertThat(grid(out, "paths").get(0)).containsEntry("BTN_PERM", "search,save").containsEntry("POPUP_PERM", null);
        }

        @Test
        @DisplayName("r4 실제 계산 — 켠 버튼·길, 사람이 닿지 않는 오브젝트도 사람 범위 그래프(loadForUsers)에서 ALLOWED 는 오브젝트 값")
        void realResolver() {
            CommPermBenchService svc = service();
            Map<String, Object> a = svc.explain(req("u1", "objA"));
            assertThat(grid(a, "buttons")).extracting(b -> b.get("CODE") + ":" + b.get("GRANTED") + ":" + b.get("REASON"))
                    .containsExactly("search:Y:PERM", "save:Y:PERM", "excelDown:N:NO_PERM", "popUser:Y:PERM");
            assertThat(grid(a, "paths")).singleElement().satisfies(p -> assertThat(p)
                    .containsEntry("ROLE_GROUP_ID", "G1").containsEntry("ROLE_ID", "R1")
                    .containsEntry("BTN_PERM", "search,save").containsEntry("POPUP_PERM", "popUser"));

            Map<String, Object> b = svc.explain(req("u1", "objB"));
            assertThat(grid(b, "buttons")).extracting(x -> x.get("CODE") + ":" + x.get("ALLOWED") + ":" + x.get("GRANTED") + ":" + x.get("REASON"))
                    .containsExactly("search:Y:N:NO_PERM", "save:Y:N:NO_PERM");
            assertThat(grid(b, "paths")).isEmpty();
            assertThat(loader.forUsersCalls).containsOnly(Set.of("u1"));
            assertThat(loader.allCalls).isZero();
        }

        @Test
        @DisplayName("Q-022 사용 안 함 사용자 — 계산기를 부르지 않고 오브젝트 허용 값 전부(BTN 다음 POPUP) GRANTED=N·NO_ROLE, paths 없음")
        void inactiveUser() {
            explainResolver = resolver;
            query.statuses.put("u1", new UserStatus("N", null, null));

            Map<String, Object> out = service().explain(req("u1", "objA"));

            List<Map<String, Object>> buttons = grid(out, "buttons");
            assertThat(buttons).extracting(b -> b.get("CODE")).containsExactly("search", "save", "excelDown", "popUser");
            assertThat(buttons).extracting(b -> b.get("KIND")).containsExactly("BTN", "BTN", "BTN", "POPUP");
            assertThat(buttons).allSatisfy(b -> assertThat(b).containsEntry("ALLOWED", "Y").containsEntry("GRANTED", "N")
                    .containsEntry("REASON", "NO_ROLE").containsEntry("ROLES", null).containsEntry("GROUPS", null));
            assertThat(grid(out, "paths")).isEmpty();
            assertThat(resolver.explainCalls).isZero();
            assertThat(loader.forUsersCalls).isEmpty();
        }

        @Test
        @DisplayName("Q-022 시작 전·끝난 기간 사용자도 NO_ROLE, 사용 중 사용자는 r4 결과 그대로, 없는 userId 는 PERM_BAD_VALUE")
        void inactiveByPeriodAndActiveUnchanged() {
            CommPermBenchService svc = service();
            assertThat(grid(svc.explain(req("u1", "objA")), "buttons")).first()
                    .satisfies(b -> assertThat(b).containsEntry("GRANTED", "Y").containsEntry("REASON", "PERM"));

            query.statuses.put("u1", new UserStatus("Y", null, LocalDateTime.of(2001, 1, 1, 12, 0)));
            assertThat(grid(svc.explain(req("u1", "objA")), "buttons")).isNotEmpty()
                    .allSatisfy(b -> assertThat(b).containsEntry("REASON", "NO_ROLE"));
            query.statuses.put("u1", new UserStatus("Y", LocalDateTime.now().plusDays(1), null));
            assertThat(grid(svc.explain(req("u1", "objA")), "buttons"))
                    .allSatisfy(b -> assertThat(b).containsEntry("REASON", "NO_ROLE"));
            assertThatThrownBy(() -> svc.explain(req("nobody", "objA"))).hasMessageStartingWith("PERM_BAD_VALUE:");
        }

        @Test
        @DisplayName("userId·objectId 없음 PERM_REQUIRED, 없는 objectId PERM_BAD_VALUE, 계산기가 답을 안 주면 빈 grid")
        void requiredAndEmpty() {
            explainResolver = resolver;
            CommPermBenchService svc = service();
            assertThatThrownBy(() -> svc.explain(req("u1", null))).hasMessageStartingWith("PERM_REQUIRED: objectId");
            assertThatThrownBy(() -> svc.explain(req("u1", "objX"))).hasMessageStartingWith("PERM_BAD_VALUE:");
            Map<String, Object> out = svc.explain(req("u1", "objB"));
            assertThat(grid(out, "buttons")).isEmpty();
            assertThat(grid(out, "paths")).isEmpty();
        }

        @Test
        @DisplayName("DRAFT — 저장된 변경을 겹친 전체 그래프로 설명한다")
        void draft() {
            draft = List.of(PermChange.roleObj("R1", "objB", PermChange.ADD, "search", null));
            CommPermBenchExplainRequest r = req("u1", "objB");
            r.setSource("DRAFT");
            Map<String, Object> out = service().explain(r);
            assertThat(loader.allCalls).isEqualTo(1);
            assertThat(grid(out, "buttons")).extracting(b -> b.get("CODE") + ":" + b.get("GRANTED"))
                    .containsExactly("search:Y", "save:N");
        }
    }

    // ── 사용자 사용 판정(PermEvaluator.active 와 같은 규칙) ─────────────

    @Nested
    class UserStatusRule {

        final LocalDateTime now = LocalDateTime.of(2026, 11, 27, 15, 30);

        @Test
        @DisplayName("USE_TP=Y 만, 시작 시각 전은 아님, 자정 끝 = 그날 끝까지, 시각 끝 = 그 시각까지 포함")
        void activeAt() {
            assertThat(new UserStatus("Y", null, null).activeAt(now)).isTrue();
            assertThat(new UserStatus("N", null, null).activeAt(now)).isFalse();
            assertThat(new UserStatus(null, null, null).activeAt(now)).isFalse();
            assertThat(new UserStatus("Y", now.plusSeconds(1), null).activeAt(now)).isFalse();
            assertThat(new UserStatus("Y", now, null).activeAt(now)).isTrue();
            assertThat(new UserStatus("Y", null, LocalDateTime.of(2026, 11, 27, 0, 0)).activeAt(now)).isTrue();
            assertThat(new UserStatus("Y", null, LocalDateTime.of(2026, 11, 26, 0, 0)).activeAt(now)).isFalse();
            assertThat(new UserStatus("Y", null, now).activeAt(now)).isTrue();
            assertThat(new UserStatus("Y", null, now.minusSeconds(1)).activeAt(now)).isFalse();
        }
    }

    // ── searchRolePerm ─────────────────────────────────────────────

    @Nested
    class SearchRolePerm {

        CommPermBenchSearchRolePermRequest req(String roleId, String folder, String source) {
            CommPermBenchSearchRolePermRequest r = new CommPermBenchSearchRolePermRequest();
            r.setRoleId(roleId);
            r.setMenuFolderId(folder);
            r.setSource(source);
            return r;
        }

        @Test
        @DisplayName("폴더를 주면 후손 화면의 오브젝트 전부(메뉴 순서·중복 제거), 퍼미션 없는 것은 BTN_PERM null, 조회만 값은 readPreset, 빈 값은 null, CUR = loadForRoles")
        void byFolder() {
            List<Map<String, Object>> perms = service().searchRolePerm(req("R1", "MOD", null));

            assertThat(perms).extracting(m -> m.get("OBJECT_ID")).containsExactly("objA", "objB", "objC");
            assertThat(perms.get(0)).containsExactly(Map.entry("ROLE_ID", "R1"), Map.entry("OBJECT_ID", "objA"),
                    Map.entry("OBJECT_NM", "오브젝트A"), Map.entry("MENU_PATH", "모듈 › 폴더 › 화면A"),
                    Map.entry("OBJ_BTN_PERM", "search,save,excelDown"), Map.entry("OBJ_POPUP_PERM", "popUser"),
                    Map.entry("OBJ_READ_PERM", "search"), Map.entry("BTN_PERM", "search,save"),
                    Map.entry("POPUP_PERM", "popUser"), Map.entry("DATA_PERM", "D1"));
            assertThat(perms.get(1)).containsEntry("BTN_PERM", null).containsEntry("POPUP_PERM", null).containsEntry("DATA_PERM", null)
                    .containsEntry("OBJ_POPUP_PERM", null);
            assertThat(perms.get(2)).containsEntry("OBJ_READ_PERM", "list").containsEntry("MENU_PATH", "모듈 › 빈 폴더 › 화면C");
            assertThat(loader.forRolesCalls).containsExactly(Set.of("R1"));
            assertThat(loader.allCalls).isZero();
        }

        @Test
        @DisplayName("폴더가 없으면 그 역할의 퍼미션만 — 메뉴에 있는 것 먼저, 메뉴에 없는 것은 끝(MENU_PATH null)")
        void withoutFolder() {
            List<Map<String, Object>> perms = service().searchRolePerm(req("R1", null, null));
            assertThat(perms).extracting(m -> m.get("OBJECT_ID")).containsExactly("objA", "objZ");
            assertThat(perms.get(1)).containsEntry("MENU_PATH", null).containsEntry("OBJECT_NM", "오브젝트Z")
                    .containsEntry("POPUP_PERM", null);
        }

        @Test
        @DisplayName("없는 menuFolderId·roleId 는 PERM_BAD_VALUE, roleId 없음은 PERM_REQUIRED")
        void badInputs() {
            CommPermBenchService svc = service();
            assertThatThrownBy(() -> svc.searchRolePerm(req("R1", "NOPE", null))).hasMessageStartingWith("PERM_BAD_VALUE:");
            assertThatThrownBy(() -> svc.searchRolePerm(req("R_NONE", null, null))).hasMessageStartingWith("PERM_BAD_VALUE:");
            assertThatThrownBy(() -> svc.searchRolePerm(req(null, null, null))).hasMessageStartingWith("PERM_REQUIRED: roleId");
        }

        @Test
        @DisplayName("DRAFT — 전체 그래프에 초안의 ROLE_OBJ 변경을 겹친다(빈 팝업은 null)")
        void draft() {
            draft = List.of(PermChange.roleObj("R1", "objB", PermChange.ADD, "search, save", null),
                    PermChange.roleObj("R1", "objA", PermChange.DEL, null, null));
            List<Map<String, Object>> perms = service().searchRolePerm(req("R1", "FLD", "DRAFT"));
            assertThat(loader.allCalls).isEqualTo(1);
            assertThat(loader.forRolesCalls).isEmpty();
            assertThat(rowOf(perms, "OBJECT_ID", "objB")).containsEntry("BTN_PERM", "search,save").containsEntry("POPUP_PERM", null);
            assertThat(rowOf(perms, "OBJECT_ID", "objA")).containsEntry("BTN_PERM", null);
        }
    }
}
