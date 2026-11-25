package com.dongkuk.dmes.mqc.qdm.qualitySpec.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.ChangeAction;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.Products;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpec;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecAttr;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecBase;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecChange;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecCustomer;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecIfLog;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecOrder;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecStore;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecTerm;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.SpecStatus;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecBatchRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecCodesRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecDeleteRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecHistoryRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecRunRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecSaveRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecSearchRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecViewRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.engine.SpecDsl;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.engine.SpecMatcher;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * 품질사양 관리 서비스(OASIS qualitySpec, 메뉴 qdm/qualitySpec).
 * 고객 품질사양은 "조건(IF) → 설계결과(THEN)" 규칙이다. 한 줄 문장으로 쓰고 확정한 뒤 SAP OMS 로 보낸다(시연 흉내).
 * 주문 품질설계 때는 표준 설계 기준값을 맞는 사양이 사양번호 순으로 덮어쓴다(뒤 사양 우선).
 * <ul>
 *   <li>search·view·history·codes — 조회. run — 주문 적용 시뮬레이션(저장하지 않는다).</li>
 *   <li>save·delete — 사양(기본) 또는 항목 사전(target=ATTR). confirm·send — 사양 여러 개.</li>
 * </ul>
 * 상태: 작성중(DRAFT) → 확정(CONF) → 전송완료(SENT) | 전송실패(FAIL) → 재전송. 작성중이 아닌 사양을 고치면 개정(Rev+1)되고 작성중으로 돌아간다.
 * OMS 전송은 결정적 흉내다 — SIM_FAIL_MSG 가 있는 사양만 그 메시지로 실패한다.
 * 진입 빈이라 @Transactional 을 두지 않는다(02-structure-naming-constraints §6-B-1). 쓰기 묶음은 저장소 inTx 로 감싼다.
 * 화면이 보낸 값 중 신뢰하는 것은 키(사양번호·항목 코드)뿐이고, 상태·조건은 저장된 값을 다시 읽어 판단한다(BE 가이드 §5.4).
 */
@Service("qualitySpec")
public class QualitySpecService {

    static final ZoneId KST = ZoneId.of("Asia/Seoul");
    static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    static final DateTimeFormatter IF_DAY = DateTimeFormatter.ofPattern("yyyyMMdd");
    static final DateTimeFormatter SND_DT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    static final String TARGET_ATTR = "ATTR";
    static final String SPEC_IF_ID = "MESQ_OMS_SPEC_001";
    static final String ORDER_IF_ID = "OMS_MESQ_ORD_001";
    static final String SEND_OK_MSG = "사양 송신 완료 (IDoc 51 → 53)";
    static final String DELETE_NOTICE_MSG = "사양 삭제 통지 (QSPEC_DEL)";
    static final String NONE = "—";
    static final int MAX_LINES = 50;
    private static final Pattern ATTR_CODE = Pattern.compile("^[A-Z][A-Z0-9_]{0,19}$");
    private static final Pattern LEN_NUMBER = Pattern.compile("^\\d{1,3}(,\\d{1,3})?$");
    private static final Pattern LEN_TEXT = Pattern.compile("^\\d{1,4}$");
    private static final Set<String> KINDS = Set.of(QualitySpecAttr.COND, QualitySpecAttr.RESULT, QualitySpecAttr.BOTH);
    private static final Set<String> DATA_TYPES = Set.of("VARCHAR2", "NUMBER", "CHAR", "DATE");

    private final QualitySpecStore store;
    private final Clock clock;
    private final Supplier<String> currentUser;
    private final ObjectMapper json = new ObjectMapper();

    @Autowired
    public QualitySpecService(QualitySpecStore store) {
        this(store, Clock.system(KST), QualitySpecService::securityUser);
    }

    QualitySpecService(QualitySpecStore store, Clock clock, Supplier<String> currentUser) {
        this.store = store;
        this.clock = clock;
        this.currentUser = currentUser;
    }

    // ── 조회 ─────────────────────────────────────────────────────

    /** 사양 목록(최종수정 내림차순). total·counts 는 거르기 전 전체 기준이고 allSpecNos 는 화면 채번 미리보기에 쓴다. */
    public Map<String, Object> search(QualitySpecSearchRequest req) {
        List<QualitySpec> all = store.specs();
        Map<String, List<QualitySpecTerm>> termsBy = termsBySpec(store.terms());
        Map<String, String> cusNames = customerNames();
        String status = blankToNull(req.getStatus());
        String cusCd = blankToNull(req.getCusCd());
        String prdNmCd = blankToNull(req.getPrdNmCd());
        String attrCd = blankToNull(req.getAttrCd());
        String keyword = lower(req.getKeyword());

        Map<String, Integer> counts = new LinkedHashMap<>();
        SpecStatus.ALL.forEach(s -> counts.put(s, 0));
        all.forEach(s -> counts.merge(s.getStatus(), 1, Integer::sum));

        List<Map<String, Object>> rows = all.stream()
                .filter(s -> status == null || status.equals(s.getStatus()))
                .filter(s -> cusCd == null || cusCd.equals(s.getCusCd()))
                .filter(s -> prdNmCd == null || prdNmCd.equals(s.getPrdNmCd()))
                .filter(s -> attrCd == null || termsBy.getOrDefault(s.getSpecNo(), List.of()).stream().anyMatch(t -> attrCd.equals(t.getAttrCd())))
                .filter(s -> keyword == null || matchesKeyword(s, termsBy.getOrDefault(s.getSpecNo(), List.of()), cusNames, keyword))
                .sorted(Comparator.comparing(QualitySpec::getModDttm).reversed().thenComparing(QualitySpec::getSpecNo))
                .map(s -> specView(s, termsBy.getOrDefault(s.getSpecNo(), List.of()), cusNames))
                .toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("specs", rows);
        out.put("total", all.size());
        out.put("counts", counts);
        out.put("allSpecNos", all.stream().map(QualitySpec::getSpecNo).sorted().toList());
        return out;
    }

    /** 사양 한 건 상세 + 그 사양의 변경 이력·전송 이력(최근 먼저). */
    public Map<String, Object> view(QualitySpecViewRequest req) {
        String specNo = required(req.getSpecNo(), "품질사양번호");
        QualitySpec spec = findSpec(specNo);
        Map<String, QualitySpec> current = Map.of(specNo, spec);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("spec", specView(spec, store.terms(specNo), customerNames()));
        out.put("changes", store.changes().stream().filter(c -> specNo.equals(c.getSpecNo()))
                .sorted(CHANGE_ORDER).map(c -> changeView(c, current)).toList());
        out.put("ifLogs", store.ifLogs().stream().filter(l -> specNo.equals(l.getSpecNo()))
                .sorted(IF_ORDER).map(l -> ifView(l, current)).toList());
        return out;
    }

    /** 변경 이력(kind=CHANGE, 기본) 또는 전송 이력(kind=IF). 최근 먼저. */
    public Map<String, Object> history(QualitySpecHistoryRequest req) {
        Map<String, QualitySpec> current = store.specs().stream().collect(Collectors.toMap(QualitySpec::getSpecNo, s -> s));
        String specNo = blankToNull(req.getSpecNo());
        String keyword = lower(req.getKeyword());
        if ("IF".equalsIgnoreCase(blankToNull(req.getKind()))) {
            String direction = blankToNull(req.getDirection());
            String result = blankToNull(req.getResult());
            List<Map<String, Object>> logs = store.ifLogs().stream()
                    .filter(l -> specNo == null || specNo.equals(l.getSpecNo()))
                    .filter(l -> direction == null || direction.equals(l.getDirection()))
                    .filter(l -> result == null || result.equals(l.getIfResult()))
                    .filter(l -> keyword == null || containsAny(keyword, l.getIfNo(), l.getSpecNo(), l.getOrdNo(), l.getTarget()))
                    .sorted(IF_ORDER).map(l -> ifView(l, current)).toList();
            return Map.of("ifLogs", logs);
        }
        LocalDate from = parseDay(req.getFromDt(), "시작일");
        LocalDate to = parseDay(req.getToDt(), "종료일");
        if (from != null && to != null && from.isAfter(to)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "시작일이 종료일보다 늦을 수 없습니다.");
        }
        List<Map<String, Object>> changes = store.changes().stream()
                .filter(c -> specNo == null || specNo.equals(c.getSpecNo()))
                .filter(c -> from == null || !c.getChgDttm().isBefore(from.atStartOfDay()))
                .filter(c -> to == null || c.getChgDttm().isBefore(to.plusDays(1).atStartOfDay()))
                .filter(c -> keyword == null || containsAny(keyword, c.getSpecNo(), c.getWorkerNm()))
                .sorted(CHANGE_ORDER).map(c -> changeView(c, current)).toList();
        return Map.of("changes", changes);
    }

    /** 기준 자료: 항목 사전(거르기 적용, 사용 건수 포함), 고객, 품명, 표준 설계 기준값, 시뮬레이션 표본 주문. */
    public Map<String, Object> codes(QualitySpecCodesRequest req) {
        List<QualitySpecAttr> attrs = store.attrs();
        Map<String, Integer> useCounts = useCounts(store.terms());
        String kind = blankToNull(req.getKind());
        String useYn = blankToNull(req.getUseYn());
        String keyword = lower(req.getKeyword());
        Map<String, String> cusNames = customerNames();
        Map<String, QualitySpecAttr> dict = attrs.stream().collect(Collectors.toMap(QualitySpecAttr::getAttrCd, a -> a));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("attrs", attrs.stream()
                .filter(a -> kind == null || kind.equals(a.getAttrKind()))
                .filter(a -> useYn == null || useYn.equals(a.getUseYn()))
                .filter(a -> keyword == null || containsAny(keyword, a.getAttrNm(), a.getAttrCd(), a.getDescription()))
                .map(a -> attrView(a, useCounts.getOrDefault(a.getAttrCd(), 0))).toList());
        out.put("customers", store.customers().stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("cusCd", c.getCusCd());
            m.put("cusNm", c.getCusNm());
            return m;
        }).toList());
        out.put("products", Products.NAMES.entrySet().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("prdNmCd", e.getKey());
            m.put("prdNm", e.getValue());
            m.put("label", Products.label(e.getKey()));
            return m;
        }).toList());
        out.put("baseDesign", store.baseDesign().stream().map(b -> {
            QualitySpecAttr a = dict.get(b.getAttrCd());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("attrCd", b.getAttrCd());
            m.put("attrNm", a == null ? b.getAttrCd() : a.getAttrNm());
            m.put("baseVal", b.getBaseVal());
            m.put("remark", b.getRemark());
            m.put("unit", a == null ? null : a.getUnit());
            return m;
        }).toList());
        out.put("orders", store.orders().stream().map(o -> orderView(o.getOrdNo(), o.getCusCd(), o.getPrdNmCd(), o.getQty(),
                o.getRecvDttm(), readAttrs(o.getAttrsJson()), cusNames)).toList());
        return out;
    }

    // ── 사양 쓰기 ─────────────────────────────────────────────────

    /** 사양 저장(줄마다 한 건, specNo 가 있으면 그 사양 수정) 또는 항목 사전 저장(target=ATTR). */
    public Map<String, Object> save(QualitySpecSaveRequest req) {
        if (TARGET_ATTR.equalsIgnoreCase(blankToNull(req.getTarget()))) return store.inTx(() -> saveAttr(req));
        return store.inTx(() -> saveSpecs(req));
    }

    /** 사양 삭제(specNos) 또는 항목 사전 삭제(target=ATTR, attrCd). */
    public Map<String, Object> delete(QualitySpecDeleteRequest req) {
        if (TARGET_ATTR.equalsIgnoreCase(blankToNull(req.getTarget()))) return store.inTx(() -> deleteAttr(req));
        List<String> specNos = specNos(req.getSpecNos());
        return store.inTx(() -> {
            String user = user();
            LocalDateTime now = now();
            List<String> deleted = new ArrayList<>();
            for (String specNo : specNos) {
                QualitySpec spec = findSpec(specNo);
                if (SpecStatus.SENT.equals(spec.getStatus())) {
                    // OMS 에 이미 있는 사양은 지운다는 통지를 보낸다(결정적 흉내 — 늘 성공).
                    store.saveIfLog(QualitySpecIfLog.of(nextIfNo(now), QualitySpecIfLog.MES_OMS, spec.getSpecNo() + " Rev." + spec.getRev(),
                            spec.getSpecNo(), spec.getRev(), null, QualitySpecIfLog.OK, DELETE_NOTICE_MSG, elapsedMs(spec.getSpecNo() + "DEL"), null, now));
                }
                logChange(spec.getSpecNo(), spec.getRev(), ChangeAction.DEL,
                        List.of(change("상태", SpecStatus.name(spec.getStatus()), "삭제")), user, now);
                store.deleteSpec(specNo);
                deleted.add(specNo);
            }
            return Map.of("deleted", deleted);
        });
    }

    /** 작성중 사양을 확정한다. 설계결과가 없거나 사전에 없는 항목이 있으면 건너뛴다. */
    public Map<String, Object> confirm(QualitySpecBatchRequest req) {
        List<String> specNos = specNos(req.getSpecNos());
        return store.inTx(() -> {
            String user = user();
            LocalDateTime now = now();
            List<Map<String, Object>> confirmed = new ArrayList<>();
            List<Map<String, Object>> skipped = new ArrayList<>();
            for (String specNo : specNos) {
                QualitySpec spec = findSpec(specNo);
                List<QualitySpecTerm> terms = store.terms(specNo);
                String reason = !SpecStatus.DRAFT.equals(spec.getStatus()) ? "작성중 상태가 아닙니다"
                        : terms.stream().noneMatch(t -> !t.isIf()) ? "설계결과가 없습니다"
                        : !mapped(terms) ? "코드 사전에 없는 항목이 있습니다(코드 매핑 필요)" : null;
                if (reason != null) {
                    skipped.add(skip(specNo, reason));
                    continue;
                }
                spec.setStatus(SpecStatus.CONF);
                spec.touch(user, now);
                store.saveSpec(spec);
                logChange(specNo, spec.getRev(), ChangeAction.CONF, List.of(change("상태", "작성중", "확정")), user, now);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("specNo", specNo);
                m.put("rev", spec.getRev());
                confirmed.add(m);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("confirmed", confirmed);
            out.put("skipped", skipped);
            return out;
        });
    }

    /**
     * 확정·전송실패 사양을 SAP OMS 로 보낸다(시연 흉내, I/F MESQ_OMS_SPEC_001). 사양마다 전송 이력 한 건을 남기고
     * 상태를 전송완료 또는 전송실패로 바꾼다. 실패는 SIM_FAIL_MSG 가 있는 사양만 난다(결정적).
     */
    public Map<String, Object> send(QualitySpecBatchRequest req) {
        List<String> specNos = specNos(req.getSpecNos());
        return store.inTx(() -> {
            String user = user();
            LocalDateTime now = now();
            List<Map<String, Object>> skipped = new ArrayList<>();
            List<QualitySpec> eligible = new ArrayList<>();
            Map<String, List<QualitySpecTerm>> termsOf = new HashMap<>();
            for (String specNo : specNos) {
                QualitySpec spec = findSpec(specNo);
                List<QualitySpecTerm> terms = store.terms(specNo);
                String reason = !SpecStatus.sendable(spec.getStatus()) ? SpecStatus.name(spec.getStatus()) + " 상태는 보낼 수 없습니다(확정·전송실패만)"
                        : !mapped(terms) ? "코드 사전에 없는 항목이 있습니다(코드 매핑 필요)"
                        : terms.stream().noneMatch(t -> !t.isIf()) ? "설계결과가 없습니다" : null;
                if (reason != null) {
                    skipped.add(skip(specNo, reason));
                    continue;
                }
                eligible.add(spec);
                termsOf.put(specNo, terms);
            }
            if (eligible.isEmpty()) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                        "보낼 수 있는 사양이 없습니다. 확정·전송실패 상태이고 코드 매핑이 끝난 사양만 보냅니다.");
            }
            eligible.sort(Comparator.comparing(QualitySpec::getSpecNo));
            String payload = payload(eligible, termsOf, now);

            List<Map<String, Object>> results = new ArrayList<>();
            int ok = 0;
            for (QualitySpec spec : eligible) {
                boolean fail = spec.getSimFailMsg() != null && !spec.getSimFailMsg().isBlank();
                String msg = fail ? spec.getSimFailMsg() : SEND_OK_MSG;
                String ifNo = nextIfNo(now);
                int ms = elapsedMs(spec.getSpecNo() + "#" + spec.getRev());
                store.saveIfLog(QualitySpecIfLog.of(ifNo, QualitySpecIfLog.MES_OMS, spec.getSpecNo() + " Rev." + spec.getRev(), spec.getSpecNo(),
                        spec.getRev(), null, fail ? QualitySpecIfLog.FAIL : QualitySpecIfLog.OK, msg, ms,
                        payload(List.of(spec), termsOf, now), now));
                String before = SpecStatus.name(spec.getStatus());
                spec.setStatus(fail ? SpecStatus.FAIL : SpecStatus.SENT);
                spec.setFailMsg(fail ? msg : null);
                store.saveSpec(spec);
                logChange(spec.getSpecNo(), spec.getRev(), fail ? ChangeAction.SEND_FAIL : ChangeAction.SEND,
                        List.of(change("상태", before, SpecStatus.name(spec.getStatus()))), user, now);
                if (!fail) ok++;
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("specNo", spec.getSpecNo());
                r.put("rev", spec.getRev());
                r.put("ifNo", ifNo);
                r.put("result", fail ? QualitySpecIfLog.FAIL : QualitySpecIfLog.OK);
                r.put("msg", msg);
                r.put("elapsedMs", ms);
                results.add(r);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ifId", SPEC_IF_ID);
            out.put("results", results);
            out.put("skipped", skipped);
            out.put("payload", payload);
            out.put("okCount", ok);
            out.put("failCount", results.size() - ok);
            return out;
        });
    }

    /**
     * 주문 적용 시뮬레이션(저장하지 않는다). 같은 고객사·품명 사양의 조건을 주문값과 비교하고, 맞고 확정·전송완료인 사양의
     * 설계결과로 표준 설계 기준값을 사양번호 순으로 덮어쓴다(뒤 사양 우선). 두 사양 이상이 같은 항목을 덮으면 충돌로 알린다.
     */
    public Map<String, Object> run(QualitySpecRunRequest req) {
        Map<String, String> cusNames = customerNames();
        String ordNo;
        String cusCd;
        String prdNmCd;
        String qty;
        LocalDateTime recvAt;
        Map<String, String> attrs;
        if (blankToNull(req.getOrdNo()) != null) {
            QualitySpecOrder o = store.order(req.getOrdNo().trim())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "주문이 없습니다: " + req.getOrdNo().trim()));
            ordNo = o.getOrdNo();
            cusCd = o.getCusCd();
            prdNmCd = o.getPrdNmCd();
            qty = o.getQty();
            recvAt = o.getRecvDttm();
            attrs = readAttrs(o.getAttrsJson());
        } else {
            ordNo = "직접 입력";
            cusCd = required(req.getCusCd(), "고객사");
            prdNmCd = required(req.getPrdNmCd(), "품명");
            qty = null;
            recvAt = null;
            attrs = readAttrs(req.getAttrsJson());
        }

        Map<String, QualitySpecAttr> dict = store.attrs().stream().collect(Collectors.toMap(QualitySpecAttr::getAttrCd, a -> a));
        Map<String, List<QualitySpecTerm>> termsBy = termsBySpec(store.terms());
        List<QualitySpec> candidates = store.specs().stream()
                .filter(s -> cusCd.equals(s.getCusCd()) && prdNmCd.equals(s.getPrdNmCd()))
                .sorted(Comparator.comparing(QualitySpec::getSpecNo)).toList();

        List<Map<String, Object>> matches = new ArrayList<>();
        List<QualitySpec> applied = new ArrayList<>();
        for (QualitySpec s : candidates) {
            List<QualitySpecTerm> terms = termsBy.getOrDefault(s.getSpecNo(), List.of());
            List<Map<String, Object>> conds = new ArrayList<>();
            boolean matched = true;
            for (QualitySpecTerm t : terms) {
                if (!t.isIf()) continue;
                String orderVal = orderValue(t.getAttrCd(), cusCd, prdNmCd, attrs);
                boolean pass = t.getAttrCd() != null && SpecMatcher.compare(t.getOp(), orderVal, t.getVal());
                matched &= pass;
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("attrCd", t.getAttrCd());
                c.put("attrNm", t.getAttrNm());
                c.put("op", t.getOp());
                c.put("val", t.getVal());
                c.put("unit", t.getUnit());
                c.put("orderVal", orderVal);
                c.put("pass", pass);
                conds.add(c);
            }
            boolean apply = matched && SpecStatus.applicable(s.getStatus());
            if (apply) applied.add(s);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("specNo", s.getSpecNo());
            m.put("rev", s.getRev());
            m.put("status", s.getStatus());
            m.put("statusNm", SpecStatus.name(s.getStatus()));
            m.put("verdict", apply ? "APPLIED" : matched ? "EXCLUDED" : "NO_MATCH");
            m.put("conds", conds);
            m.put("results", terms.stream().filter(t -> !t.isIf()).map(QualitySpecService::termView).toList());
            matches.add(m);
        }

        // 설계결과 합성: 표준 기준값 → 적용 사양 결과(사양번호 순, 뒤 사양 우선).
        Map<String, DesignRow> design = new LinkedHashMap<>();
        for (QualitySpecBase b : store.baseDesign()) {
            QualitySpecAttr a = dict.get(b.getAttrCd());
            design.put(b.getAttrCd(), new DesignRow(b.getAttrCd(), a == null ? b.getAttrCd() : a.getAttrNm(), a == null ? null : a.getUnit(), b.getBaseVal()));
        }
        for (QualitySpec s : applied) {
            for (QualitySpecTerm t : termsBy.getOrDefault(s.getSpecNo(), List.of())) {
                if (t.isIf()) continue;
                String key = t.getAttrCd() != null ? t.getAttrCd() : t.getAttrNm();
                DesignRow row = design.computeIfAbsent(key, k -> new DesignRow(k, t.getAttrNm(), t.getUnit(), null));
                row.apply(SpecDsl.resultValue(t.getOp(), t.getVal()), s.getSpecNo());
            }
        }
        List<Map<String, Object>> designRows = new ArrayList<>();
        List<Map<String, Object>> conflicts = new ArrayList<>();
        for (DesignRow row : design.values()) {
            designRows.add(row.view());
            if (row.sources.size() > 1) {
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("attrCd", row.attrCd);
                c.put("attrNm", row.attrNm);
                c.put("chain", String.join(" → ", row.values));
                c.put("specNos", List.copyOf(row.sources));
                conflicts.add(c);
            }
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("IF_ID", ORDER_IF_ID);
        payload.put("ORD_NO", ordNo);
        payload.put("CUS_CD", cusCd);
        payload.put("PRD_NM_CD", prdNmCd);
        payload.put("QTY", qty);
        payload.putAll(attrs);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("order", orderView(ordNo, cusCd, prdNmCd, qty, recvAt, attrs, cusNames));
        out.put("payload", pretty(payload));
        out.put("matches", matches);
        out.put("design", designRows);
        out.put("conflicts", conflicts);
        return out;
    }

    private Map<String, Object> saveSpecs(QualitySpecSaveRequest req) {
        String text = required(req.getText(), "사양 문장");
        List<String> lines = Arrays.stream(text.split("\\R")).map(String::trim).filter(l -> !l.isEmpty()).toList();
        if (lines.isEmpty()) throw new BusinessException(ErrorCode.REQUIRED_VALUE, "사양 문장을 입력하세요.");
        if (lines.size() > MAX_LINES) throw new BusinessException(ErrorCode.INVALID_VALUE, "한 번에 " + MAX_LINES + "줄까지 저장합니다.");
        boolean confirm = "Y".equalsIgnoreCase(blankToNull(req.getConfirm()));
        List<QualitySpecAttr> dict = store.attrs();
        String user = user();
        LocalDateTime now = now();

        List<SpecDsl.Line> parsed = lines.stream().map(l -> SpecDsl.parseLine(l, dict)).toList();
        List<String> problems = new ArrayList<>();
        for (int i = 0; i < parsed.size(); i++) {
            List<String> errs = lineProblems(parsed.get(i), confirm);
            String head = parsed.size() > 1 ? (i + 1) + "행: " : "";
            errs.forEach(e -> problems.add(head + e));
        }
        if (!problems.isEmpty()) throw new BusinessException(ErrorCode.INVALID_VALUE, String.join(" / ", problems));

        List<Map<String, Object>> saved = new ArrayList<>();
        String editNo = blankToNull(req.getSpecNo());
        if (editNo != null) {
            if (parsed.size() != 1) throw new BusinessException(ErrorCode.INVALID_VALUE, "수정할 때는 한 줄만 입력합니다.");
            saved.add(reviseSpec(findSpec(editNo), parsed.get(0), confirm, user, now));
        } else {
            Set<String> taken = store.specs().stream().map(QualitySpec::getSpecNo).collect(Collectors.toCollection(HashSet::new));
            for (SpecDsl.Line line : parsed) {
                String specNo = nextSpecNo(line.cus(), line.prd(), taken);
                taken.add(specNo);
                QualitySpec spec = QualitySpec.create(specNo, line.cus(), line.prd(), line.raw(), user, now);
                if (confirm) spec.setStatus(SpecStatus.CONF);
                store.saveSpec(spec);
                List<QualitySpecTerm> terms = toTerms(specNo, line);
                store.replaceTerms(specNo, terms);
                logChange(specNo, 1, ChangeAction.REG,
                        terms.stream().map(t -> change(t.getAttrNm(), NONE, SpecDsl.dispValue(t.getOp(), t.getVal()))).toList(), user, now);
                if (confirm) logChange(specNo, 1, ChangeAction.CONF, List.of(change("상태", "작성중", "확정")), user, now);
                saved.add(savedView(spec, ChangeAction.REG));
            }
        }
        return Map.of("saved", saved);
    }

    /** 작성중 사양은 그대로 고치고(수정), 그 밖의 상태는 개정(Rev+1)하며 작성중(또는 재확정)으로 돌린다. 실패 메시지는 지운다. */
    private Map<String, Object> reviseSpec(QualitySpec spec, SpecDsl.Line line, boolean confirm, String user, LocalDateTime now) {
        if (!spec.getCusCd().equals(line.cus()) || !spec.getPrdNmCd().equals(line.prd())) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "수정할 때 고객사·품명은 바꿀 수 없습니다(사양번호 기준). 새 사양으로 등록하세요.");
        }
        List<QualitySpecTerm> before = store.terms(spec.getSpecNo());
        List<QualitySpecTerm> after = toTerms(spec.getSpecNo(), line);
        List<Map<String, String>> diff = diff(before, after);
        boolean draft = SpecStatus.DRAFT.equals(spec.getStatus());
        String beforeStatus = SpecStatus.name(spec.getStatus());
        String action = draft ? ChangeAction.MOD : ChangeAction.REV;
        if (!draft) {
            spec.setRev(spec.getRev() + 1);
            diff = new ArrayList<>(diff);
            diff.add(change("상태", beforeStatus, "작성중"));
        }
        spec.setRawText(line.raw());
        spec.setStatus(SpecStatus.DRAFT);
        spec.setFailMsg(null);
        spec.touch(user, now);
        store.saveSpec(spec);
        store.replaceTerms(spec.getSpecNo(), after);
        if (!diff.isEmpty()) logChange(spec.getSpecNo(), spec.getRev(), action, diff, user, now);
        if (confirm) {
            spec.setStatus(SpecStatus.CONF);
            store.saveSpec(spec);
            logChange(spec.getSpecNo(), spec.getRev(), ChangeAction.CONF, List.of(change("상태", "작성중", "확정")), user, now);
        }
        return savedView(spec, action);
    }

    /** 저장을 막는 문제: 해석 오류, 품명 코드·길이, 확정이면 매핑·결과 필요. */
    private static List<String> lineProblems(SpecDsl.Line line, boolean confirm) {
        List<String> out = new ArrayList<>(line.errors());
        if (line.prd() != null && Products.name(line.prd()) == null) {
            out.add("품명 코드가 없습니다: " + line.prd() + " (" + String.join("·", Products.NAMES.keySet()) + ")");
        }
        if (line.cus() != null && line.cus().length() > 10) out.add("고객사 코드는 10자 이하여야 합니다.");
        if (line.raw().length() > 1000) out.add("사양 문장은 1000자 이하여야 합니다.");
        for (SpecDsl.Token t : concat(line.conds(), line.results())) {
            if (t.attrNm().length() > 50) out.add("\"" + t.attrNm() + "\" — 항목명은 50자 이하여야 합니다.");
            if (t.val().length() > 200) out.add("\"" + t.attrNm() + "\" — 값은 200자 이하여야 합니다.");
        }
        if (confirm && out.isEmpty()) {
            if (line.results().isEmpty()) out.add("설계결과가 없어 확정할 수 없습니다.");
            if (!line.mapped()) out.add("코드 사전에 없는 항목이 있어 확정할 수 없습니다(코드 매핑 필요).");
        }
        return out;
    }

    // ── 항목 사전 쓰기 ─────────────────────────────────────────────

    private Map<String, Object> saveAttr(QualitySpecSaveRequest req) {
        String attrCd = required(req.getAttrCd(), "시스템 코드").toUpperCase(Locale.ROOT);
        String attrNm = required(req.getAttrNm(), "한글 항목명");
        String kind = required(req.getKind(), "구분");
        String dataType = required(req.getDataType(), "데이터 타입");
        String dataLen = blankToNull(req.getDataLen());
        String useYn = blankToNull(req.getUseYn()) == null ? "Y" : req.getUseYn().trim();
        if (!ATTR_CODE.matcher(attrCd).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "시스템 코드는 영문 대문자로 시작하는 영문 대문자·숫자·_ 20자 이하여야 합니다.");
        }
        if (attrNm.length() > 50) throw new BusinessException(ErrorCode.INVALID_VALUE, "한글 항목명은 50자 이하여야 합니다.");
        if (!KINDS.contains(kind)) throw new BusinessException(ErrorCode.INVALID_VALUE, "구분은 COND·RESULT·BOTH 중 하나여야 합니다.");
        if (!DATA_TYPES.contains(dataType)) throw new BusinessException(ErrorCode.INVALID_VALUE, "데이터 타입은 VARCHAR2·NUMBER·CHAR·DATE 중 하나여야 합니다.");
        if (!"Y".equals(useYn) && !"N".equals(useYn)) throw new BusinessException(ErrorCode.INVALID_VALUE, "사용 여부는 Y·N 중 하나여야 합니다.");
        if ("DATE".equals(dataType)) dataLen = null;
        else if (dataLen != null && !("NUMBER".equals(dataType) ? LEN_NUMBER : LEN_TEXT).matcher(dataLen).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "NUMBER".equals(dataType)
                    ? "자리수는 5 또는 5,2 모양이어야 합니다." : "자리수는 숫자여야 합니다.");
        }
        String unit = blankToNull(req.getUnit());
        String description = blankToNull(req.getDescription());
        if (unit != null && unit.length() > 10) throw new BusinessException(ErrorCode.INVALID_VALUE, "단위는 10자 이하여야 합니다.");
        if (description != null && description.length() > 200) throw new BusinessException(ErrorCode.INVALID_VALUE, "설명은 200자 이하여야 합니다.");

        String orig = blankToNull(req.getOrigAttrCd());
        List<QualitySpecAttr> attrs = store.attrs();
        for (QualitySpecAttr a : attrs) {
            if (a.getAttrCd().equals(orig)) continue;
            if (a.getAttrCd().equals(attrCd)) throw new BusinessException(ErrorCode.DUPLICATE_DATA, "시스템 코드가 이미 있습니다: " + attrCd);
            if (SpecDsl.norm(a.getAttrNm()).equals(SpecDsl.norm(attrNm))) {
                throw new BusinessException(ErrorCode.DUPLICATE_DATA, "한글 항목명이 이미 있습니다: " + a.getAttrNm());
            }
        }
        QualitySpecAttr saved;
        if (orig == null) {
            int seq = attrs.stream().mapToInt(QualitySpecAttr::getSeq).max().orElse(0) + 1;
            saved = QualitySpecAttr.of(attrCd, attrNm, kind, dataType, dataLen, unit, description, "Y".equals(useYn), seq);
        } else {
            QualitySpecAttr existing = store.attr(orig)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "항목이 없습니다: " + orig));
            if (!orig.equals(attrCd)) {
                if (useCounts(store.terms()).getOrDefault(orig, 0) > 0) {
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, "사양에서 쓰는 항목은 시스템 코드를 바꿀 수 없습니다.");
                }
                store.deleteAttr(orig);
                saved = QualitySpecAttr.of(attrCd, attrNm, kind, dataType, dataLen, unit, description, "Y".equals(useYn), existing.getSeq());
            } else {
                existing.setAttrNm(attrNm);
                existing.setAttrKind(kind);
                existing.setDataType(dataType);
                existing.setDataLen(dataLen);
                existing.setUnit(unit);
                existing.setDescription(description);
                existing.setUseYn(useYn);
                saved = existing;
            }
        }
        store.saveAttr(saved);
        return Map.of("attr", attrView(saved, useCounts(store.terms()).getOrDefault(saved.getAttrCd(), 0)));
    }

    private Map<String, Object> deleteAttr(QualitySpecDeleteRequest req) {
        String attrCd = required(req.getAttrCd(), "시스템 코드");
        store.attr(attrCd).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "항목이 없습니다: " + attrCd));
        if (useCounts(store.terms()).getOrDefault(attrCd, 0) > 0) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "사양에서 쓰는 항목은 삭제할 수 없습니다. 사용 여부를 중지로 바꾸세요.");
        }
        store.deleteAttr(attrCd);
        return Map.of("deleted", List.of(attrCd));
    }

    // ── 도움 함수 ─────────────────────────────────────────────────

    private static final Comparator<QualitySpecChange> CHANGE_ORDER = Comparator.comparing(QualitySpecChange::getChgDttm)
            .thenComparing(c -> c.getChgId() == null ? Long.MAX_VALUE : c.getChgId()).reversed();
    private static final Comparator<QualitySpecIfLog> IF_ORDER = Comparator.comparing(QualitySpecIfLog::getIfDttm)
            .thenComparing(QualitySpecIfLog::getIfNo).reversed();

    /** 사양번호 = 고객사-품명 + 두 자리 순번(같은 접두어의 가장 큰 순번 + 1). */
    static String nextSpecNo(String cus, String prd, Set<String> taken) {
        String prefix = cus + "-" + prd;
        int max = 0;
        for (String no : taken) {
            if (!no.startsWith(prefix)) continue;
            String rest = no.substring(prefix.length());
            if (rest.isEmpty() || !rest.chars().allMatch(Character::isDigit)) continue;
            max = Math.max(max, Integer.parseInt(rest));
        }
        return prefix + String.format("%02d", max + 1);
    }

    private static List<QualitySpecTerm> toTerms(String specNo, SpecDsl.Line line) {
        List<QualitySpecTerm> out = new ArrayList<>();
        int i = 1;
        for (SpecDsl.Token t : line.conds()) out.add(QualitySpecTerm.of(specNo, QualitySpecTerm.IF, i++, t.attrCd(), t.attrNm(), t.op(), t.val(), t.unit()));
        i = 1;
        for (SpecDsl.Token t : line.results()) out.add(QualitySpecTerm.of(specNo, QualitySpecTerm.THEN, i++, t.attrCd(), t.attrNm(), t.op(), t.val(), t.unit()));
        return out;
    }

    /** 조건·결과 항목별(구분+코드, 코드가 없으면 이름) 표시값 차이. 새 항목은 이전 —, 빠진 항목은 이후 —. */
    static List<Map<String, String>> diff(List<QualitySpecTerm> before, List<QualitySpecTerm> after) {
        Map<String, QualitySpecTerm> b = new LinkedHashMap<>();
        before.forEach(t -> b.put(termKey(t), t));
        Map<String, QualitySpecTerm> a = new LinkedHashMap<>();
        after.forEach(t -> a.put(termKey(t), t));
        List<Map<String, String>> out = new ArrayList<>();
        for (Map.Entry<String, QualitySpecTerm> e : a.entrySet()) {
            QualitySpecTerm old = b.get(e.getKey());
            String nv = SpecDsl.dispValue(e.getValue().getOp(), e.getValue().getVal());
            String ov = old == null ? NONE : SpecDsl.dispValue(old.getOp(), old.getVal());
            if (!nv.equals(ov)) out.add(change(e.getValue().getAttrNm(), ov, nv));
        }
        for (Map.Entry<String, QualitySpecTerm> e : b.entrySet()) {
            if (!a.containsKey(e.getKey())) out.add(change(e.getValue().getAttrNm(), SpecDsl.dispValue(e.getValue().getOp(), e.getValue().getVal()), NONE));
        }
        return out;
    }

    private static String termKey(QualitySpecTerm t) {
        return t.getSide() + ":" + (t.getAttrCd() != null ? t.getAttrCd() : SpecDsl.norm(t.getAttrNm()));
    }

    private static Map<String, String> change(String item, String before, String after) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("item", item);
        m.put("before", before);
        m.put("after", after);
        return m;
    }

    private void logChange(String specNo, int rev, String action, List<Map<String, String>> changes, String user, LocalDateTime at) {
        store.saveChange(QualitySpecChange.of(specNo, rev, action, write(changes), user, at));
    }

    private String nextIfNo(LocalDateTime at) {
        String prefix = "IF-" + IF_DAY.format(at) + "-";
        return prefix + String.format("%02d", store.countIfLogs(prefix) + 1);
    }

    /** 처리 시간(ms) 흉내 — 같은 사양·개정이면 늘 같은 값. */
    static int elapsedMs(String seed) {
        return 180 + Math.floorMod(seed.hashCode(), 820);
    }

    private String payload(List<QualitySpec> specs, Map<String, List<QualitySpecTerm>> termsOf, LocalDateTime at) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("IF_ID", SPEC_IF_ID);
        p.put("SND_SYS", "MES-QD");
        p.put("RCV_SYS", "SAP-OMS (PRD/500)");
        p.put("SND_DT", SND_DT.format(at));
        p.put("SPEC_CNT", specs.size());
        p.put("SPECS", specs.stream().map(s -> {
            List<QualitySpecTerm> terms = termsOf.getOrDefault(s.getSpecNo(), List.of());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("QSPEC_NO", s.getSpecNo());
            m.put("REV", s.getRev());
            m.put("CUS_CD", s.getCusCd());
            m.put("PRD_NM_CD", s.getPrdNmCd());
            m.put("COND", terms.stream().filter(QualitySpecTerm::isIf)
                    .filter(t -> !SpecDsl.CUS_CD.equals(t.getAttrCd()) && !SpecDsl.PRD_NM_CD.equals(t.getAttrCd()))
                    .map(QualitySpecService::payloadTerm).toList());
            m.put("RES", terms.stream().filter(t -> !t.isIf()).map(QualitySpecService::payloadTerm).toList());
            return m;
        }).toList());
        return pretty(p);
    }

    private static Map<String, Object> payloadTerm(QualitySpecTerm t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ATTR", t.getAttrCd() != null ? t.getAttrCd() : t.getAttrNm());
        m.put("OP", t.getOp());
        m.put("VAL", t.getVal());
        return m;
    }

    private static String orderValue(String attrCd, String cusCd, String prdNmCd, Map<String, String> attrs) {
        if (attrCd == null) return null;
        if (SpecDsl.CUS_CD.equals(attrCd)) return cusCd;
        if (SpecDsl.PRD_NM_CD.equals(attrCd)) return prdNmCd;
        return attrs.get(attrCd);
    }

    private Map<String, String> readAttrs(String text) {
        if (text == null || text.isBlank()) return new LinkedHashMap<>();
        try {
            Map<String, Object> raw = json.readValue(text, new TypeReference<LinkedHashMap<String, Object>>() {});
            Map<String, String> out = new LinkedHashMap<>();
            raw.forEach((k, v) -> { if (v != null && !String.valueOf(v).isBlank()) out.put(k, String.valueOf(v).trim()); });
            return out;
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "주문 항목 값 형식이 올바르지 않습니다(JSON 객체).");
        }
    }

    private String write(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException e) { throw new IllegalStateException(e); }
    }

    private String pretty(Object value) {
        try { return json.writer().with(SerializationFeature.INDENT_OUTPUT).writeValueAsString(value); }
        catch (JsonProcessingException e) { throw new IllegalStateException(e); }
    }

    private List<Map<String, String>> readChanges(String text) {
        try { return json.readValue(text, new TypeReference<List<Map<String, String>>>() {}); }
        catch (JsonProcessingException e) { return List.of(); }
    }

    private Map<String, String> customerNames() {
        return store.customers().stream().collect(Collectors.toMap(QualitySpecCustomer::getCusCd, QualitySpecCustomer::getCusNm, (a, b) -> a));
    }

    private static Map<String, List<QualitySpecTerm>> termsBySpec(List<QualitySpecTerm> terms) {
        Map<String, List<QualitySpecTerm>> out = new HashMap<>();
        for (QualitySpecTerm t : terms) out.computeIfAbsent(t.getSpecNo(), k -> new ArrayList<>()).add(t);
        out.values().forEach(l -> l.sort(Comparator.comparing((QualitySpecTerm t) -> t.isIf() ? 0 : 1).thenComparingInt(QualitySpecTerm::getSeq)));
        return out;
    }

    /** 항목 코드별 그 항목을 쓰는 사양 수. */
    private static Map<String, Integer> useCounts(List<QualitySpecTerm> terms) {
        Map<String, Set<String>> specs = new HashMap<>();
        for (QualitySpecTerm t : terms) if (t.getAttrCd() != null) specs.computeIfAbsent(t.getAttrCd(), k -> new HashSet<>()).add(t.getSpecNo());
        Map<String, Integer> out = new HashMap<>();
        specs.forEach((k, v) -> out.put(k, v.size()));
        return out;
    }

    private static boolean mapped(List<QualitySpecTerm> terms) {
        return terms.stream().allMatch(t -> t.getAttrCd() != null);
    }

    private static boolean matchesKeyword(QualitySpec s, List<QualitySpecTerm> terms, Map<String, String> cusNames, String keyword) {
        if (containsAny(keyword, s.getSpecNo(), s.getCusCd(), cusNames.get(s.getCusCd()), s.getRawText())) return true;
        return terms.stream().anyMatch(t -> containsAny(keyword, t.getAttrNm(), t.getAttrCd(), t.getVal()));
    }

    private static boolean containsAny(String keyword, String... values) {
        for (String v : values) if (v != null && v.toLowerCase(Locale.ROOT).contains(keyword)) return true;
        return false;
    }

    private QualitySpec findSpec(String specNo) {
        return store.spec(specNo).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "품질사양이 없습니다: " + specNo));
    }

    private static List<String> specNos(String text) {
        List<String> out = Arrays.stream(required(text, "품질사양번호").split(",")).map(String::trim).filter(s -> !s.isEmpty()).distinct().toList();
        if (out.isEmpty()) throw new BusinessException(ErrorCode.REQUIRED_VALUE, "품질사양번호 값이 없습니다");
        return out;
    }

    private static Map<String, Object> skip(String specNo, String reason) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("specNo", specNo);
        m.put("reason", reason);
        return m;
    }

    private static Map<String, Object> savedView(QualitySpec s, String action) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("specNo", s.getSpecNo());
        m.put("rev", s.getRev());
        m.put("status", s.getStatus());
        m.put("action", action);
        return m;
    }

    private static <T> List<T> concat(List<T> a, List<T> b) {
        List<T> out = new ArrayList<>(a);
        out.addAll(b);
        return out;
    }

    // ── 보기 모양 ─────────────────────────────────────────────────

    private static Map<String, Object> specView(QualitySpec s, List<QualitySpecTerm> terms, Map<String, String> cusNames) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("specNo", s.getSpecNo());
        m.put("rev", s.getRev());
        m.put("cusCd", s.getCusCd());
        m.put("cusNm", cusNames.get(s.getCusCd()));
        m.put("prdNmCd", s.getPrdNmCd());
        m.put("prdNm", Products.name(s.getPrdNmCd()));
        m.put("rawText", s.getRawText());
        m.put("status", s.getStatus());
        m.put("statusNm", SpecStatus.name(s.getStatus()));
        m.put("failMsg", s.getFailMsg());
        m.put("author", s.getRegUsrNm());
        m.put("createdAt", fmt(s.getRegDttm()));
        m.put("updatedBy", s.getModUsrNm());
        m.put("updatedAt", fmt(s.getModDttm()));
        m.put("conds", terms.stream().filter(QualitySpecTerm::isIf).map(QualitySpecService::termView).toList());
        m.put("results", terms.stream().filter(t -> !t.isIf()).map(QualitySpecService::termView).toList());
        m.put("mapped", mapped(terms));
        return m;
    }

    private static Map<String, Object> termView(QualitySpecTerm t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("side", t.getSide());
        m.put("seq", t.getSeq());
        m.put("attrCd", t.getAttrCd());
        m.put("attrNm", t.getAttrNm());
        m.put("op", t.getOp());
        m.put("val", t.getVal());
        m.put("unit", t.getUnit());
        return m;
    }

    private Map<String, Object> changeView(QualitySpecChange c, Map<String, QualitySpec> current) {
        List<Map<String, String>> items = readChanges(c.getChangesJson());
        QualitySpec spec = current.get(c.getSpecNo());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("chgId", c.getChgId());
        m.put("specNo", c.getSpecNo());
        m.put("rev", c.getRev());
        m.put("action", c.getActionCd());
        m.put("actionNm", ChangeAction.name(c.getActionCd(), c.getRev()));
        m.put("changes", items);
        m.put("summary", summary(items));
        m.put("worker", c.getWorkerNm());
        m.put("chgAt", fmt(c.getChgDttm()));
        m.put("specStatus", spec == null ? null : spec.getStatus());
        m.put("specStatusNm", spec == null ? null : SpecStatus.name(spec.getStatus()));
        return m;
    }

    static String summary(List<Map<String, String>> items) {
        if (items.isEmpty()) return "";
        Map<String, String> f = items.get(0);
        String head = f.get("item") + ": " + f.get("before") + " → " + f.get("after");
        return items.size() > 1 ? head + " 외 " + (items.size() - 1) + "건" : head;
    }

    private static Map<String, Object> ifView(QualitySpecIfLog l, Map<String, QualitySpec> current) {
        QualitySpec spec = l.getSpecNo() == null ? null : current.get(l.getSpecNo());
        boolean mesToOms = QualitySpecIfLog.MES_OMS.equals(l.getDirection());
        boolean failed = QualitySpecIfLog.FAIL.equals(l.getIfResult());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ifNo", l.getIfNo());
        m.put("ifAt", fmt(l.getIfDttm()));
        m.put("direction", l.getDirection());
        m.put("directionNm", mesToOms ? "MES→OMS" : "OMS→MES");
        m.put("target", l.getTarget());
        m.put("specNo", l.getSpecNo());
        m.put("rev", l.getRev());
        m.put("ordNo", l.getOrdNo());
        m.put("result", l.getIfResult());
        m.put("resultNm", failed ? "실패" : "성공");
        m.put("msg", l.getMsg());
        m.put("elapsedMs", l.getElapsedMs());
        m.put("resendable", mesToOms && failed && spec != null && SpecStatus.sendable(spec.getStatus()));
        return m;
    }

    private static Map<String, Object> attrView(QualitySpecAttr a, int useCount) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("attrCd", a.getAttrCd());
        m.put("attrNm", a.getAttrNm());
        m.put("kind", a.getAttrKind());
        m.put("dataType", a.getDataType());
        m.put("dataLen", a.getDataLen());
        m.put("unit", a.getUnit());
        m.put("description", a.getDescription());
        m.put("useYn", a.getUseYn());
        m.put("useCount", useCount);
        m.put("seq", a.getSeq());
        return m;
    }

    private static Map<String, Object> orderView(String ordNo, String cusCd, String prdNmCd, String qty, LocalDateTime recvAt,
                                                 Map<String, String> attrs, Map<String, String> cusNames) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ordNo", ordNo);
        m.put("cusCd", cusCd);
        m.put("cusNm", cusNames.get(cusCd));
        m.put("prdNmCd", prdNmCd);
        m.put("prdNm", Products.name(prdNmCd));
        m.put("qty", qty == null ? "" : qty);
        m.put("recvAt", recvAt == null ? "" : fmt(recvAt));
        m.put("attrs", attrs);
        return m;
    }

    /** 설계결과 한 항목 — 표준 기준값과 덮어쓴 사양·값의 차례. */
    private static final class DesignRow {
        final String attrCd;
        final String attrNm;
        final String unit;
        final String baseVal;
        String finalVal;
        final List<String> sources = new ArrayList<>();
        final List<String> values = new ArrayList<>();

        DesignRow(String attrCd, String attrNm, String unit, String baseVal) {
            this.attrCd = attrCd;
            this.attrNm = attrNm;
            this.unit = unit;
            this.baseVal = baseVal;
            this.finalVal = baseVal == null ? "" : baseVal;
        }

        void apply(String value, String specNo) {
            finalVal = value;
            sources.add(specNo);
            values.add(value);
        }

        Map<String, Object> view() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("attrCd", attrCd);
            m.put("attrNm", attrNm);
            m.put("unit", unit);
            m.put("baseVal", baseVal);
            m.put("finalVal", finalVal);
            m.put("overridden", !sources.isEmpty());
            m.put("sources", List.copyOf(sources));
            return m;
        }
    }

    // ── 값 다루기 ─────────────────────────────────────────────────

    private LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    private String user() {
        String u = currentUser.get();
        return u == null || u.isBlank() ? "시스템" : u;
    }

    /** 로그인 사용자 ID(BFF 가 넘긴 X-Authenticated-User). 없으면 null. */
    static String securityUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) return null;
        return auth.getName();
    }

    private static String fmt(LocalDateTime t) {
        return t == null ? null : TS.format(t);
    }

    private static LocalDate parseDay(String text, String name) {
        String v = blankToNull(text);
        if (v == null) return null;
        try { return LocalDate.parse(v, DAY); }
        catch (DateTimeParseException e) { throw new BusinessException(ErrorCode.INVALID_VALUE, name + " 형식은 yyyy-MM-dd 입니다: " + v); }
    }

    private static String required(String v, String name) {
        if (v == null || v.isBlank()) throw new BusinessException(ErrorCode.REQUIRED_VALUE, name + "을(를) 입력하세요.");
        return v.trim();
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    private static String lower(String v) {
        String t = blankToNull(v);
        return t == null ? null : t.toLowerCase(Locale.ROOT);
    }
}
