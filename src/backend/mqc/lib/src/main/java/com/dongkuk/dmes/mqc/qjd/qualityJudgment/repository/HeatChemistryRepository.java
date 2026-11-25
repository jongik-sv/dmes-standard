package com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.HeatChemistry;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.HeatChemistryId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HeatChemistryRepository extends JpaRepository<HeatChemistry, HeatChemistryId> {

    List<HeatChemistry> findByHeatNoOrderBySeqAsc(String heatNo);
}
