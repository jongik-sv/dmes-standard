package com.dongkuk.dmes.mqc.qdm.qualitySpec.repository;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecOrder;
import org.springframework.data.jpa.repository.JpaRepository;

/** 시뮬레이션 표본 주문. */
public interface QualitySpecOrderRepository extends JpaRepository<QualitySpecOrder, String> {
}
