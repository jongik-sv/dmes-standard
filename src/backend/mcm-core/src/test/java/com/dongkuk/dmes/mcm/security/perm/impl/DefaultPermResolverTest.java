package com.dongkuk.dmes.mcm.security.perm.impl;

import com.dongkuk.dmes.mcm.security.perm.ButtonVerdict;
import com.dongkuk.dmes.mcm.security.perm.DenyReason;
import com.dongkuk.dmes.mcm.security.perm.Explain;
import com.dongkuk.dmes.mcm.security.perm.ExplainPath;
import com.dongkuk.dmes.mcm.security.perm.GrantReason;
import com.dongkuk.dmes.mcm.security.perm.MenuNode;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.dongkuk.dmes.mcm.security.perm.impl.GraphFixture.NOW;
import static com.dongkuk.dmes.mcm.security.perm.impl.GraphFixture.graph;
import static org.assertj.core.api.Assertions.assertThat;

/** perm-bench r1 — {@link DefaultPermResolver} 사례 시험(decompose §0.2 · D13~D15 · D35). */
class DefaultPermResolverTest {

    private final DefaultPermResolver resolver = new DefaultPermResolver(
            Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault()));

    private static ButtonVerdict btn(Explain e, String code) {
        return e.buttons().stream().filter(b -> b.code().equals(code)).findFirst().orElseThrow();
    }

    @Nested
    @DisplayName("효과 = (perm.BTN ∩ obj.BTN) ∪ (perm.POPUP ∩ obj.POPUP)")
    class Effect {
        @Test
        @DisplayName("기본: 교집합의 합집합")
        void basic() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1")
                    .obj("objA", "search,save,delete", "openPop")
                    .perm("R1", "objA", "search,save", "openPop").build();

            assertThat(resolver.actionsOf(g, "u1")).isEqualTo(Map.of("objA", Set.of("search", "save", "openPop")));
        }

        @Test
        @DisplayName("BTN 칸 토큰은 POPUP 허용 값으로 통하지 않는다(칸별 교집합)")
        void kindsDoNotCross() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1")
                    .obj("objA", "search", "openPop")
                    .perm("R1", "objA", "search,openPop", "").build();

            assertThat(resolver.actionsOf(g, "u1").get("objA")).containsExactly("search");
        }

        @Test
        @DisplayName("오브젝트에서 빠진 값 = 퍼미션에 남아도 계산에서 빠지고, explain 은 NOT_IN_OBJ")
        void removedFromObject() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1")
                    .obj("objA", "search", "")
                    .perm("R1", "objA", "search,save", "").build();

            assertThat(resolver.actionsOf(g, "u1").get("objA")).containsExactly("search");
            ButtonVerdict save = btn(resolver.explain(g, "u1", "objA"), "save");
            assertThat(save.granted()).isFalse();
            assertThat(save.denyReason()).isEqualTo(DenyReason.NOT_IN_OBJ);
            assertThat(save.viaRoles()).containsExactly("R1");
        }

        @Test
        @DisplayName("여러 그룹이 같은 역할 = 한 번만 세고, explain 은 두 그룹을 모두 보인다")
        void sameRoleTwoGroups() {
            PermGraph g = graph().user("u1", "G1", "G2").group("G1", "R1").group("G2", "R1")
                    .obj("objA", "search", "").perm("R1", "objA", "search", "").build();

            assertThat(resolver.actionsOf(g, "u1")).isEqualTo(Map.of("objA", Set.of("search")));
            ButtonVerdict v = btn(resolver.explain(g, "u1", "objA"), "search");
            assertThat(v.granted()).isTrue();
            assertThat(v.grantReason()).isEqualTo(GrantReason.PERM);
            assertThat(v.viaRoles()).containsExactly("R1");
            assertThat(v.viaGroups()).containsExactly("G1", "G2");
        }

        @Test
        @DisplayName("빈 BTN 행 = action 은 없지만 오브젝트는 보인다(행 있음 = 메뉴 보임)")
        void emptyBtnRow() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1")
                    .obj("objA", "search", "").perm("R1", "objA", "", "").build();

            assertThat(resolver.actionsOf(g, "u1")).isEmpty();
            assertThat(resolver.visibleObjects(g, "u1")).containsExactly("objA");
            assertThat(btn(resolver.explain(g, "u1", "objA"), "search").denyReason()).isEqualTo(DenyReason.NO_PERM);
        }

        @Test
        @DisplayName("그래프에 없는 오브젝트를 가리키는 행 = 빠진다")
        void danglingObject() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1")
                    .perm("R1", "ghost", "search", "").build();

            assertThat(resolver.actionsOf(g, "u1")).isEmpty();
            assertThat(resolver.visibleObjects(g, "u1")).isEmpty();
        }
    }

    @Nested
    @DisplayName("SYSADMIN = 퍼미션 행 없이 쓰는 오브젝트 전부 × (BTN ∪ POPUP)")
    class Sysadmin {
        @Test
        void allActiveObjects() {
            PermGraph g = graph().user("admin", "G_ADM").group("G_ADM", "SYSADMIN")
                    .obj("objA", "search,save", "openPop")
                    .obj("objOff", "mcm", "N", null, null, "search", "")
                    .obj("objB", "search", "").build();

            assertThat(resolver.actionsOf(g, "admin")).isEqualTo(Map.of(
                    "objA", Set.of("search", "save", "openPop"), "objB", Set.of("search")));
            ButtonVerdict v = btn(resolver.explain(g, "admin", "objA"), "openPop");
            assertThat(v.granted()).isTrue();
            assertThat(v.grantReason()).isEqualTo(GrantReason.SYSADMIN);
            assertThat(resolver.objectsOfRole(g, "SYSADMIN")).containsExactlyInAnyOrder("objA", "objB");
        }

        @Test
        @DisplayName("ROLE_SYSADMIN 도 같다")
        void alias() {
            PermGraph g = graph().user("admin", "G").group("G", "ROLE_SYSADMIN").obj("objA", "search", "").build();
            assertThat(resolver.actionsOf(g, "admin")).isEqualTo(Map.of("objA", Set.of("search")));
        }

        @Test
        @DisplayName("SYSADMIN 역할이 사용 안 함이면 특례 없음")
        void sysadminRoleUnused() {
            PermGraph g = graph().user("admin", "G").group("G", "SYSADMIN")
                    .roleMeta("SYSADMIN", "N", null, null).obj("objA", "search", "").build();
            assertThat(resolver.actionsOf(g, "admin")).isEmpty();
            assertThat(btn(resolver.explain(g, "admin", "objA"), "search").denyReason()).isEqualTo(DenyReason.ROLE_UNUSED);
        }

        @Test
        @DisplayName("퍼미션 경로와 SYSADMIN 경로가 같이 있으면 이유 = PERM")
        void permWinsReason() {
            PermGraph g = graph().user("u1", "G1").group("G1", "SYSADMIN", "R1")
                    .obj("objA", "search", "").perm("R1", "objA", "search", "").build();
            ButtonVerdict v = btn(resolver.explain(g, "u1", "objA"), "search");
            assertThat(v.grantReason()).isEqualTo(GrantReason.PERM);
            assertThat(v.viaRoles()).containsExactly("SYSADMIN", "R1");
        }
    }

    @Nested
    @DisplayName("사용 안 함·유효 기간 밖 = 빠짐(D35)")
    class Unused {
        @Test
        void roleUnused() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1").roleMeta("R1", "N", null, null)
                    .obj("objA", "search", "").perm("R1", "objA", "search", "").build();

            assertThat(resolver.actionsOf(g, "u1")).isEmpty();
            assertThat(resolver.visibleObjects(g, "u1")).isEmpty();
            Explain e = resolver.explain(g, "u1", "objA");
            assertThat(btn(e, "search").denyReason()).isEqualTo(DenyReason.ROLE_UNUSED);
            assertThat(e.visible()).isFalse();
            assertThat(e.objectReason()).isEqualTo(DenyReason.ROLE_UNUSED);
        }

        @Test
        void groupUnused() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1").groupMeta("G1", "N", null, null)
                    .obj("objA", "search", "").perm("R1", "objA", "search", "").build();

            assertThat(resolver.actionsOf(g, "u1")).isEmpty();
            assertThat(btn(resolver.explain(g, "u1", "objA"), "search").denyReason()).isEqualTo(DenyReason.GROUP_UNUSED);
        }

        @Test
        void objUnused() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1")
                    .obj("objA", "mcm", "N", null, null, "search", "")
                    .perm("R1", "objA", "search", "").build();

            assertThat(resolver.actionsOf(g, "u1")).isEmpty();
            assertThat(resolver.objectsOfRole(g, "R1")).isEmpty();
            Explain e = resolver.explain(g, "u1", "objA");
            assertThat(btn(e, "search").denyReason()).isEqualTo(DenyReason.OBJ_UNUSED);
            assertThat(e.objectReason()).isEqualTo(DenyReason.OBJ_UNUSED);
        }

        @Test
        @DisplayName("유효 기간: 끝난 역할·아직 시작 안 한 그룹·끝난 오브젝트는 빠지고, 경계 시각은 포함")
        void validity() {
            PermGraph g = graph().user("u1", "G1", "G2", "G3", "G4")
                    .group("G1", "R_EXPIRED").roleMeta("R_EXPIRED", "Y", null, NOW.minusSeconds(1))
                    .group("G2", "R2").groupMeta("G2", "Y", NOW.plusDays(1), null)
                    .group("G3", "R3")
                    .group("G4", "R4").roleMeta("R4", "Y", NOW, NOW)
                    .obj("objA", "a,b,c,d", "")
                    .obj("objOld", "mcm", "Y", null, NOW.minusDays(1), "x", "")
                    .perm("R_EXPIRED", "objA", "a", "").perm("R2", "objA", "b", "")
                    .perm("R3", "objOld", "x", "").perm("R4", "objA", "d", "").build();

            assertThat(resolver.actionsOf(g, "u1")).isEqualTo(Map.of("objA", Set.of("d")));
        }

        @Test
        @DisplayName("메타가 없는 그룹·역할 = 쓰는 것으로 본다")
        void missingMetaActive() {
            PermGraph base = graph().user("u1", "G1").group("G1", "R1")
                    .obj("objA", "search", "").perm("R1", "objA", "search", "").build();
            PermGraph g = new PermGraph(base.userGroups(), base.groupRoles(), Map.of(), Map.of(),
                    base.objects(), base.rolePerms(), base.menus());
            assertThat(resolver.actionsOf(g, "u1")).isEqualTo(Map.of("objA", Set.of("search")));
        }
    }

    @Nested
    @DisplayName("메뉴 표시")
    class Menu {
        @Test
        @DisplayName("숨김 메뉴 = 게이트 action 은 그대로, explain 만 MENU_HIDDEN")
        void hiddenMenu() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1")
                    .obj("objA", "search", "").menu("m1", "objA", false, "Y")
                    .perm("R1", "objA", "search", "").build();

            assertThat(resolver.actionsOf(g, "u1")).isEqualTo(Map.of("objA", Set.of("search")));
            assertThat(resolver.visibleObjects(g, "u1")).containsExactly("objA");
            Explain e = resolver.explain(g, "u1", "objA");
            assertThat(e.visible()).isFalse();
            assertThat(e.objectReason()).isEqualTo(DenyReason.MENU_HIDDEN);
            assertThat(btn(e, "search").granted()).isTrue();
        }

        @Test
        @DisplayName("보이는 메뉴 하나라도 있으면 visible")
        void oneShownMenu() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1")
                    .obj("objA", "search", "").menu("m1", "objA", false, "Y")
                    .menu("m2", "objA", true, "Y").perm("R1", "objA", "search", "").build();
            Explain e = resolver.explain(g, "u1", "objA");
            assertThat(e.visible()).isTrue();
            assertThat(e.objectReason()).isNull();
        }
    }

    @Nested
    @DisplayName("이유 없음 경우")
    class NoRole {
        @Test
        void noRoleAtAll() {
            PermGraph g = graph().user("u1").obj("objA", "search", "").build();
            Explain e = resolver.explain(g, "u1", "objA");
            assertThat(btn(e, "search").denyReason()).isEqualTo(DenyReason.NO_ROLE);
            assertThat(e.objectReason()).isEqualTo(DenyReason.NO_ROLE);
        }

        @Test
        void roleButNoPerm() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1").obj("objA", "search", "").build();
            Explain e = resolver.explain(g, "u1", "objA");
            assertThat(btn(e, "search").denyReason()).isEqualTo(DenyReason.NO_PERM);
            assertThat(btn(e, "search").viaRoles()).isEmpty();
            assertThat(e.objectReason()).isEqualTo(DenyReason.NO_PERM);
        }

        @Test
        @DisplayName("모르는 사람 = 빈 결과")
        void unknownUser() {
            PermGraph g = graph().obj("objA", "search", "").build();
            assertThat(resolver.actionsOf(g, "nobody")).isEmpty();
            assertThat(resolver.visibleObjects(g, null)).isEmpty();
        }
    }

    @Nested
    @DisplayName("계약 세부(c1)")
    class Contract {
        @Test
        @DisplayName("USE_TP 가 Y 가 아니면(빈 값·null 포함) 사용 안 함")
        void useTpNotY() {
            PermGraph g = graph().user("u1", "G1", "G2").group("G1", "R1").group("G2", "R2")
                    .roleMeta("R2", null, null, null)
                    .obj("objA", "mcm", "", null, null, "search", "")
                    .obj("objB", "search", "")
                    .perm("R1", "objA", "search", "").perm("R2", "objB", "search", "").build();

            assertThat(resolver.actionsOf(g, "u1")).isEmpty();
            assertThat(btn(resolver.explain(g, "u1", "objB"), "search").denyReason()).isEqualTo(DenyReason.ROLE_UNUSED);
        }

        @Test
        @DisplayName("paths = 쓰는 경로만, 토큰은 효과 값. 사용 안 함 경로는 paths 에 없고 viaRoles 로만 보인다")
        void paths() {
            PermGraph g = graph().user("u1", "G1", "G2").group("G1", "R1").group("G2", "R2")
                    .groupMeta("G2", "N", null, null)
                    .obj("objA", "search,save", "openPop")
                    .perm("R1", "objA", "search,gone", "openPop").perm("R2", "objA", "save", "").build();

            Explain e = resolver.explain(g, "u1", "objA");
            assertThat(e.visible()).isTrue();
            assertThat(e.paths()).containsExactly(new ExplainPath("G1", "R1", java.util.List.of("search"), java.util.List.of("openPop")));
            ButtonVerdict save = btn(e, "save");
            assertThat(save.granted()).isFalse();
            assertThat(save.denyReason()).isEqualTo(DenyReason.GROUP_UNUSED);
            assertThat(save.viaGroups()).containsExactly("G2");
            assertThat(btn(e, "gone").kind()).isEqualTo(ButtonVerdict.Kind.BTN);
            assertThat(btn(e, "openPop").kind()).isEqualTo(ButtonVerdict.Kind.POPUP);
        }

        @Test
        @DisplayName("SYSADMIN 경로 토큰 = 오브젝트 BTN·POPUP 전부")
        void sysadminPath() {
            PermGraph g = graph().user("a", "G").group("G", "ROLE_SYSADMIN").obj("objA", "search,save", "openPop").build();
            assertThat(resolver.explain(g, "a", "objA").paths())
                    .containsExactly(new ExplainPath("G", "ROLE_SYSADMIN", java.util.List.of("search", "save"), java.util.List.of("openPop")));
        }

        @Test
        @DisplayName("이 오브젝트를 가리키는 메뉴가 없으면(팝업 오브젝트 등) visible")
        void noMenuNode() {
            PermGraph base = graph().user("u1", "G1").group("G1", "R1")
                    .obj("objA", "search", "").perm("R1", "objA", "search", "").build();
            PermGraph g = new PermGraph(base.userGroups(), base.groupRoles(), base.roles(), base.groups(),
                    base.objects(), base.rolePerms(), java.util.List.of());
            Explain e = resolver.explain(g, "u1", "objA");
            assertThat(e.visible()).isTrue();
            assertThat(e.objectReason()).isNull();
        }

        @Test
        @DisplayName("거절되면 paths 는 비고, grantReason·denyReason 은 하나만 찬다")
        void exclusiveReasons() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1").obj("objA", "search", "").build();
            Explain e = resolver.explain(g, "u1", "objA");
            assertThat(e.paths()).isEmpty();
            assertThat(btn(e, "search").grantReason()).isNull();
        }
    }

    @Nested
    @DisplayName("리뷰 보강")
    class ReviewCases {
        @Test
        @DisplayName("끝 값이 자정(날짜만 저장) = 그날 끝까지 쓴다, 다음 날 0시부터 빠진다")
        void endDateInclusive() {
            PermGraph g = graph().user("u1", "G1", "G2").group("G1", "R1").group("G2", "R2")
                    .roleMeta("R1", "Y", null, NOW.toLocalDate().atStartOfDay())
                    .roleMeta("R2", "Y", null, NOW.toLocalDate().minusDays(1).atStartOfDay())
                    .obj("objA", "a,b", "").perm("R1", "objA", "a", "").perm("R2", "objA", "b", "").build();
            assertThat(resolver.actionsOf(g, "u1")).isEqualTo(Map.of("objA", Set.of("a")));
        }

        @Test
        @DisplayName("조상 폴더가 숨김·사용 안 함이어도 explain 은 보임(줄마다 숨김 — 런타임·메뉴 트리와 같은 답), 게이트도 그대로")
        void hiddenParentFolder() {
            PermGraph base = graph().user("u1", "G1").group("G1", "R1")
                    .obj("objA", "search", "").perm("R1", "objA", "search", "").build();
            List<MenuNode> menus = List.of(
                    new MenuNode("root", null, null, true, "Y"),
                    new MenuNode("fold", "root", null, true, "N"),
                    new MenuNode("leaf", "fold", "objA", true, "Y"));
            PermGraph g = new PermGraph(base.userGroups(), base.groupRoles(), base.roles(), base.groups(),
                    base.objects(), base.rolePerms(), menus);
            Explain e = resolver.explain(g, "u1", "objA");
            assertThat(e.visible()).isTrue();
            assertThat(e.objectReason()).isNull();
            assertThat(resolver.actionsOf(g, "u1")).containsKey("objA");
        }

        @Test
        @DisplayName("SYSADMIN 이라도 오브젝트가 사용 안 함이면 OBJ_UNUSED")
        void sysadminInactiveObject() {
            PermGraph g = graph().user("a", "G").group("G", "SYSADMIN")
                    .obj("objA", "mcm", "N", null, null, "search", "").build();
            Explain e = resolver.explain(g, "a", "objA");
            assertThat(e.objectReason()).isEqualTo(DenyReason.OBJ_UNUSED);
            assertThat(btn(e, "search").denyReason()).isEqualTo(DenyReason.OBJ_UNUSED);
        }

        @Test
        @DisplayName("SYSADMIN 역할에 붙은 행(초안 등)은 보지 않는다 — 추가 거절 버튼 없음")
        void sysadminIgnoresRows() {
            PermGraph g = graph().user("a", "G").group("G", "SYSADMIN").obj("objA", "search", "")
                    .perm("SYSADMIN", "objA", "zzz", "").build();
            assertThat(resolver.explain(g, "a", "objA").buttons()).extracting(ButtonVerdict::code).containsExactly("search");
        }

        @Test
        @DisplayName("역할이 연결돼 있으나 모두 사용 안 함, 행 없음 = NO_PERM(NO_ROLE 아님)")
        void linkedButInactiveRoles() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1").roleMeta("R1", "N", null, null)
                    .obj("objA", "search", "").build();
            assertThat(resolver.explain(g, "u1", "objA").objectReason()).isEqualTo(DenyReason.NO_PERM);
        }

        @Test
        @DisplayName("그룹·역할 둘 다 사용 안 함 = 역할 쪽(ROLE_UNUSED)이 먼저")
        void bothOff() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1").groupMeta("G1", "N", null, null)
                    .roleMeta("R1", "N", null, null).obj("objA", "search", "").perm("R1", "objA", "search", "").build();
            assertThat(btn(resolver.explain(g, "u1", "objA"), "search").denyReason()).isEqualTo(DenyReason.ROLE_UNUSED);
        }

        @Test
        @DisplayName("같은 코드가 BTN·POPUP 둘 다 = 판정 두 개, action 하나")
        void sameCodeBothKinds() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1").obj("objA", "x", "x")
                    .perm("R1", "objA", "", "x").build();
            Explain e = resolver.explain(g, "u1", "objA");
            assertThat(e.buttons()).extracting(ButtonVerdict::kind, ButtonVerdict::granted).containsExactly(
                    org.assertj.core.groups.Tuple.tuple(ButtonVerdict.Kind.BTN, false),
                    org.assertj.core.groups.Tuple.tuple(ButtonVerdict.Kind.POPUP, true));
            assertThat(resolver.actionsOf(g, "u1").get("objA")).containsExactly("x");
        }

        @Test
        @DisplayName("모르는 오브젝트 = 버튼 없음, OBJ_UNUSED")
        void unknownObject() {
            PermGraph g = graph().user("u1", "G1").group("G1", "R1").build();
            Explain e = resolver.explain(g, "u1", "nope");
            assertThat(e.buttons()).isEmpty();
            assertThat(e.visible()).isFalse();
            assertThat(e.objectReason()).isEqualTo(DenyReason.OBJ_UNUSED);
        }
    }

    @Nested
    @DisplayName("r2 리뷰 보강")
    class FolderUseTp {
        @Test
        @DisplayName("폴더 USE_TP 가 비면 보인다(N 만 끔), 화면 줄은 Y 만")
        void folderNullUseTp() {
            PermGraph base = graph().user("u1", "G1").group("G1", "R1")
                    .obj("objA", "search", "").perm("R1", "objA", "search", "").build();
            PermGraph g = new PermGraph(base.userGroups(), base.groupRoles(), base.roles(), base.groups(),
                    base.objects(), base.rolePerms(), List.of(
                            new MenuNode("F", null, null, true, null),
                            new MenuNode("M", "F", "objA", true, "Y")));
            assertThat(resolver.explain(g, "u1", "objA").visible()).isTrue();
        }
    }
}
