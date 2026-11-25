package com.dongkuk.dmes.mqc.qpr.common;

import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OutputHistoryRepository extends JpaRepository<OutputHistory, Long> {

    List<OutputHistory> findByDocTpAndDocNoOrderByActAtDescHistNoDesc(String docTp, String docNo);

    List<OutputHistory> findByDocTpAndActAtGreaterThanEqualAndActAtLessThanOrderByActAtDescHistNoDesc(
            String docTp, LocalDateTime from, LocalDateTime to);
}
