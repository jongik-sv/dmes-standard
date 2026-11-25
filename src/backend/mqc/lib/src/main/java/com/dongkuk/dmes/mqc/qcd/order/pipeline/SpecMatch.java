package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * ⑤ 품질사양 매칭(quality-spec.html renderSimResult 와 같은 규칙). 후보 = 같은 고객사·품명, 맞음 = 조건 모두 참,
 * 적용 = 맞음 + 상태 확정(CONF)·전송완료(SENT). 결과는 표준 기준값에서 시작해 적용 사양이 사양번호 순으로 덮어쓴다(뒤 사양 우선).
 */
public final class SpecMatch {

    /** 사양 항목 → 설계결과 경로(이 항목만 설계값을 바꾼다). */
    public static final Map<String, String> SPEC_TO_DESIGN = DesignCatalog.ordered(
            "CCL_BOM", "head.bom", "PACK_CD", "post.pack", "TOP_THK", "color.sum.thkT", "RAW_MTRL", "cgl.lines.적정.1", "PROC_CD", "route.no");
    private static final Pattern RANGE = Pattern.compile("^(-?[\\d.]+)\\s*~\\s*(-?[\\d.]+)$");
    private static final Set<String> APPLIED = Set.of("CONF", "SENT");
    private static final Map<String, String> STATUS_NM = DesignCatalog.ordered("DRAFT", "작성중", "CONF", "확정", "SENT", "전송완료", "FAIL", "전송실패");

    private final boolean available;
    private final String note;
    private final List<Map<String, Object>> candidates = new ArrayList<>();
    private final List<Map<String, Object>> rows = new ArrayList<>();
    private final List<String> conflicts = new ArrayList<>();
    /** 항목코드 → [값, 표준값, 사양번호들]. 적용 사양이 있는 항목만. */
    private final Map<String, Override> overrides = new LinkedHashMap<>();

    public record Override(String attrCd, String attrNm, String value, String base, List<String> specs) {}

    private SpecMatch(boolean available, String note) {
        this.available = available;
        this.note = note;
    }

    public static SpecMatch evaluate(SpecSource.SpecData data, OrderInput o) {
        SpecMatch m = new SpecMatch(data.available(), data.note());
        if (!data.available()) return m;
        Map<String, List<String>> srcs = new LinkedHashMap<>();
        Map<String, String> values = new LinkedHashMap<>(data.base());
        Map<String, String> names = new LinkedHashMap<>(data.names());
        List<SpecSource.Spec> sorted = new ArrayList<>(data.specs());
        sorted.sort((a, b) -> a.specNo().compareTo(b.specNo()));
        for (SpecSource.Spec s : sorted) {
            boolean matched = true;
            List<Map<String, Object>> conds = new ArrayList<>();
            List<Map<String, Object>> results = new ArrayList<>();
            for (SpecSource.Term t : s.terms()) {
                if (t.attrNm() != null && t.attrCd() != null) names.putIfAbsent(t.attrCd(), t.attrNm());
                if ("IF".equals(t.side())) {
                    if ("CUS_CD".equals(t.attrCd()) || "PRD_NM_CD".equals(t.attrCd())) continue;
                    String ov = orderValue(o, t.attrCd());
                    boolean ok = t.attrCd() != null && compare(t.op(), ov, t.val());
                    matched &= ok;
                    Map<String, Object> c = new LinkedHashMap<>();
                    c.put("attrCd", t.attrCd()); c.put("attrNm", t.attrNm()); c.put("op", t.op()); c.put("val", t.val());
                    c.put("orderVal", ov); c.put("ok", ok);
                    conds.add(c);
                } else {
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("attrCd", t.attrCd()); r.put("attrNm", t.attrNm()); r.put("op", t.op()); r.put("val", t.val()); r.put("unit", t.unit());
                    results.add(r);
                }
            }
            boolean applied = matched && APPLIED.contains(s.status());
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("specNo", s.specNo());
            c.put("status", s.status());
            c.put("statusNm", STATUS_NM.getOrDefault(s.status(), s.status()));
            c.put("matched", matched);
            c.put("applied", applied);
            c.put("excludedReason", applied ? null : !matched ? "조건 불일치" : STATUS_NM.getOrDefault(s.status(), s.status()) + " 사양은 적용하지 않습니다");
            c.put("conds", conds);
            c.put("results", results);
            m.candidates.add(c);
            if (!applied) continue;
            for (SpecSource.Term t : s.terms()) {
                if (!"THEN".equals(t.side()) || t.attrCd() == null) continue;
                values.put(t.attrCd(), display(t.op(), t.val()));
                srcs.computeIfAbsent(t.attrCd(), k -> new ArrayList<>()).add(s.specNo());
            }
        }
        Set<String> codes = new LinkedHashSet<>(data.base().keySet());
        codes.addAll(srcs.keySet());
        for (String code : codes) {
            List<String> from = srcs.getOrDefault(code, List.of());
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("attrCd", code);
            r.put("attrNm", names.getOrDefault(code, code));
            r.put("base", data.base().get(code));
            r.put("value", values.get(code));
            r.put("srcs", from);
            r.put("conflict", from.size() > 1);
            r.put("path", SPEC_TO_DESIGN.get(code));
            m.rows.add(r);
            if (from.size() > 1) m.conflicts.add(names.getOrDefault(code, code) + " — 사양 " + String.join(" → ", from) + " (나중 사양이 이깁니다)");
            if (!from.isEmpty()) m.overrides.put(code, new Override(code, names.getOrDefault(code, code), values.get(code), data.base().get(code), from));
        }
        return m;
    }

    /** 사양 항목 → 주문 값. 사양 사전 코드가 주문 항목과 이름이 다른 것만 옮긴다. */
    static String orderValue(OrderInput o, String code) {
        if (code == null) return null;
        return switch (code) {
            case "CUS_CD" -> o.get("FNL_CUS_CD", o.get("CUS_CD"));
            case "RAW_THK" -> o.get("ORD_EXC_THK");
            case "RAW_WID" -> o.get("ORD_EXC_WTH");
            case "CCL_BOM" -> o.get("CCL_BOM_NO");
            default -> o.get(code);
        };
    }

    static String display(String op, String val) {
        return "=".equals(op) || "~".equals(op) ? val : op + " " + val;
    }

    /** = 글(대소문자 무시) 또는 숫자 같음, ~ 양끝 포함 범위, ≥ ≤ &gt; &lt; 숫자. 주문 값이 없으면 거짓. */
    static boolean compare(String op, String orderVal, String specVal) {
        if (orderVal == null || orderVal.isEmpty()) return false;
        String sval = specVal == null ? "" : specVal.replaceAll("^['\"]|['\"]$", "").trim();
        BigDecimal n = PipelineText.num(orderVal);
        BigDecimal s = PipelineText.num(sval);
        switch (op == null ? "=" : op) {
            case "=":
                return orderVal.trim().toUpperCase(Locale.ROOT).equals(sval.toUpperCase(Locale.ROOT)) || (n != null && s != null && n.compareTo(s) == 0);
            case "~": {
                Matcher mm = RANGE.matcher(sval);
                if (!mm.matches() || n == null) return false;
                BigDecimal lo = PipelineText.num(mm.group(1));
                BigDecimal hi = PipelineText.num(mm.group(2));
                return lo != null && hi != null && n.compareTo(lo) >= 0 && n.compareTo(hi) <= 0;
            }
            case "≥": return n != null && s != null && n.compareTo(s) >= 0;
            case "≤": return n != null && s != null && n.compareTo(s) <= 0;
            case ">": return n != null && s != null && n.compareTo(s) > 0;
            case "<": return n != null && s != null && n.compareTo(s) < 0;
            default: return false;
        }
    }

    public boolean available() { return available; }
    public Map<String, Override> overrides() { return overrides; }
    public List<String> conflicts() { return conflicts; }
    public long appliedCount() { return candidates.stream().filter(c -> Boolean.TRUE.equals(c.get("applied"))).count(); }

    public Map<String, Object> detail() {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("available", available);
        d.put("note", note);
        d.put("conflicts", conflicts);
        d.put("candidates", candidates);
        d.put("rows", rows);
        return d;
    }
}
