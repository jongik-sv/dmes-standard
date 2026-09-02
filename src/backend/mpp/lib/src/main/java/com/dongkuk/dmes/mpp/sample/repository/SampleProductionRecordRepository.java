package com.dongkuk.dmes.mpp.sample.repository;

import com.dongkuk.dmes.mpp.sample.domain.SampleProductionRecord;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SampleProductionRecordRepository extends JpaRepository<SampleProductionRecord, Long> {
}
