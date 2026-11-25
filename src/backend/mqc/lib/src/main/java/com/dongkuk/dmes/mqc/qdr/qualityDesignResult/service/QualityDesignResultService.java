package com.dongkuk.dmes.mqc.qdr.qualityDesignResult.service;

import com.dongkuk.dmes.mqc.qcd.order.pipeline.DesignPipeline;
import com.dongkuk.dmes.mqc.qcd.order.pipeline.PinPaths;
import com.dongkuk.dmes.mqc.qcd.order.pipeline.PipelineText;
import com.dongkuk.dmes.mqc.qcd.order.repository.OrderLookup;
import com.dongkuk.dmes.mqc.qcd.order.service.DesignSupport;
import com.dongkuk.dmes.mqc.qcd.order.service.OrderViews;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain.DesignHistory;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain.DesignRequest;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain.DesignResult;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain.DesignStatus;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.dto.QualityDesignResultKeyRequest;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.dto.QualityDesignResultSearchRequest;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.repository.DesignHistoryRepository;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.repository.DesignRequestRepository;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.repository.DesignResultRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 품질설계결과(OASIS qualityDesignResult, 화면 qdr/qualityDesignResult).
 * 주문 줄마다 Maru 룰 파이프라인({@link DesignPipeline})으로 설계값을 계산해 저장하고(calculate), 확정(confirm)·보류 토글(cancel)한다.
 * 계산한 적 없는 주문은 view 가 저장 없이 미리보기(stored=false)를 돌려준다.
 * 진입 빈이라 @Transactional 을 두지 않는다 — OASIS 가 서비스 단위 트랜잭션을 건다.
 */
@Service("qualityDesignResult")
public class QualityDesignResultService {

    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final OrderLookup orders;
    private final DesignRequestRepository requests;
    private final DesignResultRepository results;
    private final DesignHistoryRepository histories;
    private final DesignPipeline pipeline;
    private final Clock clock;

    @Autowired
    public QualityDesignResultService(OrderLookup orders, DesignRequestRepository requests, DesignResultRepository results,
                                      DesignHistoryRepository histories, DesignPipeline pipeline) {
        this(orders, requests, results, histories, pipeline, DesignSupport.systemClock());
    }

    public QualityDesignResultService(OrderLookup orders, DesignRequestRepository requests, DesignResultRepository results,
                                      DesignHistoryRepository histories, DesignPipeline pipeline, Clock clock) {
        this.orders = orders;
        this.requests = requests;
        this.results = results;
        this.histories = histories;
        this.pipeline = pipeline;
        this.clock = clock;
    }

    /** 의뢰 목록. 응답 rows[OrderRow + status·statusNm·calcAt·verdict], totalCount, counts{WAIT,ING,CONF,HOLD}(상태 조건만 뺀 건수). */
    public Map<String, Object> search(QualityDesignResultSearchRequest req) {
        String from = ymd(req.getFromDt(), "시작일");
        String to = ymd(req.getToDt(), "종료일");
        if (from != null && to != null && from.compareTo(to) > 0) throw DesignSupport.invalid("시작일이 종료일보다 늦을 수 없습니다.");
        DesignStatus statusFilter = blank(req.getStatus()) ? null : DesignStatus.of(req.getStatus());
        if (!blank(req.getStatus()) && statusFilter == null) throw DesignSupport.invalid("설계 상태가 올바르지 않습니다: " + req.getStatus());
        Map<String, DesignRequest> reqs = new HashMap<>();
        requests.findAll().forEach(r -> reqs.put(r.getOrdKey(), r));
        Map<String, DesignResult> rslts = new HashMap<>();
        results.findAll().forEach(r -> rslts.put(r.getOrdKey(), r));
        Map<DesignStatus, Integer> counts = new EnumMap<>(DesignStatus.class);
        for (DesignStatus s : DesignStatus.values()) counts.put(s, 0);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, String> o : orders.all()) {
            String d = o.get("REQ_DT");
            if (from != null && (d == null || d.compareTo(from) < 0)) continue;
            if (to != null && (d == null || d.compareTo(to) > 0)) continue;
            if (!blank(req.getPrdNmCd()) && !req.getPrdNmCd().trim().equals(o.get("PRD_NM_CD"))) continue;
            if (!OrderViews.matches(o, req.getKeyword())) continue;
            String key = OrderViews.key(o);
            DesignRequest r = reqs.get(key);
            DesignStatus st = r == null ? DesignStatus.WAIT : r.getDsnStat();
            counts.merge(st, 1, Integer::sum);
            if (statusFilter != null && st != statusFilter) continue;
            Map<String, Object> row = OrderViews.row(o);
            row.put("status", st.name());
            row.put("statusNm", st.label());
            DesignResult rs = rslts.get(key);
            row.put("calcAt", rs == null ? null : DesignSupport.format(rs.getCalcDttm()));
            row.put("verdict", rs == null ? null : rs.getVerdict());
            rows.add(row);
        }
        Map<String, Object> countView = new LinkedHashMap<>();
        counts.forEach((k, v) -> countView.put(k.name(), v));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rows", rows);
        out.put("totalCount", rows.size());
        out.put("counts", countView);
        return out;
    }

    /** 설계 상세(DesignView). 저장된 결과가 없으면 미리보기 계산(저장하지 않음). */
    public Map<String, Object> view(QualityDesignResultKeyRequest req) {
        Map<String, String> o = loadOrder(req.getOrderKey());
        return detail(o, null);
    }

    /** 설계 계산 — 파이프라인을 돌려 저장한다. 미설계는 설계중이 된다. 확정·보류 주문은 계산하지 않는다. */
    public Map<String, Object> calculate(QualityDesignResultKeyRequest req) {
        Map<String, String> o = loadOrder(req.getOrderKey());
        DesignRequest r = requestOf(o);
        if (r.getDsnStat() == DesignStatus.CONF) throw DesignSupport.business("확정된 설계는 다시 계산하지 않습니다: " + r.getOrdKey());
        if (r.getDsnStat() == DesignStatus.HOLD) throw DesignSupport.business("보류 중인 설계는 계산하지 않습니다. 보류를 해제한 뒤 계산하세요: " + r.getOrdKey());
        Map<String, Object> run = calc(o, r);
        return detail(o, run);
    }

    /** 설계 확정. 결과가 없으면 먼저 계산한다. 확정·보류 주문은 받지 않는다. */
    public Map<String, Object> confirm(QualityDesignResultKeyRequest req) {
        Map<String, String> o = loadOrder(req.getOrderKey());
        DesignRequest r = requestOf(o);
        if (r.getDsnStat() == DesignStatus.CONF) throw DesignSupport.business("이미 확정된 설계입니다: " + r.getOrdKey());
        if (r.getDsnStat() == DesignStatus.HOLD) throw DesignSupport.business("보류 중인 설계는 확정하지 않습니다. 보류를 해제한 뒤 확정하세요: " + r.getOrdKey());
        if (!results.existsById(r.getOrdKey())) calc(o, r);
        LocalDateTime now = DesignSupport.now(clock);
        String by = DesignSupport.actor();
        DesignStatus before = r.getDsnStat();
        r.confirm(by, now);
        requests.save(r);
        histories.save(DesignHistory.of(r.getOrdKey(), DesignHistory.CONF, before, DesignStatus.CONF, DesignSupport.trimToNull(req.getNote()), by, now));
        return detail(o, null);
    }

    /** 보류 토글 — 보류가 아니면 보류로, 보류면 이전 상태(없으면 설계중)로. */
    public Map<String, Object> cancel(QualityDesignResultKeyRequest req) {
        Map<String, String> o = loadOrder(req.getOrderKey());
        DesignRequest r = requestOf(o);
        String note = DesignSupport.trimToNull(req.getNote());
        if (note != null && note.length() > 500) throw DesignSupport.invalid("사유는 500자까지 입력합니다.");
        LocalDateTime now = DesignSupport.now(clock);
        String by = DesignSupport.actor();
        DesignStatus before = r.getDsnStat();
        String action;
        if (before == DesignStatus.HOLD) {
            r.unhold(by, now);
            action = DesignHistory.UNHOLD;
        } else {
            r.hold(by, now);
            action = DesignHistory.HOLD;
        }
        requests.save(r);
        histories.save(DesignHistory.of(r.getOrdKey(), action, before, r.getDsnStat(), note, by, now));
        return detail(o, null);
    }

    /** 이력(최근 순). 응답 events[histId, action, actionNm, before, after, note, by, at]. */
    public Map<String, Object> history(QualityDesignResultKeyRequest req) {
        String[] k = OrderViews.splitKey(req.getOrderKey());
        List<Map<String, Object>> events = new ArrayList<>();
        for (DesignHistory h : histories.findByOrdKeyOrderByActDttmDescHistIdDesc(k[0] + "-" + k[1])) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("histId", h.getHistId());
            m.put("action", h.getActionCd());
            m.put("actionNm", switch (h.getActionCd()) {
                case DesignHistory.CALC -> "설계 계산";
                case DesignHistory.CONF -> "설계 확정";
                case DesignHistory.HOLD -> "보류";
                case DesignHistory.UNHOLD -> "보류 해제";
                default -> h.getActionCd();
            });
            m.put("before", label(h.getBeforeStat()));
            m.put("after", label(h.getAfterStat()));
            m.put("note", h.getNote());
            m.put("by", h.getActBy());
            m.put("at", DesignSupport.format(h.getActDttm()));
            events.add(m);
        }
        return Map.of("events", events);
    }

    // ── 내부 ─────────────────────────────────────────────────

    private Map<String, Object> calc(Map<String, String> o, DesignRequest r) {
        LocalDateTime now = DesignSupport.now(clock);
        String by = DesignSupport.actor();
        DesignStatus before = r.getDsnStat();
        r.calculated(by, now);
        Map<String, Object> run = pipeline.run(OrderViews.fields(o), now.atZone(DesignSupport.KST).toInstant(), r.getDsnStat().commonLabel());
        @SuppressWarnings("unchecked") Map<String, Object> summary = (Map<String, Object>) run.get("summary");
        @SuppressWarnings("unchecked") Map<String, Object> design = (Map<String, Object>) run.get("design");
        DesignResult rs = results.findById(r.getOrdKey()).orElseGet(() -> DesignResult.of(r.getOrdKey()));
        String raw = String.valueOf(PinPaths.resolve(design, "cgl.lines.적정.1"));
        rs.update(String.valueOf(summary.get("verdict")), (String) run.get("mainLine"), (String) PinPaths.resolve(design, "route.no"),
                raw.split(" - ")[0], PipelineText.num(PinPaths.resolve(design, "cgl.pltcm.X-Ray Set두께값")),
                PipelineText.num(PinPaths.resolve(design, "cgl.pltcm.폭목표값(주공정)")),
                ((Number) summary.get("errors")).intValue(), ((Number) summary.get("warnings")).intValue(), now, DesignSupport.toJson(run), by, now);
        results.save(rs);
        requests.save(r);
        histories.save(DesignHistory.of(r.getOrdKey(), DesignHistory.CALC, before, r.getDsnStat(),
                "판정 " + summary.get("verdict") + " · 오류 " + summary.get("errors") + " · 경고 " + summary.get("warnings"), by, now));
        return run;
    }

    private Map<String, Object> detail(Map<String, String> o, Map<String, Object> freshRun) {
        DesignRequest r = requestOf(o);
        DesignResult rs = results.findById(r.getOrdKey()).orElse(null);
        Map<String, Object> run = freshRun;
        boolean stored = rs != null;
        if (run == null && rs != null) run = DesignSupport.readMap(rs.getResultJson());
        if (run == null) run = pipeline.run(OrderViews.fields(o), DesignSupport.now(clock).atZone(DesignSupport.KST).toInstant(), r.getDsnStat().commonLabel());
        patchStatus(run, r.getDsnStat());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("order", OrderViews.row(o));
        out.put("fields", OrderViews.fields(o));
        out.put("status", r.getDsnStat().name());
        out.put("statusNm", r.getDsnStat().label());
        out.put("stored", stored);
        out.put("calcAt", rs == null ? null : DesignSupport.format(rs.getCalcDttm()));
        out.put("calcBy", rs == null ? null : rs.getCalcBy());
        out.put("confAt", DesignSupport.format(r.getConfDttm()));
        out.put("confBy", r.getConfBy());
        out.put("run", run);
        return out;
    }

    /** 공통 섹션 첫 줄(품질설계상태)을 지금 상태로 맞춘다. */
    @SuppressWarnings("unchecked")
    private static void patchStatus(Map<String, Object> run, DesignStatus st) {
        Object design = run.get("design");
        if (!(design instanceof Map<?, ?> d)) return;
        Object common = ((Map<String, Object>) d).get("common");
        if (common instanceof List<?> rows && !rows.isEmpty() && rows.get(0) instanceof List<?> first && first.size() > 1) {
            ((List<Object>) first).set(1, st.commonLabel());
        }
    }

    private DesignRequest requestOf(Map<String, String> o) {
        String key = OrderViews.key(o);
        return requests.findById(key).orElseGet(() -> DesignRequest.waiting(o.get("ORD_REQ_NO"), o.get("ORD_REQ_LN"),
                o.get("REQ_DT") == null ? YMD.format(LocalDate.now(clock)) : o.get("REQ_DT"), DesignSupport.actor(), DesignSupport.now(clock)));
    }

    private Map<String, String> loadOrder(String orderKey) {
        String[] k = OrderViews.splitKey(orderKey);
        return orders.one(k[0], k[1]).orElseThrow(() -> DesignSupport.business("주문을 찾을 수 없습니다: " + orderKey));
    }

    private static String label(String st) {
        DesignStatus s = DesignStatus.of(st);
        return s == null ? st : s.label();
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    /** yyyy-MM-dd 또는 yyyyMMdd → yyyyMMdd. 비면 null. */
    static String ymd(String text, String label) {
        if (blank(text)) return null;
        String t = text.trim();
        try {
            return t.length() == 8 ? LocalDate.parse(t, YMD).format(YMD) : LocalDate.parse(t.substring(0, 10)).format(YMD);
        } catch (DateTimeParseException | StringIndexOutOfBoundsException e) {
            throw DesignSupport.invalid(label + " 형식이 올바르지 않습니다: " + text);
        }
    }
}
