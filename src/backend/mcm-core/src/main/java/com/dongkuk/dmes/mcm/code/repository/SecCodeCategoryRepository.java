package com.dongkuk.dmes.mcm.code.repository;

import com.dongkuk.dmes.mcm.code.entity.SecCodeCategory;
import com.dongkuk.dmes.mcm.code.entity.SecCodeCategoryId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface SecCodeCategoryRepository extends JpaRepository<SecCodeCategory, SecCodeCategoryId> {

    @Query("SELECT c FROM SecCodeCategory c WHERE c.id.groupCd = :groupCd ORDER BY c.sortOrd ASC, c.id.categoryCd ASC")
    List<SecCodeCategory> findByGroupCd(@Param("groupCd") String groupCd);

    @Query("SELECT c FROM SecCodeCategory c ORDER BY c.id.groupCd ASC, c.sortOrd ASC, c.id.categoryCd ASC")
    List<SecCodeCategory> findAllOrdered();

    @Modifying
    @Transactional
    @Query("DELETE FROM SecCodeCategory c WHERE c.id.groupCd = :groupCd")
    void deleteByGroupCd(@Param("groupCd") String groupCd);
}
