package com.dongkuk.dmes.mdm.common.version;

import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireDraft;
import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireOwner;
import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireRowVersion;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.version.ApplyFromOrderCheck;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCommand;
import com.dongkuk.dmes.mdm.contract.version.ConfirmResult;
import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 버전 상태 서비스 — 담당자 확정 DRAFT→RELEASED 와 DRAFT 삭제(TSK-01-03 B18, design.md §2.3).
 *
 * <p>확정은 한 트랜잭션이다(불변 규칙 I2): 사전 검사 → apply_from 순서 → 확정 검사 SPI → DRAFT 조건부 UPDATE →
 * 직전 RELEASED 닫기 → 부모 CREATED→INUSE. 하나라도 실패하면 전부 롤백되어 DRAFT 가 그대로 남는다.
 * {@code @Transactional} 을 쓰지 않는다(CGLIB 프록시가 OASIS 파라미터 이름을 잃는다, F19) — {@link TransactionTemplate}
 * 이 호출자 트랜잭션에 합류하거나 새로 연다.
 */
@Service
public class DefaultVersionStateService implements VersionStateService {

    private final TransactionTemplate tx;
    private final VersionRowStore store;
    private final VersionPreconditions pre;
    private final ApplyFromOrderCheck applyFromOrderCheck;
    private final VersionSpiRegistry spis;
    private final MdmNativeAuditSupport audit;
    private final Clock clock;

    public DefaultVersionStateService(PlatformTransactionManager transactionManager, VersionRowStore store,
                                      MdmCurrentUser currentUser, ApplyFromOrderCheck applyFromOrderCheck,
                                      VersionSpiRegistry spis, MdmNativeAuditSupport audit, Clock clock) {
        this.tx = new TransactionTemplate(transactionManager);
        this.store = store;
        this.pre = new VersionPreconditions(currentUser, store);
        this.applyFromOrderCheck = applyFromOrderCheck;
        this.spis = spis;
        this.audit = audit;
        this.clock = clock;
    }

    @Override
    public ConfirmResult confirm(ConfirmCommand command) {
        LocalDateTime applyFrom = validApplyFrom(command.applyFrom());
        VersionRef ref = command.draft();
        long expected = command.expectedRowVersion();
        return tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);

            pre.requireSteward();
            VersionRow draft = pre.loadOrConflict(ref);
            requireOwner(draft, command.confirmerId());
            requireRowVersion(draft, expected);
            requireDraft(draft);
            pre.requireSingleUnapplied(ref, now);

            Optional<VersionRow> previous = previousReleased(draft);
            LocalDateTime previousApplyFrom = previous.map(VersionRow::applyFrom).orElse(null);
            applyFromOrderCheck.check(previousApplyFrom, applyFrom).ifPresent(issue -> {
                throw MdmErrors.of(MdmErrorCode.APPLY_FROM_NOT_AFTER_PREVIOUS, List.of(issue));
            });

            ConfirmCheckResult result = spis.confirmCheck(ref.target()).check(
                    new ConfirmCheckRequest(draft.ref(), applyFrom, previousApplyFrom, command.confirmerId(), now));
            List<MdmCheckIssue> errors = result.errors() == null ? List.of() : result.errors();
            List<MdmCheckIssue> warnings = result.warnings() == null ? List.of() : result.warnings();
            if (!errors.isEmpty()) {
                throw MdmErrors.of(MdmErrorCode.CONFIRM_CHECK_FAILED, errors);
            }
            if (!warnings.isEmpty() && !command.warningsAcknowledged()) {
                throw MdmErrors.of(MdmErrorCode.CONFIRM_WARNINGS_NOT_ACKNOWLEDGED, warnings);
            }

            AuditStamp stamp = audit.currentStamp();
            int confirmed = store.casConfirm(draft.ref(), expected, applyFrom, command.confirmerId(), now, stamp);
            if (confirmed == 0) {
                throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
            }
            requireOneRow(confirmed, "확정", draft.ref());
            if (previous.isPresent()) {
                requireOneRow(store.closeApplyTo(previous.get().ref(), applyFrom, stamp), "직전 버전 닫기",
                        previous.get().ref());
            }
            if (!applyFrom.isAfter(now)) {
                store.markParentInUse(ref.target(), ref.objectId(), stamp);
            }
            return new ConfirmResult(draft.ref(), expected + VersionConventions.ROW_VERSION_STEP,
                    previous.map(VersionRow::ref).orElse(null), List.copyOf(warnings));
        });
    }

    @Override
    public void deleteDraft(VersionRef ref, long expectedRowVersion, String userId) {
        tx.executeWithoutResult(status -> {
            VersionRow draft = pre.loadOrConflict(ref);
            requireOwner(draft, userId);
            requireRowVersion(draft, expectedRowVersion);
            requireDraft(draft);

            spis.draftDeletion(ref.target()).beforeDraftDelete(draft.ref());
            if (store.casDeleteDraft(draft.ref(), expectedRowVersion) == 0) {
                throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
            }
        });
    }

    /** 같은 객체에서 draft 보다 VER 가 작은 RELEASED 중 가장 큰 것. 없으면 최초 버전. */
    private Optional<VersionRow> previousReleased(VersionRow draft) {
        VersionRef ref = draft.ref();
        VersionRow best = null;
        for (VersionRow row : store.findAll(ref.target(), ref.objectId())) {
            if (VersionStatus.RELEASED.name().equals(row.status())
                    && row.ref().ver().compareTo(ref.ver()) < 0
                    && (best == null || row.ref().ver().compareTo(best.ref().ver()) > 0)) {
                best = row;
            }
        }
        return Optional.ofNullable(best);
    }

    private static LocalDateTime validApplyFrom(LocalDateTime applyFrom) {
        if (applyFrom == null) {
            String message = "적용 시작 일시를 입력하세요";
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, message,
                    List.of(ErrorDetail.ofGrid(null, null, "applyFrom", ErrorCode.REQUIRED_VALUE.getCode(), message)));
        }
        LocalDateTime seconds = applyFrom.truncatedTo(ChronoUnit.SECONDS);
        if (!seconds.isBefore(VersionConventions.OPEN_END)) {
            String message = "적용 시작 일시는 9999-12-31 00:00:00 보다 앞이어야 합니다";
            throw new BusinessException(ErrorCode.INVALID_VALUE, message,
                    List.of(ErrorDetail.ofGrid(null, null, "applyFrom", ErrorCode.INVALID_VALUE.getCode(), message)));
        }
        return seconds;
    }

    private static void requireOneRow(int updated, String step, VersionRef ref) {
        if (updated != 1) {
            throw new IllegalStateException(step + " 갱신 행 수가 1이 아닙니다: " + updated + " " + ref);
        }
    }
}
