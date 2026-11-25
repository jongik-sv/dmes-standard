package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 파이프라인을 저장소 Maru 등록 묶음(실제 룰 데이터)과 실제 엔진으로 돌린다. */
@SuppressWarnings("unchecked")
class DesignPipelineTest {

    static final Instant TS = LocalDateTime.of(2026, 11, 25, 10, 0).atZone(ZoneId.of("Asia/Seoul")).toInstant();

    private Map<String, Object> run(BundleRuleGateway gw, Map<String, String> order) {
        return new DesignPipeline(new RuleCaller(gw), DemoOrders.specs()).run(order, TS, null);
    }

    private static Map<String, Object> stage(Map<String, Object> run, int no) {
        return ((List<Map<String, Object>>) run.get("stages")).get(no - 1);
    }

    private static Map<String, Object> trace(Map<String, Object> run, String path) {
        return ((Map<String, Map<String, Object>>) ((Map<String, Object>) run.get("design")).get("trace")).get(path);
    }

    @Test
    void ccgi_reference_order_is_designed_from_rules_with_evidence() {
        Map<String, Object> run = run(BundleRuleGateway.load(), DemoOrders.ccgi());
        assertThat(run.get("orderKey")).isEqualTo("D260831014-010");
        assertThat((List<?>) run.get("stages")).hasSize(6);
        Map<String, Object> design = (Map<String, Object>) run.get("design");

        // 압연 SET — C10B2060 TS-008 보정 −0.02 → 0.430 (AS-IS 기준 주문 값과 같다)
        assertThat(PinPaths.resolve(design, "cgl.pltcm.X-Ray Set두께값")).isEqualTo("0.430");
        Map<String, Object> set = trace(run, "cgl.pltcm.X-Ray Set두께값");
        assertThat(set).containsEntry("kind", "rule").containsEntry("ruleId", "C10B2060").containsEntry("ruleKey", "TS-008")
                .containsEntry("screen", "rollingThicknessSet");
        assertThat((String) set.get("formula")).contains("0.430");

        // 통과공정 — QD_PROCESS_ROUTING PR-002 → 1P-83-AX, 주공정 3CGL
        assertThat(PinPaths.resolve(design, "route.no")).isEqualTo("1P-83-AX");
        assertThat(run.get("mainLine")).isEqualTo("3CGL");
        assertThat(trace(run, "route.no")).containsEntry("ruleKey", "PR-002");

        // 폭 — PLTCM 수축 룰 근거가 붙는다
        assertThat(trace(run, "cgl.pltcm.폭수축값")).containsEntry("ruleId", "C10B1074");
        BigDecimal target = PipelineText.num(PinPaths.resolve(design, "cgl.pltcm.폭목표값(주공정)"));
        BigDecimal trim = PipelineText.num(PinPaths.resolve(design, "cgl.pltcm.Side Trimming Set값(주공정)"));
        assertThat(target).isGreaterThanOrEqualTo(new BigDecimal("1490"));
        assertThat(trim).isGreaterThanOrEqualTo(target);

        // ② 정합성: QD_ORDER_CHECK 가 A803(2조 이상 Slitting 필수) 을 낸다
        Map<String, Object> s2 = stage(run, 2);
        assertThat(s2.get("verdict")).isEqualTo("F");
        List<Map<String, Object>> fired = (List<Map<String, Object>>) ((Map<String, Object>) s2.get("detail")).get("fired");
        assertThat(fired).extracting(f -> f.get("errCd")).contains("A803");
        // ③ 단중 24 / 6 = 4 → 허용범위 안
        assertThat(stage(run, 3).get("verdict")).isEqualTo("P");
        assertThat(((Map<String, Object>) stage(run, 3).get("detail")).get("okSplits")).asList().contains(5, 6);
        // ④ 3CGL 주공정 P
        Map<String, Object> s4 = stage(run, 4);
        assertThat(s4.get("verdict")).isEqualTo("P");
        assertThat(((Map<String, Object>) s4.get("detail")).get("mainSheet")).isEqualTo("3CGL");
        // ⑥ 설계값
        assertThat(stage(run, 6).get("verdict")).isEqualTo("P");

        // 형상 — CCGI 5장면, 압연 장면 X-Ray Set 값은 룰 근거
        Map<String, Object> shape = (Map<String, Object>) run.get("shape");
        assertThat(shape.get("productType")).isEqualTo("CCGI");
        List<Map<String, Object>> scenes = (List<Map<String, Object>>) shape.get("scenes");
        assertThat(scenes).extracting(s -> s.get("id")).containsExactly("raw", "rolled", "coated", "painted", "product");
        Map<String, Object> setVal = ((List<Map<String, Object>>) scenes.get(1).get("values")).get(0);
        assertThat(setVal.get("value")).isEqualTo(0.43);
        assertThat((Map<String, Object>) setVal.get("evidence")).containsEntry("kind", "rule").containsEntry("ruleId", "C10B2060");
        assertThat((String) shape.get("summary")).startsWith("CCGI · 원자재").contains("Set 0.430").contains("제품 0.472×1,490");
        assertThat(((Map<String, Object>) run.get("source")).get("label")).isEqualTo("라이브");
    }

    @Test
    void gl_without_routing_rule_row_falls_back_to_7cgl_and_has_no_sheet() {
        Map<String, Object> run = run(BundleRuleGateway.load(), DemoOrders.gl());
        Map<String, Object> design = (Map<String, Object>) run.get("design");
        // 320104-L02(확정) 사양이 통과공정을 덮어쓰고, 작성중 L09 는 적용하지 않는다
        assertThat(PinPaths.resolve(design, "route.no")).isEqualTo("1P-31-81-A1");
        assertThat(trace(run, "route.no")).containsEntry("kind", "spec").containsEntry("screen", "qualitySpec");
        assertThat(PinPaths.resolve(design, "cgl.lines.적정.1")).asString().startsWith("H32");
        Map<String, Object> spec = (Map<String, Object>) stage(run, 5).get("detail");
        assertThat(stage(run, 5).get("verdict")).isEqualTo("P");
        List<Map<String, Object>> cands = (List<Map<String, Object>>) spec.get("candidates");
        assertThat(cands).extracting(c -> c.get("specNo") + ":" + c.get("applied")).containsExactly("320104-L01:false", "320104-L02:true", "320104-L09:false");
        // GLOSS 는 설계결과에 대응 항목이 없다 → 사양 미연결
        List<Map<String, Object>> anomalies = (List<Map<String, Object>>) run.get("anomalies");
        assertThat(anomalies).extracting(a -> a.get("kind")).contains("spec-unmapped");
        // 사양 경로 1P-31 → 2CGL GL 시트
        assertThat(run.get("mainLine")).isEqualTo("2CGL");
        assertThat(((Map<String, Object>) stage(run, 4).get("detail")).get("mainSheet")).isEqualTo("2CGL-GL");
    }

    @Test
    void gl_without_spec_uses_standard_route_7cgl_and_feasibility_cannot_judge() {
        Map<String, Object> run = new DesignPipeline(new RuleCaller(BundleRuleGateway.load()), (c, p) -> SpecSource.SpecData.unavailable("없음"))
                .run(DemoOrders.gl(), TS, null);
        assertThat(PinPaths.resolve(run.get("design"), "route.no")).isEqualTo("1P-87");
        assertThat(run.get("mainLine")).isEqualTo("7CGL");
        Map<String, Object> s4 = stage(run, 4);
        assertThat(s4.get("verdict")).isNull();
        assertThat(((Map<String, Object>) s4.get("detail")).get("missingSheet")).isEqualTo("7CGL");
        assertThat(stage(run, 5).get("verdict")).isNull();
        assertThat(stage(run, 5).get("summary")).asString().contains("건너뜀");
    }

    @Test
    void missing_rule_degrades_to_no_criteria_with_rule_id() {
        BundleRuleGateway gw = BundleRuleGateway.load().drop("C10B1075").drop("QD_ORDER_CHECK");
        Map<String, Object> run = run(gw, DemoOrders.ccgi());
        assertThat(stage(run, 2).get("verdict")).isNull();
        assertThat(stage(run, 2).get("summary")).asString().contains("QD_ORDER_CHECK 기준 없음");
        Map<String, Object> wt = trace(run, "cgl.pltcm.폭목표값(주공정)");
        assertThat(wt).containsEntry("kind", "missing").containsEntry("ruleId", "C10B1075");
        assertThat((String) wt.get("note")).contains("기준 없음 — C10B1075");
        List<Map<String, Object>> anomalies = (List<Map<String, Object>>) run.get("anomalies");
        assertThat(anomalies).filteredOn(a -> "no-criteria".equals(a.get("kind"))).extracting(a -> a.get("ref")).contains("C10B1075", "QD_ORDER_CHECK");
        assertThat(((Map<String, Object>) run.get("source")).get("label")).isEqualTo("일부 라이브");
    }

    @Test
    void mdm_unavailable_never_throws() {
        BundleRuleGateway gw = BundleRuleGateway.load();
        gw.unavailable = true;
        Map<String, Object> run = run(gw, DemoOrders.gi());
        assertThat((List<?>) run.get("stages")).hasSize(6);
        assertThat(((Map<String, Object>) run.get("source")).get("label")).isEqualTo("기준 없음");
        assertThat(PinPaths.resolve(run.get("design"), "cgl.pltcm.X-Ray Set두께값")).isEqualTo("0.440");
        assertThat(trace(run, "cgl.pltcm.X-Ray Set두께값")).containsEntry("kind", "missing");
    }

    @Test
    void input_stage_lists_missing_required_fields() {
        Map<String, String> o = DemoOrders.gi();
        o.put("MAT_CD", "");
        o.put("ORD_EXC_WTH", null);
        Map<String, Object> run = run(BundleRuleGateway.load(), o);
        assertThat(stage(run, 1).get("verdict")).isEqualTo("F");
        assertThat(((Map<String, Object>) stage(run, 1).get("detail")).get("missing")).asList().containsExactly("MAT_CD", "ORD_EXC_WTH");
        assertThat(((Map<String, Object>) run.get("summary")).get("verdict")).isEqualTo("BLOCK");
    }

    @Test
    void set_grid_and_truncation_follow_pltcm_logic() {
        assertThat(PipelineText.snapSet(new BigDecimal("0.540"))).isEqualByComparingTo("0.540");
        assertThat(PipelineText.snapSet(new BigDecimal("0.542"))).isEqualByComparingTo("0.540");
        assertThat(PipelineText.snapSet(new BigDecimal("0.544"))).isEqualByComparingTo("0.545");
        assertThat(PipelineText.snapSet(new BigDecimal("0.547"))).isEqualByComparingTo("0.545");
        assertThat(PipelineText.snapSet(new BigDecimal("0.548"))).isEqualByComparingTo("0.550");
        assertThat(PipelineText.snapSet(new BigDecimal("0.998"))).isEqualByComparingTo("1.000");
        assertThat(PipelineText.trunc3(new BigDecimal("0.60863"))).isEqualByComparingTo("0.608");
        assertThat(PipelineText.snapSet(PipelineText.trunc3(new BigDecimal("0.486864")))).isEqualByComparingTo("0.485");
        assertThat(PipelineText.snapSet(PipelineText.trunc3(new BigDecimal("0.2029")))).isEqualByComparingTo("0.200");
    }

    @Test
    void width_band_maps_descending_labels() {
        assertThat(DesignPipeline.widthBand("1260,1230,1150,1050,950,650↑", 1490)).containsExactly(1260.0, "width-above");
        assertThat(DesignPipeline.widthBand("1260,1230,1150,1050,950,650↑", 1225)).containsExactly(1150.0, null);
        assertThat(DesignPipeline.widthBand("1260,1230,1150,1050,950,650↑", 600)).containsExactly(null, "width-below");
    }

    @Test
    void golden_snapshot_paths_and_pins() {
        Map<String, Object> run = run(BundleRuleGateway.load(), DemoOrders.ccgi());
        Object design = run.get("design");
        assertThat(PinPaths.compare("=", PinPaths.resolve(design, "cgl.coat.min"), "80")).isTrue();
        assertThat(PinPaths.compare("~", PinPaths.resolve(design, "common.도금량코드"), "E")).isTrue();
        assertThat(PinPaths.resolve(design, "cgl.lines.적정.6")).isNotNull();
        Map<String, String> snap = PinPaths.snapshot(design);
        assertThat(snap).containsKey("cgl.pltcm.X-Ray Set두께값").containsKey("cgl.lines.적정.1").doesNotContainKey("trace");
        Map<String, Object> again = run(BundleRuleGateway.load(), DemoOrders.ccgi());
        assertThat(PinPaths.diff(snap, PinPaths.snapshot(again.get("design")))).isEmpty();
    }

    @Test
    void seed_simulation_cases_behave_as_documented() {
        DesignPipeline p = new DesignPipeline(new RuleCaller(BundleRuleGateway.load()), (c, x) -> SpecSource.SpecData.unavailable("없음"));
        List<Map<String, Object>> pins = List.of(Map.of("path", "cgl.coat.min", "label", "도금 하한", "op", "=", "val", "80"),
                Map.of("path", "common.도금량코드", "label", "도금량코드", "op", "~", "val", "E"));
        Map<String, Object> tc014 = com.dongkuk.dmes.mqc.qcd.designSimulation.service.CaseEvaluator.evaluate(
                p.run(DemoOrders.ccgi(), TS, null), pins, List.of(Map.of("stage", 4, "expect", "P")), null, null);
        assertThat(tc014.get("status")).isNotEqualTo("FAIL");
        Map<String, Object> tc021 = com.dongkuk.dmes.mqc.qcd.designSimulation.service.CaseEvaluator.evaluate(
                p.run(DemoOrders.gi(), TS, null), List.of(), List.of(Map.of("stage", 4, "expect", "P"), Map.of("stage", 2, "expectErrorCode", "A803")), null, null);
        assertThat(tc021).containsEntry("verdictPass", 2);
        Map<String, Object> tc024 = com.dongkuk.dmes.mqc.qcd.designSimulation.service.CaseEvaluator.evaluate(
                p.run(DemoOrders.gl(), TS, null), List.of(), List.of(Map.of("stage", 4, "expect", "P")), null, null);
        assertThat(tc024).containsEntry("status", "FAIL");
    }
}
