package com.dongkuk.caravan.core.jpa;

import com.dongkuk.caravan.core.entity.KafkaErrorLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * TB_CARAVAN_TC_ERROR JPA Repository
 */
public interface KafkaErrorLogJpaRepository extends JpaRepository<KafkaErrorLogEntity, String> {
}
