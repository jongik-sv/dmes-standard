/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: PermImpactCalculator·PermImpactService 단위 시험(가짜 계산기·가짜 이름 원천, Oracle 없음) + 1,000명 영향 측정
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.security.perm.impl.DefaultImpactCalculator;
import com.dongkuk.dmes.mcm.security.perm.impl.DefaultPermResolver;
import com.dongkuk.dmes.mcm.security.perm.GroupMeta;
import com.dongkuk.dmes.mcm.security.perm.ImpactCalculator;
import com.dongkuk.dmes.mcm.security.perm.ObjMeta;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermGraphLoader;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;
import com.dongkuk.dmes.mcm.security.perm.RoleMeta;
import com.dongkuk.dmes.mcm.security.perm.RolePerm;
import com.dongkuk.dmes.mcm.security.perm.UserImpact;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PermImpactServiceTest {

    // ────────────────────────────────────────────────────────────────
    // 그래프 도우미
    // ────────────────────────────────────────────────────────────────

    private static ObjMeta obj(String id, String btn, String popup) {
        return new ObjMeta(id, "mcm", "Y", PermTokens.parse(btn), PermTokens.parse(popup), null, null);
    }

    private static RolePerm perm(String role, String obj, String btn, String popup) {
        return new RolePerm(role, obj, PermTokens.parse(btn), PermTokens.parse(popup), null);
    }

    /** u1·u2 ∈ G1(R1), u3 ∈ G2(R2), u4 는 그룹 없음. 오브젝트 O1·O2·O3. */
    private static PermGraph small() {
        Map<String, Set<String>> ug = new LinkedHashMap<>();
        ug.put("u1", Set.of("G1"));
        ug.put("u2", Set.of("G1"));
        ug.put("u3", Set.of("G2"));
        ug.put("u4", Set.of());
        Map<String, Set<String>> gr = Map.of("G1", Set.of("R1"), "G2", Set.of("R2"));
        Map<String, RoleMeta> roles = Map.of("R1", new RoleMeta("R1", "Y", null, null), "R2", new RoleMeta("R2", "Y", null, null));
        Map<String, GroupMeta> groups = Map.of("G1", new GroupMeta("G1", "Y", null, null), "G2", new GroupMeta("G2", "Y", null, null));
        Map<String, ObjMeta> objs = new LinkedHashMap<>();
        objs.put("O1", obj("O1", "ADD,SAVE,DEL", "POP"));
        objs.put("O2", obj("O2", "ADD,SAVE", ""));
        objs.put("O3", obj("O3", "ADD", ""));
        Map<String, Map<String, RolePerm>> rp = new LinkedHashMap<>();
        rp.put("R1", new LinkedHashMap<>(Map.of("O1", perm("R1", "O1", "ADD,SAVE", ""))));
        rp.put("R2", new LinkedHashMap<>(Map.of("O2", perm("R2", "O2", "ADD", ""))));
        return new PermGraph(ug, gr, roles, groups, objs, rp, List.of());
    }

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-27T03:00:00Z"), ZoneId.of("UTC"));
    private final DefaultPermResolver resolver = new DefaultPermResolver(CLOCK);
    private final DefaultImpactCalculator impactCalc = new DefaultImpactCalculator(CLOCK);
    private final PermImpactCalculator calc = new PermImpactCalculator(resolver, impactCalc);

    // ────────────────────────────────────────────────────────────────
    // 계산
    // ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("변경 없음 = 0 건, 빈 영향")
    void emptyChanges() {
        PermImpactCalculator.Result r = calc.compute(small(), List.of());
        assertThat(r.gainUserCnt()).isZero();
        assertThat(r.loseUserCnt()).isZero();
        assertThat(r.screenCnt()).isZero();
        assertThat(r.impacts()).isEmpty();
    }

    @Test
    @DisplayName("역할 퍼미션 변경 — 그 역할을 가진 사용자만 후보, gained·lost 가 따로 센다")
    void roleChange() {
        // R1·O1: ADD,SAVE -> SAVE,DEL  => gained DEL, lost ADD  (u1,u2)
        PermImpactCalculator.Result r = calc.compute(small(),
                List.of(PermChange.roleObj("R1", "O1", PermChange.UPD, "SAVE,DEL", "")));
        assertThat(r.candidates()).containsExactly("u1", "u2");
        assertThat(r.gainUserCnt()).isEqualTo(2);
        assertThat(r.loseUserCnt()).isEqualTo(2);
        assertThat(r.screenCnt()).isEqualTo(1);
        assertThat(r.impacts()).extracting(UserImpact::userId, UserImpact::objectId).containsExactly(
                org.assertj.core.groups.Tuple.tuple("u1", "O1"), org.assertj.core.groups.Tuple.tuple("u2", "O1"));
    }

    @Test
    @DisplayName("후보 = before ∪ after — 같은 초안에서 새로 역할을 받는 사용자(USER_GRP+GRP_ROLE)도 잡는다")
    void candidateUnion() {
        // u4 에게 G3 를 주고, G3 에 R2 를 준다. G3 는 before 에 없으므로 after 에서만 u4 가 후보로 잡힌다.
        List<PermChange> ch = List.of(
                PermChange.link(PermChange.USER_GRP, "u4", "G3", PermChange.ADD),
                PermChange.link(PermChange.GRP_ROLE, "G3", "R2", PermChange.ADD));
        PermImpactCalculator.Result r = calc.compute(small(), ch);
        assertThat(r.candidates()).containsExactly("u4");
        assertThat(r.impacts()).hasSize(1);
        assertThat(r.impacts().get(0).userId()).isEqualTo("u4");
        assertThat(r.impacts().get(0).objectId()).isEqualTo("O2");
        assertThat(r.gainUserCnt()).isEqualTo(1);
        assertThat(r.loseUserCnt()).isZero();
    }

    @Test
    @DisplayName("GRP_ROLE 로 역할을 뺀 사용자 = lost, 그룹 구성원 모두 후보")
    void groupRoleDel() {
        PermImpactCalculator.Result r = calc.compute(small(),
                List.of(PermChange.link(PermChange.GRP_ROLE, "G1", "R1", PermChange.DEL)));
        assertThat(r.candidates()).containsExactly("u1", "u2");
        assertThat(r.loseUserCnt()).isEqualTo(2);
        assertThat(r.gainUserCnt()).isZero();
        assertThat(r.impacts()).allSatisfy(i -> assertThat(i.lost()).containsExactlyInAnyOrder("ADD", "SAVE"));
    }

    @Test
    @DisplayName("보임만 바뀌는 변경(action 은 그대로) — impacts 는 비고 SCREEN_CNT 만 센다")
    void visibilityOnly() {
        // R1 에 O3 퍼미션 추가인데 BTN 이 오브젝트 허용 밖(SAVE)이라 효과 action 은 비지만 가짜 보임에는 잡힌다.
        PermImpactCalculator.Result r = calc.compute(small(),
                List.of(PermChange.roleObj("R1", "O3", PermChange.ADD, "SAVE", "")));
        assertThat(r.impacts()).isEmpty();
        assertThat(r.gainUserCnt()).isZero();
        assertThat(r.loseUserCnt()).isZero();
        assertThat(r.screenCnt()).isEqualTo(1);
    }

    @Test
    @DisplayName("한 사용자가 얻고 잃기 모두 하면 양쪽에 센다, 서로 다른 오브젝트 수 = SCREEN_CNT")
    void userInBothCounts() {
        PermImpactCalculator.Result r = calc.compute(small(), List.of(
                PermChange.roleObj("R1", "O1", PermChange.UPD, "SAVE,DEL", ""),
                PermChange.roleObj("R1", "O2", PermChange.ADD, "ADD", "")));
        assertThat(r.gainUserCnt()).isEqualTo(2);
        assertThat(r.loseUserCnt()).isEqualTo(2);
        assertThat(r.screenCnt()).isEqualTo(2);
        assertThat(r.impacts()).hasSize(4);
    }

    // ────────────────────────────────────────────────────────────────
    // 서비스(grid 변환·500줄·빈 초안·빈 미등록)
    // ────────────────────────────────────────────────────────────────

    private static <T> ObjectProvider<T> provider(Class<T> type, T bean) {
        DefaultListableBeanFactory bf = new DefaultListableBeanFactory();
        if (bean != null) {
            bf.registerSingleton("b", bean);
        }
        return bf.getBeanProvider(type);
    }

    private static final PermImpactNames NAMES = new PermImpactNames() {
        @Override
        public Map<String, String> userNames(Collection<String> ids) {
            Map<String, String> m = new HashMap<>();
            ids.forEach(i -> m.put(i, "이름-" + i));
            return m;
        }

        @Override
        public Map<String, String> objectNames(Collection<String> ids) {
            Map<String, String> m = new HashMap<>();
            ids.forEach(i -> m.put(i, "화면-" + i));
            return m;
        }
    };

    private PermImpactService service(List<PermChange> changes, PermGraph g, boolean withBeans) {
        PermDraftService draft = org.mockito.Mockito.mock(PermDraftService.class);
        org.mockito.Mockito.when(draft.myChanges()).thenReturn(changes);
        PermGraphLoader loader = new PermGraphLoader() {
            @Override
            public PermGraph loadForUsers(Set<String> userIds) {
                throw new AssertionError("loadAll 만 쓴다");
            }

            @Override
            public PermGraph loadAll() {
                return g;
            }
        };
        return new PermImpactService(draft,
                provider(PermGraphLoader.class, withBeans ? loader : null),
                provider(PermResolver.class, withBeans ? resolver : null),
                provider(ImpactCalculator.class, withBeans ? impactCalc : null), NAMES);
    }

    @Test
    @DisplayName("impact — summary 한 줄 + impacts 줄(이름·정렬된 코드)")
    @SuppressWarnings("unchecked")
    void serviceGrids() {
        Map<String, Object> res = service(List.of(PermChange.roleObj("R1", "O1", PermChange.UPD, "SAVE,DEL", "")),
                small(), true).impact();
        assertThat(res).containsOnlyKeys("summary", "impacts");
        List<Map<String, Object>> summary = (List<Map<String, Object>>) res.get("summary");
        assertThat(summary).hasSize(1);
        assertThat(summary.get(0)).containsEntry("GAIN_USER_CNT", 2).containsEntry("LOSE_USER_CNT", 2).containsEntry("SCREEN_CNT", 1);
        List<Map<String, Object>> impacts = (List<Map<String, Object>>) res.get("impacts");
        assertThat(impacts).hasSize(2);
        assertThat(impacts.get(0)).containsEntry("USER_ID", "u1").containsEntry("USER_NM", "이름-u1")
                .containsEntry("OBJECT_ID", "O1").containsEntry("OBJECT_NM", "화면-O1")
                .containsEntry("GAINED", "DEL").containsEntry("LOST", "ADD");
    }

    @Test
    @DisplayName("초안 없음·빈 초안 — summary 0, impacts 빈 목록, 그래프를 읽지 않는다")
    @SuppressWarnings("unchecked")
    void noDraft() {
        Map<String, Object> res = service(List.of(), small(), false).impact();   // 빈 없어도 오류 없음
        assertThat(((List<Map<String, Object>>) res.get("summary")).get(0))
                .containsEntry("GAIN_USER_CNT", 0).containsEntry("LOSE_USER_CNT", 0).containsEntry("SCREEN_CNT", 0);
        assertThat((List<?>) res.get("impacts")).isEmpty();
    }

    @Test
    @DisplayName("계산 빈이 없으면 PERM_NOT_READY")
    void notReady() {
        assertThatThrownBy(() -> service(List.of(PermChange.roleObj("R1", "O1", PermChange.UPD, "SAVE", "")), small(), false).impact())
                .isInstanceOf(BusinessException.class).hasMessageStartingWith("PERM_NOT_READY");
    }

    @Test
    @DisplayName("impacts 는 앞 500줄만, summary 는 전체 건수")
    @SuppressWarnings("unchecked")
    void cap500() {
        PermGraph g = synthetic(300, 10);   // 300명 × 10 오브젝트 = 3,000 행
        Map<String, Object> res = service(List.of(PermChange.roleObj("R", "O0", PermChange.UPD, "ADD", ""),
                PermChange.roleObj("R", "O1", PermChange.UPD, "ADD", "")), g, true).impact();
        // 두 오브젝트에서 SAVE 를 잃는다 → 300명 × 2 = 600 줄, 500 줄만 나간다
        List<Map<String, Object>> impacts = (List<Map<String, Object>>) res.get("impacts");
        assertThat(impacts).hasSize(PermImpactService.MAX_ROWS);
        assertThat(((List<Map<String, Object>>) res.get("summary")).get(0)).containsEntry("LOSE_USER_CNT", 300);
        assertThat(impacts.get(0).get("USER_ID")).isEqualTo("u0000");
    }

    // ────────────────────────────────────────────────────────────────
    // 측정 — 역할 1건 변경이 1,000명에 닿는 경우
    // ────────────────────────────────────────────────────────────────

    /** 사용자 수 × 오브젝트 수. 사용자 전원이 그룹 G → 역할 R. 오브젝트 O0..On, 역할 R 이 모든 오브젝트에 퍼미션. */
    private static PermGraph synthetic(int users, int objects) {
        Map<String, Set<String>> ug = new LinkedHashMap<>();
        for (int i = 0; i < users; i++) {
            ug.put(String.format("u%04d", i), Set.of("G"));
        }
        Map<String, ObjMeta> objs = new LinkedHashMap<>();
        Map<String, RolePerm> perms = new LinkedHashMap<>();
        for (int i = 0; i < objects; i++) {
            String id = "O" + i;
            objs.put(id, obj(id, "ADD,SAVE,DEL", "POP"));
            perms.put(id, perm("R", id, "ADD,SAVE", ""));
        }
        return new PermGraph(ug, Map.of("G", Set.of("R")), Map.of("R", new RoleMeta("R", "Y", null, null)),
                Map.of("G", new GroupMeta("G", "Y", null, null)), objs, Map.of("R", perms), List.of());
    }

    @Test
    @DisplayName("측정 — 역할 1건 변경 × 1,000명 × 1,004 오브젝트의 영향 계산(compute 만, loadAll·이름 조회 제외) ≤ 2초")
    void timing() {
        PermGraph g = synthetic(1000, 1004);
        List<PermChange> change = List.of(PermChange.roleObj("R", "O0", PermChange.UPD, "SAVE,DEL", ""));

        calc.compute(g, change, PermImpactService.MAX_ROWS);                      // 예열
        long best = Long.MAX_VALUE;
        PermImpactCalculator.Result r = null;
        StringBuilder runs = new StringBuilder();
        for (int i = 0; i < 3; i++) {
            long t0 = System.nanoTime();
            r = calc.compute(g, change, PermImpactService.MAX_ROWS);
            long d = System.nanoTime() - t0;
            runs.append(d / 1_000_000).append("ms ");
            best = Math.min(best, d);
        }
        long ms = best / 1_000_000;
        System.out.println("[PERM-IMPACT-TIMING] runs=" + runs + "best-of-3=" + ms + "ms candidates=" + r.candidates().size()
                + " rows=" + r.totalRows());
        assertThat(r.candidates()).hasSize(1000);
        assertThat(r.gainUserCnt()).isEqualTo(1000);
        assertThat(ms).isLessThanOrEqualTo(2000);
    }

    @Test
    @DisplayName("측정 — 1,000명이 모두 다른 그룹 조합이어도 유효 역할 집합이 같으면 한 번만 계산")
    void timingDistinctGroupsSameRoles() {
        PermGraph base = synthetic(1000, 1004);
        Map<String, Set<String>> ug = new LinkedHashMap<>();
        Map<String, Set<String>> gr = new LinkedHashMap<>(base.groupRoles());
        Map<String, GroupMeta> groups = new LinkedHashMap<>(base.groups());
        for (int i = 0; i < 1000; i++) {
            ug.put(String.format("u%04d", i), Set.of("G", "X" + i));
            gr.put("X" + i, Set.of("R"));
            groups.put("X" + i, new GroupMeta("X" + i, "Y", null, null));
        }
        PermGraph g = new PermGraph(ug, gr, base.roles(), groups, base.objects(), base.rolePerms(), List.of());
        List<PermChange> change = List.of(PermChange.roleObj("R", "O0", PermChange.UPD, "SAVE,DEL", ""));
        calc.compute(g, change, PermImpactService.MAX_ROWS);
        long t0 = System.nanoTime();
        PermImpactCalculator.Result r = calc.compute(g, change, PermImpactService.MAX_ROWS);
        long ms = (System.nanoTime() - t0) / 1_000_000;
        System.out.println("[PERM-IMPACT-DISTINCT-GROUPS-SAME-ROLES] " + ms + "ms");
        assertThat(r.gainUserCnt()).isEqualTo(1000);
        assertThat(ms).isLessThanOrEqualTo(2000);
    }

    @Test
    @DisplayName("측정(최악) — 1,000명이 모두 서로 다른 역할 집합(R + 개인 역할)이라 묶이지 않을 때 (상한 2초)")
    void timingDistinctRoleSets() {
        PermGraph base = synthetic(1000, 1004);
        Map<String, Set<String>> ug = new LinkedHashMap<>();
        Map<String, Set<String>> gr = new LinkedHashMap<>(base.groupRoles());
        Map<String, GroupMeta> groups = new LinkedHashMap<>(base.groups());
        Map<String, RoleMeta> roles = new LinkedHashMap<>(base.roles());
        Map<String, Map<String, RolePerm>> rp = new LinkedHashMap<>(base.rolePerms());
        for (int i = 0; i < 1000; i++) {
            String u = String.format("u%04d", i);
            ug.put(u, Set.of("G", "X" + i));
            gr.put("X" + i, Set.of("Q" + i));
            groups.put("X" + i, new GroupMeta("X" + i, "Y", null, null));
            roles.put("Q" + i, new RoleMeta("Q" + i, "Y", null, null));
            rp.put("Q" + i, Map.of("O1", perm("Q" + i, "O1", "ADD", "")));
        }
        PermGraph g = new PermGraph(ug, gr, roles, groups, base.objects(), rp, List.of());
        List<PermChange> change = List.of(PermChange.roleObj("R", "O0", PermChange.UPD, "SAVE,DEL", ""));
        calc.compute(g, change, PermImpactService.MAX_ROWS);
        long t0 = System.nanoTime();
        PermImpactCalculator.Result r = calc.compute(g, change, PermImpactService.MAX_ROWS);
        long ms = (System.nanoTime() - t0) / 1_000_000;
        System.out.println("[PERM-IMPACT-WORST-DISTINCT-ROLESETS] " + ms + "ms");
        assertThat(r.gainUserCnt()).isEqualTo(1000);
        assertThat(ms).isLessThanOrEqualTo(2000);
    }

    @Test
    @DisplayName("묶기 키(DefaultPermResolver#activeRolesOf)가 규칙대로다 — 사용 안 함·기간 밖 그룹/역할은 빠지고, 키가 같으면 효과도 같다")
    void roleSetKeyMatchesResolver() {
        PermGraph b = small();
        Map<String, Set<String>> ug = new LinkedHashMap<>();
        ug.put("a", Set.of("G1"));
        ug.put("b", Set.of("G1", "GN"));                     // GN = 사용 안 함
        ug.put("c", Set.of("G1", "GE"));                     // GE = 어제 끝난 그룹(자정 값)
        ug.put("d", Set.of("G1", "GL"));                     // GL = 오늘 자정 끝 → 오늘 끝까지 유효
        ug.put("e", Set.of("G3"));                           // G3 → 만료 역할 RX 만
        ug.put("f", Set.of("G2"));
        Map<String, Set<String>> gr = new LinkedHashMap<>(b.groupRoles());
        gr.put("GN", Set.of("R2"));
        gr.put("GE", Set.of("R2"));
        gr.put("GL", Set.of("R2"));
        gr.put("G3", Set.of("RX"));
        Map<String, GroupMeta> groups = new LinkedHashMap<>(b.groups());
        groups.put("GN", new GroupMeta("GN", "N", null, null));
        groups.put("GE", new GroupMeta("GE", "Y", null, java.time.LocalDateTime.of(2026, 11, 26, 0, 0)));
        groups.put("GL", new GroupMeta("GL", "Y", null, java.time.LocalDateTime.of(2026, 11, 27, 0, 0)));
        Map<String, RoleMeta> roles = new LinkedHashMap<>(b.roles());
        roles.put("RX", new RoleMeta("RX", "Y", null, java.time.LocalDateTime.of(2026, 1, 1, 12, 0)));
        PermGraph g = new PermGraph(ug, gr, roles, groups, b.objects(), b.rolePerms(), List.of());

        assertThat(resolver.activeRolesOf(g, "a")).containsExactly("R1");
        assertThat(resolver.activeRolesOf(g, "b")).containsExactly("R1");
        assertThat(resolver.activeRolesOf(g, "c")).containsExactly("R1");
        assertThat(resolver.activeRolesOf(g, "d")).containsExactly("R1", "R2");
        assertThat(resolver.activeRolesOf(g, "e")).isEmpty();
        assertThat(resolver.activeRolesOf(g, "f")).containsExactly("R2");
        // 키가 같으면 실제 resolver 의 효과·보임도 같다
        for (String x : List.of("a", "b", "c")) {
            assertThat(resolver.actionsOf(g, x)).isEqualTo(resolver.actionsOf(g, "a"));
            assertThat(resolver.visibleObjects(g, x)).isEqualTo(resolver.visibleObjects(g, "a"));
        }
        assertThat(resolver.actionsOf(g, "d")).containsKeys("O1", "O2");
        assertThat(resolver.actionsOf(g, "e")).isEmpty();
    }

    @Test
    @DisplayName("측정(최악) — 1,000명 그룹에 SYSADMIN 추가 = 약 100만 줄. 앞 500줄만 만들고 건수는 전체")
    void timingSysadminWorst() {
        PermGraph base = synthetic(1000, 1004);
        Map<String, RoleMeta> roles = new LinkedHashMap<>(base.roles());
        roles.put("SYSADMIN", new RoleMeta("SYSADMIN", "Y", null, null));
        PermGraph g = new PermGraph(base.userGroups(), base.groupRoles(), roles, base.groups(), base.objects(), base.rolePerms(), List.of());
        List<PermChange> change = List.of(PermChange.link(PermChange.GRP_ROLE, "G", "SYSADMIN", PermChange.ADD));
        calc.compute(g, change, PermImpactService.MAX_ROWS);
        Runtime rt = Runtime.getRuntime();
        System.gc();
        long m0 = rt.totalMemory() - rt.freeMemory();
        long t0 = System.nanoTime();
        PermImpactCalculator.Result r = calc.compute(g, change, PermImpactService.MAX_ROWS);
        long ms = (System.nanoTime() - t0) / 1_000_000;
        long m1 = rt.totalMemory() - rt.freeMemory();
        System.out.println("[PERM-IMPACT-WORST-SYSADMIN] " + ms + "ms totalRows=" + r.totalRows() + " heapDelta~" + (m1 - m0) / 1_000_000 + "MB");
        // R 이 이미 O 전부에 ADD,SAVE 를 줬으므로 SYSADMIN 은 DEL(·POP)을 더 준다 → 행 수 = 1000 x 1004
        assertThat(r.totalRows()).isEqualTo(1000L * 1004);
        assertThat(r.impacts()).hasSize(PermImpactService.MAX_ROWS);
        assertThat(r.gainUserCnt()).isEqualTo(1000);
        assertThat(r.screenCnt()).isEqualTo(1004);
        assertThat(r.impacts().get(0).userId()).isEqualTo("u0000");
        assertThat(ms).isLessThanOrEqualTo(2000);
    }

    // ────────────────────────────────────────────────────────────────
    // 규칙 경계(실제 계산기)
    // ────────────────────────────────────────────────────────────────

    private static PermGraph with(PermGraph g, Map<String, Set<String>> ug, Map<String, GroupMeta> groups,
                                  Map<String, RoleMeta> roles, Map<String, ObjMeta> objs) {
        return new PermGraph(ug == null ? g.userGroups() : ug, g.groupRoles(), roles == null ? g.roles() : roles,
                groups == null ? g.groups() : groups, objs == null ? g.objects() : objs, g.rolePerms(), g.menus());
    }

    @Test
    @DisplayName("USER_GRP DEL 로 마지막 그룹을 빼면 그 사람의 action 을 모두 잃는다")
    void lastGroupDel() {
        PermImpactCalculator.Result r = calc.compute(small(),
                List.of(PermChange.link(PermChange.USER_GRP, "u3", "G2", PermChange.DEL)));
        assertThat(r.candidates()).containsExactly("u3");
        assertThat(r.loseUserCnt()).isEqualTo(1);
        assertThat(r.gainUserCnt()).isZero();
        assertThat(r.impacts()).hasSize(1);
        assertThat(r.impacts().get(0).objectId()).isEqualTo("O2");
        assertThat(r.impacts().get(0).lost()).containsExactly("ADD");
        assertThat(r.screenCnt()).isEqualTo(1);
    }

    @Test
    @DisplayName("GRP_ROLE ADD SYSADMIN — 쓰는 오브젝트 전부의 (BTN∪POPUP) 중 없던 것을 얻는다, SCREEN_CNT = 쓰는 오브젝트 수")
    void sysadminGrant() {
        Map<String, RoleMeta> roles = new LinkedHashMap<>(small().roles());
        roles.put("SYSADMIN", new RoleMeta("SYSADMIN", "Y", null, null));
        PermGraph g = with(small(), null, null, roles, null);
        PermImpactCalculator.Result r = calc.compute(g,
                List.of(PermChange.link(PermChange.GRP_ROLE, "G2", "SYSADMIN", PermChange.ADD)));
        assertThat(r.candidates()).containsExactly("u3");
        assertThat(r.screenCnt()).isEqualTo(3);            // O1·O2·O3 전부
        assertThat(r.gainUserCnt()).isEqualTo(1);
        assertThat(r.impacts()).extracting(UserImpact::objectId).containsExactly("O1", "O2", "O3");
        assertThat(r.impacts().get(0).gained()).containsExactlyInAnyOrder("ADD", "SAVE", "DEL", "POP");
    }

    @Test
    @DisplayName("SYSADMIN 역할의 ROLE_OBJ 변경은 영향 0 (퍼미션 행을 보지 않는다)")
    void sysadminRoleObj() {
        Map<String, RoleMeta> roles = new LinkedHashMap<>(small().roles());
        roles.put("SYSADMIN", new RoleMeta("SYSADMIN", "Y", null, null));
        Map<String, Set<String>> gr = new LinkedHashMap<>(small().groupRoles());
        gr.put("G2", Set.of("R2", "SYSADMIN"));
        PermGraph base = small();
        PermGraph g = new PermGraph(base.userGroups(), gr, roles, base.groups(), base.objects(), base.rolePerms(), List.of());
        PermImpactCalculator.Result r = calc.compute(g,
                List.of(PermChange.roleObj("SYSADMIN", "O1", PermChange.ADD, "ADD", "")));
        assertThat(r.impacts()).isEmpty();
        assertThat(r.screenCnt()).isZero();
        assertThat(r.gainUserCnt()).isZero();
    }

    @Test
    @DisplayName("USE_TP N 그룹으로 들어가도 영향 0")
    void unusedGroup() {
        Map<String, GroupMeta> groups = new LinkedHashMap<>(small().groups());
        groups.put("G1", new GroupMeta("G1", "N", null, null));
        PermGraph g = with(small(), null, groups, null, null);
        PermImpactCalculator.Result r = calc.compute(g,
                List.of(PermChange.link(PermChange.USER_GRP, "u4", "G1", PermChange.ADD)));
        assertThat(r.impacts()).isEmpty();
        assertThat(r.gainUserCnt()).isZero();
        assertThat(r.screenCnt()).isZero();
    }

    @Test
    @DisplayName("기간이 끝난 역할의 ROLE_OBJ 변경은 영향 0")
    void expiredRole() {
        Map<String, RoleMeta> roles = new LinkedHashMap<>(small().roles());
        roles.put("R1", new RoleMeta("R1", "Y", null, java.time.LocalDateTime.of(2026, 1, 1, 0, 0)));
        PermGraph g = with(small(), null, null, roles, null);
        PermImpactCalculator.Result r = calc.compute(g,
                List.of(PermChange.roleObj("R1", "O1", PermChange.UPD, "SAVE,DEL", "")));
        assertThat(r.impacts()).isEmpty();
        assertThat(r.screenCnt()).isZero();
    }

    @Test
    @DisplayName("USE_TP N 오브젝트에 ROLE_OBJ ADD — 보임도 안 바뀐다")
    void unusedObject() {
        Map<String, ObjMeta> objs = new LinkedHashMap<>(small().objects());
        objs.put("O3", new ObjMeta("O3", "mcm", "N", List.of("ADD"), List.of(), null, null));
        PermGraph g = with(small(), null, null, null, objs);
        PermImpactCalculator.Result r = calc.compute(g,
                List.of(PermChange.roleObj("R1", "O3", PermChange.ADD, "ADD", "")));
        assertThat(r.impacts()).isEmpty();
        assertThat(r.screenCnt()).isZero();
    }

    @Test
    @DisplayName("limit — 건수는 전체, 줄은 앞 limit 줄(사용자·오브젝트 순)")
    void limitRows() {
        PermImpactCalculator.Result r = calc.compute(small(),
                List.of(PermChange.roleObj("R1", "O1", PermChange.UPD, "SAVE,DEL", "")), 1);
        assertThat(r.totalRows()).isEqualTo(2);
        assertThat(r.impacts()).hasSize(1);
        assertThat(r.impacts().get(0).userId()).isEqualTo("u1");
        assertThat(r.gainUserCnt()).isEqualTo(2);
    }
}
