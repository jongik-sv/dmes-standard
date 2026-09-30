package com.dongkuk.dmes.mdm.dme.ruleMng.service;

import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.ref;
import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireMdm;
import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireRowVersion;
import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireVer;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.RuleHitPolicies;
import com.dongkuk.dmes.mdm.common.rule.RuleNativeWrites;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveRejections;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveValidator;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionRowStore;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.version.DraftOwnershipService;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleVersionResult;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRowRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVarRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVerRepository;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * ② 버전 — 새 버전(copy)·DRAFT 삭제·선점·해제·넘기기·적중 정책(HIT_POLICY) 저장(D-105 로 {@code ruleEdit} 카드 ② 에서
 * {@code ruleMng} 상세로 옮겨 왔다).
 *
 * <p>소유권·삭제는 TSK-01-03 공통 서비스로만 한다(I6): 선점 {@link DraftOwnershipService#acquire}, 해제 {@code release}, 넘기기
 * {@code handover}, DRAFT 삭제 {@link VersionStateService#deleteDraft}(BUSINESS_RULE 삭제 훅은 {@code RuleDraftDeletionHook}). 이
 * 서비스는 OWNER_ID·ROW_VERSION·버전 STATUS 를 직접 쓰지 않는다. 새 버전은 공통 가드로 미적용 버전을 거부한 뒤(I4) 직전 RELEASED 의
 * 변수·행을 칼럼 전부, 번호 그대로 복사한다(I5). 룰 STATUS 는 새 버전 트랜잭션에서 저장 CREATED·계산 INUSE 일 때만 공통 저장소
 * {@link VersionRowStore#markParentInUse} 로 INUSE 로 올린다(TSK-08-05 design §6.7, I20).
 *
 * <p><b>HIT_POLICY 는 여기서 쓴다(D-105 (4))</b>. {@code TB_MDM_RULE_VER.HIT_POLICY} 는 버전마다 복제되는 버전 속성이지만
 * 원래 575줄 {@code RuleColumnsService}(내용 화면)가 네이티브 UPDATE 로 썼다. 그 asymmetria(버전 속성을 내용 화면에서만 고칠 수
 * 있음)를 없애려고 여기서 저장하고, 내용 화면은 이 값을 읽기만 한다.
 */
@Service
public class RuleVersionService {

    private final RuleScreenSupport support;
    private final RuleQueries queries;
    private final RuleStewardCheck stewardCheck;
    private final VersionWriteGuard writeGuard;
    private final VersionStateService stateService;
    private final DraftOwnershipService ownership;
    private final MdmRuleVerRepository verRepository;
    private final MdmRuleVarRepository varRepository;
    private final MdmRuleRowRepository rowRepository;
    private final VersionRowStore versionStore;
    private final MdmNativeAuditSupport audit;
    private final TransactionTemplate tx;
    /** D-105 (4) — 적중 정책 저장 전 저장된 정의를 새 정책으로 다시 검사한다. */
    private final RuleSaveValidator validator;
    private final StoredRuleDefinitions stored;
    private final RuleNativeWrites writes;
    private final jakarta.persistence.EntityManager entityManager;

    public RuleVersionService(RuleScreenSupport support, RuleQueries queries, RuleStewardCheck stewardCheck,
                              VersionWriteGuard writeGuard, VersionStateService stateService, DraftOwnershipService ownership,
                              MdmRuleVerRepository verRepository, MdmRuleVarRepository varRepository,
                              MdmRuleRowRepository rowRepository, VersionRowStore versionStore, MdmNativeAuditSupport audit,
                              PlatformTransactionManager transactionManager, RuleSaveValidator validator,
                              StoredRuleDefinitions stored, RuleNativeWrites writes, EntityManager entityManager) {
        this.support = support;
        this.queries = queries;
        this.stewardCheck = stewardCheck;
        this.writeGuard = writeGuard;
        this.stateService = stateService;
        this.ownership = ownership;
        this.verRepository = verRepository;
        this.varRepository = varRepository;
        this.rowRepository = rowRepository;
        this.versionStore = versionStore;
        this.audit = audit;
        this.tx = new TransactionTemplate(transactionManager);
        this.validator = validator;
        this.stored = stored;
        this.writes = writes;
        this.entityManager = entityManager;
    }

    /** 새 버전(action copy). 번호 = 그 룰 버전 최대값 + 1(없으면 1), 소유자 = 만든 사람. */
    public RuleVersionResult newVersion(RuleVersionRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        if ("DEPRECATED".equals(rule.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "폐기한 룰은 새 버전을 만들 수 없습니다", List.of());
        }
        stewardCheck.requireSteward();
        String id = rule.getMaruRuleId();
        writeGuard.checkCanCreateVersion(VersionTarget.BUSINESS_RULE, id);
        List<MdmRuleVer> versions = queries.versions(id);
        RuleScreenSupport.requireNoVersionInApproval(versions);
        Optional<MdmRuleVer> source = RuleVersions.latestReleased(versions);
        if (source.isEmpty() && !versions.isEmpty()) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "복사할 RELEASED 버전이 없어 새 버전을 만들 수 없습니다: " + id);
        }
        int next = versions.stream().mapToInt(MdmRuleVer::getVer).max().orElse(0) + 1;
        String me = support.me();
        boolean promote = RuleVersions.needsInUsePromotion(rule.getStatus(), versions, support.now());
        tx.executeWithoutResult(status -> {
            MdmRuleVer created = new MdmRuleVer(id, next, me);
            if (source.isPresent()) {
                created.setBaseVer(source.get().getVer());
                created.setHitPolicy(source.get().getHitPolicy());
            } else {
                created.setBaseVer(null);
                created.setHitPolicy("DECISION".equals(rule.getRuleKind()) ? "FIRST" : null);
            }
            verRepository.saveAndFlush(created);
            source.ifPresent(src -> copyDefinition(id, src.getVer(), next));
            if (promote) {
                versionStore.markParentInUse(VersionTarget.BUSINESS_RULE, id, audit.currentStamp());
            }
        });
        return new RuleVersionResult(id, next, 0L);
    }

    /** 변수·행 칼럼 전부 복사 — var_id·row_id·seq 유지(번호를 발급하지 않는다, 06:931). */
    private void copyDefinition(String id, int from, int to) {
        for (MdmRuleVar v : queries.vars(id, from)) {
            MdmRuleVar c = new MdmRuleVar(id, to, v.getVarId(), v.getVarKind(), v.getSeq());
            c.setDispType(v.getDispType());
            c.setVarName(v.getVarName());
            c.setVarAst(v.getVarAst());
            c.setDomainId(v.getDomainId());
            c.setDataType(v.getDataType());
            c.setCollectAgg(v.getCollectAgg());
            c.setPrioList(v.getPrioList());
            c.setResGrp(v.getResGrp());
            c.setGrpCond(v.getGrpCond());
            c.setGrpCondAst(v.getGrpCondAst());
            c.setLabel(v.getLabel());
            c.setDescription(v.getDescription());
            varRepository.save(c);
        }
        for (MdmRuleRow r : queries.rows(id, from)) {
            MdmRuleRow c = new MdmRuleRow(id, to, r.getRowId(), r.getRowKind(), r.getSeq(), r.getCells());
            c.setNote(r.getNote());
            c.setTag(r.getTag());
            rowRepository.save(c);
        }
        rowRepository.flush();
    }

    /**
     * 적중 정책 저장(action save target VERSION, D-105 (4)).
     *
     * <p>내용 화면이 아니라 여기서 쓴다. 다만 <b>저장 전에 저장된 정의를 새 정책으로 다시 검사한다</b>
     * ({@link RuleSaveTarget#STORED}) — 원래 표 저장과 한 트랜잭션이던 것을 둘로 갈라면서, "policy 가 바뀌었는데 내용이
     * 그에 안 맞는데 저장돼 버리는" 틈을 만들지 않기 위해서다. 검사에서 ERROR 가 하나라도 있으면 MDM021 로 거절한다.
     * 확��� 시점에도 같은 검사가 다시 도므로 이중 안전망이다(STORED 는 상신 검사 지점이다).
     *
     * <p>값이 같으면 아무것도 쓰지 않는다(쓰지 않은 저장은 하지 않는다).
     */
    public RuleMngSaveResult saveHitPolicy(RuleMngSaveRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        int ver = requireVer(request.getVer());
        long expected = requireRowVersion(request.getRowVersion());
        // 산출 룰(DERIVE)에는 정책이 없다 — 원래 표 저장 때의 규칙을 그대로 지킨다.
        String hit = RuleHitPolicies.normalize(rule.getRuleKind(), request.getHitPolicy());

        return tx.execute(status -> {
            long rowVersion = writeGuard.beginDraftWrite(ref(rule.getMaruRuleId(), ver), expected, support.me());
            StoredRuleDefinitions.Stored s = stored.read(rule.getMaruRuleId(), ver)
                    .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE,
                            "버전을 찾을 수 없습니다: " + rule.getMaruRuleId() + " " + ver));
            if (hit.equals(s.version().getHitPolicy())) {
                return new RuleMngSaveResult(rule.getMaruRuleId(), RuleMngSaveRequest.TARGET_VERSION, null, ver, rowVersion);
            }
            RuleCheckReport report = validator.validate(new RuleCheckInput(rule.getMaruRuleId(), ver, rule.getRuleKind(), hit, s.rawVars(),
                    s.vars(), s.rows(), RuleSaveTarget.STORED));
            if (report.hasErrors()) {
                throw RuleSaveRejections.reject(report.issues());
            }
            writes.updateHitPolicy(rule.getMaruRuleId(), ver, hit);
            entityManager.flush();
            return new RuleMngSaveResult(rule.getMaruRuleId(), RuleMngSaveRequest.TARGET_VERSION, null, ver, rowVersion);
        });
    }

    /** DRAFT 삭제(delete target VERSION). 소유자·DRAFT·row_version·삭제 훅은 공통 서비스가 본다. */
    public RuleVersionResult deleteDraft(RuleVersionRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        int ver = requireVer(request.getVer());
        stateService.deleteDraft(ref(rule.getMaruRuleId(), ver), requireRowVersion(request.getRowVersion()), support.me());
        return new RuleVersionResult(rule.getMaruRuleId(), ver, null);
    }

    /**
     * 확정 취소(delete target CONFIRM) — 아직 적용 시각이 오지 않은 확정 버전을 작성 중으로 되돌린다
     * (ADR-0002 D8, TSK-02-01 D4-1). 판정·구간 복구·상위 상태는 공용 버전 상태 서비스가 한다.
     */
    public RuleVersionResult cancelConfirm(RuleVersionRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        int ver = requireVer(request.getVer());
        stateService.cancelConfirm(ref(rule.getMaruRuleId(), ver), requireRowVersion(request.getRowVersion()), support.me());
        return new RuleVersionResult(rule.getMaruRuleId(), ver, null);
    }

    /** 선점 — 공통 서비스가 담당자 역할·빈 소유자를 본다. 새 row_version 을 돌려준다. */
    public RuleVersionResult lock(RuleVersionRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        int ver = requireVer(request.getVer());
        long rv = ownership.acquire(ref(rule.getMaruRuleId(), ver), requireRowVersion(request.getRowVersion()), support.me());
        return new RuleVersionResult(rule.getMaruRuleId(), ver, rv);
    }

    /** 해제 — 소유자만(MDM003). */
    public RuleVersionResult unlock(RuleVersionRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        int ver = requireVer(request.getVer());
        long rv = ownership.release(ref(rule.getMaruRuleId(), ver), requireRowVersion(request.getRowVersion()), support.me());
        return new RuleVersionResult(rule.getMaruRuleId(), ver, rv);
    }

    /** 넘기기 — 소유자만(MDM003), 받는 사람은 담당자(MDM005, MdmStewardDirectory). */
    public RuleVersionResult handover(RuleVersionRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        int ver = requireVer(request.getVer());
        long rv = ownership.handover(ref(rule.getMaruRuleId(), ver), requireRowVersion(request.getRowVersion()), support.me(),
                request.getNewOwnerId());
        return new RuleVersionResult(rule.getMaruRuleId(), ver, rv);
    }
}
