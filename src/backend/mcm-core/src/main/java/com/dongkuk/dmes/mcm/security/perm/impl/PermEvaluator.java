package com.dongkuk.dmes.mcm.security.perm.impl;

import com.dongkuk.dmes.mcm.security.perm.GroupMeta;
import com.dongkuk.dmes.mcm.security.perm.ObjMeta;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import com.dongkuk.dmes.mcm.security.perm.RoleMeta;
import com.dongkuk.dmes.mcm.security.perm.RolePerm;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 그래프 하나 × 기준 시각 하나에 대한 계산기. 역할별 효과를 한 번만 계산해 둔다(영향 계산에서 사람 수만큼 재사용).
 *
 * <p>규칙(decompose §0.2 · D13 · D35):
 * <ul>
 *   <li>역할×오브젝트 효과 = {@code (perm.BTN ∩ obj.BTN) ∪ (perm.POPUP ∩ obj.POPUP)}</li>
 *   <li>SYSADMIN 역할 = 쓰는 오브젝트 전부 × {@code (obj.BTN ∪ obj.POPUP)}. 퍼미션 행을 보지 않는다</li>
 *   <li>그룹·역할·오브젝트가 USE_TP≠Y 이거나 유효 기간 밖이면 빠진다. 끝 값이 자정이면 그날 끝까지 포함한다. 메타가 없으면(그래프에 안 실림) 쓰는 것으로 본다</li>
 *   <li>퍼미션 행이 있으면 효과가 비어도 오브젝트는 「보임」(D14 「행 있음 = 메뉴 보임」)</li>
 * </ul>
 *
 * <p>스레드 안전하지 않다. 호출 하나 안에서만 쓴다.
 */
final class PermEvaluator {

    static final Set<String> SYSADMIN_ROLE_IDS = Set.of(PermResolver.SYSADMIN_ROLE, "ROLE_SYSADMIN");

    private final PermGraph graph;
    private final LocalDateTime now;
    /** roleId → (objectId → 효과 action). 행 있음 = 키 있음(값이 비어도). 쓰지 않는 역할 = 빈 맵. */
    private final Map<String, Map<String, Set<String>>> roleEffect = new HashMap<>();
    private Map<String, Set<String>> sysadminEffect;

    PermEvaluator(PermGraph graph, LocalDateTime now) {
        this.graph = graph;
        this.now = now;
    }

    PermGraph graph() { return graph; }

    static boolean isSysadmin(String roleId) {
        return roleId != null && SYSADMIN_ROLE_IDS.contains(roleId);
    }

    boolean active(String useTp, LocalDateTime start, LocalDateTime end) {
        if (!"Y".equals(useTp)) return false;
        if (start != null && now.isBefore(start)) return false;
        if (end == null) return true;
        // 관리 화면은 날짜만 저장한다(00:00:00). 자정 값 = 그날 끝까지 쓰는 것으로 본다.
        if (end.toLocalTime().equals(LocalTime.MIDNIGHT)) return now.isBefore(end.plusDays(1));
        return !now.isAfter(end);
    }

    boolean groupActive(String groupId) {
        GroupMeta g = nz(graph.groups()).get(groupId);
        return g == null || active(g.useTp(), g.startActiveDate(), g.endActiveDate());
    }

    boolean roleActive(String roleId) {
        RoleMeta r = nz(graph.roles()).get(roleId);
        return r == null || active(r.useTp(), r.startActiveDate(), r.endActiveDate());
    }

    /** 오브젝트가 그래프에 있고 쓰는 중인가. 그래프에 없는 오브젝트 = 계산에서 빠짐(옛 규칙: 없는 오브젝트 매핑 건너뜀). */
    boolean objActive(String objectId) {
        ObjMeta o = nz(graph.objects()).get(objectId);
        return o != null && active(o.useTp(), o.startActiveDate(), o.endActiveDate());
    }

    Set<String> groupsOf(String userId) {
        if (userId == null) return Set.of();
        Set<String> g = nz(graph.userGroups()).get(userId);
        return g == null ? Set.of() : g;
    }

    Set<String> rolesOfGroup(String groupId) {
        Set<String> r = nz(graph.groupRoles()).get(groupId);
        return r == null ? Set.of() : r;
    }

    /** 쓰는 그룹을 거쳐 닿는 쓰는 역할(순서 유지). */
    Set<String> activeRolesOf(String userId) {
        Set<String> out = new LinkedHashSet<>();
        for (String g : groupsOf(userId)) {
            if (!groupActive(g)) continue;
            for (String r : rolesOfGroup(g)) {
                if (roleActive(r)) out.add(r);
            }
        }
        return out;
    }

    /** 역할 하나의 효과(오브젝트 → action). 쓰지 않는 역할이면 빈 맵. */
    Map<String, Set<String>> effectOfRole(String roleId) {
        if (!roleActive(roleId)) return Map.of();
        if (isSysadmin(roleId)) return sysadminEffect();
        return roleEffect.computeIfAbsent(roleId, this::computeRoleEffect);
    }

    private Map<String, Set<String>> computeRoleEffect(String roleId) {
        Map<String, RolePerm> rows = nz(graph.rolePerms()).get(roleId);
        if (rows == null || rows.isEmpty()) return Map.of();
        Map<String, Set<String>> out = new LinkedHashMap<>();
        for (Map.Entry<String, RolePerm> e : rows.entrySet()) {
            String objectId = e.getKey();
            if (!objActive(objectId)) continue;
            ObjMeta obj = graph.objects().get(objectId);
            RolePerm perm = e.getValue();
            if (perm == null) continue;
            Set<String> eff = new LinkedHashSet<>();
            intersectInto(eff, perm.btnPerm(), obj.btnPerm());
            intersectInto(eff, perm.popupPerm(), obj.popupPerm());
            out.put(objectId, Collections.unmodifiableSet(eff));
        }
        return out;
    }

    private Map<String, Set<String>> sysadminEffect() {
        if (sysadminEffect == null) {
            Map<String, Set<String>> out = new LinkedHashMap<>();
            for (Map.Entry<String, ObjMeta> oe : nz(graph.objects()).entrySet()) {
                ObjMeta obj = oe.getValue();
                if (obj == null || !objActive(oe.getKey())) continue;
                Set<String> eff = new LinkedHashSet<>();
                eff.addAll(obj.btnPerm());
                eff.addAll(obj.popupPerm());
                out.put(oe.getKey(), Collections.unmodifiableSet(eff));
            }
            sysadminEffect = out;
        }
        return sysadminEffect;
    }

    /** 사람 하나의 효과(오브젝트 → action). 행 있음 = 키 있음(값이 비어도). */
    Map<String, Set<String>> effectOfUser(String userId) {
        Map<String, Set<String>> out = new LinkedHashMap<>();
        for (String roleId : activeRolesOf(userId)) {
            for (Map.Entry<String, Set<String>> e : effectOfRole(roleId).entrySet()) {
                out.computeIfAbsent(e.getKey(), k -> new LinkedHashSet<>()).addAll(e.getValue());
            }
        }
        return out;
    }

    private static void intersectInto(Set<String> sink, List<String> perm, List<String> allowed) {
        if (perm == null || allowed == null || perm.isEmpty() || allowed.isEmpty()) return;
        Set<String> allow = new java.util.HashSet<>(allowed);
        for (String t : perm) {
            if (allow.contains(t)) sink.add(t);
        }
    }

    static <K, V> Map<K, V> nz(Map<K, V> m) {
        return m == null ? Map.of() : m;
    }
}
