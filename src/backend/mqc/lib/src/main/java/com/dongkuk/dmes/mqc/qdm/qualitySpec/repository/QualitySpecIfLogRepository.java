package com.dongkuk.dmes.mqc.qdm.qualitySpec.repository;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecIfLog;
import org.springframework.data.jpa.repository.JpaRepository;

/** 전송 이력(I/F). */
public interface QualitySpecIfLogRepository extends JpaRepository<QualitySpecIfLog, String> {

    long countByIfNoStartingWith(String prefix);
}
