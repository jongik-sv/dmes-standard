package com.dongkuk.dmes.mdm.dme.ruleSetEdit.service;

import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireRowVersion;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.StandardParentPromotion;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.common.version.VersionRules;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.DraftOwnershipService;
import com.dongkuk.dmes.mdm.contract.version.NewVersionCommand;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionSnapshot;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetVersionResult;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVerId;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetVerRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * 룰 세트 버전 조작(D-144 2단계) — 새 버전(copy)·DRAFT 삭제·확정 취소·선점·해제·넘기기. 룰 {@code RuleVersionService} 를 세트로 옮긴 것이다.
 *
 * <p>소유권·삭제·확정 취소는 공통 서비스로만 한다: 선점 {@link DraftOwnershipService#acquire}, 해제 {@code release}, 넘기기
 * {@code handover}, DRAFT 삭제 {@link VersionStateService#deleteDraft}(RULE_SET 삭제 훅은 {@code RuleSetDraftDeletionHook}), 확정 취소
 * {@link VersionStateService#cancelConfirm}(ADR-0002 D8). 이 서비스는 OWNER_ID·ROW_VERSION·버전 STATUS 를 직접 쓰지 않는다. 새 버전은 공통
 * 훅 {@link VersionStateService#newVersion} 이 미적용 버전을 거부한 뒤(MDM006) 직전 RELEASED(VER 최대)의 {@code RULE_IDS}·{@code FLOW_JSON}
 * 을 복사하고 {@code BASE_VER} 에 그 번호를 적는다(BE 리팩토링 2회차 C3). 버전이 하나도 없으면(유일한 DRAFT 를 지운 세트) 빈 1.000 을
 * 만든다. 적용된 RELEASED 가 있으면 세트 STATUS 를 표준 승격({@link StandardParentPromotion}, 저장 CREATED 일 때만 바뀐다)으로 INUSE 로
 * 올린다(룰과 같다).
 *
 * <p>{@code @Transactional} 을 붙이지 않는다 — 새 버전 쓰기는 공통 훅의 트랜잭션에서 한다.
 */
@Service
public class RuleSetVersionService {

    private final MdmRuleSetRepository setRepository;
    private final MdmRuleSetVerRepository verRepository;
    private final RuleSetVersionQueries setVersions;
    private final RuleStewardCheck stewardCheck;
    private final VersionStateService stateService;
    private final DraftOwnershipService ownership;
    private final StandardParentPromotion promotion;
    private final MdmCurrentUser currentUser;

    public RuleSetVersionService(MdmRuleSetRepository setRepository, MdmRuleSetVerRepository verRepository,
                                 RuleSetVersionQueries setVersions, RuleStewardCheck stewardCheck, VersionStateService stateService,
                                 DraftOwnershipService ownership, StandardParentPromotion promotion, MdmCurrentUser currentUser) {
        this.setRepository = setRepository;
        this.verRepository = verRepository;
        this.setVersions = setVersions;
        this.stewardCheck = stewardCheck;
        this.stateService = stateService;
        this.ownership = ownership;
        this.promotion = promotion;
        this.currentUser = currentUser;
    }

    /**
     * 새 버전(action copy). 번호 = 그 세트 버전 최대값에서 {@code verKind} 로 올린 값(MAJOR: floor+1, MINOR: +0.001, 없으면 1.000),
     * 소유자 = 만든 사람. {@code verKind} 가 비면 MAJOR 다. 여기서는 앞단 검사(세트 읽기·폐기·담당자 역할·결재 중)만 하고, 미적용 버전
     * 가드(MDM006)·원천·번호·쓰기·승격은 공통 훅이 한 트랜잭션에서 한다(C3).
     */
    public RuleSetVersionResult newVersion(RuleSetVersionRequest request) {
        VersionKind kind = VersionRules.parseKind(request.getVerKind());
        MdmRuleSet set = load(request.getSetId());
        String id = set.getMaruRuleSetId();
        if ("DEPRECATED".equals(set.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "폐기한 룰 세트는 새 버전을 만들 수 없습니다", List.of());
        }
        stewardCheck.requireSteward();
        // 결재 중(REQUESTED·APPROVED) 앞단 검사 — 공통 훅의 미적용 가드도 이 두 상태를 미적용으로 보아 같은 MDM006 을 낸다. 겹치는
        // 검사로 남겨 둔다(조정자 결정 2026-10-16). 훅보다 먼저 돌지만 결과(코드·문구)는 같다.
        if (setVersions.versions(id).stream().anyMatch(v -> VersionRules.isInApproval(v.getStatus()))) {
            throw MdmErrors.of(MdmErrorCode.UNAPPLIED_VERSION_EXISTS);
        }
        VersionRef draft = stateService.newVersion(new NewVersionCommand(VersionTarget.RULE_SET, id, kind, currentUser.userId()),
                all -> pickSource(id, all), (newRef, k, owner, source) -> writeDraft(id, newRef, k, owner, source), promotion);
        return new RuleSetVersionResult(id, VersionNumbers.plain(draft.ver()), kind.name(), 0L);
    }

    /** 원천 = RELEASED 가운데 VER 최대. 버전이 하나도 없으면 원천 없이 빈 DRAFT, 버전은 있는데 RELEASED 가 없으면 BUSINESS_ERROR. */
    private static Optional<BigDecimal> pickSource(String id, List<VersionSnapshot> all) {
        Optional<BigDecimal> source = VersionRules.latestReleased(all);
        if (source.isEmpty() && !all.isEmpty()) {
            throw noSource(id);
        }
        return source;
    }

    private static BusinessException noSource(String id) {
        return new BusinessException(ErrorCode.BUSINESS_ERROR, "복사할 RELEASED 버전이 없어 새 버전을 만들 수 없습니다: " + id);
    }

    /** 새 DRAFT 행. 원천이 있으면 다시 읽어 {@code RULE_IDS}·{@code FLOW_JSON}·{@code CALL_SET_IDS} 를 복사하고 {@code BASE_VER} 를 적는다. */
    private void writeDraft(String id, VersionRef draft, VersionKind kind, String owner, Optional<BigDecimal> source) {
        Optional<MdmRuleSetVer> src = source.map(ver -> verRepository.findById(new MdmRuleSetVerId(id, ver)).orElseThrow(() -> noSource(id)));
        MdmRuleSetVer created = new MdmRuleSetVer(id, draft.ver(), kind, owner, src.map(MdmRuleSetVer::getRuleIds).orElse("[]"));
        src.ifPresent(s -> {
            created.setBaseVer(s.getVer());
            created.setFlowJson(s.getFlowJson());
            created.setCallSetIds(s.getCallSetIds());
        });
        verRepository.saveAndFlush(created);
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
}
