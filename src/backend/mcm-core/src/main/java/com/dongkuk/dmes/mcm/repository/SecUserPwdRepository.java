/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecUserPwd (TB_MCM_SEC_USER_PWD) JPA Repository — commUserMng 화면 owner (W5)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecUserPwd;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_USER_PWD} JPA Repository (commUserMng 화면 owner / W5).
 *
 * <p>인용 SQL (분석리포트 §6):
 * <ul>
 *   <li>표준 save() = As-Is {@code mergeCommonPwdInit} (xml:203~225) — Oracle MERGE 등가 (PK 존재 시 UPDATE, 미존재 시 INSERT).
 *       Service 는 findById 후 존재 시 UPDATE 필드 set 후 save / 미존재 시 new + save.</li>
 *   <li>{@link #updateSsoPwd(String, String)} = As-Is {@code updateCommonSSOPwdInit} (xml:244~249) —
 *       SSO 일괄 초기화 (PasswordInit.java:42 분기). USER_SSO_PWD 만 SET.</li>
 * </ul>
 *
 * <p>To-Be 정책 #3 (B) — As-Is {@code updateCommonPwdInit} (xml:196~201) 미사용 SQL 폐기.
 */
public interface SecUserPwdRepository extends JpaRepository<SecUserPwd, String> {

    /**
     * As-Is {@code updateCommonSSOPwdInit} (xml:244~249) MSSQL 변환 — SSO 비밀번호만 SET.
     * {@code UPDATE TB_MCM_SEC_USER_PWD SET USER_SSO_PWD = #{USER_SSO_PWD} WHERE USER_ID = #{USER_ID}}.
     */
    @Modifying
    @Query("UPDATE SecUserPwd p SET p.userSsoPwd = :userSsoPwd WHERE p.userId = :userId")
    int updateSsoPwd(@Param("userId") String userId,
                     @Param("userSsoPwd") String userSsoPwd);
}
