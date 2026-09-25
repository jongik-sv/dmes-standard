package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.Header;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckReport;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentService;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * MASTER_CODE 확정 검사 SPI 운영 구현(TSK-06-05 design.md §6.1). 원장을 {@link MasterCodeLedgerQueries}·
 * {@link MasterCodeSegmentService#viewAt} 로 읽어 순수 규칙({@link MasterCodeVersionDiffs}·{@link MasterCodeConfirmChecks})에
 * 넘긴다. 확정 트랜잭션 안에서 불리므로 쓰기를 하지 않는다(I15). 새 네이티브 SQL 이 없다.
 *
 * <p>{@code report} 의 최초 판정은 공통 서비스가 넘긴 {@code previousReleasedApplyFrom} 이 null 인지다(RELEASED 는 apply_from
 * 이 늘 있으므로 {@link MasterCodeConfirmChecks#previousReleased} 가 없는 것과 같다). apply_from 순서(3항)는 공통 서비스가
 * SPI 전에 검사하므로 반복하지 않는다.
 */
@Component
public class MasterCodeConfirmCheck implements MasterCodeConfirmCheckSpi {

    private final MasterCodeLedgerQueries ledger;
    private final MasterCodeSegmentService segments;

    public MasterCodeConfirmCheck(MasterCodeLedgerQueries ledger, MasterCodeSegmentService segments) {
        this.ledger = ledger;
        this.segments = segments;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.MASTER_CODE;
    }

    @Override
    public VersionDiff diff(VersionRef draft) {
        VersionRef base = MasterCodeConfirmChecks.previousReleased(ledger.versions(draft.objectId()), draft.ver())
                .map(row -> new VersionRef(VersionTarget.MASTER_CODE, draft.objectId(), row.ver()))
                .orElse(null);
        return new VersionDiff(base, draft, entries(draft));
    }

    @Override
    public MasterCodeConfirmCheckReport report(ConfirmCheckRequest request) {
        VersionRef draft = request.draft();
        Header header = ledger.header(draft.objectId())
                .orElseThrow(() -> new IllegalStateException("마루 코드가 없습니다: " + draft.objectId()));
        return MasterCodeConfirmChecks.report(draft, request.previousReleasedApplyFrom() == null,
                new MasterCodeItemChecks.Header(header.lvlCnt(), header.attrNames()), segments.viewAt(draft),
                entries(draft));
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        return MasterCodeConfirmChecks.flatten(report(request));
    }

    private List<VersionDiffEntry> entries(VersionRef draft) {
        String id = draft.objectId();
        return MasterCodeVersionDiffs.diff(draft.ver(), ledger.items(id), ledger.cates(id), ledger.cateItems(id));
    }
}
