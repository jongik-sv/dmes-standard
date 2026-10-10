package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import java.util.List;

/**
 * 커밋된 명령 하나의 델타(스펙 4.4). SSE change 이벤트·getChangesSince 항목.
 *
 * <p>source 가 {@link #MARKER_SOURCE} 이면 명령이 아니라 표시 행이다 — DRAFT 삭제·새 DRAFT 처럼 모델 JSON 이 통째로 바뀐 자리.
 * 구독자에게는 change 대신 reload 로 나가고, getChangesSince 는 이 행을 건너는 범위에 reload=true 를 준다.
 */
public record ErdDelta(String modelId, long rev, String userId, String session, String source, Long rowVersion,
                       List<ErdChange> changes) {

    /** rowVersion 이 없는 델타 — 재전송·getChangesSince·표시 행은 ROW_VERSION 을 기록하지 않는다(S2-16). */
    public ErdDelta(String modelId, long rev, String userId, String session, String source, List<ErdChange> changes) {
        this(modelId, rev, userId, session, source, null, changes);
    }

    /** 표시 행의 출처. 명령은 이 출처로 보낼 수 없다(ErdCommandService). */
    public static final String MARKER_SOURCE = "SYSTEM";

    /** 표시 행의 세션 이름. */
    public static final String MARKER_SESSION = "system";

    public static boolean isMarker(ErdDelta d) {
        return MARKER_SOURCE.equals(d.source());
    }
}
