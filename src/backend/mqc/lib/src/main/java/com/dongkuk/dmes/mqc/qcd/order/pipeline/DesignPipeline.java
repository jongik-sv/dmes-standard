package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import static com.dongkuk.dmes.mqc.qcd.order.pipeline.DesignCatalog.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import org.springframework.stereotype.Component;

/**
 * 품질설계 파이프라인(품질설계결과·시뮬레이션 공용, simulation.html runPipeline 과 같은 6단계). 차단돼도 멈추지 않고, 첫 차단 단계 뒤는 참고값(advisory)이다.
 * <ol>
 *   <li>주문 입력 검증 — 필수 항목(PRD_NM_CD·SPC_AVR·MAT_CD·ORD_EXC_THK·ORD_EXC_WTH·FNL_CUS_CD)</li>
 *   <li>주문 정합성 — QD_ORDER_CHECK(COLLECT, 주문 전 항목, MAT_CD 제외)</li>
 *   <li>주문단중 에러 — QD_ORDER_WEIGHT_ERROR(ORD_UNT_WGT=ORD_LN_WGT, SPLIT_CNT=ORD_SLIT_GRP_CNT)</li>
 *   <li>생산 가부 — QD_FEAS_*(MAT_GRP_CD=코드 QC_FEAS_MATL_GRP, WID=폭 밴드, THK=주문두께) — 주공정 시트가 판정</li>
 *   <li>품질사양 매칭 — TB_MQC_QSPEC*(SQL 읽기)</li>
 *   <li>설계값 산출 — {@link DesignCalc}</li>
 * </ol>
 * 룰이 없거나 MDM 이 응답하지 않으면 그 단계·값은 「기준 없음」(룰 ID 표시)으로 내려앉고 실행은 계속된다.
 */
@Component
public class DesignPipeline {

    static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final List<String> CATEGORY_ORDER = List.of("누락", "사용불가", "불필요", "한도위반", "선택오류");
    private static final List<String> GOVERNED = List.of("common.도금량코드", "common.조질도", "common.주문두께구분", "common.두께관리코드",
            "common.폭관리코드", "common.포장방법", "common.권취방법", "head.bom", "post.pack", "color.sum.thkT", "cgl.lines.적정.1");
    private static final Set<String> NON_CONSISTENCY = Set.of("MAT_CD");

    private final RuleCaller caller;
    private final SpecSource specs;

    public DesignPipeline(RuleCaller caller, SpecSource specs) {
        this.caller = caller;
        this.specs = specs;
    }

    /** 주문 하나를 돌린다. statusLabel 은 공통 섹션 「품질설계상태」 표시값(시뮬레이션은 "B : 설계중"). */
    public Map<String, Object> run(Map<String, String> order, Instant evalTs, String statusLabel) {
        OrderInput o = new OrderInput(order);
        RuleCaller.Session s = caller.session(evalTs);
        List<Map<String, Object>> stages = new ArrayList<>();
        List<Map<String, Object>> anomalies = new ArrayList<>();

        stages.add(inputStage(o));
        stages.add(consistencyStage(o, s));
        stages.add(weightStage(o, s));

        SpecSource.SpecData data = specs.load(o.get("FNL_CUS_CD", o.get("CUS_CD", "")), o.prd());
        SpecMatch sm = SpecMatch.evaluate(data, o);
        DesignCalc calc = new DesignCalc(o, sm);
        calc.compute(s);
        Map<String, Object> design = DesignDocs.design(calc, statusLabel == null ? "B : 설계중" : statusLabel);
        Map<String, Object> shape = DesignDocs.shape(calc, design);

        stages.add(feasibilityStage(o, s, calc, anomalies));
        stages.add(specStage(sm));
        stages.add(designStage(calc, design));
        stages.sort(Comparator.comparingInt(st -> (Integer) st.get("no")));

        int blockedAt = 0;
        for (Map<String, Object> st : stages) {
            if (blockedAt > 0) st.put("advisory", true);
            else if (Boolean.TRUE.equals(st.get("blocked"))) blockedAt = (Integer) st.get("no");
        }

        anomalies(calc, design, sm, s, anomalies);
        Map<String, Object> run = new LinkedHashMap<>();
        run.put("orderKey", o.key());
        run.put("evalTs", TS.format(LocalDateTime.ofInstant(evalTs, RuleCaller.KST)));
        run.put("source", source(s));
        run.put("stages", stages);
        run.put("blockedAt", blockedAt);
        run.put("mainLine", calc.mainLine);
        run.put("design", design);
        run.put("shape", shape);
        run.put("anomalies", anomalies);
        int errors = (int) anomalies.stream().filter(a -> "error".equals(a.get("severity"))).count();
        int warnings = (int) anomalies.stream().filter(a -> "warn".equals(a.get("severity"))).count();
        boolean anyBad = stages.stream().anyMatch(st -> !"P".equals(st.get("verdict")));
        String verdict = blockedAt > 0 || "F".equals(stages.get(0).get("verdict")) ? "BLOCK" : (anyBad || warnings > 0 || errors > 0) ? "WARN" : "OK";
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("verdict", verdict);
        summary.put("errors", errors);
        summary.put("warnings", warnings);
        run.put("summary", summary);
        return run;
    }

    // ── ① 입력 ───────────────────────────────────────────────
    private Map<String, Object> inputStage(OrderInput o) {
        List<Map<String, Object>> req = new ArrayList<>();
        List<String> missing = new ArrayList<>();
        for (String f : REQUIRED_FIELDS) {
            String v = o.get(f);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("field", f);
            m.put("label", fieldLabel(f));
            m.put("value", v);
            m.put("missing", v == null);
            req.add(m);
            if (v == null) missing.add(f);
        }
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("required", req);
        d.put("missing", missing);
        String summary = missing.isEmpty() ? "필수 항목이 모두 채워졌습니다."
                : "필수 항목 누락: " + String.join(", ", missing.stream().map(DesignCatalog::fieldLabel).toList());
        return stage(1, "input", "주문 입력 검증", missing.isEmpty() ? "P" : "F", summary, null, List.of(), d);
    }

    // ── ② 정합성 ─────────────────────────────────────────────
    private Map<String, Object> consistencyStage(OrderInput o, RuleCaller.Session s) {
        Map<String, Object> input = new LinkedHashMap<>();
        o.fields().forEach((k, v) -> { if (!NON_CONSISTENCY.contains(k)) input.put(k, v == null || v.isBlank() ? null : v); });
        RuleHit hit = s.judge(RULE_CONSISTENCY, input);
        List<Map<String, Object>> fired = new ArrayList<>();
        Map<String, Set<String>> codesByTarget = new HashMap<>();
        for (Map<String, String> r : hit.all()) {
            codesByTarget.computeIfAbsent(String.valueOf(r.get("TARGET_ITEM")), k -> new LinkedHashSet<>()).add(String.valueOf(r.get("ERR_CD")));
        }
        for (Map<String, String> r : hit.all()) {
            Map<String, Object> f = new LinkedHashMap<>();
            f.put("ruleKey", r.get("RULE_KEY"));
            f.put("errCd", r.get("ERR_CD"));
            f.put("errMsg", r.get("ERR_MSG"));
            f.put("category", r.get("ERR_CATEGORY"));
            f.put("severity", r.get("SEVERITY"));
            f.put("actor", r.get("ACTOR"));
            f.put("ownerDept", r.get("OWNER_DEPT"));
            f.put("targetItem", r.get("TARGET_ITEM"));
            f.put("targetLabel", fieldLabel(String.valueOf(r.get("TARGET_ITEM"))));
            f.put("source", r.get("RULE_SOURCE"));
            f.put("concurrent", codesByTarget.getOrDefault(String.valueOf(r.get("TARGET_ITEM")), Set.of()).size() > 1);
            fired.add(f);
        }
        fired.sort(Comparator.comparingInt((Map<String, Object> f) -> {
            int i = CATEGORY_ORDER.indexOf(String.valueOf(f.get("category")));
            return i < 0 ? 99 : i;
        }).thenComparing(f -> String.valueOf(f.get("ruleKey"))));
        Map<String, Object> d = new LinkedHashMap<>();
        boolean available = hit.matched() || "NO_MATCH".equals(hit.status());
        d.put("available", available);
        d.put("errorCount", fired.size());
        d.put("fired", fired);
        String verdict = !available ? null : fired.isEmpty() ? "P" : "F";
        String summary = !available ? hit.label() + (hit.message() == null ? "" : " — " + hit.message()) : fired.isEmpty() ? "통과" : "에러 " + fired.size() + "건";
        return stage(2, "consistency", "주문 정합성", verdict, summary, "orderConsistency", List.of(hit), d);
    }

    // ── ③ 단중 ───────────────────────────────────────────────
    private Map<String, Object> weightStage(OrderInput o, RuleCaller.Session s) {
        BigDecimal weight = o.num("ORD_LN_WGT");
        BigDecimal split = o.num("ORD_SLIT_GRP_CNT");
        BigDecimal min = new BigDecimal("4.0"), max = new BigDecimal("5.0");
        for (CodeItemRow i : s.codeItems(CODE_WEIGHT_LIMIT)) {
            BigDecimal v = i.attrs() == null || i.attrs().isEmpty() ? null : PipelineText.num(i.attrs().get(0));
            if (v == null) continue;
            if ("MIN".equals(i.code())) min = v;
            if ("MAX".equals(i.code())) max = v;
        }
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("weight", weight == null ? null : weight.doubleValue());
        d.put("split", split == null ? null : split.intValue());
        d.put("min", min.doubleValue());
        d.put("max", max.doubleValue());
        d.put("note", "단중=ORD_LN_WGT · 분할수=ORD_SLIT_GRP_CNT (가정 — 기준정보에 명시 없음)");
        String reason = weight == null ? "weight-null" : split == null ? "split-null" : split.signum() == 0 ? "split-zero" : null;
        List<RuleHit> ev = new ArrayList<>();
        Double unit = null;
        Boolean inRange = null;
        List<Integer> ok = new ArrayList<>();
        if (reason == null) {
            RuleHit hit = s.judge(RULE_WEIGHT, Map.of("ORD_UNT_WGT", weight, "SPLIT_CNT", split));
            ev.add(hit);
            if (hit.missing()) {
                reason = "rule-missing";
            } else if (hit.matched()) {
                unit = PipelineText.dbl(hit.result("SPLIT_UNT_WGT"));
                inRange = "Y".equals(hit.result("IN_RANGE_YN"));
            } else {
                reason = "no-row";
                BigDecimal v = weight.divide(split, 2, RoundingMode.HALF_UP);
                unit = v.doubleValue();
                inRange = v.compareTo(min) >= 0 && v.compareTo(max) <= 0;
            }
            if (!hit.missing()) {
                for (int n = 2; n <= 10; n++) {
                    RuleHit h = s.judge(RULE_WEIGHT, Map.of("ORD_UNT_WGT", weight, "SPLIT_CNT", n));
                    boolean y = h.matched() ? "Y".equals(h.result("IN_RANGE_YN"))
                            : weight.divide(BigDecimal.valueOf(n), 2, RoundingMode.HALF_UP).compareTo(min) >= 0
                              && weight.divide(BigDecimal.valueOf(n), 2, RoundingMode.HALF_UP).compareTo(max) <= 0;
                    if (y) ok.add(n);
                }
            }
        }
        d.put("unitWeight", unit);
        d.put("inRange", inRange);
        d.put("okSplits", ok);
        d.put("reason", reason);
        String verdict = inRange == null ? null : inRange ? "P" : "F";
        String summary = switch (reason == null ? "" : reason) {
            case "weight-null" -> "주문단중이 없어 판정하지 못했습니다";
            case "split-null" -> "분할 수가 없어 판정하지 못했습니다";
            case "split-zero" -> "분할 수가 0 이라 판정하지 못했습니다";
            case "rule-missing" -> RULE_WEIGHT + " 기준 없음";
            default -> "분할단중 " + PipelineText.fixed(unit, 2) + " 이 허용범위 " + PipelineText.plain(min) + "~" + PipelineText.plain(max)
                    + (Boolean.TRUE.equals(inRange) ? " 안에 있습니다" : " 밖입니다") + ("no-row".equals(reason) ? " (기준표 밖 단중 — 산식)" : "");
        };
        return stage(3, "weight", "주문단중 에러", verdict, summary, "orderWeightError", ev, d);
    }

    // ── ④ 생산 가부 ──────────────────────────────────────────
    private Map<String, Object> feasibilityStage(OrderInput o, RuleCaller.Session s, DesignCalc c, List<Map<String, Object>> anomalies) {
        String mat = o.get("MAT_CD", "");
        BigDecimal t = c.t, w = c.w;
        String mainSheet = mainSheet(c.mainLine, c.prd);
        List<CodeItemRow> groups = s.codeItems(CODE_FEAS_GROUP);
        List<Map<String, Object>> rows = new ArrayList<>();
        List<RuleHit> ev = new ArrayList<>();
        String state = null;
        for (Map.Entry<String, String> e : FEAS_RULES.entrySet()) {
            String sheet = e.getKey();
            String ruleId = e.getValue();
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("sheet", sheet);
            r.put("line", sheet.split("-")[0]);
            r.put("ruleId", ruleId);
            r.put("title", ruleTitle(ruleId));
            List<String> flags = new ArrayList<>();
            CodeItemRow g = groups.stream().filter(i -> i.lvl() != null && !i.lvl().isEmpty() && sheet.equalsIgnoreCase(String.valueOf(i.lvl().get(0))))
                    .filter(i -> i.attrs() != null && !i.attrs().isEmpty() && i.attrs().get(0) != null
                            && Arrays.stream(i.attrs().get(0).split(",")).map(String::trim).anyMatch(mat::equals))
                    .findFirst().orElse(null);
            String st = null;
            Double band = null;
            if (groups.isEmpty()) {
                flags.add("group-code-missing");
            } else if (g == null) {
                flags.add("no-group");
            } else if (t == null || w == null) {
                flags.add("size-null");
            } else {
                String widths = g.attrs().size() > 2 ? g.attrs().get(2) : null;
                Object[] b = widthBand(widths, w.doubleValue());
                band = (Double) b[0];
                if (b[1] != null) flags.add((String) b[1]);
                RuleHit hit = s.judge(ruleId, Map.of("MAT_GRP_CD", g.code(), "WID", band == null ? "" : BigDecimal.valueOf(band).stripTrailingZeros().toPlainString(), "THK", t));
                ev.add(hit);
                if (hit.matched()) st = hit.result("FEAS_STAT");
                else if (hit.missing()) flags.add("rule-missing");
                else flags.add("no-cell");
            }
            r.put("matGrp", g == null ? null : g.code());
            r.put("matGrpNm", g == null ? null : g.name());
            r.put("widthBand", band);
            r.put("thk", t == null ? null : t.doubleValue());
            r.put("state", st);
            r.put("stateNm", st == null ? "해당 없음" : FEAS_STATE_NM.getOrDefault(st, st));
            boolean main = sheet.equals(mainSheet);
            r.put("main", main);
            r.put("flags", flags);
            rows.add(r);
            if (main) {
                state = st;
                for (String f : flags) {
                    if (f.startsWith("width-")) anomalies.add(anomaly("range", "warn", "범위 위반", ruleTitle(ruleId) + " — " + f + " (생산범위 축을 벗어나 경계 밴드로 판정)", ruleId));
                }
            }
        }
        String missingSheet = mainSheet == null ? (c.mainLine == null ? "주공정 미정" : c.mainLine) : null;
        if (missingSheet != null) {
            anomalies.add(anomaly("no-criteria", "warn", "기준 부재", missingSheet + " 생산범위 시트가 없어 주공정을 판정하지 못했습니다.", missingSheet));
        }
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("mainLine", c.mainLine);
        d.put("mainSheet", mainSheet);
        d.put("state", state);
        d.put("stateNm", state == null ? null : FEAS_STATE_NM.getOrDefault(state, state));
        d.put("missingSheet", missingSheet);
        d.put("note", "Full Hard 환산: 주문두께 그대로(가정)");
        d.put("rows", rows);
        String verdict = state == null ? null : "P".equals(state) ? "P" : "C".equals(state) ? "C" : "F";
        boolean blocked = "-".equals(state) || "X".equals(state);
        String summary = missingSheet != null ? missingSheet + " 생산범위 시트 없음"
                : state == null ? c.mainLine + " 주공정 판정 불가" : c.mainLine + " 주공정 " + state + " " + FEAS_STATE_NM.getOrDefault(state, state);
        Map<String, Object> st = stage(4, "feasibility", "생산 가부", verdict, summary, "productionFeasibility", ev, d);
        st.put("blocked", blocked);
        return st;
    }

    static String mainSheet(String line, String prd) {
        if (line == null) return null;
        return switch (line) {
            case "2CGL" -> "L".equals(prd) || "W".equals(prd) || "4".equals(prd) ? "2CGL-GL" : "2CGL-GI";
            case "3CGL" -> "3CGL";
            case "4CGL" -> "4CGL";
            case "5CGL" -> "5CGL";
            default -> null;
        };
    }

    /** 폭 라벨(내림차순, 행 i = [L(i), L(i-1))) → [밴드 값, 플래그]. 맨 위 라벨 이상은 맨 위 밴드 + width-above, 마지막 미만은 width-below. */
    static Object[] widthBand(String labels, double w) {
        if (labels == null || labels.isBlank()) return new Object[] {null, "no-width-axis"};
        List<Double> ls = new ArrayList<>();
        for (String l : labels.split(",")) {
            String n = l.replaceAll("[^0-9.]", "");
            if (!n.isEmpty()) ls.add(Double.parseDouble(n));
        }
        if (ls.isEmpty()) return new Object[] {null, "no-width-axis"};
        if (w >= ls.get(0)) return new Object[] {ls.get(0), w > ls.get(0) ? "width-above" : null};
        for (int i = 1; i < ls.size(); i++) if (w >= ls.get(i)) return new Object[] {ls.get(i), null};
        return new Object[] {null, "width-below"};
    }

    // ── ⑤ 사양 ───────────────────────────────────────────────
    private Map<String, Object> specStage(SpecMatch sm) {
        long applied = sm.appliedCount();
        String verdict = !sm.available() ? null : applied > 0 ? "P" : null;
        String summary = !sm.available() ? "품질사양 표 없음 — 건너뜀" : applied > 0 ? "사양 " + applied + "건 적용" : "적용 사양 없음 (표준값)";
        return stage(5, "spec", "품질사양 매칭", verdict, summary, "qualitySpec", List.of(), sm.detail());
    }

    // ── ⑥ 설계 ───────────────────────────────────────────────
    private Map<String, Object> designStage(DesignCalc c, Map<String, Object> design) {
        List<Map<String, Object>> sections = new ArrayList<>();
        sections.add(section("common", "공통", "도금량 " + PinPaths.resolve(design, "common.도금량코드")));
        sections.add(section("mat", "재질", "YP " + PinPaths.resolve(design, "mat.bands.사내사양.3") + " · TS " + PinPaths.resolve(design, "mat.bands.사내사양.5")));
        sections.add(section("tol", "인수도", "설계기준 " + PinPaths.resolve(design, "tol.base.설계기준.2") + "~" + PinPaths.resolve(design, "tol.base.설계기준.3")));
        sections.add(section("cgl", "용융도금 - 제조표준", "SET " + PinPaths.resolve(design, "cgl.pltcm.X-Ray Set두께값") + " · 폭목표 " + PinPaths.resolve(design, "cgl.pltcm.폭목표값(주공정)")));
        sections.add(section("egl", "전기도금 - 제조표준", "해당 없음"));
        sections.add(section("post", "후공정 - 제조표준", "포장 " + c.pack.split(" : ")[0]));
        sections.add(section("color", "칼라제조사양", c.color ? "BOM " + c.bom : "해당 없음"));
        sections.add(section("route", "통과공정", c.routeCd == null ? "" : c.routeCd));
        sections.add(section("comp", "성분", highStrength(c.spc) ? "C ≤ 0.25 · Mn ≤ 1.70" : "C 0.02~0.08 · Mn ≤ 0.50"));
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("sections", sections);
        @SuppressWarnings("unchecked") Map<String, Object> shapeLess = (Map<String, Object>) design.get("head");
        String summary = c.has ? "원자재 " + c.rawCode + " " + PipelineText.plain(c.rawThk) + "×" + PipelineText.plain(c.rawWid)
                + " → SET " + PipelineText.plain(c.setThk) + "×" + PipelineText.plain(c.trimSet) + " → 제품 " + PipelineText.plain(c.t) + "×" + PipelineText.plain(c.w)
                : "주문 두께·폭이 없어 일부 값만 산출" + (shapeLess == null ? "" : "");
        return stage(6, "design", "설계값 산출", "P", summary, null, c.hits(), d);
    }

    private static Map<String, Object> section(String key, String title, String summary) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", key);
        m.put("title", title);
        m.put("summary", summary);
        m.put("anomalies", 0);
        return m;
    }

    // ── 이상징후 ─────────────────────────────────────────────
    private void anomalies(DesignCalc c, Map<String, Object> design, SpecMatch sm, RuleCaller.Session s, List<Map<String, Object>> out) {
        @SuppressWarnings("unchecked") Map<String, Map<String, Object>> trace = (Map<String, Map<String, Object>>) design.get("trace");
        for (String p : GOVERNED) {
            if (design.get("color") == null && (p.startsWith("color.") || "head.bom".equals(p))) continue;
            Object v = PinPaths.resolve(design, p);
            if (PipelineText.blank(v) && (trace.get(p) == null || "missing".equals(trace.get(p).get("kind")))) {
                out.add(anomaly("uncovered", "error", "미커버", "값이 비어 있고 이를 지시하는 기준도 없습니다.", p));
            }
        }
        Set<String> seen = new LinkedHashSet<>();
        s.calls().forEach((ruleId, status) -> {
            if (("RULE_NOT_FOUND".equals(status) || "UNAVAILABLE".equals(status)) && seen.add(ruleId)) {
                out.add(anomaly("no-criteria", "warn", "기준 부재", ruleId + " " + ruleTitle(ruleId) + " — Maru 에 적용 중인 기준이 없습니다(" + status + ").", ruleId));
            }
        });
        if (c.rollHit != null && "NO_MATCH".equals(c.rollHit.status())) {
            out.add(anomaly("no-match", "warn", "기준 미적중", RULE_ROLLING_SET + " 압연두께Set 기준에 맞는 행이 없습니다(AS-IS KK82) — 보정 0 으로 계산했습니다.", RULE_ROLLING_SET));
        }
        if (!c.fallbacks.isEmpty()) {
            out.add(anomaly("standard-only", "info", "표준값", c.fallbacks.size() + "개 값이 기준 미적중·부재로 표준값 또는 0 을 썼습니다: "
                    + String.join(" · ", c.fallbacks.subList(0, Math.min(4, c.fallbacks.size()))) + (c.fallbacks.size() > 4 ? " 외 " + (c.fallbacks.size() - 4) + "건" : ""), null));
        }
        for (String cf : sm.conflicts()) out.add(anomaly("conflict", "warn", "충돌", cf, null));
        sm.overrides().forEach((code, ov) -> {
            if (!SpecMatch.SPEC_TO_DESIGN.containsKey(code)) {
                out.add(anomaly("spec-unmapped", "warn", "사양 미연결", ov.attrNm() + " — 사양은 " + ov.value() + " 를 지시하지만 설계결과에 대응 항목이 없습니다.", code));
            }
        });
    }

    private static Map<String, Object> source(RuleCaller.Session s) {
        List<String> used = new ArrayList<>(), missing = new ArrayList<>();
        s.calls().forEach((id, st) -> {
            if ("RULE_NOT_FOUND".equals(st) || "UNAVAILABLE".equals(st)) missing.add(id);
            else used.add(id);
        });
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("label", used.isEmpty() ? "기준 없음" : missing.isEmpty() ? "라이브" : "일부 라이브");
        m.put("used", used);
        m.put("missing", missing);
        m.put("note", s.unavailable() ? "MDM 에 접속하지 못해 일부 기준을 읽지 못했습니다" : "Maru 룰 " + used.size() + "개 사용" + (missing.isEmpty() ? "" : " · 기준 없음 " + missing.size() + "개"));
        return m;
    }

    static Map<String, Object> anomaly(String kind, String sev, String label, String detail, String ref) {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("kind", kind);
        a.put("severity", sev);
        a.put("label", label);
        a.put("detail", detail);
        a.put("ref", ref);
        return a;
    }

    private static Map<String, Object> stage(int no, String key, String name, String verdict, String summary, String screen, List<RuleHit> hits, Map<String, Object> detail) {
        Map<String, Object> st = new LinkedHashMap<>();
        st.put("no", no);
        st.put("key", key);
        st.put("name", name);
        st.put("verdict", verdict);
        st.put("summary", summary);
        st.put("blocked", false);
        st.put("advisory", false);
        st.put("screen", screen);
        st.put("evidence", hits.stream().map(RuleHit::evidence).toList());
        st.put("detail", detail);
        return st;
    }
}
