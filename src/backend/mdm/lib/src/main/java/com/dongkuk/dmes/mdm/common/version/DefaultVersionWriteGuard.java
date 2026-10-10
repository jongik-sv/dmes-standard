package com.dongkuk.dmes.mdm.common.version;

import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireDraft;
import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireOwner;
import static com.dongkuk.dmes.mdm.common.version.VersionPreconditions.requireRowVersion;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 버전 생성·DRAFT 저장 가드 — "미적용 버전 하나" 규칙(TSK-01-03 B20, 원천 04:284·293-301).
 */
@Service
public class DefaultVersionWriteGuard implements VersionWriteGuard {

    private final TransactionTemplate tx;
    private final VersionRowStore store;
    private final VersionPreconditions pre;
    private final MdmNativeAuditSupport audit;
    private final Clock clock;
    private final VersionSpiRegistry spiRegistry;

    public DefaultVersionWriteGuard(PlatformTransactionManager transactionManager, VersionRowStore store,
                                    MdmCurrentUser currentUser, MdmNativeAuditSupport audit, Clock clock,
                                    VersionSpiRegistry spiRegistry) {
        this.tx = new TransactionTemplate(transactionManager);
        this.store = store;
        this.pre = new VersionPreconditions(currentUser, store);
        this.audit = audit;
        this.clock = clock;
        this.spiRegistry = spiRegistry;
    }

    @Override
    public void checkCanCreateVersion(VersionTarget target, String objectId) {
        tx.executeWithoutResult(status -> {
            LocalDateTime now = now();
            for (VersionRow row : store.findAll(target, objectId)) {
                if (VersionPreconditions.isUnapplied(row, now)) {
                    throw MdmErrors.of(MdmErrorCode.UNAPPLIED_VERSION_EXISTS);
                }
            }
        });
    }

    @Override
    public long beginDraftWrite(VersionRef draft, long expectedRowVersion, String userId) {
        return tx.execute(status -> {
            LocalDateTime now = now();
            VersionRow row = pre.loadOrConflict(draft);
            // 소유자가 아니어도 그 대상에 공동 편집자 SPI 가 있고 userId 가 공동 편집자면 통과한다(ERD_MODEL, 스펙 D15).
            // 단 DRAFT 에 소유자가 있을 때만 SPI 를 묻는다 — 주인 없는 DRAFT(해제 뒤)는 먼저 선점해야 하므로 모두에게 MDM003 이다.
            // 그 밖에는 requireOwner 가 MDM003 을 그대로 던진다. 나머지 검사는 모두에게 같다.
            if (!isOwner(row, userId) && !(row.ownerId() != null && isCoEditor(draft, userId))) {
                requireOwner(row, userId);
            }
            requireRowVersion(row, expectedRowVersion);
            requireDraft(row);
            pre.requireSingleUnapplied(draft, now);
            if (store.casBumpRowVersion(row.ref(), expectedRowVersion, audit.currentStamp()) == 0) {
                throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
            }
            return expectedRowVersion + VersionConventions.ROW_VERSION_STEP;
        });
    }

    private static boolean isOwner(VersionRow row, String userId) {
        return row.ownerId() != null && row.ownerId().equals(userId);
    }

    private boolean isCoEditor(VersionRef draft, String userId) {
        return spiRegistry.coEditor(draft.target()).map(spi -> spi.isCoEditor(draft, userId)).orElse(false);
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }
}
