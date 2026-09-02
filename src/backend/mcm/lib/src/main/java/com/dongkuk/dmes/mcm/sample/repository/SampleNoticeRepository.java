package com.dongkuk.dmes.mcm.sample.repository;

import com.dongkuk.dmes.mcm.sample.domain.SampleNotice;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SampleNoticeRepository extends JpaRepository<SampleNotice, Long> {
}
