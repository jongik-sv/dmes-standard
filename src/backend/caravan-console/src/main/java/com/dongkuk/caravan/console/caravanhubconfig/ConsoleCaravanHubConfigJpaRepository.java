package com.dongkuk.caravan.console.caravanhubconfig;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface ConsoleCaravanHubConfigJpaRepository extends JpaRepository<ConsoleCaravanHubConfigEntity, ConsoleCaravanHubConfigId>,
        JpaSpecificationExecutor<ConsoleCaravanHubConfigEntity> {
}
