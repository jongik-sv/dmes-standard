package com.dongkuk.dmes.mcm.favorite.repository;

import com.dongkuk.dmes.mcm.favorite.entity.SecUserFavoriteFold;
import com.dongkuk.dmes.mcm.favorite.entity.SecUserFavoriteFoldId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface SecUserFavoriteFoldRepository
        extends JpaRepository<SecUserFavoriteFold, SecUserFavoriteFoldId> {

    List<SecUserFavoriteFold> findByUserIdOrderByFvtFoldSeq(String userId);

    @Query("SELECT COALESCE(MAX(f.fvtFoldSeq), 0) FROM SecUserFavoriteFold f WHERE f.userId = :userId")
    Integer maxFoldSeqByUserId(@Param("userId") String userId);

    @Modifying
    @Transactional
    void deleteByUserIdAndFvtFoldId(String userId, String fvtFoldId);
}
