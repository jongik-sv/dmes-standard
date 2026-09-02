package com.dongkuk.caravan.core.jpa;

import com.dongkuk.caravan.core.entity.TopicInfoEntity;
import com.dongkuk.caravan.core.entity.TopicInfoId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * TB_CARAVAN_TOPICS JPA Repository
 */
public interface TopicInfoJpaRepository extends JpaRepository<TopicInfoEntity, TopicInfoId>,
                                                 JpaSpecificationExecutor<TopicInfoEntity> {

    List<TopicInfoEntity> findByBizSystemAndUseTp(String bizSystem, String useTp);

    Optional<TopicInfoEntity> findByTopicIdAndBizSystemAndUseTp(
        String topicId, String bizSystem, String useTp);

    /**
     * 복합키 단건 조회. {@code findById} 가 Hibernate 6.x 의 row-value IN syntax 를 생성해
     * MSSQL 에서 거부되는 문제를 회피하기 위한 별도 finder.
     */
    Optional<TopicInfoEntity> findByTopicIdAndBizSystem(String topicId, String bizSystem);

    /**
     * Phase 7: 부팅 시 해당 bizSystem 의 USE_TP='Y' 토픽 STATUS 를 RUNNING 으로 reset.
     *
     * <p>"X 옵션: restart = clean slate" 전략 — 재기동 시 ERROR/PAUSED/STOPPED 인 토픽도
     * 모두 RUNNING 으로 초기화. 동일 메시지가 여전히 fail 하면 자동으로 다시 ERROR 진입 (Phase 5).</p>
     *
     * @param bizSystem 비즈니스 시스템
     * @return UPDATE 영향 행 수
     */
    @Modifying
    @Query("UPDATE TopicInfoEntity t " +
           "SET t.status = 'RUNNING', " +
           "    t.errorAt = null, " +
           "    t.errorOffset = null, " +
           "    t.lastErrorCode = null, " +
           "    t.lastErrorMsg = null " +
           "WHERE t.bizSystem = :bizSystem AND t.useTp = 'Y'")
    int resetStatusForBizSystem(@Param("bizSystem") String bizSystem);
}
