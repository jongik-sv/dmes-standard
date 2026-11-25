package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * 설계결과 문서의 경로 읽기·평탄화(시뮬레이션 pinResolve·goldenSnapshot·goldenDiff 와 같은 규칙).
 * 경로 문법 {@code <섹션>.<블록>.<행 라벨>[.<열 번호>]} — 행 배열에서는 첫 칸이 라벨이고 마지막 마디는 인덱스가 아니라 라벨이다.
 */
public final class PinPaths {

    private PinPaths() {
    }

    /** 경로 값. 없으면 null. */
    public static Object resolve(Object doc, String path) {
        if (path == null || path.isBlank()) return null;
        String[] parts = path.split("\\.");
        Object cur = doc;
        for (int i = 0; i < parts.length; i++) {
            String p = parts[i];
            if (cur == null) return null;
            if (isRowArray(cur)) {
                List<?> hit = null;
                for (Object row : (List<?>) cur) {
                    List<?> r = (List<?>) row;
                    if (!r.isEmpty() && p.equals(String.valueOf(r.get(0)))) {
                        hit = r;
                        break;
                    }
                }
                if (hit == null) return null;
                if (i + 1 < parts.length && parts[i + 1].matches("\\d+")) {
                    int idx = Integer.parseInt(parts[++i]);
                    cur = idx < hit.size() ? hit.get(idx) : null;
                } else {
                    cur = hit.size() > 1 ? hit.get(1) : null;
                }
                continue;
            }
            if (cur instanceof Map<?, ?> m) {
                cur = m.get(p);
                continue;
            }
            return null;
        }
        return cur;
    }

    /** 값 비교. op = "=" · "~"(포함) · "≠". 둘 다 숫자면 숫자로 같다. */
    public static boolean compare(String op, Object actual, String expected) {
        String a = actual == null ? "" : text(actual).trim();
        String e = expected == null ? "" : expected.trim();
        if ("~".equals(op)) return a.contains(e);
        if ("≠".equals(op) || "!=".equals(op)) return !a.equals(e);
        BigDecimal na = PipelineText.num(a);
        BigDecimal ne = PipelineText.num(e);
        if (na != null && ne != null && !a.isEmpty() && !e.isEmpty() && a.matches("-?[\\d.,]+") && e.matches("-?[\\d.,]+")) {
            return na.compareTo(ne) == 0;
        }
        return a.equals(e);
    }

    public static String text(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal b) return b.stripTrailingZeros().toPlainString();
        if (v instanceof Double d) return BigDecimal.valueOf(d).stripTrailingZeros().toPlainString();
        return String.valueOf(v);
    }

    /** 문서 전체를 경로 → 글 값으로 편다(trace 는 뺀다). */
    public static Map<String, String> snapshot(Object doc) {
        Map<String, String> acc = new LinkedHashMap<>();
        walk(doc, "", acc);
        return acc;
    }

    private static void walk(Object d, String prefix, Map<String, String> acc) {
        if (d == null) return;
        if (isRowArray(d)) {
            for (Object row : (List<?>) d) {
                List<?> r = (List<?>) row;
                String head = String.valueOf(r.get(0));
                boolean kv = r.size() == 2 || (r.size() == 3 && r.get(2) instanceof String s && s.length() <= 4);
                if (kv) acc.put(prefix + head, text(r.get(1)));
                else for (int c = 1; c < r.size(); c++) acc.put(prefix + head + "." + c, text(r.get(c)));
            }
            return;
        }
        if (d instanceof List<?> l) {
            for (int i = 0; i < l.size(); i++) walk(l.get(i), prefix + i + ".", acc);
            return;
        }
        if (d instanceof Map<?, ?> m) {
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (prefix.isEmpty() && "trace".equals(e.getKey())) continue;
                walk(e.getValue(), prefix + e.getKey() + ".", acc);
            }
            return;
        }
        acc.put(prefix.endsWith(".") ? prefix.substring(0, prefix.length() - 1) : prefix, text(d));
    }

    /** 두 스냅샷의 다른 경로(정렬). */
    public static List<Map<String, Object>> diff(Map<String, String> before, Map<String, String> after) {
        TreeSet<String> keys = new TreeSet<>();
        keys.addAll(before.keySet());
        keys.addAll(after.keySet());
        List<Map<String, Object>> out = new ArrayList<>();
        for (String k : keys) {
            String b = before.get(k);
            String a = after.get(k);
            if (!String.valueOf(b).equals(String.valueOf(a))) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("path", k);
                m.put("before", b);
                m.put("after", a);
                out.add(m);
            }
        }
        return out;
    }

    static boolean isRowArray(Object v) {
        return v instanceof List<?> l && !l.isEmpty() && l.get(0) instanceof List<?> first && !first.isEmpty();
    }
}
