package com.dongkuk.dmes.mcm.favorite.repository;

import com.dongkuk.dmes.mcm.favorite.entity.SecUserFavorite;
import com.dongkuk.dmes.mcm.favorite.entity.SecUserFavoriteId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface SecUserFavoriteRepository
        extends JpaRepository<SecUserFavorite, SecUserFavoriteId> {

    List<SecUserFavorite> findByUserId(String userId);

    /** 폴더 무관 — 같은 (userId, fullId, menuId) 즐겨찾기 존재 확인용 (토글 on/off 판정). */
    List<SecUserFavorite> findByUserIdAndFullIdAndMenuId(String userId, String fullId, String menuId);

    @Query("SELECT COALESCE(MAX(f.fvtSeq), 0) FROM SecUserFavorite f "
            + "WHERE f.userId = :userId AND f.fvtFoldId = :fvtFoldId")
    Integer maxFvtSeqByUserIdAndFold(@Param("userId") String userId, @Param("fvtFoldId") String fvtFoldId);

    /** 토글 off — 폴더 무관 해당 메뉴 즐겨찾기 제거. */
    @Modifying
    @Transactional
    void deleteByUserIdAndFullIdAndMenuId(String userId, String fullId, String menuId);

    /** 폴더 삭제 시 하위 즐겨찾기 일괄 제거. */
    @Modifying
    @Transactional
    void deleteByUserIdAndFvtFoldId(String userId, String fvtFoldId);
}
