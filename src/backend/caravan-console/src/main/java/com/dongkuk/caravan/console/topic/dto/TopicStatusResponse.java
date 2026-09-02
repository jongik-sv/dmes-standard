package com.dongkuk.caravan.console.topic.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TopicStatusResponse {

    private String topicId;
    private String topicDesc;
    private String groupId;
    private String bizSystem;
    private String sendModuleId;
    private String recvModuleId;
    /** caravan TopicInfoEntity.useTp(Y/N) 와 동일. caravan-console 원본의 useYn 명칭 보존. */
    private String useYn;
    /** caravan TopicInfoEntity.status (RUNNING/PAUSED/STOPPED/ERROR/UNKNOWN). */
    private String containerStatus;
    private long currentOffset;
    private long maxOffset;
    /** caravan KafkaGroupQueryService.GroupInfo.lag (maxOffset - currentOffset). caravan-console 원본에 없던 신규 필드. */
    private long lag;
}
