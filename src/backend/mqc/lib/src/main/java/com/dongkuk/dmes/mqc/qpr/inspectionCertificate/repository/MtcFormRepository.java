package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository;

import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcForm;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MtcFormRepository extends JpaRepository<MtcForm, String> {

    List<MtcForm> findAllByOrderBySortSeqAsc();

    @Query("select coalesce(max(x.sortSeq), 0) from MtcForm x")
    int maxSortSeq();
}
