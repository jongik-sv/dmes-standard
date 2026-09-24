package com.dongkuk.dmes.mdm.common.segment;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentResult;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 항목 저장 코어 — 화면·CSV·API 세 경로가 같은 선분 저장을 쓴다(wbs TSK-07-03 fan_in, D3). OASIS 진입점이 아니다.
 *
 * <p>한 사건의 순서는 고정이다(design.md §1):
 * ① 저장 시각 → ② {@link DataSegmentLock#lock} (선분·마루 데이터 행을 읽기 전, L1) → ③ 잠금 뒤 네이티브 재조회 →
 * ④ 검사 1~7 → ⑤ row_version 비교(S4) → ⑥ 경계 확정(S9) → ⑦ {@link DataItemSegmentStore} 연산.
 *
 * <p>{@code @Transactional} 을 쓰지 않는다(F11) — {@link TransactionTemplate} 이 호출자(OASIS 프로세스) 트랜잭션에 합류하거나
 * 새로 연다. 배포 순번은 발급하지 않는다(S12).
 */
@Component
public class DataItemSaveCore {

    private final TransactionTemplate tx;
    private final DataSegmentLock lock;
    private final DataSegmentRowStore rows;
    private final DataItemSegmentStore store;
    private final DataItemChecks checks;
    private final Clock clock;

    public DataItemSaveCore(PlatformTransactionManager transactionManager, DataSegmentLock lock, DataSegmentRowStore rows,
                            DataItemSegmentStore store, DataItemChecks checks, Clock clock) {
        this.tx = new TransactionTemplate(transactionManager);
        this.lock = lock;
        this.rows = rows;
        this.store = store;
        this.checks = checks;
        this.clock = clock;
    }

    // ── 화면 경로(항목 1건) ─────────────────────────────────────────────────

    /** 등록 — 그 키의 행이 하나도 없을 때만(S8). 닫힌 키는 다시 열기를 안내한다(수용 기준 3). */
    public SaveOutcome register(String maruDataId, String code, DataItemValue value) {
        return tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now(clock);
            LockedMaruData data = lock.lock(maruDataId);
            List<ItemSegmentRow> own = rows.itemRows(maruDataId, code);
            checks.requireActive(data);
            checks.requireSourcePath(DataSavePath.SCREEN, data, null);
            List<MdmCheckIssue> issues = new ArrayList<>(checks.contentIssues(DataSavePath.SCREEN, data, code, value, true,
                    HierarchyIndex.of(rows.latestItemRows(maruDataId))));
            if (!own.isEmpty()) {
                String message = SegmentRow.firstOpen(own) != null ? DataItemMessages.KEY_EXISTS
                        : DataItemMessages.CLOSED_KEY_REOPEN;
                issues.add(DataItemChecks.issue("CHK6", message, "code", code));
            }
            if (!issues.isEmpty()) {
                throw DataItemChecks.rejected(issues);
            }
            LocalDateTime at = SegmentBoundary.next(now, own);
            store.register(new DataItemKey(maruDataId, code), value, at);
            return outcome(MdmTemporalSegmentAction.INSERT, maruDataId, code, at);
        });
    }

    /** 수정 — 열린 행을 at 에 닫고 같은 at 의 새 행(S1). 값이 같으면 NONE(S5). */
    public SaveOutcome modify(String maruDataId, String code, DataItemValue value, int expectedRowVersion) {
        return tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now(clock);
            LockedMaruData data = lock.lock(maruDataId);
            List<ItemSegmentRow> own = rows.itemRows(maruDataId, code);
            checks.requireActive(data);
            checks.requireSourcePath(DataSavePath.SCREEN, data, null);
            ItemSegmentRow open = requireOpen(own, code);
            List<MdmCheckIssue> issues = checks.contentIssues(DataSavePath.SCREEN, data, code, value, false,
                    HierarchyIndex.of(rows.latestItemRows(maruDataId)));
            if (!issues.isEmpty()) {
                throw DataItemChecks.rejected(issues);
            }
            requireRowVersion(last(own), expectedRowVersion);
            LocalDateTime at = SegmentBoundary.next(now, own);
            MdmTemporalSegmentResult<DataItemValue> result = store.modifyOpen(open, value, at, expectedRowVersion);
            return outcome(result.action(), maruDataId, code, at);
        });
    }

    /** 닫기 — 열린 행 valid_to = at(S6). 닫는 행 row_version +1(D7). */
    public SaveOutcome close(String maruDataId, String code, int expectedRowVersion) {
        return tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now(clock);
            LockedMaruData data = lock.lock(maruDataId);
            List<ItemSegmentRow> own = rows.itemRows(maruDataId, code);
            checks.requireActive(data);
            checks.requireSourcePath(DataSavePath.SCREEN, data, null);
            requireOpen(own, code);
            requireRowVersion(last(own), expectedRowVersion);
            LocalDateTime at = SegmentBoundary.next(now, own);
            store.close(new DataItemKey(maruDataId, code), at, expectedRowVersion);
            return outcome(MdmTemporalSegmentAction.CLOSE, maruDataId, code, at);
        });
    }

    /** 다시 열기 — 열린 행이 없을 때만, 마지막 행 값 복사(S7). 계층 대조(5-1)를 다시 돈다. */
    public SaveOutcome reopen(String maruDataId, String code, int expectedRowVersion) {
        return tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now(clock);
            LockedMaruData data = lock.lock(maruDataId);
            List<ItemSegmentRow> own = rows.itemRows(maruDataId, code);
            checks.requireActive(data);
            checks.requireSourcePath(DataSavePath.SCREEN, data, null);
            if (own.isEmpty()) {
                throw DataItemChecks.rejected(List.of(DataItemChecks.issue("KEY", DataItemMessages.KEY_NOT_FOUND + ": "
                        + code, "code", code)));
            }
            if (SegmentRow.firstOpen(own) != null) {
                throw DataItemChecks.rejected(List.of(DataItemChecks.issue("KEY", DataItemMessages.ALREADY_OPEN,
                        "code", code)));
            }
            ItemSegmentRow last = last(own);
            List<MdmCheckIssue> issues = checks.hierarchyIssues(HierarchyIndex.of(rows.latestItemRows(maruDataId)), code,
                    last.value());
            if (!issues.isEmpty()) {
                throw DataItemChecks.rejected(issues);
            }
            requireRowVersion(last, expectedRowVersion);
            LocalDateTime at = SegmentBoundary.next(now, own);
            store.reopen(new DataItemKey(maruDataId, code), at);
            return outcome(MdmTemporalSegmentAction.REOPEN, maruDataId, code, at);
        });
    }

    // ── CSV·API 경로(일괄 upsert) ──────────────────────────────────────────

    /**
     * 일괄 upsert — 없으면 INSERT, 바뀌었으면 UPDATE, 같으면 NONE(C6). 한 트랜잭션·한 저장 시각이다.
     *
     * <ul>
     *   <li>검사 1·2 는 즉시 거부한다(던진다). 행 내용 검사(3~5-2)는 CSV 만 돈다(C0).</li>
     *   <li>CSV 는 닫힌 키를 거부한다(CSV 로 다시 열지 않는다, 05 「CSV 형식」). API 는 닫힌 키를 다시 열고 받은 값으로
     *       새 행을 만든다(REOPEN, D12 — closed 플래그 미구현).</li>
     *   <li>이슈가 하나라도 있거나 {@code dryRun} 이면 아무 행도 쓰지 않고 행마다 예정 동작을 돌려준다.</li>
     * </ul>
     */
    public UpsertResult upsert(String maruDataId, DataSavePath path, String callerSystem, List<UpsertRow> input,
                               boolean dryRun) {
        return tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now(clock);
            LockedMaruData data = lock.lock(maruDataId);
            Map<String, ItemSegmentRow> latest = new LinkedHashMap<>();
            for (ItemSegmentRow row : rows.latestItemRows(maruDataId)) {
                latest.put(row.key().code(), row);
            }
            checks.requireActive(data);
            checks.requireSourcePath(path, data, callerSystem);

            HierarchyIndex index = HierarchyIndex.of(latest.values());
            List<MdmCheckIssue> issues = new ArrayList<>();
            List<UpsertResult.RowAction> actions = new ArrayList<>(input.size());
            List<ItemSegmentRow> touched = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            for (UpsertRow row : input) {
                String code = row.code();
                if (!seen.add(code)) {
                    issues.add(DataItemChecks.issue("CHK6", DataItemMessages.DUPLICATE_IN_BATCH + ": " + code, "code", code));
                    actions.add(new UpsertResult.RowAction(code, MdmTemporalSegmentAction.NONE));
                    continue;
                }
                ItemSegmentRow current = latest.get(code);
                List<MdmCheckIssue> rowIssues = checks.contentIssues(path, data, code, row.value(), current == null, index);
                issues.addAll(rowIssues);
                MdmTemporalSegmentAction action;
                if (current == null) {
                    action = MdmTemporalSegmentAction.INSERT;
                } else if (!current.isOpen()) {
                    if (path == DataSavePath.API) {
                        action = MdmTemporalSegmentAction.REOPEN;
                    } else {
                        issues.add(DataItemChecks.issue("CHK6", DataItemMessages.CLOSED_KEY_REOPEN + ": " + code, "code",
                                code));
                        action = MdmTemporalSegmentAction.NONE;
                    }
                } else if (current.value().sameAs(row.value())) {
                    action = MdmTemporalSegmentAction.NONE;
                } else {
                    action = MdmTemporalSegmentAction.UPDATE;
                }
                if (path != DataSavePath.API && rowIssues.isEmpty()) {
                    index.put(code, row.value().lvlChain());
                }
                if (current != null && action != MdmTemporalSegmentAction.NONE) {
                    touched.add(current);
                }
                actions.add(new UpsertResult.RowAction(code, action));
            }
            if (!issues.isEmpty() || dryRun) {
                return new UpsertResult(actions, issues, null, false);
            }

            LocalDateTime at = SegmentBoundary.next(now, touched);
            for (int i = 0; i < input.size(); i++) {
                UpsertRow row = input.get(i);
                DataItemKey key = new DataItemKey(maruDataId, row.code());
                ItemSegmentRow current = latest.get(row.code());
                switch (actions.get(i).action()) {
                    case INSERT -> store.register(key, row.value(), at);
                    case UPDATE -> store.modifyOpen(current, row.value(), at, current.rowVersion());
                    case REOPEN -> store.reopenWith(current, row.value(), at);
                    default -> {
                        // NONE — 쓰지 않는다.
                    }
                }
            }
            return new UpsertResult(actions, List.of(), at, true);
        });
    }

    // ── 공통 ────────────────────────────────────────────────────────────────

    private ItemSegmentRow requireOpen(List<ItemSegmentRow> own, String code) {
        if (own.isEmpty()) {
            throw DataItemChecks.rejected(List.of(DataItemChecks.issue("KEY", DataItemMessages.KEY_NOT_FOUND + ": " + code,
                    "code", code)));
        }
        ItemSegmentRow open = SegmentRow.firstOpen(own);
        if (open == null) {
            throw DataItemChecks.rejected(List.of(DataItemChecks.issue("KEY", DataItemMessages.NOT_OPEN, "code", code)));
        }
        return open;
    }

    /** S4 — 잠금 뒤 읽은 그 키의 마지막 행 row_version 과 같아야 한다. */
    private static void requireRowVersion(ItemSegmentRow last, int expectedRowVersion) {
        if (last.rowVersion() != expectedRowVersion) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
    }

    private static ItemSegmentRow last(List<ItemSegmentRow> own) {
        return own.get(own.size() - 1);
    }

    private SaveOutcome outcome(MdmTemporalSegmentAction action, String maruDataId, String code, LocalDateTime at) {
        List<ItemSegmentRow> after = rows.itemRows(maruDataId, code);
        return new SaveOutcome(action, last(after), at);
    }
}
