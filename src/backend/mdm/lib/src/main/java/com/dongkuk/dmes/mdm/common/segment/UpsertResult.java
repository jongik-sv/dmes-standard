package com.dongkuk.dmes.mdm.common.segment;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 일괄 upsert 결과 — 행마다 (예정) 동작, 검사 이슈, 저장 시각. {@code written} 이 false 면 아무 행도 쓰지 않았다
 * (dryRun 이거나 이슈가 있다 — 05 「CSV 업로드」 오류 0건일 때만 저장). 쓰지 않았으면 {@code at} 은 null 이다.
 */
public record UpsertResult(List<RowAction> rows, List<MdmCheckIssue> issues, LocalDateTime at, boolean written) {

    /**
     * 행 하나의 동작(05 RECV_ITEM.ACTION 과 같은 이름). {@code issues} 는 이 행에서 난 이슈만(전역 {@link #issues()} 는 순서
     * 없이 모두 쌓이므로 CSV 줄 번호로 되짚을 수 없다 — CSV 업로드(TSK-07-04)가 줄 번호별 오류를 보고하려고 추가했다, I7).
     */
    public record RowAction(String code, MdmTemporalSegmentAction action, List<MdmCheckIssue> issues) {
        public RowAction {
            issues = issues == null ? List.of() : List.copyOf(issues);
        }
    }

    public List<MdmTemporalSegmentAction> actions() {
        return rows.stream().map(RowAction::action).toList();
    }
}
