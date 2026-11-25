package com.dongkuk.dmes.mqc.qjd.qualityJudgment.service;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.Coil;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.CoilJudgment;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.InspectionEvaluator;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.InspectionItem;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.ItemResult;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.JudgmentHistory;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.JudgmentStatus;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.dto.QualityJudgmentConfirmRequest;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.dto.QualityJudgmentHistoryRequest;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.dto.QualityJudgmentJudgeRequest;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.dto.QualityJudgmentSearchRequest;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.dto.QualityJudgmentViewRequest;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository.CoilJudgmentRepository;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository.CoilRepository;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository.InspectionItemRepository;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository.JudgmentHistoryRepository;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.support.DemoSupport;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;
import java.util.TreeMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 품질판정(OASIS qualityJudgment, 화면 qjd/qualityJudgment).
 * 코일 검사값을 기준과 비교해 시스템 판정을 제안하고(judge), 검사자가 합격·불합격·보류로 확정한다(confirm).
 * 진입 빈이라 @Transactional 을 두지 않는다 — OASIS 가 서비스 단위 트랜잭션을 건다(cactus.oasis.transactional).
 */
@Service("qualityJudgment")
public class QualityJudgmentService {

    private final CoilRepository coils;
    private final CoilJudgmentRepository judgments;
    private final InspectionItemRepository items;
    private final JudgmentHistoryRepository histories;
    private final CoilLookup lookup;
    private final Clock clock;
    private final ObjectMapper json = new ObjectMapper();

    @Autowired
    public QualityJudgmentService(CoilRepository coils, CoilJudgmentRepository judgments, InspectionItemRepository items,
                                  JudgmentHistoryRepository histories, CoilLookup lookup) {
        this(coils, judgments, items, histories, lookup, DemoSupport.systemClock());
    }

    QualityJudgmentService(CoilRepository coils, CoilJudgmentRepository judgments, InspectionItemRepository items,
                           JudgmentHistoryRepository histories, CoilLookup lookup, Clock clock) {
        this.coils = coils;
        this.judgments = judgments;
        this.items = items;
        this.histories = histories;
        this.lookup = lookup;
        this.clock = clock;
    }

    /**
     * 검사일 기간의 코일 목록과 판정·배지. counts 는 상태 조건만 빼고 거른 건수(탭 「판정 대기 (n)」 용)다.
     * 응답: rows[coil 칸 + badges], totalCount, counts{WAIT,PASS,FAIL,HOLD}.
     */
    public Map<String, Object> search(QualityJudgmentSearchRequest req) {
        LocalDateTime[] r = DemoSupport.range(req.getFromDt(), req.getToDt());
        JudgmentStatus statusFilter = parseStatusFilter(req.getStatus());
        List<Coil> found = coils.findByInspAtGreaterThanEqualAndInspAtLessThanOrderByInspAtDescCoilNoAsc(r[0], r[1]);
        Map<String, CoilJudgment> jdg = new HashMap<>();
        for (CoilJudgment j : judgments.findAllById(found.stream().map(Coil::getCoilNo).toList())) jdg.put(j.getCoilNo(), j);
        Map<String, List<InspectionItem>> itemMap = new HashMap<>();
        for (InspectionItem i : items.findByInspRange(r[0], r[1])) itemMap.computeIfAbsent(i.getCoilNo(), k -> new ArrayList<>()).add(i);

        Map<JudgmentStatus, Integer> counts = new EnumMap<>(JudgmentStatus.class);
        for (JudgmentStatus s : JudgmentStatus.values()) counts.put(s, 0);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Coil c : found) {
            CoilSnapshot s = new CoilSnapshot(c, jdg.get(c.getCoilNo()), itemMap.getOrDefault(c.getCoilNo(), List.of()));
            if (!DemoSupport.eq(req.getLineCd(), c.getLineCd()) || !DemoSupport.eq(req.getPrdCd(), c.getPrdCd())) continue;
            if (!DemoSupport.matches(req.getKeyword(), c.getCoilNo(), c.getOrdNo(), c.prdLabel(), c.getSpecCd(), c.getInspBy(), c.getCusNm())) continue;
            counts.merge(s.status(), 1, Integer::sum);
            if (statusFilter != null && s.status() != statusFilter) continue;
            Map<String, Object> row = s.coilView();
            row.put("badges", s.badges());
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

    /** 코일 한 개의 상세 — coil, judgment, items, chemistry, history. */
    public Map<String, Object> view(QualityJudgmentViewRequest req) {
        return detail(DemoSupport.required(req.getCoilNo(), "코일번호"));
    }

    /**
     * 판정 계산. valuesJson 으로 받은 검사값을 저장하고 모든 항목을 기준으로 다시 판정한 뒤 시스템 제안을 기록한다.
     * 확정 상태(jdgStat)는 바꾸지 않는다. 판정대기·보류 코일만 받는다. 응답은 view 와 같다.
     */
    public Map<String, Object> judge(QualityJudgmentJudgeRequest req) {
        String coilNo = DemoSupport.required(req.getCoilNo(), "코일번호");
        if (!coils.existsById(coilNo)) throw DemoSupport.notFound("코일", coilNo);
        CoilJudgment j = judgments.findById(coilNo).orElseGet(() -> CoilJudgment.waiting(coilNo));
        if (!j.isOpen()) {
            throw DemoSupport.business("판정대기·보류 코일만 다시 판정합니다: " + coilNo + "(" + j.getJdgStat().label() + ")");
        }
        List<InspectionItem> list = items.findByCoilNoOrderBySeqAsc(coilNo);
        if (list.isEmpty()) throw DemoSupport.business("검사 항목이 없는 코일입니다: " + coilNo);
        Map<String, String> values = parseValues(req.getValuesJson());

        Map<String, InspectionItem> byCd = new LinkedHashMap<>();
        for (InspectionItem i : list) byCd.put(i.getItemCd(), i);
        StringJoiner changed = new StringJoiner(", ");
        for (Map.Entry<String, String> e : values.entrySet()) {
            InspectionItem i = byCd.get(e.getKey());
            if (i == null) throw DemoSupport.invalid("검사 항목 코드가 올바르지 않습니다: " + e.getKey());
            String v;
            try {
                v = InspectionEvaluator.normalize(i.getCritTp(), e.getValue());
            } catch (IllegalArgumentException ex) {
                throw DemoSupport.invalid(i.getItemNm() + " — " + ex.getMessage());
            }
            if (!java.util.Objects.equals(v, i.getMeasVal())) changed.add(i.getItemNm() + " " + (v == null ? "—" : v));
            i.record(v);
        }
        List<ItemResult> results = new ArrayList<>();
        for (InspectionItem i : list) {
            i.reevaluate();
            results.add(i.getRsltCd());
        }
        JudgmentStatus suggestion = InspectionEvaluator.suggest(results);
        LocalDateTime now = DemoSupport.now(clock);
        j.suggest(suggestion, now);
        items.saveAll(list);
        judgments.save(j);
        String note = changed.length() == 0 ? "판정 계산" : "검사값 수정: " + changed;
        histories.save(JudgmentHistory.of(coilNo, JudgmentHistory.JUDGE, j.getJdgStat(), j.getJdgStat(), suggestion,
                note, DemoSupport.actor(), now));
        return detail(coilNo);
    }

    /**
     * 판정 확정(코일 하나 또는 여러 개). 합격·불합격·보류만 받는다. 판정대기·보류 코일만 확정한다.
     * 시스템 제안과 다르게 확정하면 사유(note)가 있어야 한다. 하나라도 못 하면 아무것도 바꾸지 않는다.
     * 응답: count, status, statusNm, coilNos, (코일 하나면) detail.
     */
    public Map<String, Object> confirm(QualityJudgmentConfirmRequest req) {
        List<String> keys = DemoSupport.keys(req.getCoilNos(), "코일");
        JudgmentStatus target = JudgmentStatus.of(req.getStatus());
        if (target == null || target == JudgmentStatus.WAIT) throw DemoSupport.invalid("확정 판정은 합격·불합격·보류 중 하나여야 합니다.");
        String note = DemoSupport.trimToNull(req.getNote());
        if (note != null && note.length() > 500) throw DemoSupport.invalid("사유는 500자까지 입력합니다.");

        Map<String, CoilSnapshot> snaps = lookup.load(keys);
        List<String> missing = keys.stream().filter(k -> !snaps.containsKey(k)).toList();
        if (!missing.isEmpty()) throw DemoSupport.notFound("코일", String.join(", ", missing));
        List<String> closed = new ArrayList<>();
        List<String> needNote = new ArrayList<>();
        for (CoilSnapshot s : snaps.values()) {
            if (s.status() != JudgmentStatus.WAIT && s.status() != JudgmentStatus.HOLD) closed.add(s.coilNo() + "(" + s.status().label() + ")");
            else if (note == null && s.suggestion() != target) {
                needNote.add(s.coilNo() + "(제안 " + (s.suggestion() == null ? "없음" : s.suggestion().label()) + ")");
            }
        }
        if (!closed.isEmpty()) throw DemoSupport.business("이미 확정된 코일은 바꾸지 않습니다: " + String.join(", ", closed));
        if (!needNote.isEmpty()) {
            throw DemoSupport.business("시스템 제안과 다르게 " + target.label() + " 처리하려면 사유를 입력하세요: " + String.join(", ", needNote));
        }

        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        for (CoilSnapshot s : snaps.values()) {
            CoilJudgment j = s.judgment() == null ? CoilJudgment.waiting(s.coilNo()) : s.judgment();
            JudgmentStatus before = j.getJdgStat();
            j.confirm(target, by, now, note);
            judgments.save(j);
            histories.save(JudgmentHistory.of(s.coilNo(), JudgmentHistory.CONFIRM, before, target, j.getSuggStat(), note, by, now));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("count", snaps.size());
        out.put("status", target.name());
        out.put("statusNm", target.label());
        out.put("coilNos", keys);
        if (keys.size() == 1) out.put("detail", detail(keys.get(0)));
        return out;
    }

    /** 판정 이력. coilNo 가 있으면 그 코일 전체, 없으면 처리일 기간. 최근 순. 응답: events[]. */
    public Map<String, Object> history(QualityJudgmentHistoryRequest req) {
        String coilNo = DemoSupport.trimToNull(req.getCoilNo());
        List<JudgmentHistory> list;
        if (coilNo != null) {
            list = histories.findByCoilNoOrderByActAtDescHistNoDesc(coilNo);
        } else {
            LocalDateTime[] r = DemoSupport.range(req.getFromDt(), req.getToDt());
            list = histories.findByActAtGreaterThanEqualAndActAtLessThanOrderByActAtDescHistNoDesc(r[0], r[1]);
        }
        return Map.of("events", historyViews(list));
    }

    /**
     * 판정 기준 목록(규격 × 검사 항목, 품질설계결과에서 내려온 기준의 사본)과 조회 칸 고르기 값.
     * 응답: criteria[specCd, prdLabels, itemCd, itemNm, unitNm, critTxt, coilCount], lines[], products[{code,label}].
     */
    public Map<String, Object> codes(QualityJudgmentSearchRequest req) {
        List<CoilSnapshot> all = lookup.all();
        Map<String, Map<String, Object>> criteria = new TreeMap<>();
        Map<String, String> lines = new TreeMap<>();
        Map<String, String> products = new TreeMap<>();
        for (CoilSnapshot s : all) {
            Coil c = s.coil();
            if (c.getLineCd() != null) lines.put(c.getLineCd(), c.getLineCd());
            products.put(c.getPrdCd(), c.prdLabel());
            if (!DemoSupport.eq(req.getPrdCd(), c.getPrdCd())) continue;
            for (InspectionItem i : s.items()) {
                String key = c.getSpecCd() + "|" + String.format("%03d", i.getSeq()) + "|" + i.getCritTxt();
                Map<String, Object> m = criteria.computeIfAbsent(key, k -> {
                    Map<String, Object> v = new LinkedHashMap<>();
                    v.put("key", k);
                    v.put("specCd", c.getSpecCd());
                    v.put("prdLabel", c.prdLabel());
                    v.put("itemCd", i.getItemCd());
                    v.put("itemNm", i.getItemNm());
                    v.put("unitNm", i.getUnitNm());
                    v.put("critTxt", i.getCritTxt());
                    v.put("coilCount", 0);
                    return v;
                });
                m.put("coilCount", (Integer) m.get("coilCount") + 1);
            }
        }
        List<Map<String, Object>> criteriaRows = criteria.values().stream()
                .filter(m -> DemoSupport.matches(req.getKeyword(), (String) m.get("specCd"), (String) m.get("itemNm"), (String) m.get("prdLabel")))
                .toList();
        List<Map<String, Object>> productRows = new ArrayList<>();
        products.forEach((code, label) -> {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("code", code);
            p.put("label", label);
            productRows.add(p);
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("criteria", criteriaRows);
        out.put("lines", new ArrayList<>(lines.keySet()));
        out.put("products", productRows);
        return out;
    }

    // ── 내부 ─────────────────────────────────────────────

    private Map<String, Object> detail(String coilNo) {
        CoilSnapshot s = lookup.one(coilNo).orElseThrow(() -> DemoSupport.notFound("코일", coilNo));
        Map<String, Object> coil = s.coilView();
        coil.put("badges", s.badges());
        Map<String, Object> judgment = new LinkedHashMap<>();
        CoilJudgment j = s.judgment();
        judgment.put("status", s.status().name());
        judgment.put("statusNm", s.status().label());
        judgment.put("suggStatus", s.suggestion() == null ? null : s.suggestion().name());
        judgment.put("suggStatusNm", JudgmentStatus.labelOf(s.suggestion()));
        judgment.put("judgedAt", j == null ? null : DemoSupport.format(j.getJudgeAt()));
        judgment.put("decidedBy", j == null ? null : j.getDcsnBy());
        judgment.put("decidedAt", j == null ? null : DemoSupport.format(j.getDcsnAt()));
        judgment.put("note", j == null ? null : j.getNote());
        judgment.put("open", j == null || j.isOpen());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("coil", coil);
        out.put("judgment", judgment);
        out.put("items", s.itemViews());
        out.put("chemistry", lookup.chemistry(s.coil().getHeatNo()));
        out.put("history", historyViews(histories.findByCoilNoOrderByActAtDescHistNoDesc(coilNo)));
        return out;
    }

    static List<Map<String, Object>> historyViews(List<JudgmentHistory> list) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (JudgmentHistory h : list) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("histNo", h.getHistNo());
            m.put("coilNo", h.getCoilNo());
            m.put("actCd", h.getActCd());
            m.put("actNm", JudgmentHistory.JUDGE.equals(h.getActCd()) ? "판정 계산" : "판정 확정");
            m.put("statBef", h.getStatBef() == null ? null : h.getStatBef().name());
            m.put("statBefNm", JudgmentStatus.labelOf(h.getStatBef()));
            m.put("statAft", h.getStatAft() == null ? null : h.getStatAft().name());
            m.put("statAftNm", JudgmentStatus.labelOf(h.getStatAft()));
            m.put("suggStat", h.getSuggStat() == null ? null : h.getSuggStat().name());
            m.put("suggStatNm", JudgmentStatus.labelOf(h.getSuggStat()));
            m.put("note", h.getNote());
            m.put("actBy", h.getActBy());
            m.put("actAt", DemoSupport.format(h.getActAt()));
            out.add(m);
        }
        return out;
    }

    private static JudgmentStatus parseStatusFilter(String status) {
        if (DemoSupport.isBlank(status)) return null;
        JudgmentStatus s = JudgmentStatus.of(status);
        if (s == null) throw DemoSupport.invalid("판정 상태가 올바르지 않습니다: " + status);
        return s;
    }

    private Map<String, String> parseValues(String valuesJson) {
        if (DemoSupport.isBlank(valuesJson)) return Map.of();
        Map<String, Object> raw;
        try {
            raw = json.readValue(valuesJson, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (JsonProcessingException e) {
            throw DemoSupport.invalid("검사값 형식이 올바르지 않습니다.");
        }
        Map<String, String> out = new LinkedHashMap<>();
        raw.forEach((k, v) -> out.put(k, v == null ? null : String.valueOf(v)));
        return out;
    }
}
