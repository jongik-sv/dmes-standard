package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 커밋된 명령 하나의 델타(스펙 4.4). SSE change 이벤트·getChangesSince 항목.
 *
 * <p>source 가 {@link ErdSources#MARKER_SOURCE} 이면 명령이 아니라 표시 행이다 — DRAFT 삭제·새 DRAFT 처럼 모델 JSON 이 통째로 바뀐 자리.
 * 구독자에게는 change 대신 reload 로 나가고, getChangesSince 는 이 행을 건너는 범위에 reload=true 를 준다.
 *
 * <p>at 은 명령을 기록한 시각(서버 지역 시각, "yyyy-MM-ddTHH:mm:ss")이다 — 모르면 null(UX 1차 U22, 읽기 전용 칸).
 */
public record ErdDelta(String modelId, long rev, String userId, String session, String source, Long rowVersion,
                       List<ErdChange> changes, String at) {

    /** at 이 없는 모양(시험·옛 호출). at 은 null. */
    public ErdDelta(String modelId, long rev, String userId, String session, String source, Long rowVersion,
                    List<ErdChange> changes) {
        this(modelId, rev, userId, session, source, rowVersion, changes, null);
    }

    /** rowVersion 이 없는 델타 — 재전송·getChangesSince·표시 행은 ROW_VERSION 을 기록하지 않는다(S2-16). */
    public ErdDelta(String modelId, long rev, String userId, String session, String source, List<ErdChange> changes) {
        this(modelId, rev, userId, session, source, null, changes);
    }

    private static final DateTimeFormatter AT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    /** 명령 기록 시각 → "yyyy-MM-ddTHH:mm:ss"(서버 지역 시각, 초 단위). LocalDateTime.toString 은 초가 0 이면 줄여 쓰므로 쓰지 않는다. */
    public static String atOf(LocalDateTime t) {
        return t == null ? null : AT.format(t);
    }

    public static boolean isMarker(ErdDelta d) {
        return ErdSources.MARKER_SOURCE.equals(d.source());
    }
}
