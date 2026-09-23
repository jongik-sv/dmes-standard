package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 전이 공통 사전 검사(TSK-01-03 B17, design.md §2.3). 검사 순서는 불변 규칙 I10 이다:
 * 역할(해당 시) → 행 읽기(없으면 MDM001) → 소유자 → row_version → 상태 DRAFT → 미적용 2개(해당 시).
 * 상태 검사가 row_version 보다 뒤라서, 먼저 끝난 확정과 겹친 두 번째 확정은 MDM002 가 아니라 MDM001 을 받는다.
 */
final class VersionPreconditions {

    private final MdmCurrentUser currentUser;
    private final VersionRowStore store;

    VersionPreconditions(MdmCurrentUser currentUser, VersionRowStore store) {
        this.currentUser = currentUser;
        this.store = store;
    }

    /** 1. 담당자 역할(확정·선점). SYSADMIN·MDM_STD_ADMIN 만으로는 거부한다. */
    void requireSteward() {
        if (!currentUser.roleIds().contains(MdmRoles.STEWARD)) {
            throw MdmErrors.of(MdmErrorCode.STEWARD_ROLE_REQUIRED);
        }
    }

    /** 2. 행 읽기. 없으면 다른 사람이 지운 DRAFT 를 본 화면과 같은 상황이라 MDM001. */
    VersionRow loadOrConflict(VersionRef ref) {
        return store.find(ref).orElseThrow(() -> MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT));
    }

    /** 3. 소유자. owner 가 비었거나 행위자와 다르면 MDM003(역할이 이 검사를 우회하지 않는다). */
    static void requireOwner(VersionRow row, String userId) {
        if (row.ownerId() == null || !row.ownerId().equals(userId)) {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT_OWNER);
        }
    }

    /** 4. row_version. */
    static void requireRowVersion(VersionRow row, long expected) {
        if (row.rowVersion() != expected) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
    }

    /** 5. 상태 DRAFT. */
    static void requireDraft(VersionRow row) {
        if (!VersionStatus.DRAFT.name().equals(row.status())) {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT);
        }
    }

    /** 6. 같은 객체의 <b>다른</b> 미적용 버전이 있으면 MDM007(확정·DRAFT 저장, 04:293-301). */
    void requireSingleUnapplied(VersionRef ref, LocalDateTime now) {
        List<VersionRow> rows = store.findAll(ref.target(), ref.objectId());
        for (VersionRow row : rows) {
            if (row.ref().ver().compareTo(ref.ver()) != 0 && isUnapplied(row, now)) {
                throw MdmErrors.of(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS);
            }
        }
    }

    /** 미적용 = DRAFT, 또는 APPLY_FROM 이 now 보다 뒤인 RELEASED(04:284, ADR-0002 D2). 경계(= now)는 적용됨. */
    static boolean isUnapplied(VersionRow row, LocalDateTime now) {
        if (VersionStatus.DRAFT.name().equals(row.status())) {
            return true;
        }
        return VersionStatus.RELEASED.name().equals(row.status())
                && row.applyFrom() != null && row.applyFrom().isAfter(now);
    }
}
