package com.dongkuk.dmes.mdm.dme.ruleMng.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.RuleIdRules;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries.RuleFilter;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleVersionRow;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleListRow;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngViewResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleRegRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleRegResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleSearchResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleVersionResult;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVerRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 룰 조회·등록({@code ruleMng}) OASIS 진입 서비스 — TSK-08-02 design §6.1·§6.3.2. BPMN {@code services/dme/ruleMng.bpmn} 의
 * {@code search}(method {@link #search})·{@code reg}(method {@link #register}) 두 분기와 1:1.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — OASIS 파라미터 이름 바인딩이 깨진다. 쓰기는 {@link TransactionTemplate}.
 * 담당자 역할 판단은 {@link RuleStewardCheck} 한 곳으로만 한다(I30).
 */
@Service("ruleMngService")
public class RuleMngService {

    static final int DEFAULT_SIZE = 20;
    static final int MAX_SIZE = 100;
    static final int NAME_MAX = 100;
    private static final Set<String> RULE_KINDS = Set.of("DECISION", "DERIVE");
    private static final String SOURCE_MDM = "MDM";

    private final MdmRuleRepository ruleRepository;
    private final MdmRuleVerRepository verRepository;
    private final RuleQueries queries;
    private final RuleStewardCheck stewardCheck;
    private final MdmCurrentUser currentUser;
    private final RuleHeaderService headerService;
    private final RuleVersionService versionService;
    private final Clock clock;
    private final TransactionTemplate tx;

    public RuleMngService(MdmRuleRepository ruleRepository, MdmRuleVerRepository verRepository, RuleQueries queries,
                          RuleStewardCheck stewardCheck, MdmCurrentUser currentUser, Clock clock,
                          PlatformTransactionManager transactionManager, RuleHeaderService headerService,
                          RuleVersionService versionService) {
        this.ruleRepository = ruleRepository;
        this.verRepository = verRepository;
        this.queries = queries;
        this.stewardCheck = stewardCheck;
        this.currentUser = currentUser;
        this.headerService = headerService;
        this.versionService = versionService;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactionManager);
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — 서버 페이징(I29)
    // ────────────────────────────────────────────────────────────────

    public RuleSearchResult search(RuleSearchRequest request) {
        RuleSearchRequest r = request != null ? request : new RuleSearchRequest();
        int page = r.getPage() == null || r.getPage() < 0 ? 0 : r.getPage();
        int size = r.getSize() == null || r.getSize() < 1 ? DEFAULT_SIZE : Math.min(r.getSize(), MAX_SIZE);
        LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        RuleFilter filter = new RuleFilter(blankToNull(r.getKeyword()), blankToNull(r.getRuleKind()), blankToNull(r.getStatus()), now);

        List<MdmRule> rules = queries.pageRules(filter, page, size);
        long total = queries.countRules(filter);
        Map<String, List<MdmRuleVer>> versions = new LinkedHashMap<>();
        for (MdmRuleVer v : queries.versionsOf(rules.stream().map(MdmRule::getMaruRuleId).toList())) {
            versions.computeIfAbsent(v.getMaruRuleId(), k -> new ArrayList<>()).add(v);
        }
        List<RuleListRow> rows = new ArrayList<>(rules.size());
        for (MdmRule rule : rules) {
            rows.add(toRow(rule, versions.getOrDefault(rule.getMaruRuleId(), List.of()), now));
        }
        return new RuleSearchResult(rows, total, page, size);
    }

    private static RuleListRow toRow(MdmRule rule, List<MdmRuleVer> versions, LocalDateTime now) {
        RuleListRow row = new RuleListRow();
        row.setMaruRuleId(rule.getMaruRuleId());
        row.setMaruRuleName(rule.getMaruRuleName());
        row.setRuleKind(rule.getRuleKind());
        row.setSourceKind(rule.getSourceKind());
        row.setStatus(RuleVersions.effectiveStatus(rule.getStatus(), versions, now)); // 필터와 같은 계산 상태(I19)
        RuleVersions.currentReleased(versions, now).ifPresent(v -> {
            row.setReleasedVer(v.getVer());
            row.setHitPolicy(v.getHitPolicy());
        });
        RuleVersions.unapplied(versions, now).ifPresent(v -> {
            row.setPendingVer(v.getVer());
            row.setPendingStatus(v.getStatus());
            row.setPendingOwnerId(v.getOwnerId());
        });
        return row;
    }

    // ────────────────────────────────────────────────────────────────
    // action: reg — MDM 원천 룰 등록(I1·I2·I3)
    // ────────────────────────────────────────────────────────────────

    /** TB_MDM_RULE(CREATED) + TB_MDM_RULE_VER(1, DRAFT, 소유자 = 등록자, row_version 0)를 한 트랜잭션으로 쓴다. 변수·행은 넣지 않는다. */
    public RuleRegResult register(RuleRegRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "등록할 값이 없습니다.");
        }
        String id = request.getMaruRuleId();
        RuleIdRules.validateRuleId(id);
        String name = blankToNull(request.getMaruRuleName());
        if (name == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰명은 필수입니다.");
        }
        if (name.length() > NAME_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "룰명은 " + NAME_MAX + "자 이하여야 합니다.");
        }
        String kind = blankToNull(request.getRuleKind());
        if (kind == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 종류는 필수입니다.");
        }
        if (!RULE_KINDS.contains(kind)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "룰 종류는 DECISION·DERIVE 중 하나여야 합니다: " + kind);
        }
        String source = blankToNull(request.getSourceKind());
        if (source != null && !SOURCE_MDM.equals(source)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "룰 등록은 원천 MDM 만 받습니다(외부 원천은 수신 경로로만 들어옵니다): " + source);
        }
        stewardCheck.requireSteward();
        if (ruleRepository.existsById(id)) {
            throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 룰 ID 가 이미 있습니다: " + id);
        }
        String me = currentUser.userId();
        tx.executeWithoutResult(status -> {
            MdmRule rule = new MdmRule(id, name, kind, SOURCE_MDM);
            rule.setSourceSystem(null);
            rule.setDescription(blankToNull(request.getDescription()));
            rule.setUsageNote(blankToNull(request.getUsageNote()));
            ruleRepository.saveAndFlush(rule);
            MdmRuleVer ver = new MdmRuleVer(id, 1, me);
            ver.setBaseVer(null);
            ver.setHitPolicy("DECISION".equals(kind) ? "FIRST" : null);
            verRepository.saveAndFlush(ver);
        });
        return new RuleRegResult(id, 1, 0L);
    }

    // ────────────────────────────────────────────────────────────────
    // action: view — 헤더 + 버전 목록(D-105). 마루 코드 codeMng 상세와 같은 모양이다.
    // ────────────────────────────────────────────────────────────────

    /**
     * 헤더·버전 화면 상세. 변수·행·테스트 케이스는 <b>읽지 않는다</b> — 그건 내용 화면({@code ruleEdit}) 몫이다. D-105 전에는
     * {@code ruleEdit} 의 18필드 view 를 헤더 카드까지 같이 쓰고 있었고, 그 부피가 화면 복잡도의 한 축이었다.
     *
     * <p>버전 행은 공용 읽기 모델 {@link RuleVersionRow} 를 쓰고 확정 취소 가능 여부만 더한다. 버튼 판정({@code flags})은 서버가
     * 계산한다(I7·D6) — 화면은 이 값을 믿고 끄기만 하고 실제 거부는 저장 시점에 다시 검사한다.
     */
    public RuleMngViewResult view(RuleMngViewRequest request) {
        String id = request == null ? null : blankToNull(request.getMaruRuleId());
        if (id == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 ID 는 필수입니다.");
        }
        MdmRule rule = ruleRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "룰을 찾을 수 없습니다: " + id));
        LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        List<MdmRuleVer> versions = queries.versions(id);

        RuleMngViewResult result = new RuleMngViewResult();
        result.setMe(currentUser.userId());
        result.setSteward(stewardCheck.isSteward());
        result.setHeader(toHeader(rule, versions, now));
        result.setVersions(toVersionRows(rule, versions, now));
        result.setFlags(toFlags(rule, versions, now));
        return result;
    }

    private static RuleMngViewResult.Header toHeader(MdmRule rule, List<MdmRuleVer> versions, LocalDateTime now) {
        RuleMngViewResult.Header h = new RuleMngViewResult.Header();
        h.setMaruRuleId(rule.getMaruRuleId());
        h.setMaruRuleName(rule.getMaruRuleName());
        h.setRuleKind(rule.getRuleKind());
        h.setStatus(RuleVersions.effectiveStatus(rule.getStatus(), versions, now)); // 목록과 같은 계산 상태(I19)
        h.setSourceKind(rule.getSourceKind());
        h.setSourceSystem(rule.getSourceSystem());
        h.setDescription(rule.getDescription());
        h.setUsageNote(rule.getUsageNote());
        h.setAuditVer(rule.getVersion()); // TB_MDM_RULE.VER — 헤더 저장의 낙관적 잠금 값(D-105 (5))
        return h;
    }

    private List<RuleMngViewResult.VersionRow> toVersionRows(MdmRule rule, List<MdmRuleVer> versions, LocalDateTime now) {
        String me = currentUser.userId();
        int unapplied = (int) versions.stream().filter(v -> RuleVersions.isUnapplied(v, now)).count();
        List<RuleMngViewResult.VersionRow> rows = new ArrayList<>();
        // ver 내림차순 — 원래 카드 ② 가 그랬다.
        versions.stream().sorted((a, b) -> Integer.compare(b.getVer(), a.getVer())).forEach(v -> {
            RuleMngViewResult.VersionRow row = new RuleMngViewResult.VersionRow(v.getVer(), v.getStatus(),
                    text(v.getApplyFrom()), text(v.getApplyTo()), v.getOwnerId(), v.getBaseVer(), v.getHitPolicy(), v.getRowVersion());
            row.setCancelConfirmable(cancelConfirmable(v, versions, now, me, unapplied));
            rows.add(row);
        });
        return rows;
    }

    /**
     * 확정 취소 가능(ADR-0002 D8) — 아직 적용 시각이 오지 않은 확정 버전이고 소유자가 요청 사용자이며 미적용 버전이 이 하나일
     * 때만. 공용 {@code VersionPreconditions} 가 패키지-private 여서 판정식을 여기서 다시 쓴다 — 화면 버튼용이라 서버가 저장
     * 시점에 다시 검사한다.
     */
    private static boolean cancelConfirmable(MdmRuleVer row, List<MdmRuleVer> versions, LocalDateTime now, String me, int unapplied) {
        if (!"RELEASED".equals(row.getStatus()) || unapplied != 1) {
            return false;
        }
        if (row.getApplyFrom() == null || !row.getApplyFrom().isAfter(now)) {
            return false; // 이미 적용된 버전은 확정 취소할 수 없다(D8-1)
        }
        return row.getOwnerId() != null && row.getOwnerId().equals(me);
    }

    private RuleMngViewResult.Flags toFlags(MdmRule rule, List<MdmRuleVer> versions, LocalDateTime now) {
        RuleMngViewResult.Flags f = new RuleMngViewResult.Flags();
        boolean mdm = SOURCE_MDM.equals(rule.getSourceKind());
        f.setHeaderEditable(mdm && headerService.headerEditable(rule, versions));
        f.setUnappliedCount((int) versions.stream().filter(v -> RuleVersions.isUnapplied(v, now)).count());
        f.setCanNewVersion(mdm && !"DEPRECATED".equals(rule.getStatus()) && f.getUnappliedCount() == 0);
        // 폐기(I9) — 원천 MDM·사용 중(INUSE)·미적용 버전 없을 때.
        f.setCanDeprecate(mdm && "INUSE".equals(RuleVersions.effectiveStatus(rule.getStatus(), versions, now))
                && f.getUnappliedCount() == 0);
        RuleVersions.currentReleased(versions, now).ifPresent(v -> f.setCurrentVer(v.getVer()));
        return f;
    }

    private static String text(LocalDateTime value) {
        return value == null ? null : value.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    // ────────────────────────────────────────────────────────────────
    // action: save — target HEADER(룰명·설명·활용처). D-105 (7). 적중 정책(옛 target VERSION)은 D-133 으로 ruleEdit 표 저장이 한다.
    // ────────────────────────────────────────────────────────────────

    /**
     * 헤더 화면의 저장. {@code target} 은 {@code HEADER} 하나만 받는다. 액션 이름을 따로 만들지 않은 이유는 권한 어휘 16종에 헤더
     * 저장용 이름이 없다는 점이다 — dme 의 {@code search}(target)·{@code delete}(target) 와 같은 관용구다.
     *
     * <p>옛 {@code target VERSION}(적중 정책 저장)은 D-133 으로 없앴다. 적중 정책은 판정표의 해석 규칙이라 내용 화면
     * ({@code ruleEdit} save part TABLE)이 표와 같은 트랜잭션에서 저장한다. 옛 화면이 VERSION 을 보내면 조용히 버리지 않고 거부한다.
     */
    public RuleMngSaveResult save(RuleMngSaveRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "저장할 값이 없습니다.");
        }
        String target = blankToNull(request.getTarget());
        if (RuleMngSaveRequest.TARGET_HEADER.equals(target)) {
            return headerService.saveHeader(request);
        }
        if ("VERSION".equals(target)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "적중 정책은 룰 편집 화면(ruleEdit)의 의사결정표에서 표 저장과 함께 저장합니다(D-133).");
        }
        throw new BusinessException(ErrorCode.INVALID_VALUE, "저장 대상은 " + RuleMngSaveRequest.TARGET_HEADER + " 여야 합니다: " + target);
    }

    // ────────────────────────────────────────────────────────────────
    // action: copy / delete / lock / unlock / handover — 버전 관리. D-105 로 ruleEdit 에서 옮겨 왔다.
    // ────────────────────────────────────────────────────────────────

    /** 새 버전(action copy). */
    public RuleVersionResult copy(RuleVersionRequest request) {
        return versionService.newVersion(request);
    }

    /** delete(target VERSION = DRAFT 삭제, RULE = 폐기, CONFIRM = 확정 취소, ADR-0002 D8). */
    public RuleVersionResult delete(RuleVersionRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "삭제할 값이 없습니다.");
        }
        String target = blankToNull(request.getTarget());
        if ("VERSION".equals(target)) {
            return versionService.deleteDraft(request);
        }
        if ("RULE".equals(target)) {
            return headerService.deprecate(request);
        }
        // D8-13 — 04 와 같은 target 문자열을 쓴다. 액션을 새로 만들지 않으므로 어휘 16종이 그대로다.
        if (RuleVersionRequest.TARGET_CONFIRM.equals(target)) {
            return versionService.cancelConfirm(request);
        }
        throw new BusinessException(ErrorCode.INVALID_VALUE,
                "삭제 대상은 VERSION·RULE·CONFIRM 중 하나여야 합니다: " + target);
    }

    /** 선점(action lock). */
    public RuleVersionResult lock(RuleVersionRequest request) {
        return versionService.lock(request);
    }

    /** 해제(action unlock) — 소유자만. */
    public RuleVersionResult unlock(RuleVersionRequest request) {
        return versionService.unlock(request);
    }

    /** 넘기기(action handover) — 소유자만, 받는 사람은 담당자. */
    public RuleVersionResult handover(RuleVersionRequest request) {
        return versionService.handover(request);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}

