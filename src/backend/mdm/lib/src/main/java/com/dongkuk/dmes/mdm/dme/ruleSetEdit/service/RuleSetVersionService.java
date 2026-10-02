package com.dongkuk.dmes.mdm.dme.ruleSetEdit.service;

import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireRowVersion;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.common.version.VersionRowStore;
import com.dongkuk.dmes.mdm.common.version.VersionRules;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.version.DraftOwnershipService;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetVersionResult;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetVerRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 룰 세트 버전 조작(D-144 2단계) — 새 버전(copy)·DRAFT 삭제·확정 취소·선점·해제·넘기기. 룰 {@code RuleVersionService} 를 세트로 옮긴 것이다.
 *
 * <p>소유권·삭제·확정 취소는 공통 서비스로만 한다: 선점 {@link DraftOwnershipService#acquire}, 해제 {@code release}, 넘기기
 * {@code handover}, DRAFT 삭제 {@link VersionStateService#deleteDraft}(RULE_SET 삭제 훅은 {@code RuleSetDraftDeletionHook}), 확정 취소
 * {@link VersionStateService#cancelConfirm}(ADR-0002 D8). 이 서비스는 OWNER_ID·ROW_VERSION·버전 STATUS 를 직접 쓰지 않는다. 새 버전은 공통
 * 가드로 미적용 버전을 거부한 뒤(MDM006) 직전 RELEASED(VER 최대)의 {@code RULE_IDS}·{@code FLOW_JSON} 을 복사하고 {@code BASE_VER} 에 그
 * 번호를 적는다. 버전이 하나도 없으면(유일한 DRAFT 를 지운 세트) 빈 1.000 을 만든다. 세트 STATUS 는 저장 CREATED·계산 INUSE 일 때만
 * 공통 저장소 {@link VersionRowStore#markParentInUse} 로 INUSE 로 올린다(룰과 같다).
 *
 * <p>{@code @Transactional} 을 붙이지 않는다 — 쓰기는 {@link TransactionTemplate}.
 */
@Service
public class RuleSetVersionService {

    /** 승인 흐름 상태 — 공통 가드의 미적용 판정(DRAFT·미래 RELEASED)에 들지 않으므로 룰처럼 따로 막는다. */
    private static final Set<String> IN_APPROVAL = Set.of("REQUESTED", "APPROVED");

    private final MdmRuleSetRepository setRepository;
    private final MdmRuleSetVerRepository verRepository;
    private final RuleSetVersionQueries setVersions;
    private final RuleStewardCheck stewardCheck;
    private final VersionWriteGuard writeGuard;
    private final VersionStateService stateService;
    private final DraftOwnershipService ownership;
    private final VersionRowStore versionStore;
    private final MdmNativeAuditSupport audit;
    private final MdmCurrentUser currentUser;
    private final Clock clock;
    private final TransactionTemplate tx;

    public RuleSetVersionService(MdmRuleSetRepository setRepository, MdmRuleSetVerRepository verRepository,
                                 RuleSetVersionQueries setVersions, RuleStewardCheck stewardCheck, VersionWriteGuard writeGuard,
                                 VersionStateService stateService, DraftOwnershipService ownership, VersionRowStore versionStore,
                                 MdmNativeAuditSupport audit, MdmCurrentUser currentUser, Clock clock,
                                 PlatformTransactionManager transactionManager) {
        this.setRepository = setRepository;
        this.verRepository = verRepository;
        this.setVersions = setVersions;
        this.stewardCheck = stewardCheck;
        this.writeGuard = writeGuard;
        this.stateService = stateService;
        this.ownership = ownership;
        this.versionStore = versionStore;
        this.audit = audit;
        this.currentUser = currentUser;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /**
     * 새 버전(action copy). 번호 = 그 세트 버전 최대값에서 {@code verKind} 로 올린 값(MAJOR: floor+1, MINOR: +0.001, 없으면 1.000),
     * 소유자 = 만든 사람. {@code verKind} 가 비면 MAJOR 다. 종류 해석·번호 검사는 공통 {@link VersionRules}.
     */
    public RuleSetVersionResult newVersion(RuleSetVersionRequest request) {
        VersionKind kind = VersionRules.parseKind(request.getVerKind());
        MdmRuleSet set = load(request.getSetId());
        String id = set.getMaruRuleSetId();
        if ("DEPRECATED".equals(set.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "폐기한 룰 세트는 새 버전을 만들 수 없습니다", List.of());
        }
        stewardCheck.requireSteward();
        writeGuard.checkCanCreateVersion(VersionTarget.RULE_SET, id);                       // MDM006
        List<MdmRuleSetVer> versions = setVersions.versions(id);
        if (versions.stream().anyMatch(v -> IN_APPROVAL.contains(v.getStatus()))) {
            throw MdmErrors.of(MdmErrorCode.UNAPPLIED_VERSION_EXISTS);
        }
        Optional<MdmRuleSetVer> source = RuleVersions.latestReleased(versions);
        if (source.isEmpty() && !versions.isEmpty()) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "복사할 RELEASED 버전이 없어 새 버전을 만들 수 없습니다: " + id);
        }
        BigDecimal max = VersionNumbers.maxVer(versions.stream().map(MdmRuleSetVer::getVer).toList());
        BigDecimal next = VersionRules.nextNumber(max, kind);
        String me = currentUser.userId();
        boolean promote = RuleVersions.needsInUsePromotion(set.getStatus(), versions, now());
        tx.executeWithoutResult(status -> {
            MdmRuleSetVer created = new MdmRuleSetVer(id, next, kind, me, source.map(MdmRuleSetVer::getRuleIds).orElse("[]"));
            source.ifPresent(s -> {
                created.setBaseVer(s.getVer());
                created.setFlowJson(s.getFlowJson());
            });
            verRepository.saveAndFlush(created);
            if (promote) {
                versionStore.markParentInUse(VersionTarget.RULE_SET, id, audit.currentStamp());
            }
        });
        return new RuleSetVersionResult(id, VersionNumbers.plain(next), kind.name(), 0L);
    }

    /** DRAFT 삭제(delete target VERSION). 소유자·DRAFT·row_version·삭제 훅은 공통 서비스가 본다. */
    public RuleSetVersionResult deleteDraft(RuleSetVersionRequest request) {
        VersionRef ref = ref(request);
        stateService.deleteDraft(ref, requireRowVersion(request.getRowVersion()), currentUser.userId());
        return new RuleSetVersionResult(ref.objectId(), VersionNumbers.plain(ref.ver()), null, null);
    }

    /**
     * 확정 취소(delete target CONFIRM, ADR-0002 D8) — 아직 적용 시각이 오지 않은 확정 버전을 작성 중으로 되돌린다. 판정·구간 복구·상위
     * 상태는 공통 버전 상태 서비스가 한다.
     */
    public RuleSetVersionResult cancelConfirm(RuleSetVersionRequest request) {
        VersionRef ref = ref(request);
        stateService.cancelConfirm(ref, requireRowVersion(request.getRowVersion()), currentUser.userId());
        return new RuleSetVersionResult(ref.objectId(), VersionNumbers.plain(ref.ver()), null, null);
    }

    /** 선점 — 공통 서비스가 담당자 역할·빈 소유자를 본다. 새 row_version 을 돌려준다. */
    public RuleSetVersionResult lock(RuleSetVersionRequest request) {
        VersionRef ref = ref(request);
        long rv = ownership.acquire(ref, requireRowVersion(request.getRowVersion()), currentUser.userId());
        return new RuleSetVersionResult(ref.objectId(), VersionNumbers.plain(ref.ver()), null, rv);
    }

    /** 해제 — 소유자만(MDM003). */
    public RuleSetVersionResult unlock(RuleSetVersionRequest request) {
        VersionRef ref = ref(request);
        long rv = ownership.release(ref, requireRowVersion(request.getRowVersion()), currentUser.userId());
        return new RuleSetVersionResult(ref.objectId(), VersionNumbers.plain(ref.ver()), null, rv);
    }

    /** 넘기기 — 소유자만(MDM003), 받는 사람은 담당자(MDM005, MdmStewardDirectory). */
    public RuleSetVersionResult handover(RuleSetVersionRequest request) {
        VersionRef ref = ref(request);
        long rv = ownership.handover(ref, requireRowVersion(request.getRowVersion()), currentUser.userId(), request.getNewOwnerId());
        return new RuleSetVersionResult(ref.objectId(), VersionNumbers.plain(ref.ver()), null, rv);
    }

    private VersionRef ref(RuleSetVersionRequest request) {
        MdmRuleSet set = load(request.getSetId());
        BigDecimal ver = VersionRules.requireVer(request.getVer());
        return new VersionRef(VersionTarget.RULE_SET, set.getMaruRuleSetId(), VersionNumbers.scaled(ver));
    }

    private MdmRuleSet load(String setId) {
        if (setId == null || setId.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 세트 ID 는 필수입니다.");
        }
        return setRepository.findById(setId.trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "룰 세트를 찾을 수 없습니다: " + setId.trim()));
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }
}
