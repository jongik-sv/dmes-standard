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

    @Modifying
    @Transactional
    @Query("DELETE FROM SecCodeItem i WHERE i.id.groupCd = :groupCd")
    void deleteByGroupCd(@Param("groupCd") String groupCd);
}
