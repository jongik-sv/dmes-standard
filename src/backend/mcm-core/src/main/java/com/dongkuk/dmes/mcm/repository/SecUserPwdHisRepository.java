/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: SecUserPwdHis (TB_MCM_SEC_USER_PWD_HIS) JPA Repository — 비밀번호 재사용 금지·변경 이력(V24)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecUserPwdHis;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/** 비밀번호 이력 저장소. */
public interface SecUserPwdHisRepository extends JpaRepository<SecUserPwdHis, SecUserPwdHis.PK> {

    /** 본인 변경(SELF) 이력의 해시 — 최근 것부터. 재사용 비교용. */
    @Query("SELECT h.userEncPwd FROM SecUserPwdHis h WHERE h.userId = :userId AND h.chgTp = 'SELF' ORDER BY h.chgAt DESC")
    List<String> findRecentSelfHashes(@Param("userId") String userId, Pageable page);
}
