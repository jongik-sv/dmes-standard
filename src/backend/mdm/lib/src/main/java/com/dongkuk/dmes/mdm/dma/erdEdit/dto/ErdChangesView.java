package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdDelta;
import java.util.List;

/** getChangesSince 결과. reload=true 면 deltas 는 비고, 호출자가 모델 전체를 다시 읽는다. */
public record ErdChangesView(long rev, boolean reload, List<ErdDelta> deltas) {
}
