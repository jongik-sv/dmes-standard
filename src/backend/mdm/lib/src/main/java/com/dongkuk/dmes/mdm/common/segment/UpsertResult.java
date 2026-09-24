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

    /** 행 하나의 동작(05 RECV_ITEM.ACTION 과 같은 이름). */
    public record RowAction(String code, MdmTemporalSegmentAction action) {
    }

    public List<MdmTemporalSegmentAction> actions() {
        return rows.stream().map(RowAction::action).toList();
    }
}
