package com.dongkuk.caravan.console.topic;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * caravan {@code TB_CARAVAN_TOPICS} read-only repository.
 *
 * <p>RE-Phase 11 wiring 후 caravan EMF 통해 read. write 메서드는 호출 금지 (caravan API 사용).</p>
 */
public interface ConsoleTopicInfoJpaRepository
        extends JpaRepository<ConsoleTopicInfoEntity, ConsoleTopicInfoId>,
                JpaSpecificationExecutor<ConsoleTopicInfoEntity> {
}
