package com.dongkuk.caravan.console.message.dto;

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
public class MessageResponse {

    private String topic;
    private String topicDesc;
    private long offset;
    private int partition;
    private String timestamp;
    private String transactionCode;
    private String kafkaKeyData;
    private String value;
    /** WAIT / DONE / PROCESSING / ERROR / UNKNOWN — caravan-console 원본 SearchKafkaMessageList 판별 로직 보존. */
    private String messageStatus;
    /** RUN/RUNNING/PAUSE/PAUSED/STOP/STOPPED/UNKNOWN — caravan TopicInfoEntity.status. */
    private String containerStatus;
    private long currentOffset;
    private long maxOffset;
    private String sendModuleId;
    private String recvModuleId;
}
