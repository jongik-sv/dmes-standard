package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdDelta;
import java.util.List;

/**
 * getChangesSince 결과. reload=true 면 deltas 는 비고, 호출자가 모델 전체를 다시 읽는다.
 *
 * <p>fromRev: 요청 구간을 줄 수 없어 reload 일 때, 기록을 줄 수 있는 가장 이른 sinceRev(그 구간 안 마지막 다시 읽기 표시 rev, 없으면
 * rev-500). 이 값을 sinceRev 로 다시 보내면 델타가 온다. reload 가 아니거나 sinceRev 가 서버 rev 보다 크면 null 이다.
 */
public record ErdChangesView(long rev, boolean reload, List<ErdDelta> deltas, Long fromRev) {

    /** fromRev 없는 결과(reload 가 아니거나 다시 읽을 구간이 없을 때). */
    public ErdChangesView(long rev, boolean reload, List<ErdDelta> deltas) {
        this(rev, reload, deltas, null);
    }
}
