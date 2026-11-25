package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.service;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.Coil;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.InspectionItem;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.service.CoilLookup;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.service.CoilSnapshot;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.support.DemoSupport;
import com.dongkuk.dmes.mqc.qpr.common.OutputHistories;
import com.dongkuk.dmes.mqc.qpr.common.OutputHistory;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.InspectionCertificate;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcStatus;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.dto.InspectionCertificateHistoryRequest;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.dto.InspectionCertificateKeyRequest;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.dto.InspectionCertificateSaveRequest;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.dto.InspectionCertificateSearchRequest;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.InspectionCertificateRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 검사증명서관리(OASIS inspectionCertificate, 화면 qpr/inspectionCertificate). 코일·적용 규격 단위 MTC.
 * 발행 요청(save) → 검토중 → 발행(issue, 검사값 고정) / 보류(cancel). 발행된 증명서는 재발행(reissue, 판 +1)한다.
 * 발행·재발행은 코일 판정이 합격이어야 한다. 진입 빈이라 @Transactional 을 두지 않는다.
 */
@Service("inspectionCertificate")
public class InspectionCertificateService {

    static final List<String> STANDARDS = List.of("KS D 3506", "KS D 3520", "JIS G 3302", "ASTM A653");
    static final Map<String, String> SOURCES = Map.of("SELF", "자체 시험", "EXT", "외부 기관");
    static final Map<String, String> LANGS = Map.of("KO", "국문", "EN", "영문");
    /** 기계적 성질 표: 항목 코드, 이름(단위). */
    static final String[][] MECH = {
        {"YP", "항복강도 YP (MPa)"},
        {"TS", "인장강도 TS (MPa)"},
        {"EL", "연신율 EL (%)"},
        {"COAT", "도금 부착량 (g/㎡)"},
    };
    static final DateTimeFormatter NO_DAY = DateTimeFormatter.ofPattern("yyMMdd");

    private final InspectionCertificateRepository certs;
    private final CoilLookup lookup;
    private final OutputHistories histories;
    private final Clock clock;

    @Autowired
    public InspectionCertificateService(InspectionCertificateRepository certs, CoilLookup lookup, OutputHistories histories) {
        this(certs, lookup, histories, DemoSupport.systemClock());
    }

    InspectionCertificateService(InspectionCertificateRepository certs, CoilLookup lookup, OutputHistories histories, Clock clock) {
        this.certs = certs;
        this.lookup = lookup;
        this.histories = histories;
        this.clock = clock;
    }

    /** 증명서 목록. 기준일 = 코일 검사일. 응답: rows[], totalCount, counts{REVIEW,ISSUED,HOLD}. */
    public Map<String, Object> search(InspectionCertificateSearchRequest req) {
        LocalDateTime[] r = DemoSupport.range(req.getFromDt(), req.getToDt());
        MtcStatus statusFilter = DemoSupport.isBlank(req.getStatus()) ? null : MtcStatus.of(req.getStatus());
        if (!DemoSupport.isBlank(req.getStatus()) && statusFilter == null) throw DemoSupport.invalid("상태가 올바르지 않습니다: " + req.getStatus());
        List<InspectionCertificate> list = certs.findAllByOrderByMtcNoDesc();
        Map<String, CoilSnapshot> snaps = lookup.load(list.stream().map(InspectionCertificate::getCoilNo).distinct().toList());

        Map<String, Integer> counts = new LinkedHashMap<>();
        for (MtcStatus s : MtcStatus.values()) counts.put(s.name(), 0);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (InspectionCertificate m : list) {
            CoilSnapshot s = snaps.get(m.getCoilNo());
            LocalDateTime base = s == null ? m.getReqAt() : s.coil().getInspAt();
            if (base != null && (base.isBefore(r[0]) || !base.isBefore(r[1]))) continue;
            if (!DemoSupport.eq(req.getStdCd(), m.getStdCd())) continue;
            Map<String, Object> row = rowView(m, s);
            if (!DemoSupport.matches(req.getKeyword(), m.getMtcNo(), m.getCoilNo(), m.getHeatNo(), m.getStdCd(),
                    (String) row.get("prdLabel"), (String) row.get("specCd"), (String) row.get("inspBy"))) continue;
            counts.merge(m.getStatCd().name(), 1, Integer::sum);
            if (statusFilter != null && m.getStatCd() != statusFilter) continue;
            rows.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rows", rows);
        out.put("totalCount", rows.size());
        out.put("counts", counts);
        return out;
    }

    /** 상세 — cert, mech[], chemistry[], actions{canIssue,canReissue,canCancel,blockReason}, history[]. */
    public Map<String, Object> view(InspectionCertificateKeyRequest req) {
        return detail(DemoSupport.required(req.getMtcNo(), "증명서번호"));
    }

    /** 발행 요청 — 검토중 증명서를 만든다. 같은 코일·규격의 증명서가 이미 있으면 받지 않는다. 응답은 view 와 같다. */
    public Map<String, Object> save(InspectionCertificateSaveRequest req) {
        String coilNo = DemoSupport.required(req.getCoilNo(), "코일번호");
        String std = DemoSupport.required(req.getStdCd(), "적용 규격");
        if (!STANDARDS.contains(std)) throw DemoSupport.invalid("적용 규격이 올바르지 않습니다: " + std);
        String src = DemoSupport.isBlank(req.getSrcCd()) ? "SELF" : req.getSrcCd().trim();
        String lang = DemoSupport.isBlank(req.getLangCd()) ? "KO" : req.getLangCd().trim();
        if (!SOURCES.containsKey(src)) throw DemoSupport.invalid("시험 성적 출처가 올바르지 않습니다: " + src);
        if (!LANGS.containsKey(lang)) throw DemoSupport.invalid("언어가 올바르지 않습니다: " + lang);
        String note = DemoSupport.trimToNull(req.getNote());
        if (note != null && note.length() > 500) throw DemoSupport.invalid("비고는 500자까지 입력합니다.");
        CoilSnapshot s = lookup.one(coilNo).orElseThrow(() -> DemoSupport.notFound("코일", coilNo));
        List<InspectionCertificate> dup = certs.findByCoilNoAndStdCd(coilNo, std);
        if (!dup.isEmpty()) {
            throw DemoSupport.business("같은 코일·규격의 증명서가 이미 있습니다: " + dup.get(0).getMtcNo() + "(" + dup.get(0).getStatCd().label() + ")");
        }
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        InspectionCertificate m = InspectionCertificate.request(nextNo(now), coilNo, std, s.coil().getHeatNo(), src, lang, note, by, now);
        certs.save(m);
        histories.record(OutputHistory.MTC, m.getMtcNo(), m.getDocRev(), OutputHistory.REQUEST, null, MtcStatus.REVIEW.name(), note, by, now);
        return detail(m.getMtcNo());
    }

    /**
     * 발행(하나 또는 일괄). 검토중·보류 증명서만, 코일 판정이 합격이어야 한다. 하나라도 못 하면 아무것도 발행하지 않는다.
     * 응답: count, mtcNos, (하나면) detail.
     */
    public Map<String, Object> issue(InspectionCertificateKeyRequest req) {
        List<String> keys = DemoSupport.isBlank(req.getMtcNos())
                ? List.of(DemoSupport.required(req.getMtcNo(), "증명서번호"))
                : DemoSupport.keys(req.getMtcNos(), "증명서");
        List<InspectionCertificate> targets = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        for (String k : keys) {
            InspectionCertificate m = certs.findById(k).orElseThrow(() -> DemoSupport.notFound("검사증명서", k));
            if (m.getStatCd() == MtcStatus.ISSUED) {
                errors.add(k + "(이미 발행)");
                continue;
            }
            String block = blockReason(lookup.one(m.getCoilNo()).orElse(null), m.getCoilNo());
            if (block != null) errors.add(k + " — " + block);
            targets.add(m);
        }
        if (!errors.isEmpty()) throw DemoSupport.business("발행할 수 없습니다. " + String.join("; ", errors));
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        for (InspectionCertificate m : targets) {
            CoilSnapshot s = lookup.one(m.getCoilNo()).orElseThrow();
            String before = m.getStatCd().name();
            m.issue(s.value("YP"), s.value("TS"), s.value("EL"), s.value("COAT"), by, now);
            certs.save(m);
            histories.record(OutputHistory.MTC, m.getMtcNo(), m.getDocRev(), OutputHistory.ISSUE, before, MtcStatus.ISSUED.name(),
                    DemoSupport.trimToNull(req.getReason()), by, now);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("count", targets.size());
        out.put("mtcNos", keys);
        if (keys.size() == 1) out.put("detail", detail(keys.get(0)));
        return out;
    }

    /** 재발행 — 발행된 증명서만, 사유 필수, 판 +1, 검사값을 다시 고정한다. 코일 판정이 합격이어야 한다. 응답은 view 와 같다. */
    public Map<String, Object> reissue(InspectionCertificateKeyRequest req) {
        InspectionCertificate m = find(req.getMtcNo());
        String reason = DemoSupport.required(req.getReason(), "재발행 사유");
        if (m.getStatCd() != MtcStatus.ISSUED) throw DemoSupport.business("발행된 증명서만 재발행합니다: " + m.getMtcNo() + "(" + m.getStatCd().label() + ")");
        CoilSnapshot s = lookup.one(m.getCoilNo()).orElse(null);
        String block = blockReason(s, m.getCoilNo());
        if (block != null) throw DemoSupport.business("재발행할 수 없습니다. " + block);
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        m.reissue(s.value("YP"), s.value("TS"), s.value("EL"), s.value("COAT"), by, now);
        certs.save(m);
        histories.record(OutputHistory.MTC, m.getMtcNo(), m.getDocRev(), OutputHistory.REISSUE, MtcStatus.ISSUED.name(), MtcStatus.ISSUED.name(),
                reason, by, now);
        return detail(m.getMtcNo());
    }

    /** 보류 — 검토중·발행을 보류로. 사유 필수. 응답은 view 와 같다. */
    public Map<String, Object> cancel(InspectionCertificateKeyRequest req) {
        InspectionCertificate m = find(req.getMtcNo());
        String reason = DemoSupport.required(req.getReason(), "보류 사유");
        if (m.getStatCd() == MtcStatus.HOLD) throw DemoSupport.business("이미 보류한 증명서입니다: " + m.getMtcNo());
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        String before = m.getStatCd().name();
        m.hold();
        certs.save(m);
        histories.record(OutputHistory.MTC, m.getMtcNo(), m.getDocRev(), OutputHistory.CANCEL, before, MtcStatus.HOLD.name(), reason, by, now);
        return detail(m.getMtcNo());
    }

    /** 처리 이력. mtcNo 가 있으면 그 문서, 없으면 처리일 기간. 응답: events[]. */
    public Map<String, Object> history(InspectionCertificateHistoryRequest req) {
        return Map.of("events", histories.list(OutputHistory.MTC, req.getMtcNo(), req.getFromDt(), req.getToDt(),
                MtcStatus::labelOf, InspectionCertificateService::actionName));
    }

    /** 발행 요청 칸의 고르기 값 — standards[], coils[{coilNo, ordNo, heatNo, prdLabel, specCd, status, statusNm}]. */
    public Map<String, Object> codes(InspectionCertificateSearchRequest req) {
        List<Map<String, Object>> coils = new ArrayList<>();
        for (CoilSnapshot s : lookup.all()) {
            Coil c = s.coil();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("coilNo", c.getCoilNo());
            m.put("ordNo", c.getOrdNo());
            m.put("heatNo", c.getHeatNo());
            m.put("prdLabel", c.prdLabel());
            m.put("specCd", c.getSpecCd());
            m.put("status", s.status().name());
            m.put("statusNm", s.status().label());
            coils.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("standards", STANDARDS);
        out.put("coils", coils);
        return out;
    }

    // ── 내부 ─────────────────────────────────────────────

    static String actionName(String actCd) {
        return switch (actCd) {
            case OutputHistory.REQUEST -> "발행 요청";
            case OutputHistory.ISSUE -> "발행";
            case OutputHistory.REISSUE -> "재발행";
            case OutputHistory.CANCEL -> "보류";
            default -> actCd;
        };
    }

    static String blockReason(CoilSnapshot s, String coilNo) {
        if (s == null) return "코일을 찾을 수 없습니다: " + coilNo;
        return s.passed() ? null : "코일 " + coilNo + " 판정이 합격이 아닙니다(" + s.status().label() + ")";
    }

    private InspectionCertificate find(String mtcNo) {
        String no = DemoSupport.required(mtcNo, "증명서번호");
        return certs.findById(no).orElseThrow(() -> DemoSupport.notFound("검사증명서", no));
    }

    private String nextNo(LocalDateTime now) {
        String prefix = "MTC-" + NO_DAY.format(now) + "-";
        int seq = certs.findTopByMtcNoStartingWithOrderByMtcNoDesc(prefix)
                .map(m -> Integer.parseInt(m.getMtcNo().substring(prefix.length())) + 1).orElse(1);
        return prefix + String.format("%02d", seq);
    }

    /** 발행분은 고정값, 아니면 코일의 지금 검사값. */
    private static BigDecimal shown(InspectionCertificate m, BigDecimal fixed, CoilSnapshot s, String itemCd) {
        if (m.getStatCd() == MtcStatus.ISSUED || fixed != null) return fixed;
        return s == null ? null : s.value(itemCd);
    }

    private Map<String, Object> rowView(InspectionCertificate m, CoilSnapshot s) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("mtcNo", m.getMtcNo());
        r.put("stdCd", m.getStdCd());
        r.put("coilNo", m.getCoilNo());
        r.put("heatNo", m.getHeatNo());
        r.put("ordNo", s == null ? null : s.coil().getOrdNo());
        r.put("cusNm", s == null ? null : s.coil().getCusNm());
        r.put("prdLabel", s == null ? null : s.coil().prdLabel());
        r.put("specCd", s == null ? null : s.coil().getSpecCd());
        r.put("sizeText", s == null ? null : s.coil().sizeText());
        r.put("wgt", s == null ? null : s.coil().getWgt());
        r.put("yp", shown(m, m.getYpVal(), s, "YP"));
        r.put("ts", shown(m, m.getTsVal(), s, "TS"));
        r.put("el", shown(m, m.getElVal(), s, "EL"));
        r.put("coat", shown(m, m.getCoatVal(), s, "COAT"));
        r.put("fixed", m.getStatCd() == MtcStatus.ISSUED);
        r.put("status", m.getStatCd().name());
        r.put("statusNm", m.getStatCd().label());
        r.put("judgStatus", s == null ? null : s.status().name());
        r.put("judgStatusNm", s == null ? null : s.status().label());
        r.put("inspDate", s == null ? null : DemoSupport.formatDate(s.coil().getInspAt()));
        r.put("inspBy", s == null ? null : s.coil().getInspBy());
        r.put("srcCd", m.getSrcCd());
        r.put("srcNm", SOURCES.getOrDefault(m.getSrcCd(), m.getSrcCd()));
        r.put("langCd", m.getLangCd());
        r.put("langNm", LANGS.getOrDefault(m.getLangCd(), m.getLangCd()));
        r.put("docRev", m.getDocRev());
        r.put("reqBy", m.getReqBy());
        r.put("reqAt", DemoSupport.format(m.getReqAt()));
        r.put("issueBy", m.getIssueBy());
        r.put("issueAt", DemoSupport.format(m.getIssueAt()));
        r.put("note", m.getNote());
        return r;
    }

    private Map<String, Object> detail(String mtcNo) {
        InspectionCertificate m = certs.findById(mtcNo).orElseThrow(() -> DemoSupport.notFound("검사증명서", mtcNo));
        CoilSnapshot s = lookup.one(m.getCoilNo()).orElse(null);
        Map<String, Object> cert = rowView(m, s);
        List<Map<String, Object>> mech = new ArrayList<>();
        for (String[] g : MECH) {
            InspectionItem i = s == null ? null : s.item(g[0]);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("itemCd", g[0]);
            row.put("itemNm", g[1]);
            row.put("critTxt", i == null ? null : i.getCritTxt());
            row.put("value", cert.get(g[0].equals("COAT") ? "coat" : g[0].toLowerCase()));
            row.put("result", i == null ? null : i.getRsltCd().name());
            row.put("resultNm", i == null ? null : i.getRsltCd().label());
            mech.add(row);
        }
        String block = blockReason(s, m.getCoilNo());
        Map<String, Object> actions = new LinkedHashMap<>();
        actions.put("canIssue", m.getStatCd() != MtcStatus.ISSUED && block == null);
        actions.put("canReissue", m.getStatCd() == MtcStatus.ISSUED && block == null);
        actions.put("canCancel", m.getStatCd() != MtcStatus.HOLD);
        actions.put("blockReason", block);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cert", cert);
        out.put("mech", mech);
        out.put("chemistry", lookup.chemistry(m.getHeatNo()));
        out.put("actions", actions);
        out.put("history", histories.list(OutputHistory.MTC, mtcNo, null, null, MtcStatus::labelOf, InspectionCertificateService::actionName));
        return out;
    }
}
