package com.dongkuk.dmes.mcm.security.perm;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 권한 그래프.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 사람→그룹→역할→오브젝트 권한 전체를 담는 불변 값. 계산은 {@link PermResolver} 가 맡는다.
 * rolePerms 는 roleId → (objectId → {@link RolePerm}).
 */
public record PermGraph(
        Map<String, Set<String>> userGroups,
        Map<String, Set<String>> groupRoles,
        Map<String, RoleMeta> roles,
        Map<String, GroupMeta> groups,
        Map<String, ObjMeta> objects,
        Map<String, Map<String, RolePerm>> rolePerms,
        List<MenuNode> menus) {

    public PermGraph {
        userGroups = copySets(userGroups);
        groupRoles = copySets(groupRoles);
        roles = copyMap(roles);
        groups = copyMap(groups);
        objects = copyMap(objects);
        rolePerms = copyPerms(rolePerms);
        menus = menus == null ? List.of() : List.copyOf(menus);
    }

    /**
     * 변경 목록을 목록 순서대로 적용한 새 그래프를 돌려준다(순수 함수, 원본 불변).
     * USER_GRP·GRP_ROLE 은 ADD/DEL, ROLE_OBJ 는 ADD·UPD = 덮어쓰기(btn·popup 은 PermTokens.parse), DEL = 제거.
     * 없는 것의 DEL 은 아무 일도 안 한다. 알 수 없는 tp·op 는 무시한다. dataPerm 은 기존 값을 유지한다.
     */
    public PermGraph applyChanges(List<PermChange> changes) {
        Map<String, Set<String>> ug = mutableSets(userGroups);
        Map<String, Set<String>> gr = mutableSets(groupRoles);
        Map<String, Map<String, RolePerm>> rp = new LinkedHashMap<>();
        rolePerms.forEach((k, v) -> rp.put(k, new LinkedHashMap<>(v)));

        if (changes != null) {
            for (PermChange c : changes) {
                if (c == null || c.tp() == null || c.op() == null) {
                    continue;
                }
                boolean add = PermChange.ADD.equals(c.op());
                boolean del = PermChange.DEL.equals(c.op());
                switch (c.tp()) {
                    case PermChange.USER_GRP -> linkChange(ug, c, add, del);
                    case PermChange.GRP_ROLE -> linkChange(gr, c, add, del);
                    case PermChange.ROLE_OBJ -> {
                        if (del) {
                            Map<String, RolePerm> m = rp.get(c.key1());
                            if (m != null) {
                                m.remove(c.key2());
                                if (m.isEmpty()) {
                                    rp.remove(c.key1());
                                }
                            }
                        } else if (add || PermChange.UPD.equals(c.op())) {
                            Map<String, RolePerm> m = rp.computeIfAbsent(c.key1(), k -> new LinkedHashMap<>());
                            RolePerm old = m.get(c.key2());
                            m.put(c.key2(), new RolePerm(c.key1(), c.key2(),
                                    PermTokens.parse(c.btnPerm()), PermTokens.parse(c.popupPerm()),
                                    old == null ? null : old.dataPerm()));
                        }
                    }
                    default -> { }
                }
            }
        }
        return new PermGraph(ug, gr, roles, groups, objects, rp, menus);
    }

    private static void linkChange(Map<String, Set<String>> map, PermChange c, boolean add, boolean del) {
        if (add) {
            map.computeIfAbsent(c.key1(), k -> new LinkedHashSet<>()).add(c.key2());
        } else if (del) {
            Set<String> s = map.get(c.key1());
            if (s != null) {
                s.remove(c.key2());
                if (s.isEmpty()) {
                    map.remove(c.key1());
                }
            }
        }
    }

    private static Map<String, Set<String>> mutableSets(Map<String, Set<String>> src) {
        Map<String, Set<String>> out = new LinkedHashMap<>();
        src.forEach((k, v) -> out.put(k, new LinkedHashSet<>(v)));
        return out;
    }

    private static Map<String, Set<String>> copySets(Map<String, Set<String>> src) {
        if (src == null) {
            return Map.of();
        }
        Map<String, Set<String>> out = new LinkedHashMap<>();
        src.forEach((k, v) -> out.put(k, v == null ? Set.of() : java.util.Collections.unmodifiableSet(new LinkedHashSet<>(v))));
        return java.util.Collections.unmodifiableMap(out);
    }

    /** 넣은 순서를 지키는 불변 사본(설명·영향 결과 순서가 실행마다 같도록). */
    private static <V> Map<String, V> copyMap(Map<String, V> src) {
        return src == null ? Map.of() : java.util.Collections.unmodifiableMap(new LinkedHashMap<>(src));
    }

    private static Map<String, Map<String, RolePerm>> copyPerms(Map<String, Map<String, RolePerm>> src) {
        if (src == null) {
            return Map.of();
        }
        Map<String, Map<String, RolePerm>> out = new LinkedHashMap<>();
        src.forEach((k, v) -> out.put(k, v == null ? Map.of() : java.util.Collections.unmodifiableMap(new LinkedHashMap<>(v))));
        return java.util.Collections.unmodifiableMap(out);
    }
}
