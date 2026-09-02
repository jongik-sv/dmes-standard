package com.dongkuk.caravan.console.message.dto;

import lombok.Getter;
import lombok.Setter;

/**
 * 메시지 오프셋 미리보기(fromOffset) 요청 — OASIS body 바인딩 (As-Is REST 는 path+query, Q-001/Q-005).
 */
@Getter
@Setter
public class MessageFromOffsetRequest {

    private String topicId;
    private long offset;
}
