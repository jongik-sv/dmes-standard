package com.dongkuk.caravan.console.topic.dto;

import lombok.Getter;
import lombok.Setter;

/**
 * peekFromOffset(오프셋 미리보기) 요청 — OASIS body 바인딩 (As-Is REST 는 path+query, Q-005 path→body).
 */
@Getter
@Setter
public class PeekRequest {

    private String topicId;
    private long offset;
}
