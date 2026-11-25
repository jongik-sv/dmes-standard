package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository;

import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcImage;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MtcImageRepository extends JpaRepository<MtcImage, String> {

    List<MtcImage> findAllByOrderBySortSeqAsc();

    @Query("select coalesce(max(x.sortSeq), 0) from MtcImage x")
    int maxSortSeq();
}
