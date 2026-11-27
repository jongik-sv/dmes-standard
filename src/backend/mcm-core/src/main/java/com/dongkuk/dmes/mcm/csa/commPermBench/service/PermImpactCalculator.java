/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench 영향 계산 — before 그래프와 초안 적용 그래프(after)를 후보 사용자(before∪after)로 비교. impact(b3)·apply(b4) 공용
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.security.perm.ImpactCalculator;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import com.dongkuk.dmes.mcm.security.perm.UserImpact;
import com.dongkuk.dmes.mcm.security.perm.impl.DefaultPermResolver;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * 초안 적용 전후 영향 계산(순수 계산, DB·Spring 없음).
 *
 * <p><b>후보 사용자</b> = before 그래프에서 영향받는 사용자 ∪ after({@code before.applyChanges(changes)}) 그래프에서 영향받는 사용자.
 * 같은 초안에서 새로 역할을 받는 사용자(예: USER_GRP ADD 와 GRP_ROLE ADD 가 함께 있는 경우)가 빠지지 않도록 둘 다 본다.
 * 변경 한 줄이 영향 주는 사용자:
 * <ul>
 *   <li>USER_GRP: KEY1(사용자)</li>
 *   <li>GRP_ROLE: 그룹 KEY1 에 속한 사용자</li>
 *   <li>ROLE_OBJ: 역할 KEY1 을 어떤 그룹으로든 가진 사용자</li>
 * </ul>
 *
 * <p><b>비교</b>: 후보 사용자만 남긴 그래프 두 개를 {@link ImpactCalculator#diff} 에 넣는다(후보 밖 사용자는 계산하지 않는다).
 * diff 는 action 증감만 센다. 화면 보임만 바뀌는 경우(퍼미션 행 추가·삭제로 보임만 달라짐)는 {@link PermResolver#visibleObjects} 로 따로 비교한다.
 *
 * <p><b>SCREEN_CNT</b> = 후보 사용자 중 누구에게든 (유효 action 이 달라지거나 보임 여부가 달라지는) 서로 다른 오브젝트 수.
 * <b>GAIN_USER_CNT / LOSE_USER_CNT</b> = gained / lost 가 하나라도 있는 서로 다른 사용자 수(한 사용자가 양쪽에 셀 수 있다).
 *
 * <p>apply(b4)도 같은 클래스를 쓴다: {@code compute(before, changes)} 또는 {@code compute(before, changes, limit)}.
 */
public class PermImpactCalculator {

    /**
     * 계산 결과. impacts = USER_ID, OBJECT_ID 순 앞 limit 줄(전체 줄 수 = totalRows). 건수는 limit 와 무관하게 전체 기준이다.
     */
    public record Result(int gainUserCnt, int loseUserCnt, int screenCnt, List<UserImpact> impacts, long totalRows,
                         Set<String> candidates) {
        public static Result empty() {
            return new Result(0, 0, 0, List.of(), 0, Set.of());
        }
    }

    private final PermResolver resolver;
    private final ImpactCalculator calculator;

    public PermImpactCalculator(PermResolver resolver, ImpactCalculator calculator) {
        this.resolver = resolver;
        this.calculator = calculator;
    }

    /** 전체 줄을 돌려준다(작은 입력·시험용). 큰 영향은 {@link #compute(PermGraph, List, int)} 로 앞 줄만 받는다. */
    public Result compute(PermGraph before, List<PermChange> changes) {
        return compute(before, changes, Integer.MAX_VALUE);
    }

    /**
     * before 그래프(전체)와 변경 목록으로 영향을 계산한다. 변경이 없으면 빈 결과.
     * 같은 (before·after 유효 역할 집합, DefaultPermResolver#activeRolesOf)이 같은 사용자는 대표 한 명만 계산하므로, SYSADMIN 을 1,000명 그룹에 주는 것처럼
     * 줄이 100만이어도 앞 {@code limit} 줄만 만든다(건수는 전체).
     */
    public Result compute(PermGraph before, List<PermChange> changes, int limit) {
        if (changes == null || changes.isEmpty()) {
            return Result.empty();
        }
        PermGraph after = before.applyChanges(changes);
        Set<String> candidates = new TreeSet<>(affectedUsers(before, changes));
        candidates.addAll(affectedUsers(after, changes));
        if (candidates.isEmpty()) {
            return Result.empty();
        }
        // 사용자의 권한은 (before 유효 역할 집합, after 유효 역할 집합)에만 달려 있다(그룹·그룹 조합이 달라도 같은 역할이면 같은 효과).
        // 같은 쌍이면 대표 한 명만 계산한다. (resolver·diff 는 사용자마다 역할 효과를 다시 합치므로, 따로 풀면 느리다.)
        Map<List<Object>, List<String>> bySig = new LinkedHashMap<>();
        Map<String, List<String>> sigOfUser = new HashMap<>();
        for (String user : candidates) {
            List<String> members = bySig.computeIfAbsent(List.of(groupKey(before, user), groupKey(after, user)), k -> new ArrayList<>());
            members.add(user);
            sigOfUser.put(user, members);
        }
        Set<String> reps = new LinkedHashSet<>();
        bySig.values().forEach(us -> reps.add(us.get(0)));
        PermGraph b = narrow(before, reps);
        PermGraph a = narrow(after, reps);

        Map<String, List<UserImpact>> byRep = new HashMap<>();
        for (UserImpact u : calculator.diff(b, a)) {
            if (!u.gained().isEmpty() || !u.lost().isEmpty()) {
                byRep.computeIfAbsent(u.userId(), k -> new ArrayList<>()).add(u);
            }
        }
        Comparator<UserImpact> byObject = Comparator.comparing(UserImpact::objectId, Comparator.nullsFirst(Comparator.<String>naturalOrder()));
        byRep.values().forEach(l -> l.sort(byObject));

        int gainUsers = 0;
        int loseUsers = 0;
        long total = 0;
        Set<String> screens = new HashSet<>();
        for (List<String> users : bySig.values()) {
            List<UserImpact> repImpacts = byRep.getOrDefault(users.get(0), List.of());
            boolean gain = false;
            boolean lose = false;
            for (UserImpact u : repImpacts) {
                screens.add(u.objectId());
                gain |= !u.gained().isEmpty();
                lose |= !u.lost().isEmpty();
            }
            if (gain) {
                gainUsers += users.size();
            }
            if (lose) {
                loseUsers += users.size();
            }
            total += (long) repImpacts.size() * users.size();
            // 화면 보임만 바뀌는 오브젝트(action 차이가 없어 diff 에 안 나온다)
            Set<String> vb = resolver.visibleObjects(b, users.get(0));
            Set<String> va = resolver.visibleObjects(a, users.get(0));
            for (String o : vb) {
                if (!va.contains(o)) {
                    screens.add(o);
                }
            }
            for (String o : va) {
                if (!vb.contains(o)) {
                    screens.add(o);
                }
            }
        }

        // 앞 limit 줄만 만든다 — 사용자 순서대로 대표의 줄(오브젝트 순)을 복사.
        List<UserImpact> rows = new ArrayList<>((int) Math.min(total, Math.max(limit, 0)));
        for (String user : candidates) {
            if (rows.size() >= limit) {
                break;
            }
            List<String> members = sigOfUser.get(user);
            String rep = members.get(0);
            for (UserImpact u : byRep.getOrDefault(rep, List.of())) {
                if (rows.size() >= limit) {
                    break;
                }
                rows.add(user.equals(rep) ? u : new UserImpact(user, u.objectId(), u.gained(), u.lost()));
            }
        }
        return new Result(gainUsers, loseUsers, screens.size(), rows, total, candidates);
    }

    /**
     * 묶기 키. {@link DefaultPermResolver#activeRolesOf}(쓰는 그룹·역할만, 규칙은 PermEvaluator 한 곳)가 있으면 유효 역할 목록,
     * 다른 계산기(시험용 가짜 등)면 사용자의 그룹 집합 — 더 잘게 나눠 늘 안전하다.
     */
    private Object groupKey(PermGraph g, String userId) {
        if (resolver instanceof DefaultPermResolver d) {
            return d.activeRolesOf(g, userId);
        }
        return g.userGroups().getOrDefault(userId, Set.of());
    }

    /** 한 그래프에서 변경이 건드리는 사용자. */
    static Set<String> affectedUsers(PermGraph g, List<PermChange> changes) {
        Map<String, Set<String>> usersOfGroup = null;
        Map<String, Set<String>> groupsOfRole = null;
        Set<String> out = new LinkedHashSet<>();
        for (PermChange c : changes) {
            if (c == null || c.tp() == null || c.key1() == null) {
                continue;
            }
            switch (c.tp()) {
                case PermChange.USER_GRP -> out.add(c.key1());
                case PermChange.GRP_ROLE -> {
                    if (usersOfGroup == null) {
                        usersOfGroup = invert(g.userGroups());
                    }
                    out.addAll(usersOfGroup.getOrDefault(c.key1(), Set.of()));
                }
                case PermChange.ROLE_OBJ -> {
                    if (usersOfGroup == null) {
                        usersOfGroup = invert(g.userGroups());
                    }
                    if (groupsOfRole == null) {
                        groupsOfRole = invert(g.groupRoles());
                    }
                    for (String grp : groupsOfRole.getOrDefault(c.key1(), Set.of())) {
                        out.addAll(usersOfGroup.getOrDefault(grp, Set.of()));
                    }
                }
                default -> { }
            }
        }
        return out;
    }

    /** key→values 를 values→keys 로 뒤집는다. */
    private static Map<String, Set<String>> invert(Map<String, Set<String>> m) {
        Map<String, Set<String>> out = new HashMap<>();
        m.forEach((k, vs) -> vs.forEach(v -> out.computeIfAbsent(v, x -> new HashSet<>()).add(k)));
        return out;
    }

    /** 후보 사용자만 남긴 그래프(나머지는 그대로). */
    private static PermGraph narrow(PermGraph g, Set<String> users) {
        Map<String, Set<String>> ug = new LinkedHashMap<>();
        for (String u : users) {
            Set<String> gs = g.userGroups().get(u);
            if (gs != null) {
                ug.put(u, gs);
            }
        }
        return new PermGraph(ug, g.groupRoles(), g.roles(), g.groups(), g.objects(), g.rolePerms(), g.menus());
    }

    /** GAINED·LOST 칸 값 — 코드를 정렬해 쉼표로 잇는다(perm-core 가 정렬을 보장하지 않아 소비 쪽에서 한다). */
    public static String codes(Set<String> actions) {
        return String.join(",", new TreeSet<>(actions));
    }
}
