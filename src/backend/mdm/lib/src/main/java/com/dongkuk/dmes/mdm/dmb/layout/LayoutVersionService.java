package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.common.version.VersionRules;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.DraftOwnershipService;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionResult;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * 레이아웃·헤더 버전 액션(D-144 3단계) — 새 버전(copy)·DRAFT 삭제·확정취소·선점·해제·넘기기. 상태·소유자·row_version 은 공통 서비스만
 * 바꾼다(룰 세트 {@code RuleSetVersionService} 와 같은 경계): 선점 {@link DraftOwnershipService#acquire}, 해제 {@code release}, 넘기기
 * {@code handover}, DRAFT 삭제 {@link VersionStateService#deleteDraft}(자식 행 정리는 {@link LayoutDraftDeletion}), 확정 취소
 * {@link VersionStateService#cancelConfirm}(ADR-0002 D8).
 *
 * <p>새 버전은 담당자 역할을 요구하지 않는다(표준 관리자도 만들고, 확정은 담당자에게 넘긴다). 공통 가드로 미적용 버전을 거부하고(MDM006)
 * 승인 흐름 상태(REQUESTED·APPROVED)도 같은 코드로 막는다. 번호는 공통 {@link VersionRules}(MAJOR floor+1, MINOR +0.001, 상한 999),
 * 내용은 직전 RELEASED 의 항목·헤더 구성·재정의를 칼럼 그대로 복사한다({@link LayoutWriter#copyVersionRows}).
 *
 * <p>{@code @Transactional}·{@code TransactionTemplate} 을 쓰지 않는다 — dmb 패키지 불변 I19(LayoutStaticGuardTest). 트랜잭션은 OASIS
 * action 한 건이며, 새 버전은 모든 검사를 끝낸 뒤 버전 행 → 항목·헤더 구성·재정의 순으로 쓴다(저장 {@code save} 와 같은 규칙).
 * 상태·소유자를 바꾸는 공통 서비스는 자기 트랜잭션 경계를 갖고 OASIS 트랜잭션에 합류한다.
 */
@Service
public class LayoutVersionService {

    /** 승인 흐름 상태 — 공통 가드의 미적용 판정(DRAFT·미래 RELEASED)에 들지 않으므로 룰 세트처럼 따로 막는다. */
    private static final Set<String> IN_APPROVAL = Set.of("REQUESTED", "APPROVED");
    private static final String DEPRECATED = "DEPRECATED";

    private final LayoutVersionStore store;
    private final LayoutWriter writer;
    private final MdmLayoutRepository layoutRepository;
    private final VersionWriteGuard writeGuard;
    private final VersionStateService stateService;
    private final DraftOwnershipService ownership;
    private final MdmCurrentUser currentUser;

    public LayoutVersionService(LayoutVersionStore store, LayoutWriter writer, MdmLayoutRepository layoutRepository,
                                VersionWriteGuard writeGuard, VersionStateService stateService, DraftOwnershipService ownership,
                                MdmCurrentUser currentUser) {
        this.store = store;
        this.writer = writer;
        this.layoutRepository = layoutRepository;
        this.writeGuard = writeGuard;
        this.stateService = stateService;
        this.ownership = ownership;
        this.currentUser = currentUser;
    }

    /**
     * 새 버전(action copy). 번호 = 그 레이아웃 버전 최대값에서 {@code verKind} 로 올린 값(비면 MAJOR), 소유자 = 만든 사람, row_version 0.
     * 버전이 하나도 없으면(유일한 DRAFT 를 지운 레이아웃) 빈 1.000 MAJOR DRAFT 를 만든다 — 항목·헤더 구성·재정의 없음(룰 세트와 같다,
     * Ruling P3-11). 버전이 있는데 RELEASED 가 없으면 거부한다.
     */
    public LayoutVersionResult newVersion(LayoutVersionRequest request, String kind) {
        VersionKind verKind = VersionRules.parseKind(request.getVerKind());
        MdmLayout layout = load(request.getLayoutId(), kind);
        if (DEPRECATED.equals(layout.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "폐기한 레이아웃은 새 버전을 만들 수 없습니다", List.of());
        }
        String id = String.valueOf(layout.getLayoutId());
        writeGuard.checkCanCreateVersion(VersionTarget.LAYOUT, id);                         // MDM006
        List<MdmLayoutVer> versions = store.versions(layout.getLayoutId());
        if (inApproval(versions)) {
            throw MdmErrors.of(MdmErrorCode.UNAPPLIED_VERSION_EXISTS);
        }
        Optional<MdmLayoutVer> source = LayoutVersions.latestReleased(versions);
        if (source.isEmpty() && !versions.isEmpty()) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "복사할 확정 버전이 없습니다 — 첫 DRAFT 를 확정하십시오", List.of());
        }
        // 버전이 없으면 max = null → MAJOR 1.000, MINOR 는 nextNumber 가 거부한다
        BigDecimal next = VersionRules.nextNumber(versions.isEmpty() ? null : LayoutVersions.maxVer(versions), verKind);
        MdmLayoutVer created = new MdmLayoutVer(layout.getLayoutId(), next, verKind, currentUser.userId());
        source.ifPresent(s -> {
            created.setBaseVer(s.getVer());
            created.setEaiCode(s.getEaiCode());
            created.setOwnLength(s.getOwnLength());
        });
        store.save(created);                                                                   // FK: 버전 행 먼저
        source.ifPresent(s -> writer.copyVersionRows(layout.getLayoutId(), s.getVer(), next));
        return new LayoutVersionResult(layout.getLayoutId(), VersionNumbers.plain(next), verKind.name(), 0L);
    }

    /**
     * action delete — target {@code CONFIRM} 이면 확정 취소, {@code VERSION}(비면 기본)이면 DRAFT 삭제. 그 밖의 값은 INVALID_VALUE 로
     * 거부한다(2단계 J6 와 같은 결, Ruling P3-12).
     */
    public LayoutVersionResult delete(LayoutVersionRequest request, String kind) {
        String target = request.getTarget() == null || request.getTarget().isBlank() ? LayoutVersionRequest.TARGET_VERSION
                : request.getTarget().trim();
        if (LayoutVersionRequest.TARGET_CONFIRM.equals(target)) {
            return cancelConfirm(request, kind);
        }
        if (LayoutVersionRequest.TARGET_VERSION.equals(target)) {
            return deleteDraft(request, kind);
        }
        throw new BusinessException(ErrorCode.INVALID_VALUE, "삭제 대상은 VERSION·CONFIRM 중 하나여야 합니다: " + target);
    }

    /** DRAFT 삭제(delete target VERSION). 소유자·DRAFT·row_version 은 공통 서비스가, 자식 행 정리는 {@link LayoutDraftDeletion} 이 한다. */
    public LayoutVersionResult deleteDraft(LayoutVersionRequest request, String kind) {
        VersionRef ref = ref(load(request.getLayoutId(), kind), request.getVer());
        stateService.deleteDraft(ref, LayoutVersions.requireRowVersion(request.getRowVersion()), currentUser.userId());
        return result(ref, null);
    }

    /** 확정 취소(delete target CONFIRM, ADR-0002 D8) — 아직 적용 시각이 오지 않은 확정 버전을 작성 중으로 되돌린다. */
    public LayoutVersionResult cancelConfirm(LayoutVersionRequest request, String kind) {
        VersionRef ref = ref(load(request.getLayoutId(), kind), request.getVer());
        stateService.cancelConfirm(ref, LayoutVersions.requireRowVersion(request.getRowVersion()), currentUser.userId());
        return result(ref, null);
    }

    /** 선점 — 공통 서비스가 담당자 역할(MDM013)·빈 소유자(MDM004)를 본다. 새 row_version 을 돌려준다. */
    public LayoutVersionResult lock(LayoutVersionRequest request, String kind) {
        VersionRef ref = ref(load(request.getLayoutId(), kind), request.getVer());
        return result(ref, ownership.acquire(ref, LayoutVersions.requireRowVersion(request.getRowVersion()), currentUser.userId()));
    }

    /** 해제 — 소유자만(MDM003). */
    public LayoutVersionResult unlock(LayoutVersionRequest request, String kind) {
        VersionRef ref = ref(load(request.getLayoutId(), kind), request.getVer());
        return result(ref, ownership.release(ref, LayoutVersions.requireRowVersion(request.getRowVersion()), currentUser.userId()));
    }

    /** 넘기기 — 소유자만(MDM003), 받는 사람은 담당자(MDM005). */
    public LayoutVersionResult handover(LayoutVersionRequest request, String kind) {
        VersionRef ref = ref(load(request.getLayoutId(), kind), request.getVer());
        return result(ref, ownership.handover(ref, LayoutVersions.requireRowVersion(request.getRowVersion()), currentUser.userId(),
                request.getNewOwnerId()));
    }

    /**
     * 화면 새 버전 버튼 — 폐기했거나, 미적용 버전(DRAFT·미래 RELEASED)·승인 흐름 버전이 있거나, 버전은 있는데 복사할 RELEASED 가 없으면 둘
     * 다 false(마스터코드·룰과 같은 이름). 버전이 하나도 없으면 major 만 켜고 다음 번호는 1.000 이다(Ruling P3-11). 다음 번호는 그 버튼이
     * 켜질 때만 채운다. 이미 읽은 버전 목록으로만 계산한다(조회 수를 늘리지 않는다).
     */
    public Map<String, Object> flags(List<MdmLayoutVer> versions, String layoutStatus, LocalDateTime now) {
        boolean allowed = !DEPRECATED.equals(layoutStatus) && !LayoutVersions.hasUnapplied(versions, now) && !inApproval(versions)
                && (versions.isEmpty() || LayoutVersions.latestReleased(versions).isPresent());
        BigDecimal max = versions.isEmpty() ? null : LayoutVersions.maxVer(versions);
        VersionRules.NewVersionFlags nv = VersionRules.newVersionFlags(max, allowed);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("canNewMajor", nv.canNewMajor());
        out.put("canNewMinor", nv.canNewMinor());
        out.put("nextMajor", nv.canNewMajor() ? nv.nextMajor() : null);
        out.put("nextMinor", nv.canNewMinor() ? nv.nextMinor() : null);
        return out;
    }

    private static boolean inApproval(Collection<MdmLayoutVer> versions) {
        return versions.stream().anyMatch(v -> IN_APPROVAL.contains(v.getStatus()));
    }

    private MdmLayout load(Long layoutId, String kind) {
        MdmLayout l = layoutId == null ? null : layoutRepository.findById(layoutId).orElse(null);
        if (l == null || !kind.equals(l.getLayoutKind())) {
            throw LayoutRejections.notFound(layoutId, kind);
        }
        return l;
    }

    private static VersionRef ref(MdmLayout layout, String ver) {
        return new VersionRef(VersionTarget.LAYOUT, String.valueOf(layout.getLayoutId()), LayoutVersions.requireVer(ver));
    }

    private static LayoutVersionResult result(VersionRef ref, Long rowVersion) {
        return new LayoutVersionResult(Long.valueOf(ref.objectId()), VersionNumbers.plain(ref.ver()), null, rowVersion);
    }
}
