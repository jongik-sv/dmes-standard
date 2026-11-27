package com.dongkuk.dmes.mcm.security.perm.impl;

import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.UserImpact;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.dongkuk.dmes.mcm.security.perm.impl.GraphFixture.NOW;
import static com.dongkuk.dmes.mcm.security.perm.impl.GraphFixture.graph;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * perm-bench 성능 사례(조정자 지시, 2026-11-27) — 작업대 영향 계산의 계산 부분.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 사람 1,000명이 모두 다른 그룹·역할 조합(사람마다 개인 역할 1개 + 공용 역할 3개), 오브젝트 1,004개, 역할 1건 변경.
 * 사람마다 visibleObjects(전·후)·actionsOf(후) 를 부르고 diff 를 한 번 부른다(작업대 impact 와 같은 호출). 목표 2초 안(데움 1회 뒤 측정).
 */
class PermPerfCaseTest {

    private static final int USERS = 1000;
    private static final int OBJECTS = 1004;
    private static final int SHARED_ROLES = 40;

    private final Clock clock = Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
    private final DefaultPermResolver resolver = new DefaultPermResolver(clock);
    private final DefaultImpactCalculator impact = new DefaultImpactCalculator(clock);

    private static PermGraph worstCase() {
        GraphFixture f = graph();
        for (int o = 0; o < OBJECTS; o++) f.obj("obj" + o, "search,save,delete,approve", "openPop");
        for (int r = 0; r < SHARED_ROLES; r++) {
            for (int k = 0; k < 400; k++) f.perm("R" + r, "obj" + ((r * 25 + k) % OBJECTS), "search,save", "openPop");
        }
        for (int u = 0; u < USERS; u++) {
            String g = "G" + u;
            f.group(g, "R" + (u % SHARED_ROLES), "R" + ((u * 7 + 3) % SHARED_ROLES), "R" + ((u * 13 + 5) % SHARED_ROLES), "P" + u);
            for (int k = 0; k < 5; k++) f.perm("P" + u, "obj" + ((u + k * 200) % OBJECTS), "delete", "");
            f.user("u" + u, g, "G" + ((u + 1) % USERS));
        }
        return f.build();
    }

    @Test
    @DisplayName("1,000명 모두 다른 조합 × 오브젝트 1,004 × 역할 1건 변경: 사람별 visibleObjects·actionsOf + diff 가 2초 안")
    void worstCaseUnderTwoSeconds() {
        PermGraph before = worstCase();
        PermGraph after = before.applyChanges(List.of(
                PermChange.roleObj("R0", "obj0", PermChange.UPD, "search,save,approve", "openPop")));

        // 데움 1회(JIT) — 같은 규모의 다른 그래프로 돌려 이 측정의 계산기 재사용에 끼지 않게 한다
        PermGraph warm = worstCase();
        for (int u = 0; u < USERS; u += 3) resolver.visibleObjects(warm, "u" + u);
        impact.diff(warm, warm.applyChanges(List.of(PermChange.roleObj("R1", "obj1", PermChange.DEL, null, null))));

        long best = Long.MAX_VALUE;
        List<UserImpact> d = null;
        int screens = 0;
        // 두 번 재어 짧은 쪽(모듈 전체 시험이 같이 돌 때의 흔들림 줄이기). 그래프는 매번 새로 — 계산기 재사용이 회차 사이에 끼지 않게
        for (int round = 0; round < 2; round++) {
        PermGraph b0 = round == 0 ? before : worstCase();
        PermGraph a0 = round == 0 ? after : b0.applyChanges(List.of(
                PermChange.roleObj("R0", "obj0", PermChange.UPD, "search,save,approve", "openPop")));
        long t0 = System.nanoTime();
        screens = 0;
        for (int u = 0; u < USERS; u++) {
            String userId = "u" + u;
            Set<String> was = resolver.visibleObjects(b0, userId);
            Set<String> now = resolver.visibleObjects(a0, userId);
            if (!was.equals(now)) screens++;
            Map<String, Set<String>> actions = resolver.actionsOf(a0, userId);
            assertThat(actions).isNotEmpty();
        }
        d = impact.diff(b0, a0);
        best = Math.min(best, (System.nanoTime() - t0) / 1_000_000);
        }
        long ms = best;
        System.out.println("[perm-perf] users=" + USERS + " objects=" + OBJECTS + " impacts=" + d.size() + " ms=" + ms);

        // R0 은 u%40==0 · (u*7+3)%40==0 · (u*13+5)%40==0 인 사람 그룹, 그리고 그 다음 사람(G(u+1) 을 같이 가짐)에게 닿는다
        assertThat(d).isNotEmpty();
        assertThat(d).allSatisfy(i -> {
            assertThat(i.objectId()).isEqualTo("obj0");
            assertThat(i.gained()).containsExactly("approve");
            assertThat(i.lost()).isEmpty();
        });
        assertThat(screens).isZero();
        assertThat(ms).isLessThan(2000);
    }

    /** 비교 기준 — 메모·재사용 없는 단순 계산(성능 작업 전 알고리즘). 사람마다 역할을 직접 펼쳐 효과를 합친다. */
    private static Map<String, Set<String>> naiveEffect(PermGraph g, String userId) {
        PermEvaluator ev = new PermEvaluator(g, NOW);
        Map<String, Set<String>> out = new java.util.TreeMap<>();
        for (String group : g.userGroups().getOrDefault(userId, Set.of())) {
            if (!ev.groupActive(group)) continue;
            for (String role : g.groupRoles().getOrDefault(group, Set.of())) {
                if (!ev.roleActive(role)) continue;
                ev.effectOfRole(role).forEach((obj, acts) -> out.computeIfAbsent(obj, k -> new java.util.TreeSet<>()).addAll(acts));
            }
        }
        return out;
    }

    @Test
    @DisplayName("재사용·후보 좁히기가 결과를 바꾸지 않는다: 단순 계산으로 만든 전체 영향 목록·actionsOf·visibleObjects 와 같다")
    void sameAsNaive() {
        PermGraph before = worstCase();
        PermGraph after = before.applyChanges(List.of(
                PermChange.roleObj("R3", "obj100", PermChange.DEL, null, null),
                PermChange.roleObj("R5", "obj130", PermChange.UPD, "search", ""),
                PermChange.link(PermChange.GRP_ROLE, "G7", "R39", PermChange.ADD),
                PermChange.link(PermChange.USER_GRP, "u9", "G7", PermChange.DEL)));

        List<String> expected = new java.util.ArrayList<>();
        for (int u = 0; u < USERS; u++) {
            String userId = "u" + u;
            Map<String, Set<String>> eb = naiveEffect(before, userId);
            Map<String, Set<String>> ea = naiveEffect(after, userId);
            assertThat(resolver.visibleObjects(after, userId)).containsExactlyInAnyOrderElementsOf(ea.keySet());
            Map<String, Set<String>> nonEmpty = new java.util.HashMap<>();
            ea.forEach((k, v) -> { if (!v.isEmpty()) nonEmpty.put(k, v); });
            assertThat(resolver.actionsOf(after, userId)).isEqualTo(nonEmpty);
            Set<String> objs = new java.util.TreeSet<>(eb.keySet());
            objs.addAll(ea.keySet());
            for (String obj : objs) {
                Set<String> was = eb.getOrDefault(obj, Set.of());
                Set<String> now = ea.getOrDefault(obj, Set.of());
                Set<String> gained = new java.util.TreeSet<>(now); gained.removeAll(was);
                Set<String> lost = new java.util.TreeSet<>(was); lost.removeAll(now);
                if (!gained.isEmpty() || !lost.isEmpty()) expected.add(userId + "|" + obj + "|" + gained + "|" + lost);
            }
        }
        List<String> actual = impact.diff(before, after).stream()
                .map(i -> i.userId() + "|" + i.objectId() + "|" + new java.util.TreeSet<>(i.gained()) + "|" + new java.util.TreeSet<>(i.lost()))
                .toList();
        assertThat(actual).containsExactlyInAnyOrderElementsOf(expected);
        assertThat(expected).anyMatch(x -> !x.endsWith("|[]")).anyMatch(x -> x.contains("|[]|"));
    }

    @Test
    @DisplayName("activeRolesOf = 쓰는 그룹·역할만, 역할 ID 정렬")
    void activeRolesOfPublic() {
        PermGraph g = graph().user("u1", "G1", "G2").group("G1", "R_B", "R_A").group("G2", "R_OFF")
                .roleMeta("R_OFF", "N", null, null).build();
        assertThat(resolver.activeRolesOf(g, "u1")).containsExactly("R_A", "R_B");
        assertThat(resolver.activeRolesOf(g, "nobody")).isEmpty();
    }
}
