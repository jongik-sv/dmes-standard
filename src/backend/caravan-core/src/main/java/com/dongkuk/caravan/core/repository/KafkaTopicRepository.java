package com.dongkuk.caravan.core.repository;

import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.entity.TopicInfoEntity;
import com.dongkuk.caravan.core.jpa.TopicInfoJpaRepository;
import com.dongkuk.caravan.core.jpa.TopicInfoSpecification;
import com.dongkuk.caravan.core.model.TopicInfo;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Kafka 토픽 정보 Repository
 *
 * <p>TB_CARAVAN_TOPICS 테이블에서 Kafka 토픽 설정 정보를 조회합니다.</p>
 *
 * @author Caravan
 * @version 1.0.0
 * @see TopicInfo
 */
@Repository
@RequiredArgsConstructor
public class KafkaTopicRepository {

    private final TopicInfoJpaRepository topicInfoJpaRepository;
    private final CaravanProperties properties;

    /**
     * 현재 BIZ_SYSTEM에 해당하는 토픽 목록을 조회합니다.
     *
     * @return 토픽 정보 목록
     */
    public List<TopicInfo> getTopics() {
        return topicInfoJpaRepository
            .findByBizSystemAndUseTp(properties.getBizSystem(), "Y")
            .stream()
            .map(this::toDto)
            .collect(Collectors.toList());
    }

    /**
     * 토픽 ID로 토픽 정보를 조회합니다.
     *
     * @param topicId 조회할 토픽 ID
     * @return 토픽 정보를 담은 Optional
     */
    public Optional<TopicInfo> getTopicById(String topicId) {
        return topicInfoJpaRepository
            .findByTopicIdAndBizSystemAndUseTp(topicId, properties.getBizSystem(), "Y")
            .map(this::toDto);
    }

    /**
     * 토픽 상세 정보를 조회합니다 (모니터링/상태 조회용).
     *
     * @param topicId      토픽 ID 필터 (null 가능)
     * @param sendModuleId 송신 모듈 ID 필터 (null 가능)
     * @param recvModuleId 수신 모듈 ID 필터 (null 가능)
     * @return 필터 조건에 맞는 토픽 정보 목록
     */
    public List<TopicInfo> getTopicsInfo(String topicId, String sendModuleId, String recvModuleId) {
        return getTopicEntities(topicId, sendModuleId, recvModuleId)
            .stream()
            .map(this::toDto)
            .collect(Collectors.toList());
    }

    /**
     * 토픽 엔티티 목록을 조회합니다 (STATUS / ERROR_* 등 전체 컬럼이 필요한 경우용).
     *
     * @param topicId      토픽 ID 필터 (null 가능)
     * @param sendModuleId 송신 모듈 ID 필터 (null 가능)
     * @param recvModuleId 수신 모듈 ID 필터 (null 가능)
     * @return 필터 조건에 맞는 TopicInfoEntity 목록
     */
    public List<TopicInfoEntity> getTopicEntities(String topicId, String sendModuleId, String recvModuleId) {
        Specification<TopicInfoEntity> spec = TopicInfoSpecification.withFilters(
            properties.getBizSystem(), topicId, sendModuleId, recvModuleId);
        return topicInfoJpaRepository.findAll(spec);
    }

    private TopicInfo toDto(TopicInfoEntity entity) {
        return TopicInfo.builder()
            .topicId(entity.getTopicId())
            .topicDesc(entity.getTopicDesc())
            .groupId(entity.getGroupId())
            .bizSystem(entity.getBizSystem())
            .sendModuleId(entity.getSendModuleId())
            .recvModuleId(entity.getRecvModuleId())
            .useTp(entity.getUseTp())
            .status(entity.getStatus())
            .build();
    }
}
