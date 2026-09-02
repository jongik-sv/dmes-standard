package com.dongkuk.caravan.console.host;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface AppHostJpaRepository
        extends JpaRepository<AppHostEntity, AppHostId>,
                JpaSpecificationExecutor<AppHostEntity> {

    /** 단일 BIZ_SYSTEM + 공장 코드 조합 lookup. */
    Optional<AppHostEntity> findByAppHostIdAndWorksCd(String appHostId, String worksCd);

    /** 특정 공장의 전체 호스트 매핑 (대시보드 등에서 host iterate). */
    List<AppHostEntity> findByWorksCdOrderByAppHostId(String worksCd);
}
