package com.dongkuk.dmes.mqc.qcd.designSimulation.service;

import com.dongkuk.dmes.mqc.qcd.designSimulation.domain.SimCase;
import com.dongkuk.dmes.mqc.qcd.designSimulation.dto.DesignSimulationKeyRequest;
import com.dongkuk.dmes.mqc.qcd.designSimulation.dto.DesignSimulationSaveRequest;
import com.dongkuk.dmes.mqc.qcd.designSimulation.dto.DesignSimulationSearchRequest;
import com.dongkuk.dmes.mqc.qcd.designSimulation.repository.SimCaseRepository;
import com.dongkuk.dmes.mqc.qcd.order.pipeline.DesignCatalog;
import com.dongkuk.dmes.mqc.qcd.order.pipeline.DesignPipeline;
import com.dongkuk.dmes.mqc.qcd.order.pipeline.PinPaths;
import com.dongkuk.dmes.mqc.qcd.order.service.DesignSupport;
import com.dongkuk.dmes.mqc.qcd.order.service.OrderViews;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 품질설계 시뮬레이션(OASIS designSimulation, 화면 qcd/designSimulation). 케이스 하나 = 주문 하나 + 기대값(pin)·단계 판정 기대·골든 스냅샷.
 * run 은 품질설계결과와 같은 파이프라인({@link DesignPipeline})을 돌려 기대값과 맞춰 보고 상태를 저장한다. apply 는 지금 결과를 골든으로 삼는다.
 * 진입 빈이라 @Transactional 을 두지 않는다.
 */
@Service("designSimulation")
public class DesignSimulationService {

    static final String SIM_STATUS = "B : 설계중";

    private final SimCaseRepository cases;
    private final DesignPipeline pipeline;
    private final Clock clock;

    @Autowired
    public DesignSimulationService(SimCaseRepository cases, DesignPipeline pipeline) {
        this(cases, pipeline, DesignSupport.systemClock());
    }

    public DesignSimulationService(SimCaseRepository cases, DesignPipeline pipeline, Clock clock) {
        this.cases = cases;
        this.pipeline = pipeline;
        this.clock = clock;
    }

    /** 케이스 목록. rows[caseId,caseNm,baseOrdRef,status,statusNm,lastRunAt,pinTotal,verdictTotal,hasGolden,author], totalCount. */
    public Map<String, Object> search(DesignSimulationSearchRequest req) {
        String k = req.getKeyword() == null ? "" : req.getKeyword().trim().toLowerCase(Locale.ROOT);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (SimCase c : cases.findAllByOrderByCaseIdAsc()) {
            if (!k.isEmpty() && !(c.getCaseId() + " " + c.getCaseNm() + " " + c.getBaseOrdRef()).toLowerCase(Locale.ROOT).contains(k)) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("caseId", c.getCaseId());
            m.put("caseNm", c.getCaseNm());
            m.put("baseOrdRef", c.getBaseOrdRef());
            m.put("status", c.getLastStat());
            m.put("statusNm", CaseEvaluator.STATUS_NM.getOrDefault(c.getLastStat(), c.getLastStat()));
            m.put("lastRunAt", DesignSupport.format(c.getLastRunDttm()));
            m.put("pinTotal", DesignSupport.readList(c.getPinsJson(), "pin").size());
            m.put("verdictTotal", DesignSupport.readList(c.getVerdictsJson(), "판정 기대").size());
            m.put("hasGolden", c.getGoldenJson() != null);
            m.put("author", c.getAuthorNm());
            rows.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rows", rows);
        out.put("totalCount", rows.size());
        return out;
    }

    public Map<String, Object> view(DesignSimulationKeyRequest req) {
        return caseView(load(req.getCaseId()));
    }

    /** 실행 — 주문(orderJson 이 있으면 그것, 없으면 저장된 주문)으로 파이프라인을 돌리고 평가를 저장한다. */
    public Map<String, Object> run(DesignSimulationKeyRequest req) {
        SimCase c = load(req.getCaseId());
        Map<String, Object> run = execute(c, req.getOrderJson());
        Map<String, Object> eval = evaluate(c, run);
        c.ran((String) eval.get("status"), DesignSupport.toJson(eval), DesignSupport.now(clock));
        cases.save(c);
        return result(c, run, eval);
    }

    /** 골든 채택 — 지금 설계결과 스냅샷을 골든으로 저장하고 다시 평가한다. */
    public Map<String, Object> apply(DesignSimulationKeyRequest req) {
        SimCase c = load(req.getCaseId());
        Map<String, Object> run = execute(c, req.getOrderJson());
        LocalDateTime now = DesignSupport.now(clock);
        c.golden(DesignSupport.toJson(PinPaths.snapshot(run.get("design"))), now);
        Map<String, Object> eval = evaluate(c, run);
        c.ran((String) eval.get("status"), DesignSupport.toJson(eval), now);
        cases.save(c);
        return result(c, run, eval);
    }

    /** 저장(신규·수정). caseId 가 비면 TC-1nn 다음 번호. */
    public Map<String, Object> save(DesignSimulationSaveRequest req) {
        String name = DesignSupport.required(req.getCaseNm(), "케이스 이름");
        if (name.length() > 100) throw DesignSupport.invalid("케이스 이름은 100자까지 입력합니다.");
        String orderJson = DesignSupport.required(req.getOrderJson(), "주문");
        Map<String, String> order = DesignSupport.readOrder(orderJson);
        List<Map<String, Object>> pins = DesignSupport.readList(req.getPinsJson(), "pin");
        for (Map<String, Object> p : pins) {
            if (p.get("path") == null || String.valueOf(p.get("path")).isBlank()) throw DesignSupport.invalid("pin 경로를 입력하세요.");
            Object op = p.get("op");
            if (op != null && !List.of("=", "~", "≠").contains(String.valueOf(op))) throw DesignSupport.invalid("pin 비교는 = · ~ · ≠ 중 하나입니다: " + op);
        }
        List<Map<String, Object>> verdicts = DesignSupport.readList(req.getVerdictsJson(), "판정 기대");
        for (Map<String, Object> v : verdicts) {
            Object st = v.get("stage");
            int no;
            try {
                no = st instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(st));
            } catch (NumberFormatException e) {
                throw DesignSupport.invalid("판정 기대 단계는 1~6 입니다: " + st);
            }
            if (no < 1 || no > 6) throw DesignSupport.invalid("판정 기대 단계는 1~6 입니다: " + st);
        }
        LocalDateTime now = DesignSupport.now(clock);
        String id = req.getCaseId() == null || req.getCaseId().isBlank() ? nextId() : req.getCaseId().trim();
        SimCase c = cases.findById(id).orElseGet(() -> SimCase.create(id, DesignSupport.actor(), now));
        String ref = req.getBaseOrdRef() == null || req.getBaseOrdRef().isBlank() ? null : req.getBaseOrdRef().trim();
        c.edit(name, ref, DesignSupport.toJson(order), DesignSupport.toJson(pins), DesignSupport.toJson(verdicts), now);
        cases.save(c);
        return caseView(c);
    }

    public Map<String, Object> delete(DesignSimulationKeyRequest req) {
        SimCase c = load(req.getCaseId());
        cases.delete(c);
        return Map.of("caseId", c.getCaseId());
    }

    // ── 내부 ─────────────────────────────────────────────────

    private Map<String, Object> execute(SimCase c, String orderJson) {
        Map<String, String> order = DesignSupport.readOrder(orderJson == null || orderJson.isBlank() ? c.getOrderJson() : orderJson);
        return pipeline.run(order, DesignSupport.now(clock).atZone(DesignSupport.KST).toInstant(), SIM_STATUS);
    }

    private Map<String, Object> evaluate(SimCase c, Map<String, Object> run) {
        Map<String, String> golden = null;
        if (c.getGoldenJson() != null) {
            golden = new LinkedHashMap<>();
            for (Map.Entry<String, Object> e : DesignSupport.readMap(c.getGoldenJson()).entrySet()) golden.put(e.getKey(), e.getValue() == null ? null : String.valueOf(e.getValue()));
        }
        return CaseEvaluator.evaluate(run, DesignSupport.readList(c.getPinsJson(), "pin"), DesignSupport.readList(c.getVerdictsJson(), "판정 기대"),
                golden, DesignSupport.format(c.getGoldenDttm()));
    }

    private Map<String, Object> result(SimCase c, Map<String, Object> run, Map<String, Object> eval) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("case", simCase(c));
        out.put("run", run);
        out.put("eval", eval);
        return out;
    }

    private Map<String, Object> caseView(SimCase c) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("case", simCase(c));
        out.put("labels", OrderViews.labels());
        out.put("coreFields", DesignCatalog.CORE_FIELDS);
        out.put("requiredFields", DesignCatalog.REQUIRED_FIELDS);
        return out;
    }

    private Map<String, Object> simCase(SimCase c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("caseId", c.getCaseId());
        m.put("caseNm", c.getCaseNm());
        m.put("baseOrdRef", c.getBaseOrdRef());
        m.put("author", c.getAuthorNm());
        m.put("order", DesignSupport.readOrder(c.getOrderJson()));
        m.put("pins", DesignSupport.readList(c.getPinsJson(), "pin"));
        m.put("verdicts", DesignSupport.readList(c.getVerdictsJson(), "판정 기대"));
        m.put("goldenAt", DesignSupport.format(c.getGoldenDttm()));
        m.put("hasGolden", c.getGoldenJson() != null);
        m.put("status", c.getLastStat());
        m.put("statusNm", CaseEvaluator.STATUS_NM.getOrDefault(c.getLastStat(), c.getLastStat()));
        m.put("lastRunAt", DesignSupport.format(c.getLastRunDttm()));
        m.put("lastEval", c.getLastRunJson() == null ? null : DesignSupport.readMap(c.getLastRunJson()));
        return m;
    }

    private SimCase load(String caseId) {
        String id = DesignSupport.required(caseId, "케이스 ID");
        return cases.findById(id).orElseThrow(() -> DesignSupport.business("케이스를 찾을 수 없습니다: " + id));
    }

    private String nextId() {
        int max = 100;
        for (SimCase c : cases.findAll()) {
            String id = c.getCaseId();
            if (id != null && id.matches("TC-1\\d\\d")) max = Math.max(max, Integer.parseInt(id.substring(3)));
        }
        return "TC-" + (max + 1);
    }
}
