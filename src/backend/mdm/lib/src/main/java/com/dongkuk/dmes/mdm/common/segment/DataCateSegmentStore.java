package com.dongkuk.dmes.mdm.common.segment;

import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentResult;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentRules;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentStore;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * 카테고리 선분 네 연산 — 항목과 같은 규칙(S1·S2·S5·S6·S7). 카테고리에는 ROW_VERSION 이 없다(F8). 검사 없이 선분만
 * 다루고, 호출자({@link DataCategorySegmentCore})가 잠금·검사·경계를 마쳤다고 가정한다.
 */
@Component
public class DataCateSegmentStore implements MdmTemporalSegmentStore<DataCateKey, DataCateValue> {

    private final DataSegmentRowStore rows;
    private final MdmNativeAuditSupport audit;

    public DataCateSegmentStore(DataSegmentRowStore rows, MdmNativeAuditSupport audit) {
        this.rows = rows;
        this.audit = audit;
    }

    @Override
    public MdmTemporalSegmentResult<DataCateValue> register(DataCateKey key, DataCateValue value, LocalDateTime at) {
        rows.insertCate(new CateSegmentRow(key, at, MdmTemporalSegmentRules.OPEN_END, value, 0), audit.currentStamp());
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.INSERT, value);
    }

    @Override
    public MdmTemporalSegmentResult<DataCateValue> modify(DataCateKey key, DataCateValue value, LocalDateTime at) {
        CateSegmentRow open = openRow(key);
        if (open.value().sameAs(value)) {
            return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.NONE, open.value());
        }
        var stamp = audit.currentStamp();
        rows.closeCate(key.maruDataId(), key.cateId(), open.validFrom(), at, stamp);
        rows.insertCate(new CateSegmentRow(key, at, MdmTemporalSegmentRules.OPEN_END, value, 0), stamp);
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.UPDATE, value);
    }

    @Override
    public MdmTemporalSegmentResult<DataCateValue> close(DataCateKey key, LocalDateTime at) {
        CateSegmentRow open = openRow(key);
        rows.closeCate(key.maruDataId(), key.cateId(), open.validFrom(), at, audit.currentStamp());
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.CLOSE, open.value());
    }

    @Override
    public MdmTemporalSegmentResult<DataCateValue> reopen(DataCateKey key, LocalDateTime at) {
        List<CateSegmentRow> all = rows.cateRows(key.maruDataId(), key.cateId());
        if (all.isEmpty()) {
            throw new IllegalStateException("다시 열 행이 없다: " + key);
        }
        CateSegmentRow last = all.get(all.size() - 1);
        rows.insertCate(new CateSegmentRow(key, at, MdmTemporalSegmentRules.OPEN_END, last.value(), 0),
                audit.currentStamp());
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.REOPEN, last.value());
    }

    private CateSegmentRow openRow(DataCateKey key) {
        return rows.cateRows(key.maruDataId(), key.cateId()).stream()
                .filter(CateSegmentRow::isOpen)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("열린 행이 없다: " + key));
    }
}
