package com.dongkuk.dmes.mcm.startpgm.repository;

import com.dongkuk.dmes.mcm.startpgm.entity.SecUserStartPgm;
import com.dongkuk.dmes.mcm.startpgm.entity.SecUserStartPgmId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface SecUserStartPgmRepository
        extends JpaRepository<SecUserStartPgm, SecUserStartPgmId> {

    List<SecUserStartPgm> findByUserIdOrderByStartSeqAsc(String userId);

    /** 같은 (userId, fullId, menuId) 기본 화면 존재 확인용 (토글 on/off 판정). */
    List<SecUserStartPgm> findByUserIdAndFullIdAndMenuId(String userId, String fullId, String menuId);

    @Query("SELECT COALESCE(MAX(s.startSeq), 0) FROM SecUserStartPgm s WHERE s.userId = :userId")
    Integer maxStartSeqByUserId(@Param("userId") String userId);

    /** 토글 off — 해당 메뉴 기본 화면 제거. 서비스에 {@code @Transactional} 을 둘 수 없어 여기서 원자성을 확보한다. */
    @Modifying
    @Transactional
    void deleteByUserIdAndFullIdAndMenuId(String userId, String fullId, String menuId);
}
