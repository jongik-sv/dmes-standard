package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 룰 세트 계산 — 입출력 표·의존 룰·저장 시 검사(TSK-08-06 design §6.2·§6.3, I8·I10·I11). 스프링·DB 없는 순수 함수다.
 * 화면 {@code m-mdm pages/dme/ruleSetEdit/set-model.ts} 가 같은 알고리즘·같은 문구로 즉시 계산하고, 한 벌 코퍼스
 * {@code rule-set-corpus.json} 이 두 구현의 동치를 고정한다(I9). 알고리즘을 바꾸면 TS 쪽과 코퍼스를 함께 바꾼다.
 *
 * <p>{@code rules} 는 호출자가 넘긴다 — 서버는 {@code RuleIoReader} 로 읽은 맵을, 08-04 는 저장하려는 정의로 한 항목을 바꾼 맵을 넘긴다(06:327).
 * 맵에 없거나 {@code exists=false} 인 룰은 조건·결과가 없는 것으로 본다. 이름 비교는 대소문자를 구분한다(이름은 {@code RuleIoReader} 가 정한 표기 그대로).
 */
public final class RuleSetAnalyzer {

    /** 세트 입출력 표. 저장하지 않는다. */
    public record SetIo(List<InputRow> inputs, List<ResultRow> results) {
    }

    /** 입력 변수 — 앞 룰이 만들지 않은 이름. 타입·출처는 처음 읽은 룰의 것, {@code users} 는 읽는 룰(목록 순). */
    public record InputRow(String name, String label, String dataType, Integer scale, boolean dateString, String maruCodeId, String source,
            List<String> users) {
    }

    /** 결과 변수 — 타입은 처음 만든 룰의 것. {@code by} 는 만드는 룰, {@code readers} 는 만든 뒤에 읽는 룰(목록 순). */
    public record ResultRow(String name, String dataType, Integer scale, boolean dateString, String maruCodeId, List<String> by,
            List<String> readers) {

        /** 최종 결과 = 세트 안에서 아무도 뒤에서 읽지 않는다. 그 밖은 중간 결과. */
        public boolean finalResult() {
            return readers.isEmpty();
        }
    }

    private RuleSetAnalyzer() {
    }

    /** §6.2 — 목록 순서대로 훑어 앞 룰이 이미 만든 이름을 읽으면 그 결과의 readers 에, 아니면 입력 변수로 모은다. */
    public static SetIo io(List<String> ids, Map<String, RuleIo> rules) {
        Map<String, InputRow> ins = new LinkedHashMap<>();
        Map<String, ResultRow> res = new LinkedHashMap<>();
        for (String id : ids) {
            for (IoName c : conds(rules, id)) {
                ResultRow made = res.get(c.name());
                if (made != null) {
                    made.readers().add(id);
                    continue;
                }
                ins.computeIfAbsent(c.name(), n -> new InputRow(n, c.label(), c.dataType(), c.scale(), c.dateString(), c.maruCodeId(), c.source(),
                        new ArrayList<>())).users().add(id);
            }
            for (IoName x : results(rules, id)) {
                res.computeIfAbsent(x.name(), n -> new ResultRow(n, x.dataType(), x.scale(), x.dateString(), x.maruCodeId(), new ArrayList<>(),
                        new ArrayList<>())).by().add(id);
            }
        }
        return new SetIo(List.copyOf(ins.values()), List.copyOf(res.values()));
    }

    /** I11 — deps[id] = 세트 안에서 id 가 아닌 룰 가운데 id 의 DICT 가 아닌 조건 이름을 만드는 룰(목록 순, 중복 없음). 목록의 모든 ID 가 키다. */
    public static Map<String, List<String>> deps(List<String> ids, Map<String, RuleIo> rules) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (String id : ids) {
            if (out.containsKey(id)) {
                continue;
            }
            Set<String> reads = new HashSet<>();
            for (IoName c : conds(rules, id)) {
                if (!RuleIo.DICT.equals(c.source())) {
                    reads.add(c.name());
                }
            }
            List<String> d = new ArrayList<>();
            for (String j : ids) {
                if (!j.equals(id) && !d.contains(j) && results(rules, j).stream().anyMatch(x -> reads.contains(x.name()))) {
                    d.add(j);
                }
            }
            out.put(id, d);
        }
        return out;
    }

    /** §6.3 — 1단계(존재·상태) → EMPTY → 2단계(순서·순환·출처, 중복 대입). 문구는 화면과 같다. */
    public static List<RuleSetCheck> checks(List<String> ids, Map<String, RuleIo> rules) {
        List<RuleSetCheck> out = new ArrayList<>();
        for (String id : ids) {
            RuleIo r = rules.get(id);
            if (r == null || !r.exists()) {
                out.add(new RuleSetCheck(RuleSetCheck.RULE_NOT_FOUND, RuleSetCheck.REJECT, id, null, null, id + "는 없는 룰이다"));
            } else if ("DEPRECATED".equals(r.status())) {
                out.add(new RuleSetCheck(RuleSetCheck.RULE_DEPRECATED, RuleSetCheck.REJECT, id, null, null, id + "는 DEPRECATED다"));
            } else if (r.releasedVer() == null) {
                out.add(new RuleSetCheck(RuleSetCheck.NO_RELEASED, RuleSetCheck.WARN, id, null, null,
                        id + "는 RELEASED 버전이 없어 입출력을 계산하지 않았다. 이대로 부르면 판정 오류다"));
            }
        }
        if (ids.isEmpty()) {
            out.add(new RuleSetCheck(RuleSetCheck.EMPTY, RuleSetCheck.REJECT, null, null, null, "룰이 하나도 없다"));
        }
        Map<String, List<String>> d = deps(ids, rules);
        Set<String> produced = new HashSet<>();
        Map<String, String> prodBy = new HashMap<>();
        for (int i = 0; i < ids.size(); i++) {
            String id = ids.get(i);
            for (IoName c : conds(rules, id)) {
                if (RuleIo.DICT.equals(c.source()) || produced.contains(c.name())) {
                    continue;
                }
                List<String> later = new ArrayList<>();
                for (int k = i + 1; k < ids.size(); k++) {
                    String j = ids.get(k);
                    if (!j.equals(id) && produces(rules, j, c.name())) {
                        later.add(j);
                    }
                }
                if (!later.isEmpty()) {
                    String cyc = null;
                    for (String j : later) {
                        if (reaches(j, id, d) || overlaps(results(rules, id), conds(rules, j))) {
                            cyc = j;
                            break;
                        }
                    }
                    if (cyc != null) {
                        out.add(new RuleSetCheck(RuleSetCheck.CYCLE, RuleSetCheck.REJECT, id, cyc, c.name(),
                                id + "와 " + cyc + "가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다"));
                    } else {
                        out.add(new RuleSetCheck(RuleSetCheck.ORDER, RuleSetCheck.REJECT, id, later.get(0), c.name(),
                                id + "가 뒤에 도는 " + String.join(", ", later) + "의 결과 변수 " + c.name() + "를 읽는다. " + later.get(0) + "를 " + id
                                        + " 앞으로 옮긴다"));
                    }
                    continue;
                }
                if (!RuleIo.PROG.equals(c.source())) {
                    out.add(new RuleSetCheck(RuleSetCheck.UNKNOWN_INPUT, RuleSetCheck.REJECT, id, null, c.name(),
                            id + "의 조건 변수 " + c.name() + "는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다"));
                }
            }
            for (IoName x : results(rules, id)) {
                String prev = prodBy.get(x.name());
                if (prev != null) {
                    out.add(new RuleSetCheck(RuleSetCheck.DUP_RESULT, RuleSetCheck.WARN, id, prev, x.name(),
                            prev + "와 " + id + "가 같은 결과 변수 " + x.name() + "에 대입한다"));
                }
                prodBy.put(x.name(), id);
                produced.add(x.name());
            }
        }
        return out;
    }

    /** 의존 그래프(a → d[a] 의 각 원소)를 j 에서 따라가 target 에 닿는가. */
    private static boolean reaches(String j, String target, Map<String, List<String>> d) {
        Set<String> seen = new HashSet<>();
        Deque<String> stack = new ArrayDeque<>();
        seen.add(j);
        stack.push(j);
        while (!stack.isEmpty()) {
            for (String b : d.getOrDefault(stack.pop(), List.of())) {
                if (b.equals(target)) {
                    return true;
                }
                if (seen.add(b)) {
                    stack.push(b);
                }
            }
        }
        return false;
    }

    /** 이 룰의 결과 이름과 상대 룰의 조건 이름(출처 무관)이 겹치는가. */
    private static boolean overlaps(List<IoName> results, List<IoName> otherConds) {
        return results.stream().anyMatch(x -> otherConds.stream().anyMatch(c -> c.name().equals(x.name())));
    }

    private static boolean produces(Map<String, RuleIo> rules, String id, String name) {
        return results(rules, id).stream().anyMatch(x -> x.name().equals(name));
    }

    private static List<IoName> conds(Map<String, RuleIo> rules, String id) {
        RuleIo r = rules.get(id);
        return r == null || !r.exists() || r.conds() == null ? List.of() : r.conds();
    }

    private static List<IoName> results(Map<String, RuleIo> rules, String id) {
        RuleIo r = rules.get(id);
        return r == null || !r.exists() || r.results() == null ? List.of() : r.results();
    }
}
