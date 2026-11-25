package com.dongkuk.dmes.mqc.qpr.tagManagement.service;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.service.CoilLookup;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.service.CoilSnapshot;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.support.DemoSupport;
import com.dongkuk.dmes.mqc.qpr.common.OutputHistories;
import com.dongkuk.dmes.mqc.qpr.common.OutputHistory;
import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.CoilTag;
import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.TagKind;
import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.TagStatus;
import com.dongkuk.dmes.mqc.qpr.tagManagement.dto.TagHistoryRequest;
import com.dongkuk.dmes.mqc.qpr.tagManagement.dto.TagKeyRequest;
import com.dongkuk.dmes.mqc.qpr.tagManagement.dto.TagReissueRequest;
import com.dongkuk.dmes.mqc.qpr.tagManagement.dto.TagSearchRequest;
import com.dongkuk.dmes.mqc.qpr.tagManagement.repository.CoilTagRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Tag관리(OASIS tagManagement, 화면 qpr/tagManagement). 코일 단위 공정 Tag·출하 Tag.
 * 대기 → 발행(issue, 출력) → 재발행(reissue, 사유·프린터·매수) / 폐기(cancel). 출하 Tag 는 코일이 합격이어야 발행·재발행한다.
 * 진입 빈이라 @Transactional 을 두지 않는다.
 */
@Service("tagManagement")
public class TagManagementService {

    static final List<String> PRINTERS = List.of("PRT-CGL2-01", "PRT-CGL5-01", "PRT-CCL-02", "PRT-출하-01");
    static final Map<String, String> REASONS = Map.of("DAMAGE", "훼손", "LOST", "분실", "CORRECT", "정보 정정");

    private final CoilTagRepository tags;
    private final CoilLookup lookup;
    private final OutputHistories histories;
    private final Clock clock;

    @Autowired
    public TagManagementService(CoilTagRepository tags, CoilLookup lookup, OutputHistories histories) {
        this(tags, lookup, histories, DemoSupport.systemClock());
    }

    TagManagementService(CoilTagRepository tags, CoilLookup lookup, OutputHistories histories, Clock clock) {
        this.tags = tags;
        this.lookup = lookup;
        this.histories = histories;
        this.clock = clock;
    }

    /** Tag 목록. 기준일 = 발행일(대기 Tag 는 기간과 상관없이 보인다). 응답: rows[], totalCount, counts{WAIT,ISSUED,REISSUED,DISCARDED}. */
    public Map<String, Object> search(TagSearchRequest req) {
        LocalDateTime[] r = DemoSupport.range(req.getFromDt(), req.getToDt());
        TagStatus statusFilter = DemoSupport.isBlank(req.getStatus()) ? null : TagStatus.of(req.getStatus());
        if (!DemoSupport.isBlank(req.getStatus()) && statusFilter == null) throw DemoSupport.invalid("상태가 올바르지 않습니다: " + req.getStatus());
        List<CoilTag> list = tags.findAllByOrderByTagNoDesc();
        Map<String, CoilSnapshot> snaps = lookup.load(list.stream().map(CoilTag::getCoilNo).distinct().toList());

        Map<String, Integer> counts = new LinkedHashMap<>();
        for (TagStatus s : TagStatus.values()) counts.put(s.name(), 0);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (CoilTag t : list) {
            if (t.getIssueAt() != null && (t.getIssueAt().isBefore(r[0]) || !t.getIssueAt().isBefore(r[1]))) continue;
            if (!DemoSupport.eq(req.getPrtId(), t.getPrtId())) continue;
            Map<String, Object> row = rowView(t, snaps.get(t.getCoilNo()));
            if (!DemoSupport.matches(req.getKeyword(), t.getTagNo(), t.getCoilNo(), (String) row.get("ordNo"), (String) row.get("cusNm"),
                    (String) row.get("prdLabel"), t.getIssueBy())) continue;
            counts.merge(t.getStatCd().name(), 1, Integer::sum);
            if (statusFilter != null && t.getStatCd() != statusFilter) continue;
            rows.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rows", rows);
        out.put("totalCount", rows.size());
        out.put("counts", counts);
        return out;
    }

    /** 상세 — tag(Tag 미리보기 칸 포함), actions{canIssue,canReissue,canCancel,blockReason}, history[]. */
    public Map<String, Object> view(TagKeyRequest req) {
        return detail(DemoSupport.required(req.getTagNo(), "Tag번호"));
    }

    /**
     * 출력(하나 또는 선택 여러 개) — 대기 Tag 를 발행으로. 출하 Tag 는 코일이 합격이어야 한다. 하나라도 못 하면 아무것도 바꾸지 않는다.
     * 응답: count, tagNos, (하나면) detail.
     */
    public Map<String, Object> issue(TagKeyRequest req) {
        List<String> keys = DemoSupport.isBlank(req.getTagNos())
                ? List.of(DemoSupport.required(req.getTagNo(), "Tag번호"))
                : DemoSupport.keys(req.getTagNos(), "Tag");
        List<CoilTag> targets = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        for (String k : keys) {
            CoilTag t = tags.findById(k).orElseThrow(() -> DemoSupport.notFound("Tag", k));
            if (t.getStatCd() != TagStatus.WAIT) {
                errors.add(k + "(" + t.getStatCd().label() + " — 대기 Tag 만 출력, 발행된 Tag 는 재발행)");
                continue;
            }
            String block = blockReason(t, lookup.one(t.getCoilNo()).orElse(null));
            if (block != null) errors.add(k + " — " + block);
            targets.add(t);
        }
        if (!errors.isEmpty()) throw DemoSupport.business("출력할 수 없습니다. " + String.join("; ", errors));
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        for (CoilTag t : targets) {
            t.issue(by, now);
            tags.save(t);
            histories.record(OutputHistory.TAG, t.getTagNo(), t.getRissuCnt() + 1, OutputHistory.ISSUE, TagStatus.WAIT.name(),
                    TagStatus.ISSUED.name(), null, by, now);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("count", targets.size());
        out.put("tagNos", keys);
        if (keys.size() == 1) out.put("detail", detail(keys.get(0)));
        return out;
    }

    /** 재발행 — 발행·재발행 Tag 만. Tag 번호 대신 코일 번호를 주면 그 코일의 가장 최근 발행 Tag 를 고른다. 응답은 view 와 같다. */
    public Map<String, Object> reissue(TagReissueRequest req) {
        CoilTag t = resolveForReissue(req);
        String reasonCd = DemoSupport.required(req.getReasonCd(), "재발행 사유");
        if (!REASONS.containsKey(reasonCd)) throw DemoSupport.invalid("재발행 사유가 올바르지 않습니다: " + reasonCd);
        String prt = DemoSupport.trimToNull(req.getPrtId());
        if (prt != null && !PRINTERS.contains(prt)) throw DemoSupport.invalid("프린터가 올바르지 않습니다: " + prt);
        int copies = parseCopies(req.getCopies());
        String note = DemoSupport.trimToNull(req.getNote());
        if (note != null && note.length() > 500) throw DemoSupport.invalid("비고는 500자까지 입력합니다.");
        if (t.getStatCd() != TagStatus.ISSUED && t.getStatCd() != TagStatus.REISSUED) {
            throw DemoSupport.business("발행된 Tag 만 재발행합니다: " + t.getTagNo() + "(" + t.getStatCd().label() + ")");
        }
        String block = blockReason(t, lookup.one(t.getCoilNo()).orElse(null));
        if (block != null) throw DemoSupport.business("재발행할 수 없습니다. " + block);
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        String before = t.getStatCd().name();
        t.reissue(reasonCd, prt, copies, note, by, now);
        tags.save(t);
        String text = REASONS.get(reasonCd) + (note == null ? "" : " — " + note) + " (" + t.getPrtId() + ", " + copies + "매)";
        histories.record(OutputHistory.TAG, t.getTagNo(), t.getRissuCnt() + 1, OutputHistory.REISSUE, before, TagStatus.REISSUED.name(), text, by, now);
        return detail(t.getTagNo());
    }

    /** 폐기 — 대기·발행·재발행 Tag 를 폐기로. 사유 필수. 응답은 view 와 같다. */
    public Map<String, Object> cancel(TagKeyRequest req) {
        CoilTag t = find(req.getTagNo());
        String reason = DemoSupport.required(req.getReason(), "폐기 사유");
        if (reason.length() > 500) throw DemoSupport.invalid("사유는 500자까지 입력합니다.");
        if (t.getStatCd() == TagStatus.DISCARDED) throw DemoSupport.business("이미 폐기한 Tag 입니다: " + t.getTagNo());
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        String before = t.getStatCd().name();
        t.discard(reason);
        tags.save(t);
        histories.record(OutputHistory.TAG, t.getTagNo(), t.getRissuCnt() + 1, OutputHistory.CANCEL, before, TagStatus.DISCARDED.name(), reason, by, now);
        return detail(t.getTagNo());
    }

    /** 처리 이력. tagNo 가 있으면 그 Tag, 없으면 처리일 기간. 응답: events[]. */
    public Map<String, Object> history(TagHistoryRequest req) {
        return Map.of("events", histories.list(OutputHistory.TAG, req.getTagNo(), req.getFromDt(), req.getToDt(),
                TagStatus::labelOf, TagManagementService::actionName));
    }

    // ── 내부 ─────────────────────────────────────────────

    static String actionName(String actCd) {
        return switch (actCd) {
            case OutputHistory.REQUEST -> "발행 대기 등록";
            case OutputHistory.ISSUE -> "출력";
            case OutputHistory.REISSUE -> "재발행";
            case OutputHistory.CANCEL -> "폐기";
            default -> actCd;
        };
    }

    /** 출하 Tag 는 코일 합격이 조건이다. 공정 Tag 는 조건이 없다. */
    static String blockReason(CoilTag t, CoilSnapshot s) {
        if (t.getTagKnd() != TagKind.SHIP) return null;
        if (s == null) return "코일을 찾을 수 없습니다: " + t.getCoilNo();
        return s.passed() ? null : "출하 Tag 는 코일이 합격이어야 합니다(" + t.getCoilNo() + " " + s.status().label() + ")";
    }

    static int parseCopies(String copies) {
        if (DemoSupport.isBlank(copies)) return 1;
        try {
            int n = Integer.parseInt(copies.trim());
            if (n < 1 || n > 9) throw DemoSupport.invalid("매수는 1~9 이어야 합니다.");
            return n;
        } catch (NumberFormatException e) {
            throw DemoSupport.invalid("매수는 숫자여야 합니다: " + copies);
        }
    }

    private CoilTag resolveForReissue(TagReissueRequest req) {
        if (!DemoSupport.isBlank(req.getTagNo())) return find(req.getTagNo());
        String coilNo = DemoSupport.required(req.getCoilNo(), "Tag번호 또는 코일번호");
        return tags.findByCoilNoOrderByIssueAtDesc(coilNo).stream()
                .filter(t -> t.getStatCd() == TagStatus.ISSUED || t.getStatCd() == TagStatus.REISSUED)
                .findFirst()
                .orElseThrow(() -> DemoSupport.business("코일 " + coilNo + " 에 발행된 Tag 가 없습니다."));
    }

    private CoilTag find(String tagNo) {
        String no = DemoSupport.required(tagNo, "Tag번호");
        return tags.findById(no).orElseThrow(() -> DemoSupport.notFound("Tag", no));
    }

    private Map<String, Object> rowView(CoilTag t, CoilSnapshot s) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("tagNo", t.getTagNo());
        r.put("tagKnd", t.getTagKnd().name());
        r.put("tagKndNm", t.getTagKnd().label());
        r.put("coilNo", t.getCoilNo());
        r.put("ordNo", s == null ? null : s.coil().getOrdNo());
        r.put("cusNm", s == null ? null : s.coil().getCusNm());
        r.put("prdLabel", s == null ? null : s.coil().prdLabel());
        r.put("specCd", s == null ? null : s.coil().getSpecCd());
        r.put("sizeText", s == null ? null : s.coil().sizeText());
        r.put("wgt", s == null ? null : s.coil().getWgt());
        r.put("heatNo", s == null ? null : s.coil().getHeatNo());
        r.put("judgStatus", s == null ? null : s.status().name());
        r.put("judgStatusNm", s == null ? null : s.status().label());
        r.put("prtId", t.getPrtId());
        r.put("status", t.getStatCd().name());
        r.put("statusNm", t.getStatCd().label());
        r.put("copyCnt", t.getCopyCnt());
        r.put("rissuCnt", t.getRissuCnt());
        r.put("rissuRsn", t.getRissuRsn());
        r.put("rissuRsnNm", t.getRissuRsn() == null ? null : REASONS.getOrDefault(t.getRissuRsn(), t.getRissuRsn()));
        r.put("issueBy", t.getIssueBy());
        r.put("issueAt", DemoSupport.format(t.getIssueAt()));
        r.put("note", t.getNote());
        return r;
    }

    private Map<String, Object> detail(String tagNo) {
        CoilTag t = tags.findById(tagNo).orElseThrow(() -> DemoSupport.notFound("Tag", tagNo));
        CoilSnapshot s = lookup.one(t.getCoilNo()).orElse(null);
        String block = blockReason(t, s);
        Map<String, Object> actions = new LinkedHashMap<>();
        actions.put("canIssue", t.getStatCd() == TagStatus.WAIT && block == null);
        actions.put("canReissue", (t.getStatCd() == TagStatus.ISSUED || t.getStatCd() == TagStatus.REISSUED) && block == null);
        actions.put("canCancel", t.getStatCd() != TagStatus.DISCARDED);
        actions.put("blockReason", block);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tag", rowView(t, s));
        out.put("actions", actions);
        out.put("history", histories.list(OutputHistory.TAG, tagNo, null, null, TagStatus::labelOf, TagManagementService::actionName));
        return out;
    }
}
