package com.dongkuk.dmes.mdm.dme.ruleSetConfirm.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.Issue;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.ItemStatus;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleSetConfirmChecks;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleSetConfirmReport;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.ApplyFromOrderCheck;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCommand;
import com.dongkuk.dmes.mdm.contract.version.ConfirmResult;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.service.RuleConfirmService;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmViewRequest;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 룰 세트 버전 확정({@code ruleSetConfirm}) OASIS 진입 서비스(D-144 2단계, 스펙 §6).
 *
 * <p>BPMN {@code services/dme/ruleSetConfirm.bpmn} 의 {@code actionGateway} 분기(search·view·validate·confirm)와 1:1 이다. 룰
 * {@link RuleConfirmService} 와 같은 구조·응답 모양이며 키 이름만 세트다. {@code @Transactional} 을 붙이지 않는다 — 트랜잭션은 OASIS
 * 프로세스와 공통 서비스의 {@code TransactionTemplate} 이 건다. 확정은 {@link VersionStateService#confirm} 하나로만 한다.
 */
@Service("ruleSetConfirmService")
public class RuleSetConfirmService {

    private static final Logger log = LoggerFactory.getLogger(RuleSetConfirmService.class);
    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final MdmRuleSetRepository sets;
    private final RuleQueries queries;
    private final RuleSetVersionQueries setVersions;
    private final RuleSetConfirmChecks checks;
    private final ApplyFromOrderCheck applyFromOrderCheck;
    private final VersionStateService versionState;
    private final RuleStewardCheck stewardCheck;
    private final MdmCurrentUser currentUser;
    private final EntityManager entityManager;
    private final Clock clock;

    public RuleSetConfirmService(MdmRuleSetRepository sets, RuleQueries queries, RuleSetVersionQueries setVersions, RuleSetConfirmChecks checks,
                                 ApplyFromOrderCheck applyFromOrderCheck, VersionStateService versionState, RuleStewardCheck stewardCheck,
                                 MdmCurrentUser currentUser, EntityManager entityManager, Clock clock) {
        this.sets = sets;
        this.queries = queries;
        this.setVersions = setVersions;
        this.checks = checks;
        this.applyFromOrderCheck = applyFromOrderCheck;
        this.versionState = versionState;
        this.stewardCheck = stewardCheck;
        this.currentUser = currentUser;
        this.entityManager = entityManager;
        this.clock = clock;
    }

    /** 확정 대기 목록 — 모든 세트의 DRAFT(세트 ID·VER 순). keyword 는 세트 ID(대문자 포함)·세트명(포함). */
    public Map<String, Object> search(RuleSetConfirmSearchRequest request) {
        String keyword = request == null ? null : trimToNull(request.getKeyword());
        String upper = keyword == null ? null : keyword.toUpperCase(Locale.ROOT);
        List<MdmRuleSet> all = queries.allSets();
        Map<String, List<MdmRuleSetVer>> byId = setVersions.versionsOf(all.stream().map(MdmRuleSet::getMaruRuleSetId).toList());
        LocalDateTime now = now();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (MdmRuleSet s : all) {
            if (keyword != null && !s.getMaruRuleSetId().toUpperCase(Locale.ROOT).contains(upper)
                    && (s.getMaruRuleSetName() == null || !s.getMaruRuleSetName().contains(keyword))) {
                continue;
            }
            List<MdmRuleSetVer> versions = byId.getOrDefault(s.getMaruRuleSetId(), List.of());
            versions.stream().filter(v -> "DRAFT".equals(v.getStatus())).sorted(Comparator.comparing(MdmRuleSetVer::getVer)).forEach(v -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("setId", s.getMaruRuleSetId());
                row.put("setName", s.getMaruRuleSetName());
                row.put("ver", VersionNumbers.plain(v.getVer()));
                row.put("verKind", v.getVerKind() == null ? null : v.getVerKind().name());
                row.put("ownerId", v.getOwnerId());
                row.put("setStatus", RuleVersions.effectiveStatus(s.getStatus(), versions, now));
                rows.add(row);
            });
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        return result;
    }

    public Map<String, Object> view(RuleSetConfirmViewRequest request) {
        return buildView(target(request == null ? null : request.getSetId(),
                request == null ? null : RuleScreenSupport.optionalVer(request.getVer())));
    }

    /** 항목 4행 + 적용 순서. 쓰기 없음. */
    public Map<String, Object> validate(RuleSetConfirmValidateRequest request) {
        Target t = target(request == null ? null : request.getSetId(), request == null ? null : RuleScreenSupport.optionalVer(request.getVer()));
        if (!"DRAFT".equals(t.version().getStatus())) {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT);
        }
        LocalDateTime applyFrom = RuleConfirmService.parseApplyFrom(request.getApplyFrom());   // null 은 report 가 받지 못한다
        LocalDateTime now = now();
        RuleSetConfirmReport.Report report = checks.report(t.ref(), applyFrom);

        List<Map<String, Object>> items = new ArrayList<>(report.items().size());
        int rejected = 0;
        int warned = 0;
        for (RuleSetConfirmReport.Item item : report.items()) {
            rejected += item.status() == ItemStatus.REJECTED ? 1 : 0;
            warned += item.status() == ItemStatus.WARNED ? 1 : 0;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("item", item.item().name());
            row.put("status", item.status().name());
            row.put("issues", item.issues().stream().map((Issue i) -> issueMap(i.severity(), i.issue())).toList());
            items.add(row);
        }

        Map<String, Object> applyFromCheck = new LinkedHashMap<>();
        LocalDateTime previousApplyFrom = t.previous().map(MdmRuleSetVer::getApplyFrom).orElse(null);
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
        result.put("caseSummary", caseSummary);
        result.put("rejectedCount", rejected);
        result.put("warnedCount", warned);
        result.put("applyFrom", text(applyFrom));
        result.put("futureApplyFrom", applyFrom.isAfter(now));
        result.put("serverNow", text(now));
        return result;
    }

    public Map<String, Object> confirm(RuleSetConfirmRequest request) {
        stewardCheck.requireSteward();   // 입력을 보기 전에
        String setId = request == null ? null : trimToNull(request.getSetId());
        load(setId);
        BigDecimal ver = RuleScreenSupport.requireVer(request.getVer());
        if (request.getRowVersion() == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "row_version 은 필수입니다.");
        }
        VersionRef ref = new VersionRef(VersionTarget.RULE_SET, setId, VersionNumbers.scaled(ver));
        LocalDateTime applyFrom = RuleConfirmService.parseApplyFrom(request.getApplyFrom());
        ConfirmResult confirmed = versionState.confirm(new ConfirmCommand(ref, request.getRowVersion(), applyFrom, currentUser.userId(),
                Boolean.TRUE.equals(request.getWarningsAcknowledged())));
        log.info("[ruleSetConfirm] confirm — {} applyFrom={} closed={}", ref, text(applyFrom), confirmed.closedPrevious());
        entityManager.clear();   // 공통 서비스가 네이티브로 바꿨다 — 다시 읽는다

        Map<String, Object> result = buildView(target(setId, ver));
        Map<String, Object> done = new LinkedHashMap<>();
        done.put("ver", VersionNumbers.plain(confirmed.confirmed().ver()));
        done.put("rowVersion", confirmed.rowVersion());
        result.put("confirmed", done);
        result.put("closedPreviousVer", confirmed.closedPrevious() == null ? null : VersionNumbers.plain(confirmed.closedPrevious().ver()));
        result.put("warnings", confirmed.warnings().stream().map(w -> issueMap("WARNING", w)).toList());
        return result;
    }

    /** 세트·버전 목록·대상 버전·직전 RELEASED. */
    private record Target(MdmRuleSet set, List<MdmRuleSetVer> versions, MdmRuleSetVer version, Optional<MdmRuleSetVer> previous) {
        VersionRef ref() {
            return new VersionRef(VersionTarget.RULE_SET, set.getMaruRuleSetId(), VersionNumbers.scaled(version.getVer()));
        }
    }

    /** ver 가 비면 DRAFT(여럿이면 가장 작은 번호). */
    private Target target(String setId, BigDecimal ver) {
        MdmRuleSet set = load(trimToNull(setId));
        List<MdmRuleSetVer> versions = setVersions.versions(set.getMaruRuleSetId());
        MdmRuleSetVer version = ver == null
                ? versions.stream().filter(v -> "DRAFT".equals(v.getStatus())).min(Comparator.comparing(MdmRuleSetVer::getVer))
                        .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "확정할 DRAFT 가 없습니다: " + set.getMaruRuleSetId()))
                : versions.stream().filter(v -> VersionNumbers.same(v.getVer(), ver)).findFirst()
                        .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE,
                                "버전이 없습니다: " + set.getMaruRuleSetId() + " " + VersionNumbers.label(ver)));
        return new Target(set, versions, version, checks.previousReleased(set.getMaruRuleSetId(), version.getVer()));
    }

    /** view 모양 — set·version(ruleIds 포함)·previous·firstVersion·diff·diffCounts·serverNow. */
    private Map<String, Object> buildView(Target t) {
        LocalDateTime now = now();
        MdmRuleSet s = t.set();
        MdmRuleSetVer v = t.version();

        Map<String, Object> set = new LinkedHashMap<>();
        set.put("setId", s.getMaruRuleSetId());
        set.put("setName", s.getMaruRuleSetName());
        set.put("status", RuleVersions.effectiveStatus(s.getStatus(), t.versions(), now));

        Map<String, Object> version = new LinkedHashMap<>();
        version.put("ver", VersionNumbers.plain(v.getVer()));
        version.put("verKind", v.getVerKind() == null ? null : v.getVerKind().name());
        version.put("verLabel", VersionNumbers.label(v.getVer()));
        version.put("status", v.getStatus());
        version.put("ownerId", v.getOwnerId());
        version.put("rowVersion", v.getRowVersion());
        version.put("baseVer", RuleScreenSupport.verText(v.getBaseVer()));
        version.put("applyFrom", text(v.getApplyFrom()));
        version.put("applyTo", text(v.getApplyTo()));
        version.put("requestedBy", v.getRequestedBy());
        version.put("releasedAt", text(v.getReleasedAt()));
        version.put("ruleIds", RuleSetVersionQueries.members(v));

        Map<String, Object> previous = t.previous().map(p -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ver", VersionNumbers.plain(p.getVer()));
            m.put("verLabel", VersionNumbers.label(p.getVer()));
            m.put("applyFrom", text(p.getApplyFrom()));
            m.put("applyTo", text(p.getApplyTo()));
            return m;
        }).orElse(null);

        Map<String, Integer> counts = new LinkedHashMap<>();
        for (DiffKind kind : List.of(DiffKind.ADDED, DiffKind.REMOVED, DiffKind.CHANGED, DiffKind.SAME)) {
            counts.put(kind.name(), 0);
        }
        // 저장된 흐름(대상 또는 직전)이 손상되면 diff 만 비우고 사유를 싣는다 — view 가 실패하면 검사 항목(흐름 손상)을 볼 수 없다(P2-19).
        List<VersionDiffEntry> entries = List.of();
        String diffError = null;
        try {
            entries = checks.diff(t.ref()).entries();
        } catch (BusinessException e) {
            if (e.getErrors() == null || e.getErrors().isEmpty() || !MdmErrorCode.STORED_DEFINITION_CORRUPT.code().equals(e.getErrors().get(0).code())) {
                throw e;
            }
            diffError = e.getMessage();
        }
        List<Map<String, Object>> diff = new ArrayList<>(entries.size());
        for (VersionDiffEntry e : entries) {
            counts.merge(e.kind().name(), 1, Integer::sum);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("key", e.key());
            m.put("kind", e.kind().name());
            m.put("oldValues", e.oldValues());
            m.put("newValues", e.newValues());
            diff.add(m);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("set", set);
        result.put("version", version);
        result.put("previous", previous);
        result.put("firstVersion", previous == null);
        result.put("diff", diff);
        result.put("diffCounts", counts);
        result.put("diffError", diffError);
        result.put("serverNow", text(now));
        return result;
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

    private MdmRuleSet load(String setId) {
        if (setId == null || setId.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 세트 ID 는 필수입니다.");
        }
        return sets.findById(setId).orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "룰 세트를 찾을 수 없습니다: " + setId));
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
