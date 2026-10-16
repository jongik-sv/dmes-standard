package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.version.ParentPromotion;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.springframework.stereotype.Component;

/**
 * 새 버전 훅의 표준 부모 승격(C3) — 공통 저장소 native UPDATE 로 부모 CREATED → INUSE 를 올린다({@link VersionRowStore#markParentInUse},
 * 확정과 같은 쿼리). 이미 INUSE·DEPRECATED 면 손대지 않는다. 룰·룰 세트·ERD 새 버전이 넘긴다.
 */
@Component
public class StandardParentPromotion implements ParentPromotion {

    private final VersionRowStore store;
    private final MdmNativeAuditSupport audit;

    public StandardParentPromotion(VersionRowStore store, MdmNativeAuditSupport audit) {
        this.store = store;
        this.audit = audit;
    }

    @Override
    public void promote(VersionTarget target, String objectId) {
        store.markParentInUse(target, objectId, audit.currentStamp());
    }
}
