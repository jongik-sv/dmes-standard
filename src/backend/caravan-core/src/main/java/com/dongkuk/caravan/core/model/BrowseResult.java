package com.dongkuk.caravan.core.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Kafka 메시지 조회 결과 DTO
 *
 * <p>{@link com.dongkuk.caravan.core.offset.MessageBrowser}에서 조회한 메시지 정보를 담는 객체입니다.</p>
 *
 * <h3>포함 정보</h3>
 * <ul>
 *   <li><b>위치 정보</b>: offset, partition, topic</li>
 *   <li><b>메시지 내용</b>: key, value</li>
 *   <li><b>시간 정보</b>: timestamp (밀리초), timestampStr (포맷팅)</li>
 * </ul>
 *
 * <h3>사용 예시</h3>
 * <pre>{@code
 * List<BrowseResult> messages = messageBrowser.browseByOffsetRange("my-topic", 100, 110);
 * for (BrowseResult msg : messages) {
 *     System.out.printf("[%d] %s: %s%n", msg.getOffset(), msg.getTimestampStr(), msg.getValue());
 * }
 * }</pre>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.offset.MessageBrowser
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BrowseResult {
    /** 메시지 Offset */
    private long offset;
    /** 파티션 */
    private int partition;
    /** 토픽명 */
    private String topic;
    /** 메시지 Key */
    private String key;
    /** 메시지 Value */
    private String value;
    /** 메시지 타임스탬프 */
    private long timestamp;
    /** 타임스탬프 (포맷팅) */
    private String timestampStr;
}
