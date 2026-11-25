package com.dongkuk.dmes.mqc.qdr.qualityDesignResult.repository;

import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain.DesignRequest;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DesignRequestRepository extends JpaRepository<DesignRequest, String> {
}
