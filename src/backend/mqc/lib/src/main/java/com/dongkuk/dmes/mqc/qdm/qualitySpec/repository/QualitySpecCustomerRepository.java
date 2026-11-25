package com.dongkuk.dmes.mqc.qdm.qualitySpec.repository;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecCustomer;
import org.springframework.data.jpa.repository.JpaRepository;

/** 고객(가명). */
public interface QualitySpecCustomerRepository extends JpaRepository<QualitySpecCustomer, String> {
}
