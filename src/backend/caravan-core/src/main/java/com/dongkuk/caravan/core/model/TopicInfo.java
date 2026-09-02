package com.dongkuk.caravan.core.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Kafka 토픽 정보 DTO
 *
 * <p>TB_CARAVAN_TOPICS 테이블의 토픽 설정 정보를 담는 객체입니다.</p>
 *
 * <h3>TB_CARAVAN_TOPICS 테이블 매핑</h3>
 * <table border="1">
 *   <tr><th>필드</th><th>컬럼</th><th>설명</th></tr>
 *   <tr><td>topicId</td><td>TOPIC_ID</td><td>Kafka 토픽명</td></tr>
 *   <tr><td>topicDesc</td><td>TOPIC_DESC</td><td>토픽 설명</td></tr>
 *   <tr><td>groupId</td><td>GROUP_ID</td><td>Consumer Group ID</td></tr>
 *   <tr><td>bizSystem</td><td>BIZ_SYSTEM</td><td>비즈니스 시스템 코드</td></tr>
 *   <tr><td>sendModuleId</td><td>SEND_MODULE_ID</td><td>송신 모듈 ID</td></tr>
 *   <tr><td>recvModuleId</td><td>RECV_MODULE_ID</td><td>수신 모듈 ID</td></tr>
 *   <tr><td>useTp</td><td>USE_TP</td><td>사용 여부 (Y/N)</td></tr>
 *   <tr><td>status</td><td>STATUS</td><td>토픽 상태</td></tr>
 * </table>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.repository.KafkaTopicRepository
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TopicInfo {
    /** 토픽 ID */
    private String topicId;
    /** 토픽 설명 */
    private String topicDesc;
    /** Consumer Group ID */
    private String groupId;
    /** 비즈니스 시스템 코드 */
    private String bizSystem;
    /** 송신 모듈 ID */
    private String sendModuleId;
    /** 수신 모듈 ID */
    private String recvModuleId;
    /** 사용 여부 (Y/N) */
    private String useTp;
    /** 토픽 상태 */
    private String status;
}
