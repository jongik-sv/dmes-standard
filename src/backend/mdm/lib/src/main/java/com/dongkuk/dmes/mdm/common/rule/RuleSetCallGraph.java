package com.dongkuk.dmes.mdm.common.rule;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 세트 호출 그래프 검사(하위 세트 spec §5 CALL_CYCLE·CALL_DEPTH, C-D10, Ruling 10 문구) — 스프링·DB 없는 순수 함수. 부르는 쪽 행
 * ({@link SetCallIoReader#edges} — 폐기 안 한 세트의 기준 시각 이후 유효한 RELEASED 행의 CALL_SET_IDS, Ruling 25)을 검사하려는 세트의 새 목록으로
 * 덮은 그래프를 받는다. 수준은 늘 REJECT 이고 쓰는 자리가 정한다(DRAFT 저장은 {@link RuleSetCheck#asWarn()}). 엔진 {@code SetShape.MAX_CALL_DEPTH}
 * (eng:4)와 같은 상한이다.
 */
public final class RuleSetCallGraph {

    /** 최상위 세트에서 하위로 들어가는 단계 상한. */
    public static final int MAX_DEPTH = 5;

    private RuleSetCallGraph() {
    }

    /** 순환이 있으면 CALL_CYCLE 하나(깊이는 보지 않는다), 없으면 이 세트를 지나는 가장 긴 사슬이 상한을 넘을 때 CALL_DEPTH 하나. */
    public static List<RuleSetCheck> check(String setId, Map<String, List<String>> edges) {
        List<String> cycle = cycleFrom(setId, edges, new ArrayList<>(List.of(setId)), new HashSet<>());
        if (cycle != null) {
            return List.of(new RuleSetCheck(RuleSetCheck.CALL_CYCLE, RuleSetCheck.REJECT, setId, null, null,
                    "세트 호출이 순환한다: " + String.join(" › ", cycle)));
        }
        List<String> up = up(setId, reverse(edges), new HashSet<>());
        List<String> down = down(setId, edges, new HashSet<>());
        int depth = up.size() - 1 + down.size() - 1;
        if (depth <= MAX_DEPTH) {
            return List.of();
        }
        List<String> chain = new ArrayList<>(up);
        chain.addAll(down.subList(1, down.size()));
        return List.of(new RuleSetCheck(RuleSetCheck.CALL_DEPTH, RuleSetCheck.REJECT, setId, null, null,
                "세트 호출이 " + depth + "단계다. " + MAX_DEPTH + "단계까지 부른다: " + String.join(" › ", chain)));
    }

    /** cur 에서 닿는 첫 순환 경로(깊이 우선, 목록 순서). 없으면 null. */
    private static List<String> cycleFrom(String cur, Map<String, List<String>> edges, List<String> path, Set<String> done) {
        for (String next : edges.getOrDefault(cur, List.of())) {
            if (path.contains(next)) {
                List<String> out = new ArrayList<>(path);
                out.add(next);
                return out;
            }
            if (done.contains(next)) {
                continue;
            }
            path.add(next);
            List<String> found = cycleFrom(next, edges, path, done);
            if (found != null) {
                return found;
            }
            path.remove(path.size() - 1);
            done.add(next);
        }
        return null;
    }

    /** cur 에서 아래로 가장 긴 사슬 [cur, …]. onPath 는 위쪽 순환에 대한 안전장치. */
    private static List<String> down(String cur, Map<String, List<String>> edges, Set<String> onPath) {
        onPath.add(cur);
        List<String> best = List.of(cur);
        for (String next : edges.getOrDefault(cur, List.of())) {
            if (onPath.contains(next)) {
                continue;
            }
            List<String> sub = down(next, edges, onPath);
            if (sub.size() + 1 > best.size()) {
                List<String> b = new ArrayList<>();
                b.add(cur);
                b.addAll(sub);
                best = b;
            }
        }
        onPath.remove(cur);
        return best;
    }

    /** cur 로 내려오는 가장 긴 사슬 [꼭대기, …, cur]. 이 세트와 무관한 위쪽 순환(저장된 데이터)도 onPath 로 끊는다. */
    private static List<String> up(String cur, Map<String, List<String>> rev, Set<String> onPath) {
        onPath.add(cur);
        List<String> best = List.of(cur);
        for (String parent : rev.getOrDefault(cur, List.of())) {
            if (onPath.contains(parent)) {
                continue;
            }
            List<String> sub = up(parent, rev, onPath);
            if (sub.size() + 1 > best.size()) {
                List<String> b = new ArrayList<>(sub);
                b.add(cur);
                best = b;
            }
        }
        onPath.remove(cur);
        return best;
    }

    private static Map<String, List<String>> reverse(Map<String, List<String>> edges) {
        Map<String, List<String>> rev = new LinkedHashMap<>();
        edges.forEach((from, tos) -> tos.forEach(to -> rev.computeIfAbsent(to, k -> new ArrayList<>()).add(from)));
        return rev;
    }
}
