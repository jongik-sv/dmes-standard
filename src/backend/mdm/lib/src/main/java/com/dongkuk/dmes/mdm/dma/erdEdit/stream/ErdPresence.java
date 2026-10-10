package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import java.util.List;

/**
 * 접속자 한 세션의 화면 상태(스펙 D16·D18). getCurrentView(MCP, 단계 1)가 이 값을 읽는다.
 * at·expiresAt 은 ISO-8601 문자열이다 — SSE 는 Jackson 2(ErdModelCodec, java.time 모듈 없음), OASIS 응답은 Jackson 3 으로 나가므로 둘 다 그대로 쓰는 형식으로 둔다.
 * expiresAt: SSE 구독자 항목은 null, MCP·CLI 시한 항목(S2-11)은 만료 시각.
 */
public record ErdPresence(String session, String userId, String source, String diagramId, List<String> selectedTables,
                          String at, String expiresAt) {

    /** SSE 구독자 항목 — 구독이 끊길 때 지우므로 만료가 없다. */
    public ErdPresence(String session, String userId, String source, String diagramId, List<String> selectedTables, String at) {
        this(session, userId, source, diagramId, selectedTables, at, null);
    }
}
