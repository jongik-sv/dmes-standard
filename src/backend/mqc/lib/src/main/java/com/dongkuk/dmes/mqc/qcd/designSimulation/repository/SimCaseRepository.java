package com.dongkuk.dmes.mqc.qcd.designSimulation.repository;

import com.dongkuk.dmes.mqc.qcd.designSimulation.domain.SimCase;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SimCaseRepository extends JpaRepository<SimCase, String> {

    List<SimCase> findAllByOrderByCaseIdAsc();
}
