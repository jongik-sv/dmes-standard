package com.dongkuk.dmes.mqc.qdr.qualityDesignResult.repository;

import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain.DesignHistory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DesignHistoryRepository extends JpaRepository<DesignHistory, Long> {

    List<DesignHistory> findByOrdKeyOrderByActDttmDescHistIdDesc(String ordKey);
}
