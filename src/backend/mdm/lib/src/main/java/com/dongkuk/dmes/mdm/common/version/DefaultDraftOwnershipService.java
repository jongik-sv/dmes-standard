package com.dongkuk.dmes.mdm.common.version;

import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireDraft;
import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireOwner;
import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireRowVersion;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.security.MdmStewardDirectory;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.version.DraftOwnershipService;
import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * DRAFT 소유권 — 선점·해제·넘기기(TSK-01-03 B19, ADR-0002 D3, 원천 04:303).
 *
 * <p>관리자 강제 해제·넘기기 경로는 없다(메서드도 없다). 해제는 역할을 요구하지 않는다 — 역할을 잃은 소유자도 풀 수
 * 있어야 DRAFT 가 묶이지 않는다. 넘겨받는 사람은 담당자여야 한다(MDM005, D7).
 */
@Service
public class DefaultDraftOwnershipService implements DraftOwnershipService {

    private final TransactionTemplate tx;
    private final VersionRowStore store;
    private final VersionPreconditions pre;
    private final MdmStewardDirectory stewards;
    private final MdmNativeAuditSupport audit;

    public DefaultDraftOwnershipService(PlatformTransactionManager transactionManager, VersionRowStore store,
                                        MdmCurrentUser currentUser, MdmStewardDirectory stewards,
                                        MdmNativeAuditSupport audit) {
        this.tx = new TransactionTemplate(transactionManager);
        this.store = store;
        this.pre = new VersionPreconditions(currentUser, store);
        this.stewards = stewards;
        this.audit = audit;
    }

    @Override
    public long acquire(VersionRef draft, long expectedRowVersion, String userId) {
        return tx.execute(status -> {
            pre.requireSteward();
            VersionRow row = pre.loadOrConflict(draft);
            requireRowVersion(row, expectedRowVersion);
            requireDraft(row);
            if (row.ownerId() != null) {
                // 04:303 "비어 있지 않으면 선점할 수 없다" — 자기 자신이어도 같다.
                throw MdmErrors.of(MdmErrorCode.DRAFT_ALREADY_OWNED);
            }
            return setOwner(row, expectedRowVersion, userId, true);
        });
    }

    @Override
    public long release(VersionRef draft, long expectedRowVersion, String ownerId) {
        return tx.execute(status -> {
            VersionRow row = pre.loadOrConflict(draft);
            requireOwner(row, ownerId);
            requireRowVersion(row, expectedRowVersion);
            requireDraft(row);
            return setOwner(row, expectedRowVersion, null, false);
        });
    }

    @Override
    public long handover(VersionRef draft, long expectedRowVersion, String ownerId, String newOwnerId) {
        return tx.execute(status -> {
            VersionRow row = pre.loadOrConflict(draft);
            requireOwner(row, ownerId);
            requireRowVersion(row, expectedRowVersion);
            requireDraft(row);
            if (newOwnerId == null || newOwnerId.isBlank() || newOwnerId.equals(ownerId)) {
                throw MdmErrors.of(MdmErrorCode.HANDOVER_TARGET_NOT_STEWARD);
            }
            if (!stewards.isSteward(newOwnerId)) {
                throw MdmErrors.of(MdmErrorCode.HANDOVER_TARGET_NOT_STEWARD);
            }
            return setOwner(row, expectedRowVersion, newOwnerId, false);
        });
    }

    private long setOwner(VersionRow row, long expected, String newOwner, boolean requireOwnerNull) {
        if (store.casSetOwner(row.ref(), expected, newOwner, requireOwnerNull, audit.currentStamp()) == 0) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
        return expected + VersionConventions.ROW_VERSION_STEP;
    }
}
