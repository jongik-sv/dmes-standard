package com.dongkuk.dmes.mqc.qdm.qualitySpec.repository;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecTerm;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** 사양 조건·결과. */
public interface QualitySpecTermRepository extends JpaRepository<QualitySpecTerm, QualitySpecTerm.Key> {

    List<QualitySpecTerm> findBySpecNoOrderBySideAscSeqAsc(String specNo);
}
