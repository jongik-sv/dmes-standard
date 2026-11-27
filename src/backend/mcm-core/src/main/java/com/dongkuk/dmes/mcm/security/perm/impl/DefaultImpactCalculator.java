package com.dongkuk.dmes.mcm.security.perm.impl;

import com.dongkuk.dmes.mcm.security.perm.ImpactCalculator;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.UserImpact;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/**
 * 두 그래프(현재·초안 적용)의 사람×오브젝트 action 차이. 계산 규칙은 {@link DefaultPermResolver} 와 같다
 * ({@link PermEvaluator} 공유).
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 대상 사람 = 두 그래프 사람→그룹 키의 합집합. 결과 = userId·objectId 사전순, gained·lost 둘 다 빈 줄은 뺀다.
 * 오브젝트를 새로 보게 되거나(행 추가) 안 보게 돼도 action 차이가 없으면 줄이 없다.
 *
 * <p>성능(조정자 지시, 2026-11-27): 사람마다 오브젝트 전체를 비교하지 않는다.
 * <ol>
 *   <li>역할마다 「전·후 효과가 다른 오브젝트」를 한 번만 구한다</li>
 *   <li>사람의 (전 역할 조합, 후 역할 조합) 이 같으면 차이도 같다 → 조합 쌍마다 한 번만 계산</li>
 *   <li>조합 쌍의 후보 오브젝트 = 두 조합 공통 역할의 바뀐 오브젝트 ∪ 한쪽에만 있는 역할의 오브젝트 전부</li>
 * </ol>
 */
@Component
public class DefaultImpactCalculator implements ImpactCalculator {

    private final Clock clock;

    public DefaultImpactCalculator() {
        this(Clock.systemDefaultZone());
    }

    public DefaultImpactCalculator(Clock clock) {
        this.clock = clock;
    }

    /** 조합 쌍 하나의 차이 한 줄(사람 없이). */
    private record Delta(String objectId, Set<String> gained, Set<String> lost) {
    }

    @Override
    public List<UserImpact> diff(PermGraph before, PermGraph after) {
        LocalDateTime now = LocalDateTime.now(clock);
        PermEvaluator b = new PermEvaluator(before, now);
        PermEvaluator a = new PermEvaluator(after, now);

        Set<String> users = new TreeSet<>();
        users.addAll(PermEvaluator.nz(before.userGroups()).keySet());
        users.addAll(PermEvaluator.nz(after.userGroups()).keySet());

        Map<String, Set<String>> changedByRole = new HashMap<>();
        Map<List<List<String>>, List<Delta>> byPair = new HashMap<>();
        List<UserImpact> out = new ArrayList<>();
        for (String userId : users) {
            List<String> cb = b.roleCombo(userId);
            List<String> ca = a.roleCombo(userId);
            List<Delta> deltas = byPair.computeIfAbsent(List.of(cb, ca), k -> deltas(b, a, cb, ca, changedByRole));
            for (Delta d : deltas) out.add(new UserImpact(userId, d.objectId(), d.gained(), d.lost()));
        }
        return Collections.unmodifiableList(out);
    }

    private static List<Delta> deltas(PermEvaluator b, PermEvaluator a, List<String> cb, List<String> ca,
                                      Map<String, Set<String>> changedByRole) {
        Set<String> candidates = new TreeSet<>();
        for (String r : cb) {
            if (ca.contains(r)) candidates.addAll(changedByRole.computeIfAbsent(r, x -> changedObjects(b, a, x)));
            else candidates.addAll(b.effectOfRole(r).keySet());
        }
        for (String r : ca) {
            if (!cb.contains(r)) candidates.addAll(a.effectOfRole(r).keySet());
        }
        List<Delta> out = new ArrayList<>();
        for (String objectId : candidates) {
            Set<String> was = orEmpty(b.effectOn(cb, objectId));
            Set<String> now = orEmpty(a.effectOn(ca, objectId));
            Set<String> gained = minus(now, was);
            Set<String> lost = minus(was, now);
            if (!gained.isEmpty() || !lost.isEmpty()) out.add(new Delta(objectId, gained, lost));
        }
        return out;
    }

    /** 역할 하나의 전·후 효과가 다른 오브젝트(행 생김·없어짐 포함). */
    private static Set<String> changedObjects(PermEvaluator b, PermEvaluator a, String roleId) {
        Map<String, Set<String>> eb = b.effectOfRole(roleId);
        Map<String, Set<String>> ea = a.effectOfRole(roleId);
        if (eb == ea) return Set.of();
        Set<String> out = new LinkedHashSet<>();
        for (Map.Entry<String, Set<String>> e : eb.entrySet()) {
            if (!Objects.equals(e.getValue(), ea.get(e.getKey()))) out.add(e.getKey());
        }
        for (String objectId : ea.keySet()) {
            if (!eb.containsKey(objectId)) out.add(objectId);
        }
        return out;
    }

    private static Set<String> orEmpty(Set<String> s) {
        return s == null ? Set.of() : s;
    }

    private static Set<String> minus(Set<String> x, Set<String> y) {
        Set<String> out = new LinkedHashSet<>();
        for (String s : x) if (!y.contains(s)) out.add(s);
        return Collections.unmodifiableSet(out);
    }
}
