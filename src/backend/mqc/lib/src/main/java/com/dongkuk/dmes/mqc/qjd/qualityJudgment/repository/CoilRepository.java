package com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.Coil;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CoilRepository extends JpaRepository<Coil, String> {

    /** 검사 시각이 [from, to) 인 코일, 최근 검사 순. */
    List<Coil> findByInspAtGreaterThanEqualAndInspAtLessThanOrderByInspAtDescCoilNoAsc(LocalDateTime from, LocalDateTime to);

    List<Coil> findByOrdNoOrderByCoilNoAsc(String ordNo);

    List<Coil> findAllByOrderByCoilNoAsc();
}
