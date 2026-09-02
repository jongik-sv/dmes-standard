package com.dongkuk.dmes.cactus.security.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 사용자 정보(TB_SEC_USER) JPA 리포지토리.
 */
public interface SecUserRepository extends JpaRepository<SecUser, String> {

    /** 로그인 시도 횟수를 0으로 초기화한다. */
    @Modifying
    @Query("UPDATE SecUser u SET u.tryCnt = 0 WHERE u.userId = :userId")
    void resetTryCnt(@Param("userId") String userId);

    /** 로그인 시도 횟수를 1 증가시킨다. */
    @Modifying
    @Query("UPDATE SecUser u SET u.tryCnt = COALESCE(u.tryCnt, 0) + 1 WHERE u.userId = :userId")
    void incrementTryCnt(@Param("userId") String userId);

    /** 사용자를 잠금 처리한다. */
    @Modifying
    @Query("UPDATE SecUser u SET u.lockYn = 'Y' WHERE u.userId = :userId")
    void lockUser(@Param("userId") String userId);

    /** 사용자 잠금을 해제하고 시도 횟수를 초기화한다. */
    @Modifying
    @Query("UPDATE SecUser u SET u.lockYn = 'N', u.tryCnt = 0 WHERE u.userId = :userId")
    void unlockUser(@Param("userId") String userId);
}
