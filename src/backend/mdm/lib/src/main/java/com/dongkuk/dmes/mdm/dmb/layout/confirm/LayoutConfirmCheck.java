package com.dongkuk.dmes.mdm.dmb.layout.confirm;

import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersions;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * LAYOUT 확정 검사 SPI 운영 구현(D-144 3단계). 판정은 {@link LayoutConfirmChecks} 에 위임한다 — 판정 시각은 요청 apply_from. apply_from
 * 순서·소유자·담당자·미적용 하나는 공통 엔진이 본다.
 */
@Component
public class LayoutConfirmCheck implements VersionConfirmCheckSpi {

    private final LayoutConfirmChecks checks;
    private final LayoutVersionStore store;

    public LayoutConfirmCheck(LayoutConfirmChecks checks, LayoutVersionStore store) {
        this.checks = checks;
        this.store = store;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.LAYOUT;
    }

    /** 레이아웃 diff 는 변경 분류(CHANGE_KINDS)로 대신한다 — 행 diff 는 두지 않는다. */
    @Override
    public VersionDiff diff(VersionRef draft) {
        VersionRef base = LayoutVersions.previousReleased(store.versions(Long.valueOf(draft.objectId())), draft.ver())
                .map(p -> new VersionRef(VersionTarget.LAYOUT, draft.objectId(), p.getVer())).orElse(null);
        return new VersionDiff(base, draft, List.of());
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        LayoutConfirmReport r = checks.report(request.draft(), request.requestedApplyFrom());
        return new ConfirmCheckResult(r.errors(), r.warnings());
    }
}
