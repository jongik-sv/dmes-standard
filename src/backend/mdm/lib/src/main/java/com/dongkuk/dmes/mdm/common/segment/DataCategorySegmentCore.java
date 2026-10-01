package com.dongkuk.dmes.mdm.common.segment;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.category.CategoryConventions;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentRules;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 카테고리·소속 선분 코어(D4 — 화면은 TSK-07-02 몫이고 이 Task 는 코어만 둔다). 순서는 {@link DataItemSaveCore} 와 같다:
 * 저장 시각 → 마루 데이터 행 잠금(L1) → 잠금 뒤 재조회 → 검사 → 경계 → {@link DataCateSegmentStore}·
 * {@link DataCateItemSegmentStore} 연산.
 *
 * <p>카테고리·소속은 원천과 무관하게 MDM 담당자가 편집한다(05 「원천」 정의는 MDM 몫) — 검사 2(원천)는 돌지 않는다.
 * 검사 1(DEPRECATED)은 돈다. 예약 카테고리 BASE 는 수정·닫기를 거부한다(S14).
 */
@Component
public class DataCategorySegmentCore {

    private final TransactionTemplate tx;
    private final DataSegmentLock lock;
    private final DataSegmentRowStore rows;
    private final DataCateSegmentStore cateStore;
    private final DataCateItemSegmentStore memberStore;
    private final DataItemChecks checks;
    private final Clock clock;

    public DataCategorySegmentCore(PlatformTransactionManager transactionManager, DataSegmentLock lock,
                                   DataSegmentRowStore rows, DataCateSegmentStore cateStore,
                                   DataCateItemSegmentStore memberStore, DataItemChecks checks, Clock clock) {
        this.tx = new TransactionTemplate(transactionManager);
        this.lock = lock;
        this.rows = rows;
        this.cateStore = cateStore;
        this.memberStore = memberStore;
        this.checks = checks;
        this.clock = clock;
    }

    public SegmentOutcome registerCate(String maruDataId, String cateId, DataCateValue value) {
        return tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now(clock);
            LockedMaruData data = lock.lock(maruDataId);
            List<CateSegmentRow> own = rows.cateRows(maruDataId, cateId);
            checks.requireActive(data);
            List<MdmCheckIssue> issues = new ArrayList<>(checks.cateDefIssues(cateId, value));
            if (!own.isEmpty()) {
                String message = SegmentRow.firstOpen(own) != null ? DataItemMessages.KEY_EXISTS
                        : DataItemMessages.CLOSED_KEY_REOPEN;
                issues.add(DataItemChecks.issue("CHK6", message, "cateId", cateId));
            }
            if (!issues.isEmpty()) {
                throw DataItemChecks.rejected(issues);
            }
            LocalDateTime at = SegmentBoundary.next(now, own);
            cateStore.register(new DataCateKey(maruDataId, cateId), value, at);
            return new SegmentOutcome(MdmTemporalSegmentAction.INSERT, at);
        });
    }

    public SegmentOutcome modifyCate(String maruDataId, String cateId, DataCateValue value) {
        return tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now(clock);
            LockedMaruData data = lock.lock(maruDataId);
            List<CateSegmentRow> own = rows.cateRows(maruDataId, cateId);
            checks.requireActive(data);
            requireNotBase(cateId);
            requireOpen(own, cateId);
            List<MdmCheckIssue> issues = checks.cateDefIssues(cateId, value);
            if (!issues.isEmpty()) {
                throw DataItemChecks.rejected(issues);
            }
            LocalDateTime at = SegmentBoundary.next(now, own);
            return new SegmentOutcome(cateStore.modify(new DataCateKey(maruDataId, cateId), value, at).action(), at);
        });
    }

    public SegmentOutcome closeCate(String maruDataId, String cateId) {
        return tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now(clock);
            LockedMaruData data = lock.lock(maruDataId);
            List<CateSegmentRow> own = rows.cateRows(maruDataId, cateId);
            checks.requireActive(data);
            requireNotBase(cateId);
            requireOpen(own, cateId);
            LocalDateTime at = SegmentBoundary.next(now, own);
            cateStore.close(new DataCateKey(maruDataId, cateId), at);
            return new SegmentOutcome(MdmTemporalSegmentAction.CLOSE, at);
        });
    }

    public SegmentOutcome reopenCate(String maruDataId, String cateId) {
        return tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now(clock);
            LockedMaruData data = lock.lock(maruDataId);
            List<CateSegmentRow> own = rows.cateRows(maruDataId, cateId);
            checks.requireActive(data);
            if (own.isEmpty()) {
                throw keyIssue(DataItemMessages.KEY_NOT_FOUND + ": " + cateId, cateId);
            }
            if (SegmentRow.firstOpen(own) != null) {
                throw keyIssue(DataItemMessages.ALREADY_OPEN, cateId);
            }
            LocalDateTime at = SegmentBoundary.next(now, own);
            cateStore.reopen(new DataCateKey(maruDataId, cateId), at);
            return new SegmentOutcome(MdmTemporalSegmentAction.REOPEN, at);
        });
    }

    /** 소속 등록 — 검사 7(C7). 닫힌 소속이 있으면 새 행으로 다시 소속(REOPEN), 없으면 첫 행(INSERT). */
    public SegmentOutcome addMember(String maruDataId, String cateId, String code) {
        return tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now(clock);
            LockedMaruData data = lock.lock(maruDataId);
            List<CateItemSegmentRow> own = rows.cateItemRows(maruDataId, cateId, code);
            List<MdmCheckIssue> issues = checks.membershipIssues(code, rows.itemRows(maruDataId, code),
                    rows.cateRows(maruDataId, cateId));
            checks.requireActive(data);
            if (!issues.isEmpty()) {
                throw DataItemChecks.rejected(issues);
            }
            if (own.stream().anyMatch(CateItemSegmentRow::isOpen)) {
                throw keyIssue(DataItemMessages.ALREADY_OPEN, code);
            }
            LocalDateTime at = SegmentBoundary.next(now, own);
            DataCateItemKey key = new DataCateItemKey(maruDataId, cateId, code);
            MdmTemporalSegmentAction action = own.isEmpty()
                    ? memberStore.register(key, null, at).action()
                    : memberStore.reopen(key, at).action();
            return new SegmentOutcome(action, at);
        });
    }

    /** 소속 해제 — 열린 소속 행을 닫는다. */
    public SegmentOutcome removeMember(String maruDataId, String cateId, String code) {
        return tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now(clock);
            LockedMaruData data = lock.lock(maruDataId);
            List<CateItemSegmentRow> own = rows.cateItemRows(maruDataId, cateId, code);
            checks.requireActive(data);
            if (own.stream().noneMatch(CateItemSegmentRow::isOpen)) {
                throw keyIssue(DataItemMessages.NOT_OPEN, code);
            }
            LocalDateTime at = SegmentBoundary.next(now, own);
            memberStore.close(new DataCateItemKey(maruDataId, cateId, code), at);
            return new SegmentOutcome(MdmTemporalSegmentAction.CLOSE, at);
        });
    }

    /**
     * TABLE 소속 일괄 적용(R12) — {@code addCodes} 를 차례로 {@link #addMember}, 이어서 {@code removeCodes} 를 차례로
     * {@link #removeMember} 한 것과 판정·오류(어느 코드의 어떤 오류가 먼저인지)·쓰기가 같다. 한 트랜잭션이라 하나라도
     * 거부되면 아무 것도 남지 않는다.
     *
     * <p>단건 메서드는 소속마다 잠그고(L1) 소속 행·항목 행·카테고리 행을 다시 읽는다. 여기서는 값을 읽기 전에 한 번만
     * 잠그고(R2), 대상 코드의 소속 행·항목 행을 IN 으로 한 번, 카테고리 행을 한 번 읽는다. 앞 코드의 쓰기(새 소속·닫기)는
     * 메모리의 소속 행 목록에 반영해 다음 코드의 판정·경계(S9)가 단건 반복과 같게 한다. 검사를 모두 마친 뒤 쓴다. 두 목록이
     * 모두 비면 잠그지도 읽지도 않는다(단건 반복이 아무 것도 부르지 않던 것과 같다).
     */
    public void applyMembers(String maruDataId, String cateId, List<String> addCodes, List<String> removeCodes) {
        List<String> add = addCodes == null ? List.of() : addCodes;
        List<String> remove = removeCodes == null ? List.of() : removeCodes;
        if (add.isEmpty() && remove.isEmpty()) {
            return;
        }
        // 저장 시각은 잠금 전에 읽는다(DataItemSaveCore 와 같은 순서 — 클래스 설명).
        LocalDateTime now = LocalDateTime.now(clock);
        tx.executeWithoutResult(status -> {
            LockedMaruData data = lock.lock(maruDataId);
            List<String> all = new ArrayList<>(add);
            all.addAll(remove);
            Map<String, List<CateItemSegmentRow>> own = rows.cateItemRowsByCodes(maruDataId, cateId, all);
            Map<String, List<ItemSegmentRow>> items = add.isEmpty() ? Map.of() : rows.itemRowsByCodes(maruDataId, add);
            List<CateSegmentRow> cateRows = add.isEmpty() ? List.of() : rows.cateRows(maruDataId, cateId);
            List<Runnable> writes = new ArrayList<>();
            for (String code : add) {
                List<CateItemSegmentRow> mine = own.computeIfAbsent(code, k -> new ArrayList<>());
                List<MdmCheckIssue> issues = checks.membershipIssues(code, items.getOrDefault(code, List.of()), cateRows);
                checks.requireActive(data);
                if (!issues.isEmpty()) {
                    throw DataItemChecks.rejected(issues);
                }
                if (mine.stream().anyMatch(CateItemSegmentRow::isOpen)) {
                    throw keyIssue(DataItemMessages.ALREADY_OPEN, code);
                }
                LocalDateTime at = SegmentBoundary.next(now, mine);
                DataCateItemKey key = new DataCateItemKey(maruDataId, cateId, code);
                boolean first = mine.isEmpty();
                writes.add(() -> {
                    if (first) {
                        memberStore.register(key, null, at);
                    } else {
                        memberStore.reopen(key, at);
                    }
                });
                mine.add(new CateItemSegmentRow(key, at, MdmTemporalSegmentRules.OPEN_END, 0));
            }
            for (String code : remove) {
                List<CateItemSegmentRow> mine = own.computeIfAbsent(code, k -> new ArrayList<>());
                checks.requireActive(data);
                CateItemSegmentRow open = SegmentRow.firstOpen(mine);
                if (open == null) {
                    throw keyIssue(DataItemMessages.NOT_OPEN, code);
                }
                LocalDateTime at = SegmentBoundary.next(now, mine);
                DataCateItemKey key = new DataCateItemKey(maruDataId, cateId, code);
                writes.add(() -> memberStore.closeOpen(key, open.validFrom(), at));
                mine.set(mine.indexOf(open), new CateItemSegmentRow(open.key(), open.validFrom(), at, open.chgSeq()));
            }
            writes.forEach(Runnable::run);
        });
    }

    // ── 공통 ────────────────────────────────────────────────────────────────

    /** S14 — 예약 카테고리 BASE 는 편집·닫기를 할 수 없다. */
    private static void requireNotBase(String cateId) {
        if (CategoryConventions.BASE_CATE_ID.equals(cateId)) {
            throw MdmErrors.of(MdmErrorCode.RESERVED_CATEGORY);
        }
    }

    private static void requireOpen(List<CateSegmentRow> own, String cateId) {
        if (own.isEmpty()) {
            throw keyIssue(DataItemMessages.KEY_NOT_FOUND + ": " + cateId, cateId);
        }
        if (SegmentRow.firstOpen(own) == null) {
            throw keyIssue(DataItemMessages.NOT_OPEN, cateId);
        }
    }

    private static RuntimeException keyIssue(String message, String key) {
        return DataItemChecks.rejected(List.of(DataItemChecks.issue("KEY", message, "key", key)));
    }
}
