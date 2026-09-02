package com.dongkuk.dmes.mqc.sample.repository;

import com.dongkuk.dmes.mqc.sample.domain.SampleInspectionResult;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SampleInspectionResultRepository extends JpaRepository<SampleInspectionResult, Long> {
}
