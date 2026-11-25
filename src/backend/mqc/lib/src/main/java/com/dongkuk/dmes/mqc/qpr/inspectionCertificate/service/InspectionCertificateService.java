package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.service;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.support.DemoSupport;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcCert;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcCertOverride;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcDoc;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcForm;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcHistory;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcImage;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcIssue;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcKind;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcRule;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.dto.InspectionCertificateRequest;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcCertOverrideRepository;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcCertRepository;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcFormRepository;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcHistoryRepository;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcImageRepository;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcIssueRepository;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcRuleRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 검사증명서관리(OASIS inspectionCertificate, 화면 qpr/inspectionCertificate). 계약 = docs/mqc/demo/mtc-contract.md.
 * 시연 목업이다 — 값 계산(양식·예외 규칙·단건 수정 적용, 발행본 만들기)은 화면 TS 엔진이 하고, 서버는 JSON 본문을 그대로
 * 저장하면서 발행 번호 채번, 신규 수신 복제, 이미 발행·재발행 사유 검사, 위변조방지 값(해시·진위 확인 번호), 이력, 시연 초기화를 맡는다.
 * 진입 빈이라 @Transactional 을 두지 않는다 — OASIS 가 서비스 단위 트랜잭션을 건다.
 */
@Service("inspectionCertificate")
public class InspectionCertificateService {

    static final String MSG_ALREADY_ISSUED = "이미 발행된 증명서입니다. 재발행을 쓰세요.";
    static final String MSG_REASON_REQUIRED = "단건 수정이 있는 증명서는 수정 사유를 넣어야 재발행할 수 있습니다.";
    static final String SEED_BY = "system";
    static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    static final DateTimeFormatter YYMMDD = DateTimeFormatter.ofPattern("yyMMdd");
    /** 진위 확인 번호 글자(헷갈리는 I·O·0·1 제외 32자). */
    static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    static final Pattern ACT = Pattern.compile("[A-Z][A-Z0-9_]{0,29}");
    static final Pattern ARRIVAL_ID = Pattern.compile("N(\\d+)");
    static final int MSG_MAX = 1000;
    static final int REASON_MAX = 500;

    private final MtcFormRepository forms;
    private final MtcRuleRepository rules;
    private final MtcCertRepository certs;
    private final MtcCertOverrideRepository ovrs;
    private final MtcImageRepository imgs;
    private final MtcIssueRepository issues;
    private final MtcHistoryRepository hist;
    private final MtcSeedSource seed;
    private final Clock clock;
    private final ObjectMapper json = new ObjectMapper();

    @Autowired
    public InspectionCertificateService(MtcFormRepository forms, MtcRuleRepository rules, MtcCertRepository certs,
                                        MtcCertOverrideRepository ovrs, MtcImageRepository imgs, MtcIssueRepository issues,
                                        MtcHistoryRepository hist, MtcSeedSource seed) {
        this(forms, rules, certs, ovrs, imgs, issues, hist, seed, DemoSupport.systemClock());
    }

    InspectionCertificateService(MtcFormRepository forms, MtcRuleRepository rules, MtcCertRepository certs,
                                 MtcCertOverrideRepository ovrs, MtcImageRepository imgs, MtcIssueRepository issues,
                                 MtcHistoryRepository hist, MtcSeedSource seed, Clock clock) {
        this.forms = forms;
        this.rules = rules;
        this.certs = certs;
        this.ovrs = ovrs;
        this.imgs = imgs;
        this.issues = issues;
        this.hist = hist;
        this.seed = seed;
        this.clock = clock;
    }

    // ── OASIS action ─────────────────────────────────────

    /**
     * 모든 저장값을 한 번에 돌려준다. 저장된 것이 하나도 없으면 시드를 먼저 넣는다.
     * 응답: forms·rules·certs·ovrs·imgs [{key, json, updatedAt, updatedBy}], issued [...](issueNo 내림차순), hist [...](최근 200건).
     */
    public Map<String, Object> search(InspectionCertificateRequest req) {
        if (isEmpty()) seedAll();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("forms", docs(forms.findAllByOrderBySortSeqAsc()));
        out.put("rules", docs(rules.findAllByOrderBySortSeqAsc()));
        out.put("certs", docs(certs.findAllByOrderBySortSeqAsc()));
        out.put("ovrs", docs(ovrs.findAllByOrderBySortSeqAsc()));
        out.put("imgs", docs(imgs.findAllByOrderBySortSeqAsc()));
        List<Map<String, Object>> issued = new ArrayList<>();
        for (MtcIssue i : issues.findAllByOrderByIssueNoDesc()) issued.add(issueView(i));
        out.put("issued", issued);
        List<Map<String, Object>> events = new ArrayList<>();
        for (MtcHistory h : hist.findTop200ByOrderByActAtDescHistNoDesc()) events.add(histView(h));
        out.put("hist", events);
        return out;
    }

    /** 저장(있으면 교체) 또는 삭제(json 이 비면) + 이력 1행. 응답: {key, updatedAt}. */
    public Map<String, Object> save(InspectionCertificateRequest req) {
        MtcKind kind = MtcKind.of(DemoSupport.required(req.getKind(), "종류(kind)"));
        if (kind == null) throw DemoSupport.invalid("종류(kind)가 올바르지 않습니다: " + req.getKind());
        String key = DemoSupport.required(req.getKey(), "키");
        if (key.length() > keyMax(kind)) throw DemoSupport.invalid("키는 " + keyMax(kind) + "자까지입니다: " + key);
        boolean delete = DemoSupport.isBlank(req.getJson());
        String act = DemoSupport.trimToNull(req.getAct());
        if (act == null) act = kind.name() + (delete ? "_DELETE" : "_SAVE");
        if (!ACT.matcher(act).matches()) throw DemoSupport.invalid("이력 동작 이름(act)이 올바르지 않습니다: " + act);
        String reason = reason(req.getReason());
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();

        if (delete) {
            remove(kind, key);
        } else {
            String body = req.getJson().trim();
            write(kind, key, body, parseObject(body, "본문(json)"), by, now);
        }
        record(kind.name(), docNoOf(kind, key), act, req.getMsg(), reason, null, by, now);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", key);
        out.put("updatedAt", ts(now));
        return out;
    }

    /**
     * 신규 수신 흉내 — 원천 증명서 본문을 복제해 새 id(N + 3자리)와 새 증명서번호(UC1-{kind}-{오늘 YYMMDD}-{3자리 순번}, head.mtc)로 저장한다.
     * 응답: {certId, json}.
     */
    public Map<String, Object> reg(InspectionCertificateRequest req) {
        String srcId = DemoSupport.required(req.getSourceCertId(), "원천 증명서(sourceCertId)");
        MtcCert src = certs.findById(srcId).orElseThrow(() -> DemoSupport.notFound("증명서", srcId));
        ObjectNode body = (ObjectNode) parseObject(src.getBodyJson(), "원천 증명서 본문");
        String kind = text(body.get("kind"));
        if (kind == null) kind = src.getCertKnd();
        if (kind == null) throw DemoSupport.business("원천 증명서에 종류(kind)가 없습니다: " + srcId);
        String ymd = YYMMDD.format(LocalDate.now(clock));
        int n = nextArrivalNo();
        String certId;
        String mtcNo;
        while (true) {
            certId = "N" + String.format("%03d", n);
            mtcNo = "UC1-" + kind + "-" + ymd + "-" + String.format("%03d", n);
            if (!certs.existsById(certId) && !certs.existsByMtcNo(mtcNo)) break;
            n++;
        }
        JsonNode head = body.get("head");
        ObjectNode newHead = head != null && head.isObject() ? (ObjectNode) head : body.putObject("head");
        newHead.put("mtc", mtcNo);
        body.set("head", newHead);
        String text = write(body);
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        MtcCert c = MtcCert.create(certId, certs.maxSortSeq() + 1);
        c.write(text, mtcNo, kind, cut(text(body.get("cust")), 30), by, now);
        certs.save(c);
        String msg = DemoSupport.isBlank(req.getMsg()) ? mtcNo + " 수신 (원천 " + nvl(src.getMtcNo(), srcId) + ")" : req.getMsg();
        record(MtcKind.CERT.name(), mtcNo, MtcHistory.RECEIVE, msg, null, null, by, now);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("certId", certId);
        out.put("json", text);
        return out;
    }

    /** 첫 발행. 이미 발행됐으면 거부한다. 발행 번호 = 기존 최대 + 1. 응답: {certId, issueNo, issuedAt, verifyCode, docHash}. */
    public Map<String, Object> issue(InspectionCertificateRequest req) {
        String certId = DemoSupport.required(req.getCertId(), "증명서(certId)");
        MtcCert cert = certs.findById(certId).orElseThrow(() -> DemoSupport.notFound("증명서", certId));
        if (issues.existsById(certId)) throw DemoSupport.business(MSG_ALREADY_ISSUED);
        String snap = snap(req.getSnap());
        String act = DemoSupport.trimToNull(req.getAct());
        if (act == null) act = MtcHistory.ISSUE;
        if (!MtcHistory.ISSUE.equals(act) && !MtcHistory.AUTO_ISSUE.equals(act)) {
            throw DemoSupport.invalid("발행 동작은 ISSUE 또는 AUTO_ISSUE 입니다: " + act);
        }
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        int issueNo = issues.maxIssueNo() + 1;
        String hash = docHash(snap);
        String code = verifyCode(hash, issueNo, 0);
        MtcIssue i = MtcIssue.of(certId, issueNo, cert.getMtcNo(), 0, null, code, hash, snap, by, now);
        issues.save(i);
        String msg = DemoSupport.isBlank(req.getMsg()) ? nvl(cert.getMtcNo(), certId) + " 발행" : req.getMsg();
        record(MtcKind.CERT.name(), nvl(cert.getMtcNo(), certId), act, msg, null, code, by, now);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("certId", certId);
        out.put("issueNo", issueNo);
        out.put("issuedAt", ts(now));
        out.put("verifyCode", code);
        out.put("docHash", hash);
        return out;
    }

    /**
     * 재발행 — 발행본 교체, reissueCnt + 1, 진위 확인 번호 새로 만듦(이전 번호는 이력에 남아 confirm 이 SUPERSEDED 로 답한다).
     * 단건 수정이 있는 증명서는 reason 이 있어야 한다. 응답: {certId, reissueCnt, issuedAt, verifyCode, docHash}.
     */
    public Map<String, Object> reissue(InspectionCertificateRequest req) {
        String certId = DemoSupport.required(req.getCertId(), "증명서(certId)");
        MtcIssue i = issues.findById(certId).orElseThrow(() -> DemoSupport.business("발행되지 않은 증명서입니다. 먼저 발행하세요: " + certId));
        String snap = snap(req.getSnap());
        String reason = reason(req.getReason());
        if (reason == null && ovrs.existsById(certId)) throw DemoSupport.business(MSG_REASON_REQUIRED);
        String mtcNo = certs.findById(certId).map(MtcCert::getMtcNo).orElse(i.getMtcNo());
        LocalDateTime now = DemoSupport.now(clock);
        String by = DemoSupport.actor();
        String oldCode = i.getVrfyCd();
        String hash = docHash(snap);
        String code = verifyCode(hash, i.getIssueNo(), i.nextRissuCnt());
        i.reissue(snap, mtcNo, reason, code, hash, by, now);
        issues.save(i);
        String msg = DemoSupport.isBlank(req.getMsg()) ? nvl(mtcNo, certId) + " 재발행 (진위 확인 번호 " + code + ")" : req.getMsg();
        record(MtcKind.CERT.name(), nvl(mtcNo, certId), MtcHistory.REISSUE, msg, reason, oldCode, by, now);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("certId", certId);
        out.put("reissueCnt", i.getRissuCnt());
        out.put("issuedAt", ts(now));
        out.put("verifyCode", code);
        out.put("docHash", hash);
        return out;
    }

    /**
     * 진위 확인(목업 수준). status: GENUINE 현재 번호(snap 을 보냈으면 해시도 같음) · TAMPERED 번호는 맞고 snap 해시가 다름 ·
     * SUPERSEDED 재발행으로 대체된 이전 번호 · NOT_FOUND 없는 번호. 이력 VERIFY 1행.
     * 응답: {status, verifyCode, mtcNo, issueNo, issuedAt, reissueCnt, docHash}(SUPERSEDED 는 그 증명서의 현재 발행본 값, NOT_FOUND 는 비어 있다).
     */
    public Map<String, Object> confirm(InspectionCertificateRequest req) {
        String code = DemoSupport.required(req.getVerifyCode(), "진위 확인 번호").toUpperCase();
        if (code.length() > 14) throw DemoSupport.invalid("진위 확인 번호 형식이 올바르지 않습니다: " + code);
        String status;
        MtcIssue i = issues.findByVrfyCd(code).orElse(null);
        if (i != null) {
            boolean same = DemoSupport.isBlank(req.getSnap()) || docHash(req.getSnap().trim()).equals(i.getDocHash());
            status = same ? "GENUINE" : "TAMPERED";
        } else {
            List<MtcHistory> old = hist.findByActCdAndVrfyCdOrderByActAtDesc(MtcHistory.REISSUE, code);
            if (old.isEmpty()) {
                status = "NOT_FOUND";
            } else {
                status = "SUPERSEDED";
                i = issues.findFirstByMtcNo(old.get(0).getDocNo()).orElse(null);
            }
        }
        LocalDateTime now = DemoSupport.now(clock);
        String docNo = i == null ? null : nvl(i.getMtcNo(), i.getCertId());
        record(MtcKind.CERT.name(), docNo, MtcHistory.VERIFY, "진위 확인 " + code + " → " + status, null, code, DemoSupport.actor(), now);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", status);
        out.put("verifyCode", code);
        out.put("mtcNo", i == null ? null : i.getMtcNo());
        out.put("issueNo", i == null ? null : i.getIssueNo());
        out.put("issuedAt", i == null ? null : ts(i.getIssueAt()));
        out.put("reissueCnt", i == null ? null : i.getRissuCnt());
        out.put("docHash", i == null ? null : i.getDocHash());
        return out;
    }

    /** 시연 초기화 — 모든 MTC 저장값(이력 포함)을 지우고 시드를 다시 넣은 뒤 RESET 이력 1행. 응답: {ok: true}. */
    public Map<String, Object> reset(InspectionCertificateRequest req) {
        hist.deleteAllInBatch();
        issues.deleteAllInBatch();
        ovrs.deleteAllInBatch();
        certs.deleteAllInBatch();
        rules.deleteAllInBatch();
        forms.deleteAllInBatch();
        imgs.deleteAllInBatch();
        seedAll();
        record(null, null, MtcHistory.RESET, "시연 초기화", null, null, DemoSupport.actor(), DemoSupport.now(clock));
        return Map.of("ok", true);
    }

    // ── 위변조방지(목업 수준) ─────────────────────────────

    /** 발행본 문자열의 SHA-256(16진 소문자 64자). */
    static String docHash(String snap) {
        return HexFormat.of().formatHex(sha256(snap));
    }

    /** 진위 확인 번호 XXXX-XXXX-XXXX — 해시·발행 번호·재발행 횟수에서 유도. 발행·재발행마다 바뀐다. */
    static String verifyCode(String docHash, int issueNo, int reissueCnt) {
        byte[] d = sha256(docHash + ":" + issueNo + ":" + reissueCnt);
        StringBuilder sb = new StringBuilder(14);
        for (int k = 0; k < 12; k++) {
            if (k > 0 && k % 4 == 0) sb.append('-');
            sb.append(CODE_CHARS.charAt((d[k] & 0xFF) % CODE_CHARS.length()));
        }
        return sb.toString();
    }

    private static byte[] sha256(String s) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    // ── 저장 ─────────────────────────────────────────────

    private boolean isEmpty() {
        return forms.count() == 0 && rules.count() == 0 && certs.count() == 0 && ovrs.count() == 0 && imgs.count() == 0
                && issues.count() == 0;
    }

    private static int keyMax(MtcKind kind) {
        return switch (kind) {
            case FORM -> 10;
            case IMG -> 200;
            default -> 20;
        };
    }

    /** 본문을 저장한다(있으면 교체, 없으면 목록 끝에 추가). 서버가 읽는 값만 칼럼으로 뺀다. */
    private void write(MtcKind kind, String key, String body, JsonNode n, String by, LocalDateTime at) {
        switch (kind) {
            case FORM -> {
                MtcForm f = forms.findById(key).orElseGet(() -> MtcForm.create(key, forms.maxSortSeq() + 1));
                f.write(body, intOf(n.path("applied").get("ver")), n.path("pending").asBoolean(false), by, at);
                forms.save(f);
            }
            case RULE -> {
                MtcRule r = rules.findById(key).orElseGet(() -> MtcRule.create(key, rules.maxSortSeq() + 1));
                r.write(body, cut(text(n.get("code")), 30), cut(text(n.get("name")), 200), cut(text(n.get("st")), 20),
                        intOf(n.get("prio")), by, at);
                rules.save(r);
            }
            case CERT -> {
                MtcCert c = certs.findById(key).orElseGet(() -> MtcCert.create(key, certs.maxSortSeq() + 1));
                c.write(body, cut(text(n.path("head").get("mtc")), 30), cut(text(n.get("kind")), 10), cut(text(n.get("cust")), 30), by, at);
                certs.save(c);
            }
            case OVR -> {
                MtcCertOverride o = ovrs.findById(key).orElseGet(() -> MtcCertOverride.create(key, ovrs.maxSortSeq() + 1));
                o.write(body, by, at);
                ovrs.save(o);
            }
            case IMG -> {
                MtcImage i = imgs.findById(key).orElseGet(() -> MtcImage.create(key, imgs.maxSortSeq() + 1));
                i.write(body, cut(text(n.get("kind")), 10), by, at);
                imgs.save(i);
            }
        }
    }

    private void remove(MtcKind kind, String key) {
        switch (kind) {
            case FORM -> forms.deleteById(key);
            case RULE -> rules.deleteById(key);
            case CERT -> {
                if (issues.existsById(key)) throw DemoSupport.business("발행된 증명서는 지울 수 없습니다: " + key);
                certs.deleteById(key);
            }
            case OVR -> ovrs.deleteById(key);
            case IMG -> imgs.deleteById(key);
        }
    }

    /** 이력의 문서 번호 — 증명서·단건 수정은 증명서번호(head.mtc), 나머지는 키. */
    private String docNoOf(MtcKind kind, String key) {
        if (kind == MtcKind.CERT || kind == MtcKind.OVR) {
            return certs.findById(key).map(MtcCert::getMtcNo).filter(s -> !s.isBlank()).orElse(key);
        }
        return key;
    }

    private int nextArrivalNo() {
        int max = 0;
        for (MtcCert c : certs.findByCertIdStartingWith("N")) {
            Matcher m = ARRIVAL_ID.matcher(c.getCertId());
            if (m.matches()) max = Math.max(max, Integer.parseInt(m.group(1)));
        }
        return max + 1;
    }

    private void record(String kind, String docNo, String act, String msg, String reason, String code, String by, LocalDateTime at) {
        hist.save(MtcHistory.of(kind, cut(docNo, 200), act, cut(DemoSupport.trimToNull(msg), MSG_MAX), reason, code, by, at));
    }

    // ── 시드 ─────────────────────────────────────────────

    /** classpath 시드를 넣는다. 파일이 없으면 아무것도 넣지 않는다(경고는 MtcSeedSource 가 남긴다). */
    private void seedAll() {
        Optional<JsonNode> loaded = seed.load();
        if (loaded.isEmpty()) return;
        JsonNode s = loaded.get();
        LocalDateTime now = DemoSupport.now(clock);
        seedDocs(MtcKind.FORM, s.path("forms"), now);
        seedDocs(MtcKind.RULE, s.path("rules"), now);
        seedDocs(MtcKind.CERT, s.path("certs"), now);
        seedDocs(MtcKind.OVR, s.path("ovrs"), now);
        seedDocs(MtcKind.IMG, s.path("imgs"), now);
        for (JsonNode n : s.path("issued")) {
            String certId = text(n.get("certId"));
            if (certId == null) continue;
            String snap = write(n.path("snap"));
            int issueNo = n.path("issueNo").asInt();
            int cnt = n.path("reissueCnt").asInt(0);
            String hash = docHash(snap);
            String mtcNo = certs.findById(certId).map(MtcCert::getMtcNo).orElse(null);
            issues.save(MtcIssue.of(certId, issueNo, mtcNo, cnt, cut(text(n.get("reason")), REASON_MAX), verifyCode(hash, issueNo, cnt),
                    hash, snap, SEED_BY, parseTs(text(n.get("issuedAt")), now)));
        }
        for (JsonNode n : s.path("hist")) {
            String act = text(n.get("act"));
            if (act == null) continue;
            record(text(n.get("kind")), text(n.get("docNo")), cut(act, 30), text(n.get("msg")), cut(text(n.get("reason")), REASON_MAX),
                    null, nvl(text(n.get("by")), SEED_BY), parseTs(text(n.get("at")), now));
        }
    }

    private void seedDocs(MtcKind kind, JsonNode list, LocalDateTime now) {
        for (JsonNode n : list) {
            String key = text(n.get("key"));
            JsonNode body = n.get("json");
            if (key == null || body == null || !body.isObject()) continue;
            write(kind, key, write(body), body, SEED_BY, now);
        }
    }

    // ── 응답 ─────────────────────────────────────────────

    private static List<Map<String, Object>> docs(List<? extends MtcDoc> list) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (MtcDoc d : list) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("key", d.docKey());
            m.put("json", d.getBodyJson());
            m.put("updatedAt", ts(d.getUpdAt()));
            m.put("updatedBy", d.getUpdBy());
            out.add(m);
        }
        return out;
    }

    private static Map<String, Object> issueView(MtcIssue i) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("certId", i.getCertId());
        m.put("mtcNo", i.getMtcNo());
        m.put("issueNo", i.getIssueNo());
        m.put("issuedAt", ts(i.getIssueAt()));
        m.put("issuedBy", i.getIssueBy());
        m.put("reissueCnt", i.getRissuCnt());
        m.put("reason", i.getRissuRsn());
        m.put("verifyCode", i.getVrfyCd());
        m.put("docHash", i.getDocHash());
        m.put("snap", i.getSnapJson());
        return m;
    }

    private static Map<String, Object> histView(MtcHistory h) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("at", ts(h.getActAt()));
        m.put("docNo", h.getDocNo());
        m.put("act", h.getActCd());
        m.put("msg", h.getMsgTxt());
        m.put("reason", h.getRsnTxt());
        m.put("by", h.getActBy());
        m.put("kind", h.getDocKnd());
        return m;
    }

    // ── 작은 도우미 ───────────────────────────────────────

    private JsonNode parseObject(String text, String label) {
        try {
            JsonNode n = json.readTree(text);
            if (n == null || !n.isObject()) throw DemoSupport.invalid(label + "은(는) JSON 객체여야 합니다.");
            return n;
        } catch (JsonProcessingException e) {
            throw DemoSupport.invalid(label + "이(가) JSON 형식이 아닙니다.");
        }
    }

    private String write(JsonNode n) {
        try {
            return json.writeValueAsString(n);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private String snap(String snap) {
        String s = DemoSupport.required(snap, "발행본(snap)");
        parseObject(s, "발행본(snap)");
        return s;
    }

    private static String reason(String reason) {
        String r = DemoSupport.trimToNull(reason);
        if (r != null && r.length() > REASON_MAX) throw DemoSupport.invalid("사유는 " + REASON_MAX + "자까지 입력합니다.");
        return r;
    }

    private static String text(JsonNode n) {
        if (n == null || n.isNull() || n.isMissingNode() || n.isContainerNode()) return null;
        String s = n.asText();
        return s.isBlank() ? null : s.trim();
    }

    private static Integer intOf(JsonNode n) {
        return n != null && n.canConvertToInt() ? n.asInt() : null;
    }

    private static String cut(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    private static String nvl(String a, String b) {
        return a == null || a.isBlank() ? b : a;
    }

    static String ts(LocalDateTime t) {
        return t == null ? null : TS.format(t);
    }

    /** 시드 시각 — 2026-11-01T08:10:00 · 2026-11-01 08:10 · 2026.11.01 08:10 모양을 받는다. 못 읽으면 기본값. */
    static LocalDateTime parseTs(String text, LocalDateTime fallback) {
        if (text == null) return fallback;
        String t = text.trim().replace('.', '-').replace(' ', 'T');
        if (t.length() == 10) t += "T00:00:00";
        else if (t.length() == 16) t += ":00";
        try {
            return LocalDateTime.parse(t.length() > 19 ? t.substring(0, 19) : t, TS).truncatedTo(ChronoUnit.SECONDS);
        } catch (DateTimeParseException e) {
            return fallback;
        }
    }
}
