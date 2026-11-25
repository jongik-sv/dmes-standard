package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository;

import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcRule;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MtcRuleRepository extends JpaRepository<MtcRule, String> {

    List<MtcRule> findAllByOrderBySortSeqAsc();

    @Query("select coalesce(max(x.sortSeq), 0) from MtcRule x")
    int maxSortSeq();
}
