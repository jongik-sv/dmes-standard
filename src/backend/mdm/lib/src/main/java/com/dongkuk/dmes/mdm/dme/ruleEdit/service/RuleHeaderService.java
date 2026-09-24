package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import static com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditSupport.blankToNull;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditSupport.requireMdm;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.RuleNativeWrites;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleVersionResult;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 카드 ① 헤더 — 룰명·설명·활용처 메모 바로 저장(part HEADER)과 폐기(TSK-08-02 design §6.3.6·§6.3.7).
 *
 * <p>쓰는 사람(D6): 미적용 버전에 소유자가 있으면 그 소유자만(아니면 MDM003), 없으면 담당자 역할(아니면 MDM013). 헤더는 버전과
 * 무관한 값이고 TB_MDM_RULE 에 row_version 이 없으므로 마지막 저장이 이긴다(06:913). 폐기(I9)는 원천 MDM·INUSE·미적용 버전 없음일
 * 때만 STATUS 를 네이티브로 바꾼다 — 그때는 소유자가 있을 수 없으므로 담당자 역할로 판정한다.
 */
@Service
public class RuleHeaderService implements RuleEditSavePart {

    static final String PART = "HEADER";
    static final int NAME_MAX = 100;

    private final RuleEditSupport support;
    private final RuleQueries queries;
    private final RuleStewardCheck stewardCheck;
    private final VersionWriteGuard writeGuard;
    private final RuleNativeWrites writes;
    private final MdmRuleRepository ruleRepository;
    private final TransactionTemplate tx;

    public RuleHeaderService(RuleEditSupport support, RuleQueries queries, RuleStewardCheck stewardCheck, VersionWriteGuard writeGuard,
                             RuleNativeWrites writes, MdmRuleRepository ruleRepository, PlatformTransactionManager transactionManager) {
        this.support = support;
        this.queries = queries;
        this.stewardCheck = stewardCheck;
        this.writeGuard = writeGuard;
        this.writes = writes;
        this.ruleRepository = ruleRepository;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Override
    public String part() {
        return PART;
    }

    @Override
    public RuleEditSaveResult save(RuleEditSaveRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        requireHeaderWriter(queries.versions(rule.getMaruRuleId()));
        String name = blankToNull(request.getMaruRuleName());
        if (name == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰명은 필수입니다.");
        }
        if (name.length() > NAME_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "룰명은 " + NAME_MAX + "자 이하여야 합니다.");
        }
        tx.executeWithoutResult(status -> {
            MdmRule target = ruleRepository.findById(rule.getMaruRuleId()).orElseThrow();
            target.setMaruRuleName(name);
            target.setDescription(blankToNull(request.getDescription()));
            target.setUsageNote(blankToNull(request.getUsageNote()));
            ruleRepository.saveAndFlush(target);
        });
        return new RuleEditSaveResult(PART, request.getRowVersion(), Map.of(), List.of(), List.of());
    }

    /** 화면의 헤더 편집 가능 여부 — {@link #save} 와 같은 규칙(D6). */
    public boolean headerEditable(MdmRule rule, List<MdmRuleVer> versions) {
        if (!RuleEditSupport.SOURCE_MDM.equals(rule.getSourceKind())) {
            return false;
        }
        Set<String> owners = unappliedOwners(versions, support.now());
        return owners.isEmpty() ? stewardCheck.isSteward() : owners.contains(support.me());
    }

    private void requireHeaderWriter(List<MdmRuleVer> versions) {
        Set<String> owners = unappliedOwners(versions, support.now());
        if (owners.isEmpty()) {
            stewardCheck.requireSteward();
        } else if (!owners.contains(support.me())) {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT_OWNER);
        }
    }

    private static Set<String> unappliedOwners(List<MdmRuleVer> versions, LocalDateTime now) {
        return versions.stream().filter(v -> RuleVersions.isUnapplied(v, now)).map(MdmRuleVer::getOwnerId).filter(Objects::nonNull)
                .collect(Collectors.toSet());
    }

    /** 폐기(delete target RULE, I9). */
    public RuleVersionResult deprecate(RuleVersionRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        stewardCheck.requireSteward();
        if (!"INUSE".equals(rule.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "사용 중(INUSE)인 룰만 폐기할 수 있습니다", List.of());
        }
        writeGuard.checkCanCreateVersion(VersionTarget.BUSINESS_RULE, rule.getMaruRuleId());
        RuleEditSupport.requireNoVersionInApproval(queries.versions(rule.getMaruRuleId()));
        Integer changed = tx.execute(status -> writes.deprecate(rule.getMaruRuleId()));
        if (changed == null || changed == 0) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "사용 중(INUSE)인 룰만 폐기할 수 있습니다", List.of());
        }
        return new RuleVersionResult(rule.getMaruRuleId(), null, null);
    }
}
