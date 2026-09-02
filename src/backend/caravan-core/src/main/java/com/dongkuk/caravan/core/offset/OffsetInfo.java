package com.dongkuk.caravan.core.offset;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Offset 정보 DTO
 *
 * <p>Offset 스킵 작업의 결과를 담는 객체입니다.</p>
 *
 * <h3>포함 정보</h3>
 * <ul>
 *   <li>{@code beforeOffset}: 변경 전 커밋된 Offset</li>
 *   <li>{@code afterOffset}: 변경 후 커밋된 Offset</li>
 *   <li>{@code maxOffset}: 토픽의 최대 Offset (Log End Offset)</li>
 *   <li>{@code partition}: 파티션 번호</li>
 *   <li>{@code topic}: 토픽명</li>
 *   <li>{@code groupId}: Consumer Group ID</li>
 * </ul>
 *
 * <h3>Lag 계산</h3>
 * <p>스킵 후 남은 메시지 수 (Lag)는 다음과 같이 계산합니다:</p>
 * <pre>{@code
 * long lag = offsetInfo.getMaxOffset() - offsetInfo.getAfterOffset();
 * }</pre>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.offset.KafkaOffsetManager#skipOffset(String, String, String, int)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OffsetInfo {
    /** 변경 전 Offset */
    private long beforeOffset;
    /** 변경 후 Offset */
    private long afterOffset;
    /** 변경 전 최대 Offset */
    private long beforeMaxOffset;
    /** 변경 후 최대 Offset */
    private long afterMaxOffset;
    /** 토픽의 최대 Offset */
    private long maxOffset;
    /** 파티션 */
    private int partition;
    /** 토픽명 */
    private String topic;
    /** Consumer Group ID */
    private String groupId;
}
