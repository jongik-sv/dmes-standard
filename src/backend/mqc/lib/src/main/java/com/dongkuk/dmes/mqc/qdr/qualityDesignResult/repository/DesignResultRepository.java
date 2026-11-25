package com.dongkuk.dmes.mqc.qdr.qualityDesignResult.repository;

import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain.DesignResult;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DesignResultRepository extends JpaRepository<DesignResult, String> {
}
