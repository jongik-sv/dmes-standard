package com.dongkuk.dmes.mdm.common.version;

import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireDraft;
import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireFutureUnapplied;
import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireOwner;
import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireReleased;
import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireRowVersion;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;
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
import com.dongkuk.dmes.mdm.contract.version.DraftWriter;
import com.dongkuk.dmes.mdm.contract.version.NewVersionCommand;
import com.dongkuk.dmes.mdm.contract.version.ParentPromotion;
import com.dongkuk.dmes.mdm.contract.version.SourcePicker;
import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionSnapshot;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 버전 상태 서비스 — 담당자 확정 DRAFT→RELEASED, DRAFT 삭제(TSK-01-03 B18, design.md §2.3), 확정 취소
 * RELEASED(미적용)→DRAFT(TSK-02-01 D4-1, ADR-0002 D8), 새 버전(BE 리팩토링 2회차 C3).
 *
 * <p>확정은 한 트랜잭션이다(불변 규칙 I2): 사전 검사 → apply_from 순서 → 확정 검사 SPI → DRAFT 조건부 UPDATE →
 * 직전 RELEASED 닫기 → 부모 CREATED→INUSE. 하나라도 실패하면 전부 롤백되어 DRAFT 가 그대로 남는다. 새 버전도 한 트랜잭션이다:
 * 미적용 버전 가드 → 원천 고르기 → 번호 → DRAFT 쓰기 → 부모 승격. 대상마다 다른 단계는 손잡이 세 개({@link SourcePicker}·{@link DraftWriter}·{@link ParentPromotion})로 받는다.
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
    private final MetaRevisionRecorder recorder;

    public DefaultVersionStateService(PlatformTransactionManager transactionManager, VersionRowStore store,
                                      MdmCurrentUser currentUser, ApplyFromOrderCheck applyFromOrderCheck,
                                      VersionSpiRegistry spis, MdmNativeAuditSupport audit, Clock clock,
                                      MetaRevisionRecorder recorder) {
        this.tx = new TransactionTemplate(transactionManager);
        this.store = store;
        this.pre = new VersionPreconditions(currentUser, store);
        this.applyFromOrderCheck = applyFromOrderCheck;
        this.spis = spis;
        this.audit = audit;
        this.clock = clock;
        this.recorder = recorder;
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
            record(ref);
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

    @Override
    public void cancelConfirm(VersionRef released, long expectedRowVersion, String userId) {
        tx.executeWithoutResult(status -> {
            LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);

            pre.requireSteward();
            VersionRow row = pre.loadOrConflict(released);
            requireOwner(row, userId);
            requireRowVersion(row, expectedRowVersion);
            requireReleased(row);          // D8-1 — RELEASED 가 아니면 MDM002
            requireFutureUnapplied(row, now); // D8-1 — 이미 적용됐으면 MDM025

            AuditStamp stamp = audit.currentStamp();
            int reverted = store.casCancelConfirm(released, expectedRowVersion, stamp);
            if (reverted == 0) {
                throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
            }
            requireOneRow(reverted, "확정 취소", released);

            // D8-6 — 확정이 닫은 직전 RELEASED 의 적용 구간을 다시 연다. 없으면(최초 버전) 복구 대상이 없다.
            previousReleased(row).ifPresent(previous -> {
                // D8-6 안전장치 — 덮어쓸 값이 확정 때 닫힌 값과 같을 때만 연다. 다르면 동시 변경이므로 멈춘다.
                if (previous.applyTo() == null || !previous.applyTo().equals(row.applyFrom())) {
                    throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
                }
                requireOneRow(store.reopenApplyTo(previous.ref(), stamp), "직전 버전 구간 복구", previous.ref());
            });

            // Ruling P3-22·P3-23 — 대상별 취소 검사(취소 뒤 상태를 원장에서 읽어 판정). 던지면 취소 전체가 되돌아간다. 등록이 없으면 아무것도 안 한다
            spis.confirmCancelCheck(released.target()).afterConfirmCancel(released);

            // D8-8 — 상위 CREATED/INUSE 는 되돌리지 않는다(조회가 계산값을 돌려준다, D6).
            record(released);
        });
    }

    /**
     * 새 버전(C3). 순서와 오류는 계약 {@link VersionStateService#newVersion} 이 정본이다. 대상에 따라 필요한 화면 앞단 검사(예: 객체
     * 읽기·외부 원천(EXTERNAL)·폐기·담당자 역할·결재 중)는 호출자가 이 호출 전에 끝낸다. 미적용 판정과 승격 판정의 {@code now} 는
     * 초 단위로 자른다(확정·가드와 같다).
     */
    @Override
    public VersionRef newVersion(NewVersionCommand command, SourcePicker source, DraftWriter writer, ParentPromotion promotion) {
        return tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
            List<VersionRow> rows = store.findAll(command.target(), command.objectId());
            VersionPreconditions.requireNoUnapplied(rows, now);                                   // MDM006
            List<VersionSnapshot> all = rows.stream()
                    .map(row -> new VersionSnapshot(row.ref().ver(), row.status(), row.applyFrom())).toList();
            Optional<BigDecimal> picked = source.pick(all);
            BigDecimal max = VersionNumbers.maxVer(all.stream().map(VersionSnapshot::ver).toList());
            VersionRef draft = new VersionRef(command.target(), command.objectId(), VersionRules.nextNumber(max, command.kind()));
            writer.write(draft, command.kind(), command.actorId(), picked);
            if (rows.stream().anyMatch(row -> isApplied(row, now))) {
                promotion.promote(command.target(), command.objectId());
            }
            return draft;
        });
    }

    /** 적용된 RELEASED — 적용 시작이 {@code now} 이전이거나 같다({@code RuleVersions.effectiveStatus} 와 같은 판정). */
    private static boolean isApplied(VersionRow row, LocalDateTime now) {
        return VersionStatus.RELEASED.name().equals(row.status()) && row.applyFrom() != null && !row.applyFrom().isAfter(now);
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

    /**
     * 메타 캐시 무효화(spec 2026-10-02 §3.3) — 확정·확정 취소는 룰·코드·룰 세트(D-144 2단계)·레이아웃(3단계) 공통이라 여기 한 곳에서 기록한다.
     * 호출하는 쪽({@code RuleConfirmService}·{@code RuleSetConfirmService}·{@code RuleSetVersionService}·{@code LayoutConfirmService}·
     * {@code LayoutVersionService} 등)에 또 걸면 이중 기록이다. DRAFT 삭제·새 버전은 RELEASED 를 바꾸지 않아 기록하지 않는다. switch 식이라
     * {@code VersionTarget} 에 대상이 늘면 여기서 컴파일이 깨져 기록 누락을 막는다. 레이아웃은 헤더의 RELEASED 가 바뀌면 그 헤더를 쌓은 전문의
     * 시각 T 합성도 바뀌므로 쌓은 전문까지 펼친다 — 그 펼침은 레이아웃이 등록한 「RELEASED 변경」 SPI
     * ({@link com.dongkuk.dmes.mdm.contract.version.VersionReleasedChangeSpi VersionReleasedChangeSpi})가 한다. 공통 서비스는
     * {@code VersionSpiRegistry.releasedChange} 로 조회만 한다(dmb 를 직접 알지 않게, C4). 등록이 없으면 실패한다.
     */
    private void record(VersionRef ref) {
        Runnable write = switch (ref.target()) {
            case BUSINESS_RULE -> () -> recorder.rule(ref.objectId());
            case MASTER_CODE -> () -> recorder.code(ref.objectId());
            case RULE_SET -> () -> recorder.ruleSet(ref.objectId());
            case LAYOUT -> () -> spis.releasedChange(VersionTarget.LAYOUT).afterReleasedChange(ref);
            // ERD 모델은 메타 캐시 대상이 아니다(MetaTargetType 에 없음) — 기록할 것이 없다.
            case ERD_MODEL -> () -> { };
        };
        write.run();
    }
}
