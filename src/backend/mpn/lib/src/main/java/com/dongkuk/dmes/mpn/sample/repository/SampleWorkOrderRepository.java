package com.dongkuk.dmes.mpn.sample.repository;

import com.dongkuk.dmes.mpn.sample.domain.SampleWorkOrder;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SampleWorkOrderRepository extends JpaRepository<SampleWorkOrder, Long> {
}
