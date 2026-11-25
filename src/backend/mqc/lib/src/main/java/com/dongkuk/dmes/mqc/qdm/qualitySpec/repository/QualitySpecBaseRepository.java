package com.dongkuk.dmes.mqc.qdm.qualitySpec.repository;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecBase;
import org.springframework.data.jpa.repository.JpaRepository;

/** 표준 설계 기준값. */
public interface QualitySpecBaseRepository extends JpaRepository<QualitySpecBase, String> {
}
