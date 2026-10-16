package com.dongkuk.dmes.mdm.dme.ruleMng.service;

import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.ref;
import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireMdm;
import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireRowVersion;
import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireVer;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
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
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleVersionResult;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.entity.MdmRuleVerId;
import com.dongkuk.dmes.mdm.repository.MdmRuleRowRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVarRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVerRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * ② 버전 — 새 버전(copy)·DRAFT 삭제·확정 취소·선점·해제·넘기기(D-105 로 {@code ruleEdit} 카드 ② 에서 {@code ruleMng} 상세로 옮겨 왔다).
 *
 * <p>소유권·삭제는 TSK-01-03 공통 서비스로만 한다(I6): 선점 {@link DraftOwnershipService#acquire}, 해제 {@code release}, 넘기기
 * {@code handover}, DRAFT 삭제 {@link VersionStateService#deleteDraft}(BUSINESS_RULE 삭제 훅은 {@code RuleDraftDeletionHook}). 이
 * 서비스는 OWNER_ID·ROW_VERSION·버전 STATUS 를 직접 쓰지 않는다. 새 버전은 공통 훅 {@link VersionStateService#newVersion} 이 미적용
 * 버전을 거부한 뒤(I4) 직전 RELEASED 의 변수·행을 칼럼 전부, 번호 그대로 복사한다(I5, BE 리팩토링 2회차 C3). 룰 STATUS 는 새 버전
 * 트랜잭션에서 적용된 RELEASED 가 있을 때 표준 승격({@link StandardParentPromotion}, 저장 CREATED 일 때만 바뀐다)으로 INUSE 로
 * 올린다(TSK-08-05 design §6.7, I20).
 *
 * <p><b>HIT_POLICY 는 여기서 쓰지 않는다(D-133 — D-105 (4) 번복)</b>. 적중 정책은 판정표의 해석 규칙이라 내용 화면의 표 저장
 * ({@code RuleTableService}, ruleEdit save part TABLE)이 표와 같은 트랜잭션에서 쓴다. 여기서는 새 버전을 만들 때 직전 RELEASED 의
 * 정책을 복사(없으면 DECISION 은 FIRST)하는 것만 한다.
 */
@Service
public class RuleVersionService {

    private final RuleScreenSupport support;
    private final RuleQueries queries;
    private final RuleStewardCheck stewardCheck;
    private final VersionStateService stateService;
    private final DraftOwnershipService ownership;
    private final MdmRuleVerRepository verRepository;
    private final MdmRuleVarRepository varRepository;
    private final MdmRuleRowRepository rowRepository;
    private final StandardParentPromotion promotion;

    public RuleVersionService(RuleScreenSupport support, RuleQueries queries, RuleStewardCheck stewardCheck,
                              VersionStateService stateService, DraftOwnershipService ownership,
                              MdmRuleVerRepository verRepository, MdmRuleVarRepository varRepository,
                              MdmRuleRowRepository rowRepository, StandardParentPromotion promotion) {
        this.support = support;
        this.queries = queries;
        this.stewardCheck = stewardCheck;
        this.stateService = stateService;
        this.ownership = ownership;
        this.verRepository = verRepository;
        this.varRepository = varRepository;
        this.rowRepository = rowRepository;
        this.promotion = promotion;
    }

    /**
     * 새 버전(action copy). 번호 = 그 룰 버전 최대값에서 {@code verKind} 로 올린 값(MAJOR: floor+1, MINOR: +0.001, 없으면 1.000,
     * D-144), 소유자 = 만든 사람. {@code verKind} 가 비면 MAJOR 다(기존 화면 호환). 여기서는 앞단 검사(룰 읽기·외부 원천·폐기·담당자
     * 역할·결재 중)만 하고, 미적용 버전 가드(MDM006)·원천·번호·쓰기·승격은 공통 훅이 한 트랜잭션에서 한다(C3).
     */
    public RuleVersionResult newVersion(RuleVersionRequest request) {
        VersionKind kind = VersionRules.parseKind(request.getVerKind());
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        if ("DEPRECATED".equals(rule.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "폐기한 룰은 새 버전을 만들 수 없습니다", List.of());
        }
        stewardCheck.requireSteward();
        String id = rule.getMaruRuleId();
        // 결재 중 앞단 검사 — 공통 훅의 미적용 가드와 같은 MDM006 이라 겹친다. 남겨 둔다(조정자 결정 2026-10-16).
        RuleScreenSupport.requireNoVersionInApproval(queries.versions(id));
        VersionRef draft = stateService.newVersion(new NewVersionCommand(VersionTarget.BUSINESS_RULE, id, kind, support.me()),
                all -> pickSource(id, all), (newRef, k, owner, source) -> writeDraft(rule, newRef, k, owner, source), promotion);
        return new RuleVersionResult(id, VersionNumbers.plain(draft.ver()), kind.name(), 0L);
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

    /**
     * 새 DRAFT 행과 정의. 원천이 있으면 다시 읽어 BASE_VER·적중 정책을 적고 변수·행을 복사한다. 원천이 없으면 BASE_VER 는 비우고 적중
     * 정책은 DECISION 이면 FIRST 다.
     */
    private void writeDraft(MdmRule rule, VersionRef draft, VersionKind kind, String owner, Optional<BigDecimal> source) {
        String id = rule.getMaruRuleId();
        Optional<MdmRuleVer> src = source.map(ver -> verRepository.findById(new MdmRuleVerId(id, ver)).orElseThrow(() -> noSource(id)));
        MdmRuleVer created = new MdmRuleVer(id, draft.ver(), kind, owner);
        if (src.isPresent()) {
            created.setBaseVer(src.get().getVer());
            created.setHitPolicy(src.get().getHitPolicy());
        } else {
            created.setBaseVer(null);
            created.setHitPolicy("DECISION".equals(rule.getRuleKind()) ? "FIRST" : null);
        }
        verRepository.saveAndFlush(created);
        src.ifPresent(s -> copyDefinition(id, s.getVer(), draft.ver()));
    }

    /** 변수·행 칼럼 전부 복사 — var_id·row_id·seq 유지(번호를 발급하지 않는다, 06:931). */
    private void copyDefinition(String id, BigDecimal from, BigDecimal to) {
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

    /** DRAFT 삭제(delete target VERSION). 소유자·DRAFT·row_version·삭제 훅은 공통 서비스가 본다. */
    public RuleVersionResult deleteDraft(RuleVersionRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        BigDecimal ver = requireVer(request.getVer());
        stateService.deleteDraft(ref(rule.getMaruRuleId(), ver), requireRowVersion(request.getRowVersion()), support.me());
        return new RuleVersionResult(rule.getMaruRuleId(), VersionNumbers.plain(ver), null);
    }

    /**
     * 확정 취소(delete target CONFIRM) — 아직 적용 시각이 오지 않은 확정 버전을 작성 중으로 되돌린다
     * (ADR-0002 D8, TSK-02-01 D4-1). 판정·구간 복구·상위 상태는 공용 버전 상태 서비스가 한다.
     */
    public RuleVersionResult cancelConfirm(RuleVersionRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        BigDecimal ver = requireVer(request.getVer());
        stateService.cancelConfirm(ref(rule.getMaruRuleId(), ver), requireRowVersion(request.getRowVersion()), support.me());
        return new RuleVersionResult(rule.getMaruRuleId(), VersionNumbers.plain(ver), null);
    }

    /** 선점 — 공통 서비스가 담당자 역할·빈 소유자를 본다. 새 row_version 을 돌려준다. */
    public RuleVersionResult lock(RuleVersionRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        BigDecimal ver = requireVer(request.getVer());
        long rv = ownership.acquire(ref(rule.getMaruRuleId(), ver), requireRowVersion(request.getRowVersion()), support.me());
        return new RuleVersionResult(rule.getMaruRuleId(), VersionNumbers.plain(ver), rv);
    }

    /** 해제 — 소유자만(MDM003). */
    public RuleVersionResult unlock(RuleVersionRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        BigDecimal ver = requireVer(request.getVer());
        long rv = ownership.release(ref(rule.getMaruRuleId(), ver), requireRowVersion(request.getRowVersion()), support.me());
        return new RuleVersionResult(rule.getMaruRuleId(), VersionNumbers.plain(ver), rv);
    }

    /** 넘기기 — 소유자만(MDM003), 받는 사람은 담당자(MDM005, MdmStewardDirectory). */
    public RuleVersionResult handover(RuleVersionRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        BigDecimal ver = requireVer(request.getVer());
        long rv = ownership.handover(ref(rule.getMaruRuleId(), ver), requireRowVersion(request.getRowVersion()), support.me(),
                request.getNewOwnerId());
        return new RuleVersionResult(rule.getMaruRuleId(), VersionNumbers.plain(ver), rv);
    }
}
