package com.dongkuk.dmes.mqc.qpr.qualityCertificate.service;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.Coil;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.InspectionEvaluator;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.InspectionItem;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.ItemResult;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.service.CoilLookup;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.service.CoilSnapshot;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.support.DemoSupport;
import com.dongkuk.dmes.mqc.qpr.common.OutputHistories;
import com.dongkuk.dmes.mqc.qpr.common.OutputHistory;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.QcStatus;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.QualityCertificate;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.QualityCertificateCoil;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.dto.QualityCertificateHistoryRequest;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.dto.QualityCertificateKeyRequest;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.dto.QualityCertificateSaveRequest;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.dto.QualityCertificateSearchRequest;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.repository.QualityCertificateCoilRepository;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.repository.QualityCertificateRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 품질보증서관리(OASIS qualityCertificate, 화면 qpr/qualityCertificate). 주문·PO 단위로 코일 여러 개의 품질을 보증한다.
 * 발행 요청(save) → 초안 → 발행(issue) → 재발행(reissue, 판 +1) / 회수(cancel). 발행·재발행은 실린 코일이 모두 합격이어야 한다.
 * 진입 빈이라 @Transactional 을 두지 않는다 — OASIS 가 서비스 단위 트랜잭션을 건다.
 */
@Service("qualityCertificate")
public class QualityCertificateService {

    static final Map<String, String> TEMPLATES = Map.of("KS", "KS 표준", "CUS", "수요가 지정");
    static final Map<String, String> LANGS = Map.of("KO", "국문", "EN", "영문");
    /** 보증 항목(양식 KS 표준): 항목 코드, 이름, 기준 설명. 대표값은 실린 코일 검사값의 최솟값(YP 는 범위)이다. */
    static final String[][] GUARANTEE = {
        {"TS", "인장강도 TS (MPa)", "규격 하한 이상"},
        {"YP", "항복강도 YP (MPa)", "규격 범위"},
        {"EL", "연신율 EL (%)", "규격 하한 이상"},
        {"COAT", "도금 부착량 (g/㎡)", "주문 도금량 이상"},
    };
    static final DateTimeFormatter NO_MONTH = DateTimeFormatter.ofPattern("yyMM");

    private final QualityCertificateRepository certs;
    private final QualityCertificateCoilRepository certCoils;
    private final CoilLookup lookup;
    private final OutputHistories histories;
    private final Clock clock;

    @Autowired
    public QualityCertificateService(QualityCertificateRepository certs, QualityCertificateCoilRepository certCoils,
                                     CoilLookup lookup, OutputHistories histories) {
        this(certs, certCoils, lookup, histories, DemoSupport.systemClock());
    }

    QualityCertificateService(QualityCertificateRepository certs, QualityCertificateCoilRepository certCoils,
                              CoilLookup lookup, OutputHistories histories, Clock clock) {
        this.certs = certs;
        this.certCoils = certCoils;
        this.lookup = lookup;
        this.histories = histories;
        this.clock = clock;
    }

    /** 발행 목록. 기준일 = 발행일(초안은 요청일). 응답: rows[], totalCount, counts{DRAFT,ISSUED,REISSUED,RECALLED}. */
    public Map<String, Object> search(QualityCertificateSearchRequest req) {
        LocalDateTime[] r = DemoSupport.range(req.getFromDt(), req.getToDt());
        QcStatus statusFilter = DemoSupport.isBlank(req.getStatus()) ? null : QcStatus.of(req.getStatus());
        if (!DemoSupport.isBlank(req.getStatus()) && statusFilter == null) throw DemoSupport.invalid("상태가 올바르지 않습니다: " + req.getStatus());

        Map<String, List<String>> coilsByCert = new HashMap<>();
        for (QualityCertificateCoil c : certCoils.findAllByOrderByQcNoAscSeqAsc()) {
            coilsByCert.computeIfAbsent(c.getQcNo(), k -> new ArrayList<>()).add(c.getCoilNo());
        }
        Set<String> allCoils = new HashSet<>();
        coilsByCert.values().forEach(allCoils::addAll);
        Map<String, CoilSnapshot> snaps = lookup.load(allCoils);

        Map<String, Integer> counts = new LinkedHashMap<>();
        for (QcStatus s : QcStatus.values()) counts.put(s.name(), 0);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (QualityCertificate q : certs.findAllByOrderByQcNoDesc()) {
            LocalDateTime base = q.getIssueAt() != null ? q.getIssueAt() : q.getReqAt();
            if (base != null && (base.isBefore(r[0]) || !base.isBefore(r[1]))) continue;
            if (!DemoSupport.eq(req.getCusNm(), q.getCusNm())) continue;
            List<CoilSnapshot> coils = snapshots(coilsByCert.getOrDefault(q.getQcNo(), List.of()), snaps);
            Map<String, Object> row = rowView(q, coils);
            if (!DemoSupport.matches(req.getKeyword(), q.getQcNo(), q.getOrdNo(), q.getCusNm(), q.getPoNo(),
                    (String) row.get("prdLabel"), (String) row.get("specCd"), q.getIssueBy(), q.getReqBy())) continue;
            counts.merge(q.getStatCd().name(), 1, Integer::sum);
            if (statusFilter != null && q.getStatCd() != statusFilter) continue;
            rows.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rows", rows);
        out.put("totalCount", rows.size());
        out.put("counts", counts);
        return out;
    }

    /** 상세 — cert, coils[], guarantee[], actions{canIssue,canReissue,canCancel,blockReason}, history[]. */
    public Map<String, Object> view(QualityCertificateKeyRequest req) {
        return detail(DemoSupport.required(req.getQcNo(), "보증서번호"));
    }

    /** 발행 요청 — 같은 주문의 코일로 초안을 만든다. 다른 보증서(초안·발행·재발행)에 실린 코일은 받지 않는다. 응답은 view 와 같다. */
    public Map<String, Object> save(QualityCertificateSaveRequest req) {
        List<String> coilNos = DemoSupport.keys(req.getCoilNos(), "코일");
        String tmpl = DemoSupport.isBlank(req.getTmplCd()) ? "KS" : req.getTmplCd().trim();
        String lang = DemoSupport.isBlank(req.getLangCd()) ? "KO" : req.getLangCd().trim();
        if (!TEMPLATES.containsKey(tmpl)) throw DemoSupport.invalid("양식이 올바르지 않습니다: " + tmpl);
        if (!LANGS.containsKey(lang)) throw DemoSupport.invalid("언어가 올바르지 않습니다: " + lang);
        String note = DemoSupport.trimToNull(req.getNote());
        if (note != null && note.length() > 500) throw DemoSupport.invalid("비고는 500자까지 입력합니다.");

        Map<String, CoilSnapshot> snaps = lookup.load(coilNos);
        List<String> missing = coilNos.stream().filter(k -> !snaps.containsKey(k)).toList();
        if (!missing.isEmpty()) throw DemoSupport.notFound("코일", String.join(", ", missing));
        String ordNo = DemoSupport.trimToNull(req.getOrdNo());
        if (ordNo == null) ordNo = snaps.get(coilNos.get(0)).coil().getOrdNo();
        List<String> otherOrder = new ArrayList<>();
        for (CoilSnapshot s : snaps.values()) {
            if (!ordNo.equals(s.coil().getOrdNo())) otherOrder.add(s.coilNo() + "(" + s.coil().getOrdNo() + ")");
        }
        if (!otherOrder.isEmpty()) throw DemoSupport.business("주문 " + ordNo + " 의 코일만 실을 수 있습니다: " + String.join(", ", otherOrder));

        List<String> taken = new ArrayList<>();
        for (QualityCertificateCoil link : certCoils.findByCoilNoIn(coilNos)) {
            certs.findById(link.getQcNo()).filter(q -> q.getStatCd() != QcStatus.RECALLED)
                    .ifPresent(q -> taken.add(link.getCoilNo() + "(" + q.getQcNo() + " " + q.getStatCd().label() + ")"));
        }
        if (!taken.isEmpty()) throw DemoSupport.business("이미 다른 보증서에 실린 코일입니다: " + String.join(", ", taken));

        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        Coil first = snaps.get(coilNos.get(0)).coil();
        QualityCertificate q = QualityCertificate.draft(nextNo(now), ordNo, first.getCusNm(), first.getPoNo(), tmpl, lang, note, by, now);
        certs.save(q);
        int seq = 1;
        for (String c : coilNos) certCoils.save(QualityCertificateCoil.of(q.getQcNo(), c, seq++));
        histories.record(OutputHistory.QC, q.getQcNo(), q.getDocRev(), OutputHistory.REQUEST, null, QcStatus.DRAFT.name(), note, by, now);
        return detail(q.getQcNo());
    }

    /** 발행 — 초안만. 실린 코일이 모두 합격이어야 한다. 응답은 view 와 같다. */
    public Map<String, Object> issue(QualityCertificateKeyRequest req) {
        QualityCertificate q = find(req.getQcNo());
        if (q.getStatCd() != QcStatus.DRAFT) throw DemoSupport.business("초안만 발행합니다: " + q.getQcNo() + "(" + q.getStatCd().label() + ")");
        requireAllPassed(q.getQcNo(), "발행");
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        q.issue(by, now);
        certs.save(q);
        histories.record(OutputHistory.QC, q.getQcNo(), q.getDocRev(), OutputHistory.ISSUE, QcStatus.DRAFT.name(), QcStatus.ISSUED.name(),
                DemoSupport.trimToNull(req.getReason()), by, now);
        return detail(q.getQcNo());
    }

    /** 재발행 — 발행·재발행 상태만, 사유 필수, 판 +1. 실린 코일이 모두 합격이어야 한다. */
    public Map<String, Object> reissue(QualityCertificateKeyRequest req) {
        QualityCertificate q = find(req.getQcNo());
        String reason = DemoSupport.required(req.getReason(), "재발행 사유");
        if (q.getStatCd() != QcStatus.ISSUED && q.getStatCd() != QcStatus.REISSUED) {
            throw DemoSupport.business("발행된 보증서만 재발행합니다: " + q.getQcNo() + "(" + q.getStatCd().label() + ")");
        }
        requireAllPassed(q.getQcNo(), "재발행");
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        String before = q.getStatCd().name();
        q.reissue(by, now);
        certs.save(q);
        histories.record(OutputHistory.QC, q.getQcNo(), q.getDocRev(), OutputHistory.REISSUE, before, QcStatus.REISSUED.name(), reason, by, now);
        return detail(q.getQcNo());
    }

    /** 회수 — 초안·발행·재발행을 회수로. 사유 필수. 회수한 보증서의 코일은 다시 다른 보증서에 실을 수 있다. */
    public Map<String, Object> cancel(QualityCertificateKeyRequest req) {
        QualityCertificate q = find(req.getQcNo());
        String reason = DemoSupport.required(req.getReason(), "회수 사유");
        if (q.getStatCd() == QcStatus.RECALLED) throw DemoSupport.business("이미 회수한 보증서입니다: " + q.getQcNo());
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        String before = q.getStatCd().name();
        q.recall();
        certs.save(q);
        histories.record(OutputHistory.QC, q.getQcNo(), q.getDocRev(), OutputHistory.CANCEL, before, QcStatus.RECALLED.name(), reason, by, now);
        return detail(q.getQcNo());
    }

    /** 처리 이력. qcNo 가 있으면 그 문서, 없으면 처리일 기간. 응답: events[]. */
    public Map<String, Object> history(QualityCertificateHistoryRequest req) {
        return Map.of("events", histories.list(OutputHistory.QC, req.getQcNo(), req.getFromDt(), req.getToDt(),
                QcStatus::labelOf, QualityCertificateService::actionName));
    }

    /**
     * 발행 요청 칸의 고르기 값 — 주문별 코일(판정 상태, 다른 보증서에 실렸는지)과 수요가 목록.
     * 응답: orders[{ordNo, cusNm, poNo, prdLabel, specCd, coils[{coilNo, sizeText, wgt, status, statusNm, takenBy}]}], customers[].
     */
    public Map<String, Object> codes(QualityCertificateSearchRequest req) {
        Map<String, String> takenBy = new HashMap<>();
        Map<String, QcStatus> certStatus = new HashMap<>();
        for (QualityCertificate q : certs.findAll()) certStatus.put(q.getQcNo(), q.getStatCd());
        for (QualityCertificateCoil link : certCoils.findAllByOrderByQcNoAscSeqAsc()) {
            QcStatus st = certStatus.get(link.getQcNo());
            if (st != null && st != QcStatus.RECALLED) takenBy.put(link.getCoilNo(), link.getQcNo());
        }
        Map<String, Map<String, Object>> orders = new TreeMap<>();
        Set<String> customers = new java.util.TreeSet<>();
        for (CoilSnapshot s : lookup.all()) {
            Coil c = s.coil();
            if (c.getCusNm() != null) customers.add(c.getCusNm());
            Map<String, Object> o = orders.computeIfAbsent(c.getOrdNo(), k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("ordNo", k);
                m.put("cusNm", c.getCusNm());
                m.put("poNo", c.getPoNo());
                m.put("prdLabel", c.prdLabel());
                m.put("specCd", c.getSpecCd());
                m.put("coils", new ArrayList<Map<String, Object>>());
                return m;
            });
            Map<String, Object> cm = new LinkedHashMap<>();
            cm.put("coilNo", c.getCoilNo());
            cm.put("sizeText", c.sizeText());
            cm.put("wgt", c.getWgt());
            cm.put("status", s.status().name());
            cm.put("statusNm", s.status().label());
            cm.put("takenBy", takenBy.get(c.getCoilNo()));
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> list = (List<Map<String, Object>>) o.get("coils");
            list.add(cm);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("orders", new ArrayList<>(orders.values()));
        out.put("customers", new ArrayList<>(customers));
        return out;
    }

    // ── 내부 ─────────────────────────────────────────────

    static String actionName(String actCd) {
        return switch (actCd) {
            case OutputHistory.REQUEST -> "발행 요청";
            case OutputHistory.ISSUE -> "발행";
            case OutputHistory.REISSUE -> "재발행";
            case OutputHistory.CANCEL -> "회수";
            default -> actCd;
        };
    }

    private QualityCertificate find(String qcNo) {
        String no = DemoSupport.required(qcNo, "보증서번호");
        return certs.findById(no).orElseThrow(() -> DemoSupport.notFound("품질보증서", no));
    }

    private List<CoilSnapshot> coilsOf(String qcNo) {
        List<String> nos = certCoils.findByQcNoOrderBySeqAsc(qcNo).stream().map(QualityCertificateCoil::getCoilNo).toList();
        return snapshots(nos, lookup.load(nos));
    }

    private static List<CoilSnapshot> snapshots(List<String> nos, Map<String, CoilSnapshot> snaps) {
        List<CoilSnapshot> out = new ArrayList<>();
        for (String n : nos) {
            CoilSnapshot s = snaps.get(n);
            if (s != null) out.add(s);
        }
        return out;
    }

    /** 합격이 아닌 코일 설명(없으면 null). */
    static String blockReason(List<CoilSnapshot> coils) {
        if (coils.isEmpty()) return "실린 코일이 없습니다.";
        List<String> bad = new ArrayList<>();
        for (CoilSnapshot s : coils) {
            if (!s.passed()) bad.add(s.coilNo() + "(" + s.status().label() + ")");
        }
        return bad.isEmpty() ? null : "합격하지 않은 코일이 있습니다: " + String.join(", ", bad);
    }

    private void requireAllPassed(String qcNo, String action) {
        String reason = blockReason(coilsOf(qcNo));
        if (reason != null) throw DemoSupport.business(action + "할 수 없습니다. " + reason);
    }

    private String nextNo(LocalDateTime now) {
        String prefix = "QC-" + NO_MONTH.format(now) + "-";
        int seq = certs.findTopByQcNoStartingWithOrderByQcNoDesc(prefix)
                .map(q -> Integer.parseInt(q.getQcNo().substring(prefix.length())) + 1).orElse(1);
        return prefix + String.format("%04d", seq);
    }

    private Map<String, Object> rowView(QualityCertificate q, List<CoilSnapshot> coils) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("qcNo", q.getQcNo());
        m.put("docRev", q.getDocRev());
        m.put("revText", "v" + q.getDocRev());
        m.put("ordNo", q.getOrdNo());
        m.put("cusNm", q.getCusNm());
        m.put("poNo", q.getPoNo());
        Coil first = coils.isEmpty() ? null : coils.get(0).coil();
        m.put("prdLabel", first == null ? null : first.prdLabel());
        m.put("specCd", first == null ? null : first.getSpecCd());
        m.put("sizeText", first == null ? null : first.sizeText());
        m.put("coilCount", coils.size());
        BigDecimal wgt = BigDecimal.ZERO;
        for (CoilSnapshot s : coils) if (s.coil().getWgt() != null) wgt = wgt.add(s.coil().getWgt());
        m.put("totalWgt", wgt);
        m.put("tmplCd", q.getTmplCd());
        m.put("tmplNm", TEMPLATES.getOrDefault(q.getTmplCd(), q.getTmplCd()));
        m.put("langCd", q.getLangCd());
        m.put("langNm", LANGS.getOrDefault(q.getLangCd(), q.getLangCd()));
        m.put("status", q.getStatCd().name());
        m.put("statusNm", q.getStatCd().label());
        m.put("reqBy", q.getReqBy());
        m.put("reqAt", DemoSupport.format(q.getReqAt()));
        m.put("issueBy", q.getIssueBy());
        m.put("issueAt", DemoSupport.format(q.getIssueAt()));
        m.put("issueDate", DemoSupport.formatDate(q.getIssueAt()));
        m.put("note", q.getNote());
        return m;
    }

    private Map<String, Object> detail(String qcNo) {
        QualityCertificate q = certs.findById(qcNo).orElseThrow(() -> DemoSupport.notFound("품질보증서", qcNo));
        List<CoilSnapshot> coils = coilsOf(qcNo);
        List<Map<String, Object>> coilRows = new ArrayList<>();
        for (CoilSnapshot s : coils) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("coilNo", s.coilNo());
            m.put("sizeText", s.coil().sizeText());
            m.put("wgt", s.coil().getWgt());
            m.put("heatNo", s.coil().getHeatNo());
            m.put("status", s.status().name());
            m.put("statusNm", s.status().label());
            m.put("yp", s.value("YP"));
            m.put("ts", s.value("TS"));
            m.put("el", s.value("EL"));
            m.put("coat", s.value("COAT"));
            coilRows.add(m);
        }
        String block = blockReason(coils);
        boolean issued = q.getStatCd() == QcStatus.ISSUED || q.getStatCd() == QcStatus.REISSUED;
        Map<String, Object> actions = new LinkedHashMap<>();
        actions.put("canIssue", q.getStatCd() == QcStatus.DRAFT && block == null);
        actions.put("canReissue", issued && block == null);
        actions.put("canCancel", q.getStatCd() != QcStatus.RECALLED);
        actions.put("blockReason", block);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cert", rowView(q, coils));
        out.put("coils", coilRows);
        out.put("guarantee", guarantee(coils));
        out.put("actions", actions);
        out.put("history", histories.list(OutputHistory.QC, qcNo, null, null, QcStatus::labelOf, QualityCertificateService::actionName));
        return out;
    }

    /** 보증 항목 — 기준(첫 코일 검사 항목의 기준 글)과 대표값(최솟값, YP 는 최소~최대), 모든 코일 판정의 나쁜 쪽. */
    static List<Map<String, Object>> guarantee(List<CoilSnapshot> coils) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String[] g : GUARANTEE) {
            BigDecimal min = null;
            BigDecimal max = null;
            String crit = null;
            List<ItemResult> results = new ArrayList<>();
            for (CoilSnapshot s : coils) {
                InspectionItem i = s.item(g[0]);
                if (i == null) continue;
                if (crit == null) crit = i.getCritTxt();
                results.add(i.getRsltCd());
                BigDecimal v = i.numericValue();
                if (v == null) continue;
                if (min == null || v.compareTo(min) < 0) min = v;
                if (max == null || v.compareTo(max) > 0) max = v;
            }
            String value = min == null ? "—"
                    : "YP".equals(g[0]) && max.compareTo(min) != 0 ? min.toPlainString() + "~" + max.toPlainString() : min.toPlainString();
            ItemResult worst = InspectionEvaluator.worst(results);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("itemCd", g[0]);
            m.put("itemNm", g[1]);
            m.put("basis", g[2]);
            m.put("critTxt", crit);
            m.put("value", value);
            m.put("result", worst.name());
            m.put("resultNm", worst.label());
            out.add(m);
        }
        return out;
    }
}
