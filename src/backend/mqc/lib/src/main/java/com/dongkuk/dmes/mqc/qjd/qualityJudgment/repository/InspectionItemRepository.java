package com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.InspectionItem;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.InspectionItemId;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InspectionItemRepository extends JpaRepository<InspectionItem, InspectionItemId> {

    List<InspectionItem> findByCoilNoOrderBySeqAsc(String coilNo);

    List<InspectionItem> findByCoilNoInOrderByCoilNoAscSeqAsc(Collection<String> coilNos);

    /** 검사 시각이 [from, to) 인 코일의 검사 항목 전부(목록 배지용). */
    @Query("select i from InspectionItem i, Coil c where c.coilNo = i.coilNo and c.inspAt >= :from and c.inspAt < :to"
            + " order by i.coilNo, i.seq")
    List<InspectionItem> findByInspRange(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    List<InspectionItem> findAllByOrderByCoilNoAscSeqAsc();
}
