package com.dongkuk.dmes.mqc.qpr.qualityCertificate.service;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.support.DemoSupport;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.WtyDoc;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.WtyHistory;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.WtyVersion;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.dto.QualityCertificateRequest;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.repository.WtyDocRepository;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.repository.WtyHistoryRepository;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.repository.WtyVersionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 품질보증서관리(OASIS qualityCertificate, 화면 qpr/qualityCertificate). 계약 = docs/mqc/demo/wty-contract.md.
 * 시연 목업이다 — 문서 편집은 화면이 하고, 서버는 문서 본문(불투명한 JSON) 저장, 상태(적용본·초안·승인 대기),
 * 승인 시 버전 올림과 버전 기록, 이력, 시연 초기화를 맡는다.
 * 진입 빈이라 @Transactional 을 두지 않는다 — OASIS 가 서비스 단위 트랜잭션을 건다.
 */
@Service("qualityCertificate")
public class QualityCertificateService {

    static final String MSG_PENDING = "승인 대기 중에는 고칠 수 없습니다. 승인 요청을 먼저 취소하세요.";
    static final String MSG_EXISTS = "이미 문서가 있습니다. 기본 문서는 문서가 없을 때만 만들 수 있습니다.";
    static final String MSG_NO_DOC = "문서가 없습니다. 기본 문서를 먼저 만드세요.";
    static final String MSG_NOT_PENDING = "승인 대기 중인 문서가 아닙니다.";
    static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    static final Set<String> SAVE_ACTS = Set.of(WtyHistory.INIT, WtyHistory.DRAFT, WtyHistory.REQUEST, WtyHistory.UNREQUEST,
            WtyHistory.DISCARD);
    static final Set<String> COLLAPSE_ACTS = Set.of(WtyHistory.DRAFT, WtyHistory.REQUEST);
    static final Duration COLLAPSE_WINDOW = Duration.ofMinutes(1);
    static final int TEXT_MAX = 1000;

    private final WtyDocRepository docs;
    private final WtyVersionRepository vers;
    private final WtyHistoryRepository hist;
    private final Clock clock;
    private final Supplier<String> actor;
    private final ObjectMapper json = new ObjectMapper();

    @Autowired
    public QualityCertificateService(WtyDocRepository docs, WtyVersionRepository vers, WtyHistoryRepository hist) {
        this(docs, vers, hist, DemoSupport.systemClock(), DemoSupport::actor);
    }

    QualityCertificateService(WtyDocRepository docs, WtyVersionRepository vers, WtyHistoryRepository hist, Clock clock,
                              Supplier<String> actor) {
        this.docs = docs;
        this.vers = vers;
        this.hist = hist;
        this.clock = clock;
        this.actor = actor;
    }

    // ── OASIS action ─────────────────────────────────────

    /**
     * 현재 문서·버전 기록·이력. 응답: doc {ver, state, json, base, updatedAt, updatedBy} 또는 null,
     * versions [{ver, memo, approvedAt, approvedBy}](ver 내림차순), hist [{at, act, msg, by}](최근 100건, 최근 먼저).
     */
    public Map<String, Object> search(QualityCertificateRequest req) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("doc", docs.findById(WtyDoc.MAIN).map(QualityCertificateService::docView).orElse(null));
        List<Map<String, Object>> versions = new ArrayList<>();
        for (WtyVersion v : vers.findByDocIdOrderByDocVerDesc(WtyDoc.MAIN)) versions.add(versionView(v));
        out.put("versions", versions);
        List<Map<String, Object>> events = new ArrayList<>();
        for (WtyHistory h : hist.findTop100ByOrderByActAtDescHistNoDesc()) events.add(histView(h));
        out.put("hist", events);
        return out;
    }

    /**
     * 현재 문서 저장. INIT 은 문서가 없을 때만(적용본·v1 버전 기록도 같은 본문). DISCARD 는 본문을 적용본으로 되돌린다(json 무시).
     * 승인 대기 중에는 UNREQUEST 만 받는다. 상태: INIT·DISCARD = APPLIED, REQUEST = PENDING, DRAFT·UNREQUEST = state(APPLIED·DRAFT, 비면 DRAFT).
     * 응답: {ver, state, updatedAt}.
     */
    public Map<String, Object> save(QualityCertificateRequest req) {
        String act = DemoSupport.required(req.getAct(), "동작(act)").toUpperCase();
        if (!SAVE_ACTS.contains(act)) throw DemoSupport.invalid("저장 동작(act)이 올바르지 않습니다: " + act);
        String msg = text(req.getMsg(), "메시지(msg)");
        LocalDateTime now = DemoSupport.now(clock);
        String by = actor.get();
        WtyDoc doc = docs.findById(WtyDoc.MAIN).orElse(null);

        if (WtyHistory.INIT.equals(act)) {
            if (doc != null) throw DemoSupport.business(MSG_EXISTS);
            String body = body(req.getJson(), true);
            doc = WtyDoc.init(WtyDoc.MAIN, body, by, now);
            docs.save(doc);
            vers.save(WtyVersion.of(WtyDoc.MAIN, 1, body, msg == null ? "기본 문서" : msg, by, now));
            record(WtyHistory.INIT, msg == null ? "기본 문서 만들기 (v1)" : msg, by, now);
            return saved(doc);
        }

        if (doc == null) throw DemoSupport.business(MSG_NO_DOC);
        if (doc.isPending() && !WtyHistory.UNREQUEST.equals(act)) throw DemoSupport.business(MSG_PENDING);
        if (!doc.isPending() && WtyHistory.UNREQUEST.equals(act)) throw DemoSupport.business(MSG_NOT_PENDING);

        if (WtyHistory.DISCARD.equals(act)) {
            doc.write(doc.getBaseJson(), WtyDoc.APPLIED, by, now);
        } else {
            String body = body(req.getJson(), false);
            String state = WtyHistory.REQUEST.equals(act) ? WtyDoc.PENDING : editState(req.getState());
            doc.write(body == null ? doc.getBodyJson() : body, state, by, now);
        }
        docs.save(doc);
        record(act, msg, by, now);
        return saved(doc);
    }

    /** 승인 — 승인 대기일 때만. ver + 1, 적용본 = 현재 본문, 상태 APPLIED, 버전 기록 1행. 응답: {ver, approvedAt}. */
    public Map<String, Object> approve(QualityCertificateRequest req) {
        WtyDoc doc = docs.findById(WtyDoc.MAIN).orElseThrow(() -> DemoSupport.business(MSG_NO_DOC));
        if (!doc.isPending()) throw DemoSupport.business(MSG_NOT_PENDING);
        String memo = text(req.getMemo(), "승인 메모(memo)");
        LocalDateTime now = DemoSupport.now(clock);
        String by = actor.get();
        doc.approve(by, now);
        docs.save(doc);
        vers.save(WtyVersion.of(WtyDoc.MAIN, doc.getDocVer(), doc.getBodyJson(), memo, by, now));
        record(WtyHistory.APPROVE, "v" + doc.getDocVer() + " 승인" + (memo == null ? "" : " — " + memo), by, now);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ver", doc.getDocVer());
        out.put("approvedAt", ts(now));
        return out;
    }

    /** 시연 초기화 — 문서·버전·이력을 모두 지우고 RESET 이력 1행만 남긴다(화면이 기본 문서로 다시 INIT 한다). 응답: {ok: true}. */
    public Map<String, Object> reset(QualityCertificateRequest req) {
        hist.deleteAllInBatch();
        vers.deleteAllInBatch();
        docs.deleteAllInBatch();
        record(WtyHistory.RESET, "시연 초기화", actor.get(), DemoSupport.now(clock));
        return Map.of("ok", true);
    }

    // ── 도우미 ───────────────────────────────────────────

    /** 이력 1행. DRAFT·REQUEST 는 직전 행이 같은 사용자·같은 동작이고 1분 안이면 새 행 대신 그 행을 바꾼다. */
    private void record(String act, String msg, String by, LocalDateTime at) {
        if (COLLAPSE_ACTS.contains(act)) {
            WtyHistory last = hist.findFirstByOrderByActAtDescHistNoDesc().orElse(null);
            if (last != null && act.equals(last.getActCd()) && Objects.equals(by, last.getActBy())
                    && !last.getActAt().isBefore(at.minus(COLLAPSE_WINDOW))) {
                last.touch(msg, at);
                hist.save(last);
                return;
            }
        }
        hist.save(WtyHistory.of(WtyDoc.MAIN, act, msg, by, at));
    }

    /** 본문 — JSON 객체 문자열. required 가 아니면 빈 값은 null(지금 본문 유지). */
    private String body(String text, boolean required) {
        if (DemoSupport.isBlank(text)) {
            if (required) throw DemoSupport.invalid("본문(json)을 넣으세요.");
            return null;
        }
        String body = text.trim();
        try {
            JsonNode n = json.readTree(body);
            if (n == null || !n.isObject()) throw DemoSupport.invalid("본문(json)은 JSON 객체여야 합니다.");
        } catch (JsonProcessingException e) {
            throw DemoSupport.invalid("본문(json)이 JSON 형식이 아닙니다.");
        }
        return body;
    }

    /** DRAFT·UNREQUEST 가 둘 수 있는 상태 — APPLIED 또는 DRAFT(비면 DRAFT). 승인 대기는 REQUEST 로만 간다. */
    private static String editState(String state) {
        String s = DemoSupport.trimToNull(state);
        if (s == null) return WtyDoc.DRAFT;
        s = s.toUpperCase();
        if (WtyDoc.APPLIED.equals(s) || WtyDoc.DRAFT.equals(s)) return s;
        if (WtyDoc.PENDING.equals(s)) throw DemoSupport.invalid("승인 대기 상태는 승인 요청(REQUEST)으로만 둘 수 있습니다.");
        throw DemoSupport.invalid("상태(state)가 올바르지 않습니다: " + state);
    }

    private static String text(String s, String label) {
        String t = DemoSupport.trimToNull(s);
        if (t != null && t.length() > TEXT_MAX) throw DemoSupport.invalid(label + "은(는) " + TEXT_MAX + "자까지 입력합니다.");
        return t;
    }

    private static Map<String, Object> saved(WtyDoc d) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ver", d.getDocVer());
        out.put("state", d.getStatCd());
        out.put("updatedAt", ts(d.getUpdAt()));
        return out;
    }

    private static Map<String, Object> docView(WtyDoc d) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ver", d.getDocVer());
        m.put("state", d.getStatCd());
        m.put("json", d.getBodyJson());
        m.put("base", d.getBaseJson());
        m.put("updatedAt", ts(d.getUpdAt()));
        m.put("updatedBy", d.getUpdBy());
        return m;
    }

    private static Map<String, Object> versionView(WtyVersion v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ver", v.getDocVer());
        m.put("memo", v.getMemoTxt());
        m.put("approvedAt", ts(v.getAprvAt()));
        m.put("approvedBy", v.getAprvBy());
        return m;
    }

    private static Map<String, Object> histView(WtyHistory h) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("at", ts(h.getActAt()));
        m.put("act", h.getActCd());
        m.put("msg", h.getMsgTxt());
        m.put("by", h.getActBy());
        return m;
    }

    static String ts(LocalDateTime t) {
        return t == null ? null : TS.format(t);
    }
}
