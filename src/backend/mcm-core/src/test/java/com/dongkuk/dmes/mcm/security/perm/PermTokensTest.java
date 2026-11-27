package com.dongkuk.dmes.mcm.security.perm;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: {@link PermTokens} 와 {@link PermGraph#applyChanges} 단위 테스트.
 */
class PermTokensTest {

    // ---------- parse / join / notIn ----------

    @Test
    @DisplayName("parse: trim·빈 값 제거·중복 제거·처음 순서 유지")
    void parse() {
        assertThat(PermTokens.parse(" b , a,, b ,c ,")).containsExactly("b", "a", "c");
        assertThat(PermTokens.parse("  , ,")).isEmpty();
        assertThat(PermTokens.parse("")).isEmpty();
        assertThat(PermTokens.parse(null)).isEmpty();
    }

    @Test
    @DisplayName("join: 공백 없이 쉼표, 빈 값은 빈 문자열")
    void join() {
        assertThat(PermTokens.join(List.of("a", "b", "c"))).isEqualTo("a,b,c");
        assertThat(PermTokens.join(List.of())).isEmpty();
        assertThat(PermTokens.join(null)).isEmpty();
    }

    @Test
    @DisplayName("notIn: 허용 밖 값만, 순서 유지")
    void notIn() {
        assertThat(PermTokens.notIn(List.of("c", "a", "x", "b"), List.of("a", "b"))).containsExactly("c", "x");
        assertThat(PermTokens.notIn(List.of("a"), List.of("a"))).isEmpty();
        assertThat(PermTokens.notIn(List.of("a"), null)).containsExactly("a");
        assertThat(PermTokens.notIn(null, List.of("a"))).isEmpty();
    }

    // ---------- readPreset ----------

    @Test
    @DisplayName("readPreset: D18 이름 규칙 각각")
    void readPresetRules() {
        List<String> all = List.of("search", "searchCmPerm", "find", "findById", "get", "getOne", "list", "listAll",
                "lov", "lovUser", "userLov", "searchObjectLov", "view", "query");
        assertThat(PermTokens.readPreset(all)).containsExactlyElementsOf(all);
    }

    @Test
    @DisplayName("readPreset: 쓰기 action 은 제외, allowed 순서 유지")
    void readPresetNegatives() {
        List<String> allowed = List.of("save", "searchX", "delete", "view", "register", "Search", "viewer", "queryAll",
                "update", "lov");
        assertThat(PermTokens.readPreset(allowed)).containsExactly("searchX", "view", "lov");
        assertThat(PermTokens.readPreset(List.of("save", "delete"))).isEmpty();
        assertThat(PermTokens.readPreset(null)).isEmpty();
    }

    // ---------- applyChanges ----------

    private static PermGraph base() {
        Map<String, ObjMeta> objs = Map.of("O1", new ObjMeta("O1", "mcm", "Y", List.of("a", "b"), List.of("p"), null, null));
        Map<String, Map<String, RolePerm>> perms = Map.of("R1",
                Map.of("O1", new RolePerm("R1", "O1", List.of("a"), List.of(), "D")));
        return new PermGraph(Map.of("U1", Set.of("G1")), Map.of("G1", Set.of("R1")),
                Map.of(), Map.of(), objs, perms, List.of());
    }

    @Test
    @DisplayName("USER_GRP ADD/DEL")
    void userGrp() {
        PermGraph g = base().applyChanges(List.of(
                PermChange.link(PermChange.USER_GRP, "U1", "G2", PermChange.ADD),
                PermChange.link(PermChange.USER_GRP, "U2", "G1", PermChange.ADD),
                PermChange.link(PermChange.USER_GRP, "U1", "G1", PermChange.DEL)));
        assertThat(g.userGroups().get("U1")).containsExactly("G2");
        assertThat(g.userGroups().get("U2")).containsExactly("G1");
    }

    @Test
    @DisplayName("GRP_ROLE ADD/DEL, 없는 것 DEL 은 무시")
    void grpRole() {
        PermGraph g = base().applyChanges(List.of(
                PermChange.link(PermChange.GRP_ROLE, "G1", "R2", PermChange.ADD),
                PermChange.link(PermChange.GRP_ROLE, "G1", "R1", PermChange.DEL),
                PermChange.link(PermChange.GRP_ROLE, "GX", "RX", PermChange.DEL)));
        assertThat(g.groupRoles().get("G1")).containsExactly("R2");
        assertThat(g.groupRoles()).doesNotContainKey("GX");
    }

    @Test
    @DisplayName("ROLE_OBJ ADD/UPD 덮어쓰기(csv 파싱), DEL 제거")
    void roleObj() {
        PermGraph g = base().applyChanges(List.of(
                PermChange.roleObj("R1", "O1", PermChange.UPD, " b, a ,b", "p"),
                PermChange.roleObj("R2", "O1", PermChange.ADD, "a", null)));
        RolePerm r1 = g.rolePerms().get("R1").get("O1");
        assertThat(r1.btnPerm()).containsExactly("b", "a");
        assertThat(r1.popupPerm()).containsExactly("p");
        assertThat(r1.dataPerm()).isEqualTo("D");
        assertThat(g.rolePerms().get("R2").get("O1").btnPerm()).containsExactly("a");

        PermGraph g2 = g.applyChanges(List.of(
                PermChange.roleObj("R1", "O1", PermChange.DEL, null, null),
                PermChange.roleObj("R9", "O9", PermChange.DEL, null, null)));
        assertThat(g2.rolePerms()).doesNotContainKey("R1");
        assertThat(g2.rolePerms()).doesNotContainKey("R9");
        assertThat(g2.rolePerms()).containsKey("R2");
    }

    @Test
    @DisplayName("ADD 가 기존 ROLE_OBJ 를 덮어쓴다")
    void roleObjAddOverwrites() {
        PermGraph g = base().applyChanges(List.of(PermChange.roleObj("R1", "O1", PermChange.ADD, "b", "")));
        assertThat(g.rolePerms().get("R1").get("O1").btnPerm()).containsExactly("b");
        assertThat(g.rolePerms().get("R1").get("O1").popupPerm()).isEmpty();
    }

    @Test
    @DisplayName("순수성: 원본 불변, 목록 순서대로 적용")
    void pureAndOrdered() {
        PermGraph before = base();
        PermGraph after = before.applyChanges(List.of(
                PermChange.link(PermChange.USER_GRP, "U1", "G2", PermChange.ADD),
                PermChange.link(PermChange.USER_GRP, "U1", "G2", PermChange.DEL),
                PermChange.link(PermChange.USER_GRP, "U1", "G3", PermChange.DEL),
                PermChange.link(PermChange.USER_GRP, "U1", "G3", PermChange.ADD)));
        assertThat(before).isEqualTo(base());
        assertThat(after.userGroups().get("U1")).containsExactlyInAnyOrder("G1", "G3");
        assertThat(before.applyChanges(List.of())).isEqualTo(before);
        assertThat(before.applyChanges(null)).isEqualTo(before);
    }
}
