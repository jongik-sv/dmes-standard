package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import java.util.List;

/**
 * 접속자 한 세션의 화면 상태(스펙 D16·D18). getCurrentView(MCP, 단계 1)가 이 값을 읽는다.
 * at 은 ISO-8601 문자열이다 — SSE 는 Jackson 2(ErdModelCodec, java.time 모듈 없음), OASIS 응답은 Jackson 3 으로 나가므로 둘 다 그대로 쓰는 형식으로 둔다.
 */
public record ErdPresence(String session, String userId, String source, String diagramId, List<String> selectedTables,
                          String at) {
}
