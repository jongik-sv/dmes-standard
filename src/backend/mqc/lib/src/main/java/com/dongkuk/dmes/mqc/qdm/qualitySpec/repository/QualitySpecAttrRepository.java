package com.dongkuk.dmes.mqc.qdm.qualitySpec.repository;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecAttr;
import org.springframework.data.jpa.repository.JpaRepository;

/** 항목 사전. */
public interface QualitySpecAttrRepository extends JpaRepository<QualitySpecAttr, String> {
}
