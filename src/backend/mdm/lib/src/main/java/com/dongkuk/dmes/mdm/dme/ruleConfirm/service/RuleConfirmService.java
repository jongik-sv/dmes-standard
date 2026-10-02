package com.dongkuk.dmes.mdm.dme.ruleConfirm.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmChecks;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmQueries;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmQueries.Pending;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.Issue;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.Item;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.ItemStatus;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.Report;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleVersionDiffs;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleDiffConventions;
import com.dongkuk.dmes.mdm.contract.version.ApplyFromOrderCheck;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCommand;
import com.dongkuk.dmes.mdm.contract.version.ConfirmResult;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.dto.RuleConfirmRequest;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.dto.RuleConfirmSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.dto.RuleConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.dto.RuleConfirmViewRequest;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 룰 버전 확정({@code ruleConfirm}) OASIS 진입 서비스 — TSK-08-05 design §6.5.
 *
 * <p>BPMN {@code services/dme/ruleConfirm.bpmn} 의 {@code actionGateway} 분기(search·view·validate·confirm)와 1:1 이다.
 * <b>{@code @Transactional} 을 붙이지 않는다(I23)</b> — 트랜잭션은 OASIS 프로세스와 공통 서비스의 {@code TransactionTemplate} 이 건다.
 * 확정은 {@link VersionStateService#confirm} 하나로만 하고(I22) VER·RULE 표를 직접 고치지 않는다. 검사·diff 는 SPI 빈이 아니라
 * {@link RuleConfirmChecks} 를 주입받아 쓴다 — 시나리오 후처리기가 SPI 정의를 지워도 컨텍스트가 뜬다(I16). {@code dme.ruleEdit} 패키지
 * 타입을 쓰지 않는다(08-04 design §2). 응답은 06-05 {@code codeConfirm} 관례대로 {@code Map} 이다.
 */
@Service("ruleConfirmService")
public class RuleConfirmService {

    private static final Logger log = LoggerFactory.getLogger(RuleConfirmService.class);

    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String APPLY_FROM = "applyFrom";
    private static final String SOURCE_MDM = "MDM";
    private static final ObjectMapper JSON = new ObjectMapper();

    private final MdmRuleRepository rules;
    private final RuleQueries queries;
    private final RuleConfirmQueries confirmQueries;
    private final RuleConfirmChecks checks;
    private final ApplyFromOrderCheck applyFromOrderCheck;
    private final VersionStateService versionState;
    private final RuleStewardCheck stewardCheck;
    private final MdmCurrentUser currentUser;
    private final EntityManager entityManager;
    private final Clock clock;

    public RuleConfirmService(MdmRuleRepository rules, RuleQueries queries, RuleConfirmQueries confirmQueries, RuleConfirmChecks checks,
                              ApplyFromOrderCheck applyFromOrderCheck, VersionStateService versionState, RuleStewardCheck stewardCheck,
                              MdmCurrentUser currentUser, EntityManager entityManager, Clock clock) {
        this.rules = rules;
        this.queries = queries;
        this.confirmQueries = confirmQueries;
        this.checks = checks;
        this.applyFromOrderCheck = applyFromOrderCheck;
        this.versionState = versionState;
        this.stewardCheck = stewardCheck;
        this.currentUser = currentUser;
        this.entityManager = entityManager;
        this.clock = clock;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — 확정 대기 목록(MDM 원천 룰의 DRAFT 마다 한 행, 룰 ID·ver 순)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> search(RuleConfirmSearchRequest request) {
        LocalDateTime now = now();
        List<Pending> drafts = confirmQueries.drafts(request == null ? null : request.getKeyword());
        Map<String, List<MdmRuleVer>> versions = queries.versionsOf(drafts.stream().map(p -> p.rule().getMaruRuleId()).distinct().toList())
                .stream().collect(Collectors.groupingBy(MdmRuleVer::getMaruRuleId));
        List<Map<String, Object>> rows = new ArrayList<>(drafts.size());
        for (Pending p : drafts) {
            MdmRule rule = p.rule();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("maruRuleId", rule.getMaruRuleId());
            row.put("maruRuleName", rule.getMaruRuleName());
            row.put("ruleKind", rule.getRuleKind());
            row.put("ver", VersionNumbers.plain(p.version().getVer()));
            row.put("ownerId", p.version().getOwnerId());
            row.put("ruleStatus", RuleVersions.effectiveStatus(rule.getStatus(), versions.getOrDefault(rule.getMaruRuleId(), List.of()), now));
            rows.add(row);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        return result;
    }

    // ────────────────────────────────────────────────────────────────
    // action: view — 룰 헤더(계산 상태)·대상 버전·직전 RELEASED·row_id diff·변수 라벨
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> view(RuleConfirmViewRequest request) {
        return buildView(target(request == null ? null : request.getMaruRuleId(),
                request == null ? null : RuleScreenSupport.optionalVer(request.getVer())));
    }

    // ────────────────────────────────────────────────────────────────
    // action: validate — 항목 4행 + 적용 순서(쓰기 없음, I27)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> validate(RuleConfirmValidateRequest request) {
        Target t = target(request == null ? null : request.getMaruRuleId(),
                request == null ? null : RuleScreenSupport.optionalVer(request.getVer()));
        requireMdm(t.rule());
        if (!isDraft(t.version())) {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT);
        }
        LocalDateTime applyFrom = parseApplyFrom(request.getApplyFrom());
        LocalDateTime now = now();
        Report report = checks.report(t.ref(), applyFrom);

        List<Map<String, Object>> items = new ArrayList<>(report.items().size());
        List<Map<String, Object>> contractWarnings = new ArrayList<>();
        int rejected = 0;
        int warned = 0;
        for (Item item : report.items()) {
            rejected += item.status() == ItemStatus.REJECTED ? 1 : 0;
            warned += item.status() == ItemStatus.WARNED ? 1 : 0;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("item", item.item().name());
            row.put("status", item.status().name());
            row.put("issues", item.issues().stream().map(i -> issueMap(i.severity(), i.issue())).toList());
            items.add(row);
            for (Issue issue : item.issues()) {
                if (RuleSaveIssueCode.CONTRACT_CHANGED.name().equals(issue.issue().code())) {
                    contractWarnings.add(issueMap(issue.severity(), issue.issue()));
                }
            }
        }

        // 적용 순서(I26) — 최초 버전 면제, 직전 RELEASED apply_from 보다 엄격히 뒤. 공통 서비스와 같은 직전 RELEASED(I12).
        Map<String, Object> applyFromCheck = new LinkedHashMap<>();
        LocalDateTime previousApplyFrom = t.previous().map(MdmRuleVer::getApplyFrom).orElse(null);
        if (t.previous().isEmpty()) {
            applyFromCheck.put("status", "EXEMPT");
            applyFromCheck.put("previousApplyFrom", null);
            applyFromCheck.put("message", "최초 버전 — 적용 순서 검사를 하지 않습니다");
        } else {
            Optional<MdmCheckIssue> issue = applyFromOrderCheck.check(previousApplyFrom, applyFrom);
            applyFromCheck.put("status", issue.isPresent() ? "REJECTED" : "PASSED");
            applyFromCheck.put("previousApplyFrom", text(previousApplyFrom));
            applyFromCheck.put("message", issue.map(MdmCheckIssue::message).orElse(null));
            rejected += issue.isPresent() ? 1 : 0;
        }

        Map<String, Object> caseSummary = new LinkedHashMap<>();
        caseSummary.put("total", report.cases().total());
        caseSummary.put("withExpected", report.cases().withExpected());
        caseSummary.put("passed", report.cases().passed());
        caseSummary.put("failed", report.cases().failed());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        result.put("applyFromCheck", applyFromCheck);
        result.put("contractWarnings", contractWarnings);
        result.put("caseSummary", caseSummary);
        result.put("rejectedCount", rejected);
        result.put("warnedCount", warned);
        result.put("applyFrom", text(applyFrom));
        result.put("futureApplyFrom", applyFrom.isAfter(now));
        result.put("serverNow", text(now));
        return result;
    }

    // ────────────────────────────────────────────────────────────────
    // action: confirm — 담당자 가드(I25) → VersionStateService.confirm(I22) → 원장을 다시 읽어 응답(I22a)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> confirm(RuleConfirmRequest request) {
        stewardCheck.requireSteward(); // I25 — 입력을 보기 전에
        String id = request == null ? null : trimToNull(request.getMaruRuleId());
        requireMdm(loadRule(id));
        BigDecimal ver = RuleScreenSupport.requireVer(request.getVer());
        if (request.getRowVersion() == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "row_version 은 필수입니다.");
        }
        VersionRef ref = ref(id, ver);
        LocalDateTime applyFrom = parseApplyFrom(request.getApplyFrom());
        boolean acknowledged = Boolean.TRUE.equals(request.getWarningsAcknowledged());

        ConfirmResult confirmed = versionState.confirm(new ConfirmCommand(ref, request.getRowVersion(), applyFrom,
                currentUser.userId(), acknowledged));
        log.info("[ruleConfirm] confirm — {} applyFrom={} closed={}", ref, text(applyFrom), confirmed.closedPrevious());
        // 검사 SPI 가 같은 트랜잭션에서 룰·버전을 관리 엔티티로 읽어 두었고 공통 서비스는 네이티브로 바꿨다 — 비우고 다시 읽는다(I22a).
        entityManager.clear();

        Map<String, Object> result = buildView(target(id, ver));
        Map<String, Object> done = new LinkedHashMap<>();
        done.put("ver", VersionNumbers.plain(confirmed.confirmed().ver()));
        done.put("rowVersion", confirmed.rowVersion());
        result.put("confirmed", done);
        result.put("closedPreviousVer", confirmed.closedPrevious() == null ? null
                : VersionNumbers.plain(confirmed.closedPrevious().ver()));
        result.put("warnings", confirmed.warnings().stream().map(w -> issueMap("WARNING", w)).toList());
        return result;
    }

    // ── 공통 ──

    /** 룰·버전 목록·대상 버전·직전 RELEASED(I12 — {@link RuleConfirmChecks#previousReleased}). */
    private record Target(MdmRule rule, List<MdmRuleVer> versions, MdmRuleVer version, Optional<MdmRuleVer> previous) {
        VersionRef ref() {
            return RuleConfirmService.ref(rule.getMaruRuleId(), version.getVer());
        }
    }

    /** ver 가 비면 DRAFT(여럿이면 가장 작은 번호). 룰·버전이 없으면 INVALID_VALUE. */
    private Target target(String maruRuleId, BigDecimal ver) {
        MdmRule rule = loadRule(trimToNull(maruRuleId));
        List<MdmRuleVer> versions = queries.versions(rule.getMaruRuleId());
        MdmRuleVer version;
        if (ver == null) {
            version = versions.stream().filter(RuleConfirmService::isDraft).min(Comparator.comparing(MdmRuleVer::getVer))
                    .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "확정할 DRAFT 가 없습니다: " + rule.getMaruRuleId()));
        } else {
            version = versions.stream().filter(v -> VersionNumbers.same(v.getVer(), ver)).findFirst()
                    .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "버전이 없습니다: " + rule.getMaruRuleId() + " " + VersionNumbers.label(ver)));
        }
        return new Target(rule, versions, version, checks.previousReleased(rule.getMaruRuleId(), version.getVer()));
    }

    private Map<String, Object> buildView(Target t) {
        LocalDateTime now = now();
        MdmRule r = t.rule();
        MdmRuleVer v = t.version();

        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("maruRuleId", r.getMaruRuleId());
        rule.put("maruRuleName", r.getMaruRuleName());
        rule.put("ruleKind", r.getRuleKind());
        rule.put("status", RuleVersions.effectiveStatus(r.getStatus(), t.versions(), now));
        rule.put("sourceKind", r.getSourceKind());

        Map<String, Object> version = new LinkedHashMap<>();
        version.put("ver", VersionNumbers.plain(v.getVer()));
        version.put("verKind", v.getVerKind() == null ? null : v.getVerKind().name());
        version.put("verLabel", VersionNumbers.label(v.getVer()));
        version.put("status", v.getStatus());
        version.put("ownerId", v.getOwnerId());
        version.put("rowVersion", v.getRowVersion());
        version.put("hitPolicy", v.getHitPolicy());
        version.put("baseVer", RuleScreenSupport.verText(v.getBaseVer()));
        version.put("applyFrom", text(v.getApplyFrom()));
        version.put("applyTo", text(v.getApplyTo()));
        version.put("requestedBy", v.getRequestedBy());
        version.put("releasedAt", text(v.getReleasedAt()));

        Map<String, Object> previous = t.previous().map(p -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ver", VersionNumbers.plain(p.getVer()));
            m.put("verLabel", VersionNumbers.label(p.getVer()));
            m.put("hitPolicy", p.getHitPolicy());
            m.put("applyFrom", text(p.getApplyFrom()));
            m.put("applyTo", text(p.getApplyTo()));
            return m;
        }).orElse(null);

        List<VersionDiffEntry> entries = checks.diff(t.ref()).entries();
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (DiffKind kind : List.of(DiffKind.ADDED, DiffKind.REMOVED, DiffKind.CHANGED, DiffKind.SAME)) {
            counts.put(kind.name(), 0);
        }
        List<Map<String, Object>> diff = new ArrayList<>(entries.size());
        for (VersionDiffEntry e : entries) {
            counts.merge(e.kind().name(), 1, Integer::sum);
            diff.add(diffMap(e));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rule", rule);
        result.put("version", version);
        result.put("previous", previous);
        result.put("firstVersion", previous == null);
        result.put("diff", diff);
        result.put("diffCounts", counts);
        result.put("vars", vars(r.getMaruRuleId(), v.getVer(), t.previous().map(MdmRuleVer::getVer).orElse(null)));
        result.put("serverNow", text(now));
        return result;
    }

    /** 대상 버전 ∪ 직전 버전의 변수(같은 var_id 는 대상 버전 쪽), var_id 순 — diff 의 바뀐 칸 라벨용. */
    private List<Map<String, Object>> vars(String id, BigDecimal ver, BigDecimal previousVer) {
        Map<Integer, MdmRuleVar> byId = new TreeMap<>();
        if (previousVer != null) {
            queries.vars(id, previousVer).forEach(x -> byId.put(x.getVarId(), x));
        }
        queries.vars(id, ver).forEach(x -> byId.put(x.getVarId(), x));
        List<Map<String, Object>> out = new ArrayList<>(byId.size());
        for (MdmRuleVar x : byId.values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("varId", x.getVarId());
            m.put("varKind", x.getVarKind());
            m.put("label", x.getLabel());
            m.put("varName", x.getVarName());
            out.add(m);
        }
        return out;
    }

    /** diff 한 행 — row_id·종류·이전/이후 seq·정규화 셀 JSON 문자열·CHANGED 행에서 정규화 셀이 다른 var_id. */
    private static Map<String, Object> diffMap(VersionDiffEntry e) {
        Map<String, Object> oldValues = e.oldValues();
        Map<String, Object> newValues = e.newValues();
        String oldCells = oldValues == null ? null : (String) oldValues.get(MdmRuleDiffConventions.CELLS);
        String newCells = newValues == null ? null : (String) newValues.get(MdmRuleDiffConventions.CELLS);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowId", Integer.valueOf(e.key()));
        m.put("kind", e.kind().name());
        m.put("oldSeq", oldValues == null ? null : oldValues.get(MdmRuleDiffConventions.SEQ));
        m.put("newSeq", newValues == null ? null : newValues.get(MdmRuleDiffConventions.SEQ));
        m.put("oldCells", oldCells);
        m.put("newCells", newCells);
        m.put("changedVarIds", e.kind() == DiffKind.CHANGED ? changedVarIds(oldCells, newCells) : List.of());
        return m;
    }

    /** 칸(var_id)마다 {@link RuleVersionDiffs#canonicalCells} 로 정규화해 비교한다. 한쪽에만 있는 칸도 바뀐 것으로 센다. */
    private static List<Integer> changedVarIds(String oldCells, String newCells) {
        Map<String, JsonNode> before = cells(oldCells);
        Map<String, JsonNode> after = cells(newCells);
        TreeSet<Integer> out = new TreeSet<>();
        TreeSet<String> keys = new TreeSet<>(before.keySet());
        keys.addAll(after.keySet());
        for (String key : keys) {
            JsonNode b = before.get(key);
            JsonNode a = after.get(key);
            String bc = b == null ? null : RuleVersionDiffs.canonicalCells(b.toString());
            String ac = a == null ? null : RuleVersionDiffs.canonicalCells(a.toString());
            if (bc == null ? ac != null : !bc.equals(ac)) {
                try {
                    out.add(Integer.valueOf(key));
                } catch (NumberFormatException ignored) {
                    // var_id 가 아닌 키(없어야 한다)는 강조 대상에서 뺀다
                }
            }
        }
        return List.copyOf(out);
    }

    private static Map<String, JsonNode> cells(String cellsJson) {
        Map<String, JsonNode> out = new LinkedHashMap<>();
        if (cellsJson == null) {
            return out;
        }
        try {
            JsonNode node = JSON.readTree(cellsJson);
            for (Iterator<Map.Entry<String, JsonNode>> it = node.fields(); it.hasNext(); ) {
                Map.Entry<String, JsonNode> f = it.next();
                out.put(f.getKey(), f.getValue());
            }
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("셀 JSON 을 읽지 못했습니다: " + cellsJson, e);
        }
        return out;
    }

    private static Map<String, Object> issueMap(String severity, MdmCheckIssue i) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("severity", severity);
        m.put("code", i.code());
        m.put("message", i.message());
        m.put("field", i.field());
        m.put("itemKey", i.itemKey());
        return m;
    }

    private MdmRule loadRule(String ruleId) {
        if (ruleId == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 ID 는 필수입니다.");
        }
        return rules.findById(ruleId).orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "룰을 찾을 수 없습니다: " + ruleId));
    }

    /** 외부 원천(EXTERNAL) 룰은 확정하지 않는다 — ruleEdit {@code requireMdm} 과 같은 문구(S11). */
    private static void requireMdm(MdmRule rule) {
        if (!SOURCE_MDM.equals(rule.getSourceKind())) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "외부 원천(EXTERNAL) 룰은 조회만 할 수 있습니다: " + rule.getMaruRuleId());
        }
    }

    private static VersionRef ref(String ruleId, BigDecimal ver) {
        return new VersionRef(VersionTarget.BUSINESS_RULE, ruleId, VersionNumbers.scaled(ver));
    }

    private static boolean isDraft(MdmRuleVer v) {
        return VersionStatus.DRAFT.name().equals(v.getStatus());
    }

    /** {@code yyyy-MM-dd HH:mm:ss}(KST). 빈 값은 REQUIRED_VALUE, 형식 오류·열린 끝 이상은 INVALID_VALUE(field applyFrom). */
    public static LocalDateTime parseApplyFrom(String value) {
        String v = trimToNull(value);
        if (v == null) {
            throw applyFromError(ErrorCode.REQUIRED_VALUE, "적용 시작 일시를 입력하세요");
        }
        LocalDateTime parsed;
        try {
            parsed = LocalDateTime.parse(v, TEXT);
        } catch (DateTimeParseException e) {
            throw applyFromError(ErrorCode.INVALID_VALUE, "적용 시작 일시는 yyyy-MM-dd HH:mm:ss 형식이어야 합니다: " + v);
        }
        if (!parsed.isBefore(VersionConventions.OPEN_END)) {
            throw applyFromError(ErrorCode.INVALID_VALUE, "적용 시작 일시는 9999-12-31 00:00:00 보다 앞이어야 합니다");
        }
        return parsed;
    }

    private static BusinessException applyFromError(ErrorCode code, String message) {
        return new BusinessException(code, message, List.of(ErrorDetail.ofGrid(null, null, APPLY_FROM, code.getCode(), message)));
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    private static String text(LocalDateTime value) {
        return value == null ? null : TEXT.format(value);
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
