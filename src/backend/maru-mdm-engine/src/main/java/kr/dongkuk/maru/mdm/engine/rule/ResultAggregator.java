package kr.dongkuk.maru.mdm.engine.rule;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.CollectAgg;

/**
 * 적중 정책의 값 계산 — PRIORITY 순위, COLLECT 집계, ANY 값 비교(TSK-03-03 design §6.3, D6·D7).
 * 숫자는 {@code compareTo} 로 견준다(EvalEx 결과는 scale 이 제각각이다, E6).
 */
final class ResultAggregator {

    private ResultAggregator() {}

    /**
     * PRIORITY 순위 순 행 번호. {@code rows} 는 행 seq 순 결과 맵, {@code prioByName} 은 결과 열 seq 순으로 {@code prio_list} 가
     * 비어 있지 않은 결과 이름 → 목록. 순위 튜플을 사전식으로 견주고 동률은 행 seq 순(안정 정렬)이다(D6).
     */
    static List<Integer> priorityOrder(List<Map<String, Object>> rows, Map<String, List<String>> prioByName) {
        List<int[]> ranked = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            int[] tuple = new int[prioByName.size() + 1];
            int j = 0;
            for (Map.Entry<String, List<String>> e : prioByName.entrySet()) {
                tuple[j++] = rank(rows.get(i).get(e.getKey()), e.getValue());
            }
            tuple[j] = i;
            ranked.add(tuple);
        }
        ranked.sort(ResultAggregator::compareTuples);
        List<Integer> order = new ArrayList<>();
        for (int[] t : ranked) {
            order.add(t[t.length - 1]);
        }
        return order;
    }

    private static int compareTuples(int[] a, int[] b) {
        for (int i = 0; i < a.length; i++) {
            int c = Integer.compare(a[i], b[i]);
            if (c != 0) {
                return c;
            }
        }
        return 0;
    }

    /** 값의 순위 = 목록에서 처음 일치하는 위치. 없거나 NULL 이면 목록 길이(가장 낮음). */
    static int rank(Object value, List<String> prio) {
        if (value != null) {
            for (int i = 0; i < prio.size(); i++) {
                if (matches(value, prio.get(i))) {
                    return i;
                }
            }
        }
        return prio.size();
    }

    private static boolean matches(Object value, String element) {
        if (value instanceof BigDecimal d) {
            try {
                return d.compareTo(new BigDecimal(element)) == 0;
            } catch (NumberFormatException e) {
                return false;
            }
        }
        if (value instanceof String s) {
            return s.equals(element);
        }
        if (value instanceof Boolean b) {
            return (b ? "TRUE" : "FALSE").equalsIgnoreCase(element);
        }
        return false;
    }

    /**
     * COLLECT 집계(D7). NULL 은 버린다. 모은 값이 없으면 LIST 는 빈 목록, COUNT 는 0, 나머지는 null.
     * SUM 은 숫자만, MIN·MAX 는 숫자끼리 또는 문자열끼리만 — 어기면 IAE(부르는 쪽이 EVALUATION_ERROR).
     */
    static Object collect(CollectAgg agg, List<Object> values) {
        List<Object> kept = new ArrayList<>();
        for (Object v : values) {
            if (v != null) {
                kept.add(v);
            }
        }
        CollectAgg a = agg == null ? CollectAgg.LIST : agg;
        switch (a) {
            case COUNT:
                return BigDecimal.valueOf(kept.size());
            case SUM: {
                if (kept.isEmpty()) {
                    return null;
                }
                BigDecimal sum = BigDecimal.ZERO;
                for (Object v : kept) {
                    if (!(v instanceof BigDecimal d)) {
                        throw new IllegalArgumentException("SUM 은 숫자만 모은다: " + v.getClass().getSimpleName());
                    }
                    sum = sum.add(d);
                }
                return sum;
            }
            case MIN:
            case MAX:
                return extreme(kept, a == CollectAgg.MIN);
            default:
                return Collections.unmodifiableList(kept);
        }
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static Object extreme(List<Object> kept, boolean min) {
        if (kept.isEmpty()) {
            return null;
        }
        boolean numbers = kept.get(0) instanceof BigDecimal;
        boolean strings = kept.get(0) instanceof String;
        for (Object v : kept) {
            if (!(numbers && v instanceof BigDecimal) && !(strings && v instanceof String)) {
                throw new IllegalArgumentException("MIN·MAX 는 숫자끼리 또는 문자열끼리만 견준다: "
                        + v.getClass().getSimpleName());
            }
        }
        Comparable best = (Comparable) kept.get(0);
        for (Object v : kept) {
            int c = ((Comparable) v).compareTo(best);
            if (min ? c < 0 : c > 0) {
                best = (Comparable) v;
            }
        }
        return best;
    }

    /** ANY 값 비교 — 숫자는 compareTo, 목록은 원소별, null 끼리 같음(I24). */
    static boolean sameValue(Object a, Object b) {
        if (a == null || b == null) {
            return a == b;
        }
        if (a instanceof BigDecimal x && b instanceof BigDecimal y) {
            return x.compareTo(y) == 0;
        }
        if (a instanceof List<?> x && b instanceof List<?> y) {
            if (x.size() != y.size()) {
                return false;
            }
            for (int i = 0; i < x.size(); i++) {
                if (!sameValue(x.get(i), y.get(i))) {
                    return false;
                }
            }
            return true;
        }
        return a.equals(b);
    }
}
