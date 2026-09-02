package com.dongkuk.dmes.mcm.sample.repository;

import com.dongkuk.dmes.mcm.sample.domain.SampleMasterCode;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SampleMasterCodeRepository extends JpaRepository<SampleMasterCode, Long> {

    List<SampleMasterCode> findByCodeGroupAndUseYn(String codeGroup, String useYn);
}
