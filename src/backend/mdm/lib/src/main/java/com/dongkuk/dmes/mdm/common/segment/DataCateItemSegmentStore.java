package com.dongkuk.dmes.mdm.common.segment;

import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentResult;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentRules;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentStore;
import java.time.LocalDateTime;
import org.springframework.stereotype.Component;

/**
 * 소속(TABLE 카테고리) 선분 — 05 「선분과 닫기」 소속: 소속 해제는 열린 행을 닫는 것이고, 다시 소속은 새 행이다. 값 칸이
 * 없어 수정은 늘 NONE 이다. 검사 없이 선분만 다룬다.
 */
@Component
public class DataCateItemSegmentStore implements MdmTemporalSegmentStore<DataCateItemKey, Void> {

    private final DataSegmentRowStore rows;
    private final MdmNativeAuditSupport audit;

    public DataCateItemSegmentStore(DataSegmentRowStore rows, MdmNativeAuditSupport audit) {
        this.rows = rows;
        this.audit = audit;
    }

    @Override
    public MdmTemporalSegmentResult<Void> register(DataCateItemKey key, Void value, LocalDateTime at) {
        insert(key, at);
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.INSERT, null);
    }

    @Override
    public MdmTemporalSegmentResult<Void> modify(DataCateItemKey key, Void value, LocalDateTime at) {
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.NONE, null);
    }

    @Override
    public MdmTemporalSegmentResult<Void> close(DataCateItemKey key, LocalDateTime at) {
        CateItemSegmentRow open = rows.cateItemRows(key.maruDataId(), key.cateId(), key.code()).stream()
                .filter(CateItemSegmentRow::isOpen)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("열린 소속이 없다: " + key));
        rows.closeCateItem(key.maruDataId(), key.cateId(), key.code(), open.validFrom(), at, audit.currentStamp());
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.CLOSE, null);
    }

    @Override
    public MdmTemporalSegmentResult<Void> reopen(DataCateItemKey key, LocalDateTime at) {
        insert(key, at);
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.REOPEN, null);
    }

    private void insert(DataCateItemKey key, LocalDateTime at) {
        rows.insertCateItem(new CateItemSegmentRow(key, at, MdmTemporalSegmentRules.OPEN_END, 0), audit.currentStamp());
    }
}
