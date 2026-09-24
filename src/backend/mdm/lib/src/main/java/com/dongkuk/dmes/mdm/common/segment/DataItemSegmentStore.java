package com.dongkuk.dmes.mdm.common.segment;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentResult;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentRules;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentStore;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * 항목 선분 네 연산 — 05 「선분과 닫기」(S1·S2·S3·S5·S6·S7). 검사 없이 선분만 다룬다. 호출자({@link DataItemSaveCore})가
 * 마루 데이터 행 잠금을 쥐고 검사·row_version 비교·경계 확정을 마쳤다고 가정한다.
 *
 * <p>row_version(D7): 등록 0, 수정의 새 행 = 옛 행 +1(옛 행은 그대로), 닫기 = 닫는 행 +1, 다시 열기의 새 행 = 마지막 행 +1.
 * 계약에는 row_version 인자가 없어서(F7) 기대값을 받는 오버로드를 따로 둔다. 닫는 UPDATE 는 기대값이 있으면 CAS 다(S4).
 */
@Component
public class DataItemSegmentStore implements MdmTemporalSegmentStore<DataItemKey, DataItemValue> {

    private final DataSegmentRowStore rows;
    private final MdmNativeAuditSupport audit;

    public DataItemSegmentStore(DataSegmentRowStore rows, MdmNativeAuditSupport audit) {
        this.rows = rows;
        this.audit = audit;
    }

    /** 등록 — 새 열린 행 하나, row_version 0(S3). */
    @Override
    public MdmTemporalSegmentResult<DataItemValue> register(DataItemKey key, DataItemValue value, LocalDateTime at) {
        rows.insertItem(new ItemSegmentRow(key, at, MdmTemporalSegmentRules.OPEN_END, value, 0, 0), audit.currentStamp());
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.INSERT, value);
    }

    @Override
    public MdmTemporalSegmentResult<DataItemValue> modify(DataItemKey key, DataItemValue value, LocalDateTime at) {
        return modify(key, value, at, null);
    }

    public MdmTemporalSegmentResult<DataItemValue> modify(DataItemKey key, DataItemValue value, LocalDateTime at,
                                                          Integer expectedRowVersion) {
        return modifyOpen(openRow(key), value, at, expectedRowVersion);
    }

    /**
     * 수정 — 값이 같으면 쓰기 없이 NONE(S5). 다르면 열린 행을 at 에 닫고(row_version 그대로) 같은 at 의 새 행을 만든다
     * (S1·S2, 새 행 = 옛 행 +1). 일괄 upsert 가 이미 읽은 열린 행으로 부를 수 있게 행을 받는다.
     */
    public MdmTemporalSegmentResult<DataItemValue> modifyOpen(ItemSegmentRow open, DataItemValue value, LocalDateTime at,
                                                              Integer expectedRowVersion) {
        if (open.value().sameAs(value)) {
            return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.NONE, open.value());
        }
        var stamp = audit.currentStamp();
        DataItemKey key = open.key();
        if (rows.closeItem(key.maruDataId(), key.code(), open.validFrom(), at, expectedRowVersion, false, stamp) == 0) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
        rows.insertItem(new ItemSegmentRow(key, at, MdmTemporalSegmentRules.OPEN_END, value, open.rowVersion() + 1, 0),
                stamp);
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.UPDATE, value);
    }

    @Override
    public MdmTemporalSegmentResult<DataItemValue> close(DataItemKey key, LocalDateTime at) {
        return close(key, at, null);
    }

    /** 닫기 — 열린 행 valid_to = at, 새 행 없음, 물리 삭제 없음(S6). 닫는 행 row_version +1(D7). */
    public MdmTemporalSegmentResult<DataItemValue> close(DataItemKey key, LocalDateTime at, Integer expectedRowVersion) {
        ItemSegmentRow open = openRow(key);
        if (rows.closeItem(key.maruDataId(), key.code(), open.validFrom(), at, expectedRowVersion, true,
                audit.currentStamp()) == 0) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.CLOSE, open.value());
    }

    /** 다시 열기 — 마지막 행 값을 복사한 새 행, 마지막 행의 valid_to 는 그대로(S2·S7). 새 행 = 마지막 행 +1. */
    @Override
    public MdmTemporalSegmentResult<DataItemValue> reopen(DataItemKey key, LocalDateTime at) {
        List<ItemSegmentRow> all = rows.itemRows(key.maruDataId(), key.code());
        if (all.isEmpty()) {
            throw new IllegalStateException("다시 열 행이 없다: " + key);
        }
        ItemSegmentRow last = all.get(all.size() - 1);
        rows.insertItem(new ItemSegmentRow(key, at, MdmTemporalSegmentRules.OPEN_END, last.value(), last.rowVersion() + 1,
                0), audit.currentStamp());
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.REOPEN, last.value());
    }

    /**
     * API 경로의 닫힌 키 upsert — 받은 값으로 새 행을 연다(REOPEN, D12). 마지막 행의 valid_to 는 그대로다(S7).
     * 화면 다시 열기({@link #reopen})와 달리 값을 복사하지 않는다: 원천이 보낸 행이 곧 새 값이다(05 「수신 API」 upsert).
     */
    public MdmTemporalSegmentResult<DataItemValue> reopenWith(ItemSegmentRow last, DataItemValue value, LocalDateTime at) {
        rows.insertItem(new ItemSegmentRow(last.key(), at, MdmTemporalSegmentRules.OPEN_END, value, last.rowVersion() + 1,
                0), audit.currentStamp());
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.REOPEN, value);
    }

    private ItemSegmentRow openRow(DataItemKey key) {
        return rows.itemRows(key.maruDataId(), key.code()).stream()
                .filter(ItemSegmentRow::isOpen)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("열린 행이 없다: " + key));
    }
}
