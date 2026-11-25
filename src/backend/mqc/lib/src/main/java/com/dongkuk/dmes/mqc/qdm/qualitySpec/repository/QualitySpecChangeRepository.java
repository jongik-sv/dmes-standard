package com.dongkuk.dmes.mqc.qdm.qualitySpec.repository;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecChange;
import org.springframework.data.jpa.repository.JpaRepository;

/** 변경 이력. */
public interface QualitySpecChangeRepository extends JpaRepository<QualitySpecChange, Long> {
}
