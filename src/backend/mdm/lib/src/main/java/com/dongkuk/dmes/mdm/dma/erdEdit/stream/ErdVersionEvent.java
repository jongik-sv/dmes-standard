package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import java.util.List;

/**
 * 버전 수명 주기 SSE 이벤트 {@code version}(S2-12, deferred 39). rev 를 올리지 않고 명령 기록에 남지 않는다.
 * ver·status·ownerId·editors·rowVersion 은 그 시점에 view(ver 없음)가 돌려줄 값과 같다. 확정 뒤에는 확정한 버전이다.
 * reason: SUBSCRIBE·CONFIRM·LOCK·UNLOCK·HANDOVER·ADD_EDITOR·REMOVE_EDITOR. userId 는 동작한 사용자(SUBSCRIBE 는 구독한 사용자), at 은 ISO-8601.
 */
public record ErdVersionEvent(String modelId, String ver, String status, String ownerId, List<String> editors,
                              long rowVersion, String reason, String userId, String at) {
}
