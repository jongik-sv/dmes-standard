package com.dongkuk.dmes.mdm.dme.ruleMng.service;

import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.blankToNull;
import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireMdm;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;
import com.dongkuk.dmes.mdm.common.rule.RuleNativeWrites;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionRowStore;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleVersionResult;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * ① 헤더 — 룰명·설명·활용처 메모 저장과 폐기(D-105 로 {@code ruleEdit} 카드 ① 에서 {@code ruleMng} 상세로 옮겨 왔다).
 *
 * <p>쓰는 사람(D6): 미적용 버전에 소유자가 있으면 그 소유자만(아니면 MDM003), 없으면 담당자 역할(아니면 MDM013).
 *
 * <p><b>동시성(D-105 (5))</b>: {@code TB_MDM_RULE} 에 {@code ROW_VERSION} 이 없어 원래는 "마지막 저장이 이긴다"(06:913)였다.
 * {@code MdmRule} 이 {@code CactusAuditEntity} 를 상속하므로 감사 카운터 {@code VER} 가 이미 있고, 마루 코드
 * {@code CodeEditService.requireAuditVer}(I19)와 D-104 의 dataMng 헤더가 쓰는 바로 그 방식으로 <b>DDL 없이</b> 낙관적 잠금을
 * 건다. 화면이 읽어 둔 값과 어긋나면 MDM001 로 거절한다.
 *
 * <p>INUSE 는 계산 상태다(TSK-08-05 design §6.7, I20): 저장 CREATED 이고 적용된 RELEASED 가 있으면 헤더 저장·폐기 트랜잭션에서 저장값을
 * INUSE 로 먼저 올린다. {@code MdmRule.STATUS} 가 {@code updatable = false} 라 엔티티가 아니라 공통 저장소의 네이티브 UPDATE 로 한다.
 */
@Service
public class RuleHeaderService {

    static final int NAME_MAX = 100;

    private final RuleScreenSupport support;
    private final RuleQueries queries;
    private final RuleStewardCheck stewardCheck;
    private final VersionWriteGuard writeGuard;
    private final RuleNativeWrites writes;
    private final MdmRuleRepository ruleRepository;
    private final VersionRowStore versionStore;
    private final MdmNativeAuditSupport audit;
    private final MetaRevisionRecorder recorder;
    private final TransactionTemplate tx;

    public RuleHeaderService(RuleScreenSupport support, RuleQueries queries, RuleStewardCheck stewardCheck,
                             VersionWriteGuard writeGuard, RuleNativeWrites writes, MdmRuleRepository ruleRepository,
                             VersionRowStore versionStore, MdmNativeAuditSupport audit, PlatformTransactionManager transactionManager,
                             MetaRevisionRecorder recorder) {
        this.support = support;
        this.queries = queries;
        this.stewardCheck = stewardCheck;
        this.writeGuard = writeGuard;
        this.writes = writes;
        this.ruleRepository = ruleRepository;
        this.versionStore = versionStore;
        this.audit = audit;
        this.recorder = recorder;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /**
     * 헤더 저장(action save target HEADER) — 낙관적 잠금({@code auditVer})을 먼저 확인한 뒤 룰명·설명·활용처를 바꾼다.
     * 저장은 엔티티 경로 하나로 한다(네이티브 UPDATE 와 섞으면 flush 때 옛 감사 카운터로 덮어쓴다).
     */
    public RuleMngSaveResult saveHeader(RuleMngSaveRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        List<MdmRuleVer> versions = queries.versions(rule.getMaruRuleId());
        LocalDateTime now = support.now();
        requireHeaderWriter(versions);
        String name = blankToNull(request.getMaruRuleName());
        if (name == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰명은 필수입니다.");
        }
        if (name.length() > NAME_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "룰명은 " + NAME_MAX + "자 이하여야 합니다.");
        }
        Long expected = request.getAuditVer();
        MdmRule saved = tx.execute(status -> {
            MdmRule target = ruleRepository.findById(rule.getMaruRuleId()).orElseThrow();
            requireAuditVer(target, expected); // 잠금 확인은 트랜잭션 안, 쓰기 앞에서
            target.setMaruRuleName(name);
            target.setDescription(blankToNull(request.getDescription()));
            target.setUsageNote(blankToNull(request.getUsageNote()));
            MdmRule out = ruleRepository.saveAndFlush(target);
            promoteIfApplied(rule, versions, now);
            recorder.rule(rule.getMaruRuleId()); // 메타 캐시 무효화(spec 2026-10-02 §3.3)
            return out;
        });
        return new RuleMngSaveResult(rule.getMaruRuleId(), RuleMngSaveRequest.TARGET_HEADER, saved.getVersion());
    }

    /**
     * D-105 (5) — 마루 코드 {@code requireAuditVer}(I19)와 같은 판정. 감사 카운터가 다르면 남의 저장을 덮어쓴 것이다.
     *
     * <p>{@code TB_MDM_RULE.VER} 는 NOT NULL 이 아니라 값이 없기도 하다(카운터가 생기기 전 행, {@code RuleNativeWrites} 도
     * {@code COALESCE(VER, 0)} 로 증가한다). 저장값이 null 이면 0 으로 보고 비교한다 — 이미 들어 있는 행이 갑자기 잠금에
     * 걸리면 안 되므로.
     */
    static void requireAuditVer(MdmRule rule, Long expected) {
        Long stored = rule.getVersion();
        Long actual = stored == null ? 0L : stored;
        if (expected == null || !Objects.equals(expected, actual)) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
    }

    /** 화면의 헤더 편집 가능 여부 — {@link #saveHeader} 와 같은 규칙(D6). */
    public boolean headerEditable(MdmRule rule, List<MdmRuleVer> versions) {
        if (!RuleScreenSupport.SOURCE_MDM.equals(rule.getSourceKind())) {
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
        List<MdmRuleVer> versions = queries.versions(rule.getMaruRuleId());
        LocalDateTime now = support.now();
        if (!"INUSE".equals(RuleVersions.effectiveStatus(rule.getStatus(), versions, now))) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "사용 중(INUSE)인 룰만 폐기할 수 있습니다", List.of());
        }
        writeGuard.checkCanCreateVersion(VersionTarget.BUSINESS_RULE, rule.getMaruRuleId());
        RuleScreenSupport.requireNoVersionInApproval(versions);
        Integer changed = tx.execute(status -> {
            promoteIfApplied(rule, versions, now); // 폐기 UPDATE 가 STATUS = 'INUSE' 를 조건으로 쓴다
            int n = writes.deprecate(rule.getMaruRuleId());
            if (n > 0) {
                recorder.rule(rule.getMaruRuleId()); // 메타 캐시 무효화(spec 2026-10-02 §3.3)
            }
            return n;
        });
        if (changed == null || changed == 0) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "사용 중(INUSE)인 룰만 폐기할 수 있습니다", List.of());
        }
        return new RuleVersionResult(rule.getMaruRuleId(), null, null);
    }

    /** 저장 CREATED·계산 INUSE 면 저장값을 INUSE 로 올린다. 호출자 트랜잭션 안에서만 부른다. */
    private void promoteIfApplied(MdmRule rule, List<MdmRuleVer> versions, LocalDateTime now) {
        if (RuleVersions.needsInUsePromotion(rule.getStatus(), versions, now)) {
            versionStore.markParentInUse(VersionTarget.BUSINESS_RULE, rule.getMaruRuleId(), audit.currentStamp());
        }
    }
}
