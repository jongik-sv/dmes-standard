package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary.VerRow;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckItemResult;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckSeverity;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckStatus;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckReport;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeVersionView;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * 확정 검사 10행 보고서(TSK-06-05 design.md §6.3) — 순수 규칙(Spring·DB 없음). 규칙을 새로 쓰지 않고 1·6·7·8항은
 * {@link MasterCodeItemChecks}, 2항은 {@link MasterCodeCateChecks#checkDefinition}, 2-1·2-2 는
 * {@link MasterCodeCategoryResolver#resolve} 의 결과를 항목으로 나눈다. 이슈 code 는 항목 enum {@code name()}, itemKey 는 D10
 * 키로 바꾸고 message·field 는 원래 값을 둔다(D8).
 *
 * <p>행 상태 결정 순서(I2): 보류(inScope 아님) → 최초 버전 면제 → 공통 검사(3항, {@code ApplyFromOrderCheck}) → 이슈
 * 심각도 → 통과. "최초 버전" 은 직전 RELEASED 가 없는 버전이다(ver 값으로 판정하지 않는다, I3).
 */
public final class MasterCodeConfirmChecks {

    static final String NO_CHANGES_MESSAGE = "직전 RELEASED 대비 바뀐 행이 없습니다. 이름·설명만 고치려면 경미 수정을 쓰세요";

    private MasterCodeConfirmChecks() {
    }

    public static MasterCodeConfirmCheckReport report(VersionRef draft, boolean firstVersion,
                                                      MasterCodeItemChecks.Header header, MasterCodeVersionView view,
                                                      List<VersionDiffEntry> diff) {
        Map<MasterCodeConfirmCheckItem, List<MdmCheckIssue>> issues = new EnumMap<>(MasterCodeConfirmCheckItem.class);
        for (MasterCodeConfirmCheckItem item : MasterCodeConfirmCheckItem.values()) {
            issues.put(item, new ArrayList<>());
        }

        // 1·6·7·8항 — V 의 모든 코드 행(I7)
        List<MasterCodeItemEntry> entries = new ArrayList<>();
        Set<String> codes = new HashSet<>();
        for (MasterCodeItemRow row : view.items()) {
            entries.add(new MasterCodeItemEntry(row.code(), row.values()));
            codes.add(row.code());
        }
        for (MdmCheckIssue issue : MasterCodeItemChecks.check(header, entries, codes)) {
            MasterCodeConfirmCheckItem item = itemOf(MasterCodeItemIssueCode.valueOf(issue.code()));
            issues.get(item).add(rekey(item, issue, MasterCodeVersionDiffs.itemKey(issue.itemKey())));
        }

        // 2항 → 통과한 카테고리만 2-1·2-2(D10)
        for (MasterCodeCateRow cate : view.categories()) {
            String cateId = cate.definition().cateId();
            List<MdmCheckIssue> definitionIssues = MasterCodeCateChecks.checkDefinition(cate.definition());
            if (!definitionIssues.isEmpty()) {
                for (MdmCheckIssue issue : definitionIssues) {
                    issues.get(MasterCodeConfirmCheckItem.CATEGORY_RESOLVE).add(
                            rekey(MasterCodeConfirmCheckItem.CATEGORY_RESOLVE, issue,
                                    MasterCodeVersionDiffs.cateKey(cateId)));
                }
                continue;
            }
            for (MdmCheckIssue warning : MasterCodeCategoryResolver.resolve(view.items(), cate, view.cateItems())
                    .warnings()) {
                switch (warning.code()) {
                    case MasterCodeCategoryResolver.CATE_ITEM_CODE_MISSING -> issues
                            .get(MasterCodeConfirmCheckItem.CATE_ITEM_CODE_MISSING)
                            .add(rekey(MasterCodeConfirmCheckItem.CATE_ITEM_CODE_MISSING, warning,
                                    MasterCodeVersionDiffs.cateItemKey(cateId, warning.itemKey())));
                    case MasterCodeCategoryResolver.CATEGORY_EMPTY -> issues
                            .get(MasterCodeConfirmCheckItem.CATEGORY_EMPTY)
                            .add(rekey(MasterCodeConfirmCheckItem.CATEGORY_EMPTY, warning,
                                    MasterCodeVersionDiffs.cateKey(cateId)));
                    default -> throw new IllegalStateException("확정 검사에 매핑되지 않은 카테고리 경고: " + warning.code());
                }
            }
        }

        // 4항 — 최초 버전이 아니면 diff 가 하나라도 있어야 한다(D2)
        if (!firstVersion && diff.isEmpty()) {
            issues.get(MasterCodeConfirmCheckItem.HAS_CHANGES).add(new MdmCheckIssue(
                    MasterCodeConfirmCheckItem.HAS_CHANGES.name(), NO_CHANGES_MESSAGE, null, null));
        }

        List<MasterCodeCheckItemResult> results = new ArrayList<>();
        for (MasterCodeConfirmCheckItem item : MasterCodeConfirmCheckItem.values()) {
            MasterCodeCheckStatus status = status(item, firstVersion, issues.get(item));
            List<MdmCheckIssue> rowIssues = status == MasterCodeCheckStatus.REJECTED
                    || status == MasterCodeCheckStatus.WARNED ? List.copyOf(issues.get(item)) : List.of();
            results.add(new MasterCodeCheckItemResult(item, status, rowIssues));
        }
        return new MasterCodeConfirmCheckReport(draft, List.copyOf(results));
    }

    /** SPI {@code check()} — REJECTED 행 이슈는 errors, WARNED 행 이슈는 warnings(행 순서). 그 밖의 행은 넣지 않는다(I4). */
    public static ConfirmCheckResult flatten(MasterCodeConfirmCheckReport report) {
        List<MdmCheckIssue> errors = new ArrayList<>();
        List<MdmCheckIssue> warnings = new ArrayList<>();
        for (MasterCodeCheckItemResult row : report.results()) {
            if (row.status() == MasterCodeCheckStatus.REJECTED) {
                errors.addAll(row.issues());
            } else if (row.status() == MasterCodeCheckStatus.WARNED) {
                warnings.addAll(row.issues());
            }
        }
        return new ConfirmCheckResult(List.copyOf(errors), List.copyOf(warnings));
    }

    /**
     * 직전 RELEASED = STATUS RELEASED 이고 ver &lt; V 인 것 중 가장 큰 ver(I8). SPI {@code diff().base}·최초 판정·화면 3항이 이
     * 정의 하나를 쓰고, 공통 서비스 {@code DefaultVersionStateService.previousReleased} 와 결과가 같다.
     */
    public static Optional<VerRow> previousReleased(List<VerRow> versions, BigDecimal v) {
        VerRow best = null;
        for (VerRow row : versions) {
            if (VersionStatus.RELEASED.name().equals(row.status()) && row.ver().compareTo(v) < 0
                    && (best == null || row.ver().compareTo(best.ver()) > 0)) {
                best = row;
            }
        }
        return Optional.ofNullable(best);
    }

    /** 저장 검사 이슈 코드 → 확정 검사 항목(I6). 저장 검사가 내지 않는 코드는 조용히 버리지 않고 던진다. */
    static MasterCodeConfirmCheckItem itemOf(MasterCodeItemIssueCode code) {
        return switch (code) {
            // 길이 초과(KEY·TEXT_TOO_LONG)는 저장 때 막혀 오래된 행에만 남을 수 있다 — 가장 가까운 1항(코드값·행 값 형식)으로 거부한다
            case CODE_REQUIRED, CODE_FORBIDDEN_CHAR, KEY_TOO_LONG, TEXT_TOO_LONG ->
                    MasterCodeConfirmCheckItem.CODE_VALUE_CHARS;
            case LVL_GAP, LVL_PARENT_MISMATCH -> MasterCodeConfirmCheckItem.LVL_HIERARCHY;
            case ATTR_WITHOUT_LABEL -> MasterCodeConfirmCheckItem.ATTR_WITHOUT_LABEL;
            case LVL_BEYOND_CNT -> MasterCodeConfirmCheckItem.LVL_BEYOND_CNT;
            default -> throw new IllegalStateException("확정 검사에 매핑되지 않은 저장 검사 이슈: " + code);
        };
    }

    private static MasterCodeCheckStatus status(MasterCodeConfirmCheckItem item, boolean firstVersion,
                                                List<MdmCheckIssue> issues) {
        if (!item.inScope()) {
            return MasterCodeCheckStatus.DEFERRED;
        }
        if (item.firstVersionExempt() && firstVersion) {
            return MasterCodeCheckStatus.EXEMPT;
        }
        if (item.sharedCheck()) {
            return MasterCodeCheckStatus.DELEGATED;
        }
        if (!issues.isEmpty()) {
            return item.severity() == MasterCodeCheckSeverity.REJECT
                    ? MasterCodeCheckStatus.REJECTED : MasterCodeCheckStatus.WARNED;
        }
        return MasterCodeCheckStatus.PASSED;
    }

    private static MdmCheckIssue rekey(MasterCodeConfirmCheckItem item, MdmCheckIssue issue, String itemKey) {
        return new MdmCheckIssue(item.name(), issue.message(), issue.field(), itemKey);
    }
}
