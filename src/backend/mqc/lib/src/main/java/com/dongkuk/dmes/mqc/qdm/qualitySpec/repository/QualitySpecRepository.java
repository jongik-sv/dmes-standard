package com.dongkuk.dmes.mqc.qdm.qualitySpec.repository;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpec;
import org.springframework.data.jpa.repository.JpaRepository;

/** 품질사양 머리. */
public interface QualitySpecRepository extends JpaRepository<QualitySpec, String> {
}
