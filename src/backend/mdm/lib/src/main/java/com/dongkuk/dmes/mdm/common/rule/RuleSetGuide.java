package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/**
 * 세트 구성 지침 — 결과 변수를 만드는 룰을 거슬러 찾아 의존 먼저 순서로 제안한다(TSK-08-06 design §6.4, I16, D7). 모든 룰의 결과 변수를 봐야 하므로
 * 서버에만 둔다(화면 TS 이식 없음). 순수 함수이고 제안일 뿐 저장하지 않는다.
 *
 * <ul>
 *   <li>생산자 목록은 호출자가 준다 — {@code RuleIoReader.producersOfActiveRules}(DEPRECATED·RELEASED 없는 룰 제외, 룰 ID 순). 첫 룰을 고르고,
 *       둘 이상이면 {@code ambiguous} 에 모두 싣는다(화면이 보이고 사용자가 고른다, 06:1122)</li>
 *   <li>NONE 조건만 거슬러 찾는다. DICT·PROG 는 호출자가 넣는 입력이다</li>
 *   <li>순서 = 고른 순서로 DFS 후위(의존 먼저). 순환이면 오류. 오류면 {@code order}·{@code ambiguous} 는 비어 있다</li>
 * </ul>
 */
public final class RuleSetGuide {

    public record GuideResult(List<String> order, List<Ambiguity> ambiguous, String error) {
    }

    /** 한 이름을 만드는 룰이 여럿이다 — {@code ruleIds} 는 생산자 목록 순, 첫 룰을 골랐다. */
    public record Ambiguity(String varName, List<String> ruleIds) {
    }

    private RuleSetGuide() {
    }

    public static GuideResult suggest(String target, Function<String, List<String>> producers, Function<String, RuleIo> io) {
        if (producersOf(producers, target).isEmpty()) {
            return error("결과 변수 " + target + "를 만드는 룰이 없다");
        }
        Set<String> pick = new LinkedHashSet<>();
        List<Ambiguity> amb = new ArrayList<>();
        Deque<String> need = new ArrayDeque<>();
        need.add(target);
        while (!need.isEmpty()) {
            String x = need.poll();
            List<String> ps = producersOf(producers, x);
            if (ps.isEmpty()) {
                return error(x + "를 만드는 룰이 없다");
            }
            if (ps.size() > 1 && amb.stream().noneMatch(a -> a.varName().equals(x))) {
                amb.add(new Ambiguity(x, List.copyOf(ps)));
            }
            String id = ps.get(0);
            if (!pick.add(id)) {
                continue;
            }
            for (IoName c : conds(io, id)) {
                if (RuleIo.NONE.equals(c.source())) {
                    need.add(c.name());
                }
            }
        }
        Visit v = new Visit(pick, io);
        pick.forEach(v::visit);
        if (v.cyc != null) {
            return error("순환이 있다(" + v.cyc + "). 룰 A의 조건이 B의 결과이고 B의 조건이 A의 결과인 경우다");
        }
        return new GuideResult(List.copyOf(v.order), List.copyOf(amb), null);
    }

    /** 고른 룰 사이의 DFS 후위 순회. state 1 = 방문 중, 2 = 끝. */
    private static final class Visit {
        private final Set<String> pick;
        private final Function<String, RuleIo> io;
        private final Map<String, Integer> state = new HashMap<>();
        private final List<String> order = new ArrayList<>();
        private String cyc;

        Visit(Set<String> pick, Function<String, RuleIo> io) {
            this.pick = pick;
            this.io = io;
        }

        void visit(String id) {
            int s = state.getOrDefault(id, 0);
            if (s == 2) {
                return;
            }
            if (s == 1) {
                cyc = id;
                return;
            }
            state.put(id, 1);
            dep(id).forEach(this::visit);
            state.put(id, 2);
            order.add(id);
        }

        /** id 의 NONE 조건마다, 고른 룰 가운데 그 이름을 만드는 첫 룰. */
        private List<String> dep(String id) {
            List<String> out = new ArrayList<>();
            for (IoName c : conds(io, id)) {
                if (!RuleIo.NONE.equals(c.source())) {
                    continue;
                }
                for (String j : pick) {
                    if (results(io, j).stream().anyMatch(x -> x.name().equals(c.name()))) {
                        out.add(j);
                        break;
                    }
                }
            }
            return out;
        }
    }

    private static GuideResult error(String message) {
        return new GuideResult(List.of(), List.of(), message);
    }

    private static List<String> producersOf(Function<String, List<String>> producers, String name) {
        List<String> ps = producers.apply(name);
        return ps == null ? List.of() : ps;
    }

    private static List<IoName> conds(Function<String, RuleIo> io, String id) {
        RuleIo r = io.apply(id);
        return r == null || !r.exists() || r.conds() == null ? List.of() : r.conds();
    }

    private static List<IoName> results(Function<String, RuleIo> io, String id) {
        RuleIo r = io.apply(id);
        return r == null || !r.exists() || r.results() == null ? List.of() : r.results();
    }
}
