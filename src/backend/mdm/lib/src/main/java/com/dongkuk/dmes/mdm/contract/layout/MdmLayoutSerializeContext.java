package com.dongkuk.dmes.mdm.contract.layout;

import java.time.LocalDateTime;

/**
 * 직렬화 호출 시점 상태(TSK-05-01 design.md §6.1, D8) — {@code sendTime}(송신 시각)·{@code seq}(전문 순서)는
 * 스냅샷에 없는 "호출 시점" 값이다. naming-dialect-rules.md §3 #16 "현재 시각은 애플리케이션이 파라미터로
 * 넘긴다"(DB·시스템 시계를 직접 읽지 않는다)와 같은 이유로, 이 값들을 명시적으로 받아 {@link
 * MdmLayoutSerializer}가 시계·카운터를 스스로 갖지 않게 한다(불변 규칙 16).
 */
public record MdmLayoutSerializeContext(LocalDateTime sendTime, long seq) {
}
