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

/** perm-bench r1 — {@link DefaultImpactCalculator} 시험. 변경 적용은 c1 의 {@link PermGraph#applyChanges} 를 쓴다. */
class DefaultImpactCalculatorTest {

    private final Clock clock = Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
    private final DefaultPermResolver resolver = new DefaultPermResolver(clock);
    private final DefaultImpactCalculator impact = new DefaultImpactCalculator(clock);

    private static PermChange ch(String tp, String k1, String k2, String op, String btn, String popup) {
        return new PermChange(tp, k1, k2, op, btn, popup);
    }

    private PermGraph base() {
        return graph().user("u1", "G1").user("u2", "G2")
                .group("G1", "R1").group("G2", "R2")
                .obj("objA", "search,save", "openPop").obj("objB", "search", "")
                .perm("R1", "objA", "search", "").perm("R2", "objB", "search", "").build();
    }

    @Test
    @DisplayName("applyChanges 결과를 resolver 가 그대로 읽는다(원본 불변)")
    void pureAndOrdered() {
        PermGraph before = base();
        PermGraph after = before.applyChanges(List.of(
                ch("ROLE_OBJ", "R1", "objA", "UPD", "search,save", null),
                ch("USER_GRP", "u1", "G2", "ADD", null, null),
                ch("GRP_ROLE", "G2", "R2", "DEL", null, null),
                ch("ROLE_OBJ", "R2", "objA", "ADD", "search", "openPop")));

        assertThat(resolver.actionsOf(before, "u1")).isEqualTo(Map.of("objA", Set.of("search")));
        assertThat(resolver.actionsOf(after, "u1")).isEqualTo(Map.of("objA", Set.of("search", "save")));
        assertThat(resolver.actionsOf(after, "u2")).isEmpty();
        assertThat(after.groupRoles()).doesNotContainKey("G2");
    }



    @Test
    @DisplayName("impact: 얻은 값·잃은 값을 사람×오브젝트로, userId·objectId 순")
    void diffGainLoss() {
        PermGraph before = base();
        PermGraph after = before.applyChanges(List.of(
                ch("ROLE_OBJ", "R1", "objA", "UPD", "save", "openPop"),
                ch("USER_GRP", "u2", "G1", "ADD", null, null),
                ch("USER_GRP", "u3", "G2", "ADD", null, null)));

        List<UserImpact> d = impact.diff(before, after);

        assertThat(d).extracting(UserImpact::userId, UserImpact::objectId).containsExactly(
                org.assertj.core.groups.Tuple.tuple("u1", "objA"),
                org.assertj.core.groups.Tuple.tuple("u2", "objA"),
                org.assertj.core.groups.Tuple.tuple("u3", "objB"));
        assertThat(d.get(0).gained()).containsExactlyInAnyOrder("save", "openPop");
        assertThat(d.get(0).lost()).containsExactly("search");
        assertThat(d.get(1).gained()).containsExactlyInAnyOrder("save", "openPop");
        assertThat(d.get(1).lost()).isEmpty();
        assertThat(d.get(2).gained()).containsExactly("search");
    }

    @Test
    @DisplayName("impact: 오브젝트 허용 값 빼기(그래프 objects 교체)도 잃는 값으로 잡힌다")
    void objectValueRemoved() {
        PermGraph before = graph().user("u1", "G1").group("G1", "R1")
                .obj("objA", "search,save", "").perm("R1", "objA", "search,save", "").build();
        PermGraph after = graph().user("u1", "G1").group("G1", "R1")
                .obj("objA", "search", "").perm("R1", "objA", "search,save", "").build();

        List<UserImpact> d = impact.diff(before, after);
        assertThat(d).hasSize(1);
        assertThat(d.get(0).lost()).containsExactly("save");
    }

    @Test
    @DisplayName("impact: 변경 없음 = 빈 목록")
    void noChange() {
        assertThat(impact.diff(base(), base())).isEmpty();
    }

    @Test
    @DisplayName("impact: 역할 1개 × 사람 1,000명 표본이 빠르다(목표 b3 ≤ 2초의 계산 부분)")
    void manyUsers() {
        GraphFixture f = graph().group("G1", "R1");
        for (int i = 0; i < 300; i++) f.obj("obj" + i, "search,save,delete", "openPop");
        for (int i = 0; i < 300; i++) f.perm("R1", "obj" + i, "search", "");
        for (int u = 0; u < 1000; u++) f.user("u" + u, "G1");
        PermGraph before = f.build();
        PermGraph after = before.applyChanges(List.of(ch("ROLE_OBJ", "R1", "obj0", "UPD", "search,save", null)));

        long t0 = System.nanoTime();
        List<UserImpact> d = impact.diff(before, after);
        long ms = (System.nanoTime() - t0) / 1_000_000;

        assertThat(d).hasSize(1000);
        assertThat(ms).isLessThan(2000);
    }

    @Test
    @DisplayName("impact: 뒤 그래프에서 오브젝트를 끄면 퍼미션 역할·SYSADMIN 모두 잃는다")
    void objectDeactivated() {
        PermGraph before = graph().user("u1", "G1").user("adm", "GA").group("G1", "R1").group("GA", "SYSADMIN")
                .obj("objA", "search", "openPop").perm("R1", "objA", "search", "").build();
        PermGraph after = graph().user("u1", "G1").user("adm", "GA").group("G1", "R1").group("GA", "SYSADMIN")
                .obj("objA", "mcm", "N", null, null, "search", "openPop").perm("R1", "objA", "search", "").build();
        List<UserImpact> d = impact.diff(before, after);
        assertThat(d).extracting(UserImpact::userId).containsExactly("adm", "u1");
        assertThat(d.get(0).lost()).containsExactlyInAnyOrder("search", "openPop");
        assertThat(d.get(1).lost()).containsExactly("search");
    }

    @Test
    @DisplayName("impact: 효과가 빈 행의 추가·삭제(보임만 바뀜)는 줄을 만들지 않는다(action 차이만 센다)")
    void visibilityOnly() {
        PermGraph before = graph().user("u1", "G1").group("G1", "R1").obj("objA", "search", "").build();
        PermGraph after = before.applyChanges(List.of(PermChange.roleObj("R1", "objA", PermChange.ADD, "", "")));
        assertThat(resolver.visibleObjects(after, "u1")).containsExactly("objA");
        assertThat(impact.diff(before, after)).isEmpty();
    }
}
