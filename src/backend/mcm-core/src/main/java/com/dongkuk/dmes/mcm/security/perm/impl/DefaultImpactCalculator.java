package com.dongkuk.dmes.mcm.security.perm.impl;

import com.dongkuk.dmes.mcm.security.perm.ImpactCalculator;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.UserImpact;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * 두 그래프(현재·초안 적용)의 사람×오브젝트 action 차이. 계산 규칙은 {@link DefaultPermResolver} 와 같다
 * ({@link PermEvaluator} 공유). 역할별 효과를 그래프마다 한 번만 계산하므로 사람 수에 거의 선형이다.
 *
 * <p>대상 사람 = 두 그래프 사람→그룹 키의 합집합. 결과 = userId·objectId 사전순, gained·lost 둘 다 빈 줄은 뺀다.
 * 오브젝트를 새로 보게 되거나(행 추가) 안 보게 돼도 action 차이가 없으면 줄이 없다.
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

    @Override
    public List<UserImpact> diff(PermGraph before, PermGraph after) {
        LocalDateTime now = LocalDateTime.now(clock);
        PermEvaluator b = new PermEvaluator(before, now);
        PermEvaluator a = new PermEvaluator(after, now);

        Set<String> users = new TreeSet<>();
        users.addAll(PermEvaluator.nz(before.userGroups()).keySet());
        users.addAll(PermEvaluator.nz(after.userGroups()).keySet());

        List<UserImpact> out = new ArrayList<>();
        for (String userId : users) {
            Map<String, Set<String>> eb = b.effectOfUser(userId);
            Map<String, Set<String>> ea = a.effectOfUser(userId);
            Set<String> objects = new TreeSet<>(eb.keySet());
            objects.addAll(ea.keySet());
            for (String objectId : objects) {
                Set<String> was = eb.getOrDefault(objectId, Set.of());
                Set<String> now2 = ea.getOrDefault(objectId, Set.of());
                Set<String> gained = minus(now2, was);
                Set<String> lost = minus(was, now2);
                if (!gained.isEmpty() || !lost.isEmpty()) {
                    out.add(new UserImpact(userId, objectId, gained, lost));
                }
            }
        }
        return Collections.unmodifiableList(out);
    }

    private static Set<String> minus(Set<String> x, Set<String> y) {
        Set<String> out = new LinkedHashSet<>();
        for (String s : x) if (!y.contains(s)) out.add(s);
        return Collections.unmodifiableSet(out);
    }
}
