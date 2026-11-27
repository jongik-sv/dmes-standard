package com.dongkuk.dmes.mcm.security.perm.impl;

import com.dongkuk.dmes.mcm.security.perm.ButtonVerdict;
import com.dongkuk.dmes.mcm.security.perm.DenyReason;
import com.dongkuk.dmes.mcm.security.perm.Explain;
import com.dongkuk.dmes.mcm.security.perm.ExplainPath;
import com.dongkuk.dmes.mcm.security.perm.GrantReason;
import com.dongkuk.dmes.mcm.security.perm.MenuNode;
import com.dongkuk.dmes.mcm.security.perm.ObjMeta;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import com.dongkuk.dmes.mcm.security.perm.RolePerm;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 새 퍼미션 계산기 — 런타임 게이트·작업대 설명·영향 계산이 같이 쓴다(D24). 그래프를 받는 순수 계산이다.
 * 기준 시각만 {@link Clock} 에서 읽는다.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 계산 규칙은 {@link PermEvaluator} 머리 주석이 정본이다. explain 규칙:
 * <ul>
 *   <li>buttons = 오브젝트 BTN·POPUP 허용 값 전부 + 퍼미션에는 있으나 오브젝트에서 빠진 값(NOT_IN_OBJ, D15)</li>
 *   <li>paths = 쓰는 그룹→쓰는 역할 중 이 오브젝트 행이 있는(또는 SYSADMIN) 경로. 토큰 = 그 경로의 효과 값</li>
 *   <li>visible = 행이 보이고, 이 오브젝트를 가리키는 메뉴가 있으면 그중 하나라도 자기·조상 폴더가 모두 표시·사용 중. 아니면 MENU_HIDDEN</li>
 * </ul>
 */
@Component
public class DefaultPermResolver implements PermResolver {

    private final Clock clock;

    public DefaultPermResolver() {
        this(Clock.systemDefaultZone());
    }

    public DefaultPermResolver(Clock clock) {
        this.clock = clock;
    }

    PermEvaluator evaluator(PermGraph graph) {
        return new PermEvaluator(graph, LocalDateTime.now(clock));
    }

    @Override
    public Map<String, Set<String>> actionsOf(PermGraph graph, String userId) {
        Map<String, Set<String>> eff = evaluator(graph).effectOfUser(userId);
        Map<String, Set<String>> out = new LinkedHashMap<>();
        eff.forEach((obj, actions) -> {
            if (!actions.isEmpty()) out.put(obj, Collections.unmodifiableSet(actions));
        });
        return Collections.unmodifiableMap(out);
    }

    @Override
    public Set<String> visibleObjects(PermGraph graph, String userId) {
        return Collections.unmodifiableSet(new LinkedHashSet<>(evaluator(graph).effectOfUser(userId).keySet()));
    }

    @Override
    public Set<String> objectsOfRole(PermGraph graph, String roleId) {
        return Collections.unmodifiableSet(new LinkedHashSet<>(evaluator(graph).effectOfRole(roleId).keySet()));
    }

    @Override
    public Explain explain(PermGraph graph, String userId, String objectId) {
        PermEvaluator ev = evaluator(graph);
        ObjMeta obj = graph.objects().get(objectId);
        List<Path> paths = pathsOf(ev, userId, objectId);
        boolean objActive = ev.objActive(objectId);
        boolean anyLinkedRole = ev.groupsOf(userId).stream().anyMatch(g -> !ev.rolesOfGroup(g).isEmpty());

        List<String> objBtn = obj == null ? List.of() : obj.btnPerm();
        List<String> objPopup = obj == null ? List.of() : obj.popupPerm();
        List<ButtonVerdict> buttons = new ArrayList<>();
        for (String code : objBtn) buttons.add(verdict(paths, code, ButtonVerdict.Kind.BTN, true, objActive, anyLinkedRole));
        for (String code : objPopup) buttons.add(verdict(paths, code, ButtonVerdict.Kind.POPUP, true, objActive, anyLinkedRole));
        Set<String> extraBtn = new LinkedHashSet<>();
        Set<String> extraPopup = new LinkedHashSet<>();
        for (Path p : paths) {
            if (p.sysadmin || p.perm == null) continue; // SYSADMIN 은 행을 보지 않는다
            for (String c : p.perm.btnPerm()) if (!objBtn.contains(c)) extraBtn.add(c);
            for (String c : p.perm.popupPerm()) if (!objPopup.contains(c)) extraPopup.add(c);
        }
        for (String code : extraBtn) buttons.add(verdict(paths, code, ButtonVerdict.Kind.BTN, false, objActive, anyLinkedRole));
        for (String code : extraPopup) buttons.add(verdict(paths, code, ButtonVerdict.Kind.POPUP, false, objActive, anyLinkedRole));

        List<ExplainPath> granted = new ArrayList<>();
        if (objActive) {
            for (Path p : paths) {
                if (!p.active()) continue;
                granted.add(p.sysadmin
                        ? new ExplainPath(p.groupId, p.roleId, objBtn, objPopup)
                        : new ExplainPath(p.groupId, p.roleId, intersect(p.perm.btnPerm(), objBtn),
                                intersect(p.perm.popupPerm(), objPopup)));
            }
        }

        DenyReason objectReason;
        if (granted.isEmpty()) {
            objectReason = objectDeny(paths, objActive, anyLinkedRole);
        } else {
            objectReason = menuShown(graph, objectId) ? null : DenyReason.MENU_HIDDEN;
        }
        return new Explain(userId, objectId, objectReason == null, objectReason, buttons, granted);
    }

    // ── 설명 내부 ────────────────────────────────────────────────────────

    /** 사람 → 그룹 → 역할 한 줄. 사용 여부와 무관하게 모두 모은다(안 되는 이유를 말하려고). */
    private record Path(String groupId, String roleId, boolean groupActive, boolean roleActive,
                        boolean sysadmin, RolePerm perm) {
        boolean active() { return groupActive && roleActive; }
    }

    /** 이 오브젝트 행이 있거나 SYSADMIN 인 경로만. */
    private static List<Path> pathsOf(PermEvaluator ev, String userId, String objectId) {
        List<Path> out = new ArrayList<>();
        for (String g : ev.groupsOf(userId)) {
            boolean ga = ev.groupActive(g);
            for (String r : ev.rolesOfGroup(g)) {
                boolean sys = PermEvaluator.isSysadmin(r);
                Map<String, RolePerm> rows = ev.graph().rolePerms().get(r);
                RolePerm perm = rows == null ? null : rows.get(objectId);
                if (!sys && perm == null) continue;
                out.add(new Path(g, r, ga, ev.roleActive(r), sys, perm));
            }
        }
        return out;
    }

    /** 이 경로가 (사용 여부를 빼고) 이 코드를 줄 수 있는가. inObj = 오브젝트 허용 값에 있는가. */
    private static boolean couldGrant(Path p, String code, ButtonVerdict.Kind kind, boolean inObj) {
        if (p.sysadmin) return inObj;
        List<String> list = kind == ButtonVerdict.Kind.BTN ? p.perm.btnPerm() : p.perm.popupPerm();
        return list.contains(code);
    }

    private static ButtonVerdict verdict(List<Path> paths, String code, ButtonVerdict.Kind kind,
                                         boolean inObj, boolean objActive, boolean anyLinkedRole) {
        Set<String> roles = new LinkedHashSet<>();
        Set<String> groups = new LinkedHashSet<>();
        List<Path> potential = new ArrayList<>();
        boolean viaPerm = false;
        for (Path p : paths) {
            if (!couldGrant(p, code, kind, inObj)) continue;
            potential.add(p);
            if (objActive && inObj && p.active()) {
                roles.add(p.roleId);
                groups.add(p.groupId);
                if (!p.sysadmin) viaPerm = true;
            }
        }
        if (!roles.isEmpty()) {
            return new ButtonVerdict(code, kind, true, viaPerm ? GrantReason.PERM : GrantReason.SYSADMIN, null,
                    List.copyOf(roles), List.copyOf(groups));
        }
        // 안 되는 이유 — 그 코드를 줄 수 있었던 경로를 같이 보인다.
        DenyReason reason = !inObj && !potential.isEmpty()
                ? DenyReason.NOT_IN_OBJ
                : objectDeny(potential, objActive, anyLinkedRole);
        for (Path p : potential) {
            roles.add(p.roleId);
            groups.add(p.groupId);
        }
        return new ButtonVerdict(code, kind, false, null, reason, List.copyOf(roles), List.copyOf(groups));
    }

    /**
     * 우선순위: (줄 수 있던 경로가 있을 때) 오브젝트 사용 안 함 → 역할 사용 안 함 → 그룹 사용 안 함,
     * 그다음 오브젝트 사용 안 함 → 연결된 역할 없음(NO_ROLE, 사용 여부 무관) → 퍼미션 없음.
     */
    private static DenyReason objectDeny(List<Path> potential, boolean objActive, boolean anyLinkedRole) {
        if (!objActive && !potential.isEmpty()) return DenyReason.OBJ_UNUSED;
        boolean roleOff = false;
        boolean groupOff = false;
        for (Path p : potential) {
            if (!p.roleActive) roleOff = true;
            if (!p.groupActive) groupOff = true;
        }
        if (roleOff) return DenyReason.ROLE_UNUSED;
        if (groupOff) return DenyReason.GROUP_UNUSED;
        if (!objActive) return DenyReason.OBJ_UNUSED;
        if (!anyLinkedRole) return DenyReason.NO_ROLE;
        return DenyReason.NO_PERM;
    }

    /**
     * 이 오브젝트를 가리키는 메뉴가 없으면 true. 있으면 그중 하나라도 자기와 조상 폴더 전부가 표시·사용 중(USE_TP=Y)이어야 true.
     * 그래프에 없는 부모 = 끝(뿌리)으로 본다.
     */
    private static boolean menuShown(PermGraph graph, String objectId) {
        if (objectId == null) return false;
        Map<String, MenuNode> byId = new HashMap<>();
        for (MenuNode m : graph.menus()) if (m != null && m.menuId() != null) byId.putIfAbsent(m.menuId(), m);
        boolean any = false;
        for (MenuNode m : graph.menus()) {
            if (m == null || !objectId.equals(m.objectId())) continue;
            any = true;
            if (chainShown(m, byId)) return true;
        }
        return !any;
    }

    private static boolean chainShown(MenuNode leaf, Map<String, MenuNode> byId) {
        Set<String> seen = new HashSet<>();
        for (MenuNode n = leaf; n != null; n = n.parentMenuId() == null ? null : byId.get(n.parentMenuId())) {
            if (!seen.add(n.menuId())) return false; // 순환 = 보이지 않음
            if (!n.visible() || !"Y".equals(n.useTp())) return false;
        }
        return true;
    }

    private static List<String> intersect(List<String> perm, List<String> allowed) {
        List<String> out = new ArrayList<>();
        for (String t : perm) if (allowed.contains(t) && !out.contains(t)) out.add(t);
        return out;
    }
}
