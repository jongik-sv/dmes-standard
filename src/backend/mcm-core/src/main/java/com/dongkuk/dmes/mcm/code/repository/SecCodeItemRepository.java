package com.dongkuk.dmes.mcm.code.repository;

import com.dongkuk.dmes.mcm.code.entity.SecCodeItem;
import com.dongkuk.dmes.mcm.code.entity.SecCodeItemId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface SecCodeItemRepository extends JpaRepository<SecCodeItem, SecCodeItemId> {

    @Query("SELECT i FROM SecCodeItem i WHERE i.id.groupCd = :groupCd ORDER BY i.sortOrd ASC")
    List<SecCodeItem> findByGroupCdOrderBySortOrdAsc(@Param("groupCd") String groupCd);

    @Query("SELECT i FROM SecCodeItem i WHERE i.id.groupCd = :groupCd AND i.useYn = 'Y' ORDER BY i.sortOrd ASC")
    List<SecCodeItem> findActiveByGroupCd(@Param("groupCd") String groupCd);

    /** 사용 중 항목 코드만 정렬 순서대로 — 조건(codeGroup) 확인용이라 개수를 쿼리에서 제한한다(Pageable). */
    @Query("SELECT i.id.itemCd FROM SecCodeItem i WHERE i.id.groupCd = :groupCd AND i.useYn = 'Y' ORDER BY i.sortOrd ASC")
    List<String> findActiveItemCds(@Param("groupCd") String groupCd, org.springframework.data.domain.Pageable pageable);

    @Modifying
    @Transactional
    @Query("DELETE FROM SecCodeItem i WHERE i.id.groupCd = :groupCd")
    void deleteByGroupCd(@Param("groupCd") String groupCd);
}
