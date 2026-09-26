package com.dongkuk.dmes.mdm.dme.ruleMng.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.RuleIdRules;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries.RuleFilter;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleListRow;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleRegRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleRegResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleSearchResult;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVerRepository;
import java.time.Clock;
import java.time.LocalDateTime;
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
    private final Clock clock;
    private final TransactionTemplate tx;

    public RuleMngService(MdmRuleRepository ruleRepository, MdmRuleVerRepository verRepository, RuleQueries queries,
                          RuleStewardCheck stewardCheck, MdmCurrentUser currentUser, Clock clock,
                          PlatformTransactionManager transactionManager) {
        this.ruleRepository = ruleRepository;
        this.verRepository = verRepository;
        this.queries = queries;
        this.stewardCheck = stewardCheck;
        this.currentUser = currentUser;
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

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
