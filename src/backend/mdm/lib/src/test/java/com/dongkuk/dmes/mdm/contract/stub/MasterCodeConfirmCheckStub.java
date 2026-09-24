package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckItemResult;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckStatus;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckReport;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeDiffConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentTable;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * TSK-01-02 design.md §3.1 T6 — 04 마루 코드 역할 스텁. TSK-06-01 이 {@link MasterCodeConfirmCheckSpi}(구현 대상 선언)로
 * 넓혔고 실구현은 TSK-06-05 가 한다. 가치는 컴파일이다: {@link VersionConfirmCheckSpi}·{@link MasterCodeConfirmCheckSpi}
 * 시그니처가 바뀌면 이 클래스가 깨진다(불변 규칙 I16).
 *
 * <p>계약 문장대로 {@code check()} 는 {@code report()} 를 편 것이고, 키는 D10 규약({@code ITEM:P01},
 * {@code CATE_ITEM:MAJOR,P01}), 이슈 code 는 항목 enum 의 {@code name()} 이다.
 */
public class MasterCodeConfirmCheckStub implements MasterCodeConfirmCheckSpi {

    static final String ITEM_KEY = MasterCodeSegmentTable.ITEM.name() + MasterCodeDiffConventions.TABLE_KEY_SEPARATOR + "P01";
    static final String CATE_ITEM_KEY = MasterCodeSegmentTable.CATE_ITEM.name() + MasterCodeDiffConventions.TABLE_KEY_SEPARATOR
            + "MAJOR" + MasterCodeDiffConventions.KEY_PART_SEPARATOR + "P01";

    @Override
    public VersionTarget target() {
        return VersionTarget.MASTER_CODE;
    }

    @Override
    public VersionDiff diff(VersionRef draft) {
        // 04 는 SAME 을 내지 않는다(design.md §2.9). 최초 버전이면 base 가 null.
        VersionDiffEntry added = new VersionDiffEntry(ITEM_KEY, DiffKind.ADDED, null, Map.of("NAME", "신규 코드"));
        return new VersionDiff(null, draft, List.of(added));
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        List<MdmCheckIssue> errors = new ArrayList<>();
        List<MdmCheckIssue> warnings = new ArrayList<>();
        for (MasterCodeCheckItemResult row : report(request).results()) {
            if (row.status() == MasterCodeCheckStatus.REJECTED) {
                errors.addAll(row.issues());
            } else if (row.status() == MasterCodeCheckStatus.WARNED) {
                warnings.addAll(row.issues());
            }
        }
        return new ConfirmCheckResult(errors, warnings);
    }

    /** 2-1 경고 한 건(오류 없음) — 담당자가 확인(warningsAcknowledged)하면 확정할 수 있다. 3·4항 최초 면제, 3항 위임, 5항 보류. */
    @Override
    public MasterCodeConfirmCheckReport report(ConfirmCheckRequest request) {
        boolean firstVersion = request.previousReleasedApplyFrom() == null;
        List<MasterCodeCheckItemResult> results = new ArrayList<>();
        for (MasterCodeConfirmCheckItem item : MasterCodeConfirmCheckItem.values()) {
            if (!item.inScope()) {
                results.add(new MasterCodeCheckItemResult(item, MasterCodeCheckStatus.DEFERRED, List.of()));
            } else if (firstVersion && item.firstVersionExempt()) {
                results.add(new MasterCodeCheckItemResult(item, MasterCodeCheckStatus.EXEMPT, List.of()));
            } else if (item.sharedCheck()) {
                results.add(new MasterCodeCheckItemResult(item, MasterCodeCheckStatus.DELEGATED, List.of()));
            } else if (item == MasterCodeConfirmCheckItem.CATE_ITEM_CODE_MISSING) {
                MdmCheckIssue warning = new MdmCheckIssue(item.name(), "카테고리 소속 코드가 코드 표에 없습니다", null, CATE_ITEM_KEY);
                results.add(new MasterCodeCheckItemResult(item, MasterCodeCheckStatus.WARNED, List.of(warning)));
            } else {
                results.add(new MasterCodeCheckItemResult(item, MasterCodeCheckStatus.PASSED, List.of()));
            }
        }
        return new MasterCodeConfirmCheckReport(request.draft(), results);
    }
}
