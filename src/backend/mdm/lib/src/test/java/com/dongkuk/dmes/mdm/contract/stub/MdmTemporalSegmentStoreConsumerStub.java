package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentResult;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentStore;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * TSK-07-01 design.md §3.4 — {@code MdmTemporalSegmentStore} 최소 구현(TSK-07-03 역). 컴파일 증명용
 * 스텁이라 {@code src/test} 에 둔다 — "실행 로직 없음"(main 에 구현체 없음)과 무관하다.
 */
public class MdmTemporalSegmentStoreConsumerStub implements MdmTemporalSegmentStore<String, String> {

    private final Map<String, String> rows = new LinkedHashMap<>();

    @Override
    public MdmTemporalSegmentResult<String> register(String key, String value, LocalDateTime at) {
        rows.put(key, value);
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.INSERT, value);
    }

    @Override
    public MdmTemporalSegmentResult<String> modify(String key, String value, LocalDateTime at) {
        rows.put(key, value);
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.UPDATE, value);
    }

    @Override
    public MdmTemporalSegmentResult<String> close(String key, LocalDateTime at) {
        rows.remove(key);
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.CLOSE, null);
    }

    @Override
    public MdmTemporalSegmentResult<String> reopen(String key, LocalDateTime at) {
        String value = rows.get(key);
        return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.REOPEN, value);
    }
}
