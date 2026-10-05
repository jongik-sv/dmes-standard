package kr.dongkuk.maru.mdm.engine.rule;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;

/**
 * 레코드 키 예약 검사와 대소문자(06-business-rule.md:199·422·424, TSK-03-03 design §6.8, D13).
 * EvalEx 는 변수 이름의 대소문자를 가리지 않으므로(E3) 예약 검사도 대소문자를 무시한다.
 */
final class RecordKeys {

    private RecordKeys() {}

    /** 예약 키·대소문자만 다른 키 묶음을 위반으로. 키 순서대로 쌓고, 묶음 위반은 그 뒤에 첫 등장 순서로 쌓는다. */
    static List<Violation> check(Collection<String> keys, Stage stage, String ruleId) {
        List<Violation> out = new ArrayList<>();
        Map<String, List<String>> byUpper = new LinkedHashMap<>();
        for (String key : keys) {
            String upper = key.toUpperCase(Locale.ROOT);
            byUpper.computeIfAbsent(upper, k -> new ArrayList<>()).add(key);
            if (ReservedNames.CONSTANTS.contains(upper)) {
                out.add(new Violation(stage, Code.CONSTANT_KEY, ruleId, null, key,
                        "레코드 키 '" + key + "' 는 EvalEx 상수 이름이다", List.of()));
            } else if (key.equalsIgnoreCase(ReservedNames.EVAL_TS)) {
                out.add(new Violation(stage, Code.EVAL_TS_KEY, ruleId, null, key,
                        "레코드 키 '" + key + "' 는 평가 시각 예약 키다", List.of()));
            } else if (ReservedNames.CATCH_NAMES.contains(upper)) {
                out.add(new Violation(stage, Code.RESERVED_KEY, ruleId, null, key,
                        "레코드 키 '" + key + "' 는 받는 노드 예약 이름이다", List.of()));
            } else if (key.startsWith(ReservedNames.RESERVED_PREFIX)) {
                out.add(new Violation(stage, Code.RESERVED_KEY, ruleId, null, key,
                        "레코드 키 '" + key + "' 는 '" + ReservedNames.RESERVED_PREFIX + "' 로 시작한다", List.of()));
            }
        }
        for (List<String> group : byUpper.values()) {
            if (group.size() > 1) {
                List<String> sorted = new ArrayList<>(group);
                sorted.sort(null);
                String name = String.join(",", sorted);
                out.add(new Violation(stage, Code.RESERVED_KEY, ruleId, null, name,
                        "대소문자만 다른 레코드 키가 둘 이상이다: " + name, List.of()));
            }
        }
        return out;
    }

    /** ctx 에서 대소문자만 다른 다른 키를 지운 뒤 넣는다(세트에서 앞 룰 결과를 ctx 에 넣을 때, E3 충돌 방지). */
    static void putReplacing(Map<String, Object> ctx, String name, Object value) {
        Iterator<String> it = ctx.keySet().iterator();
        while (it.hasNext()) {
            String k = it.next();
            if (!k.equals(name) && k.equalsIgnoreCase(name)) {
                it.remove();
            }
        }
        ctx.put(name, value);
    }
}
