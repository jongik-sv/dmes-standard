package com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.JudgmentHistory;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JudgmentHistoryRepository extends JpaRepository<JudgmentHistory, Long> {

    List<JudgmentHistory> findByCoilNoOrderByActAtDescHistNoDesc(String coilNo);

    List<JudgmentHistory> findByActAtGreaterThanEqualAndActAtLessThanOrderByActAtDescHistNoDesc(LocalDateTime from, LocalDateTime to);
}
