/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecUserRollHis (TB_MCM_SEC_USER_ROLL_HIS) JPA Repository — commUserMng 화면 owner (W5)
 *       정책 #3 (C) / Q-004 해소 — As-Is TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK 흡수
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecUserRollHis;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_USER_ROLL_HIS} JPA Repository — Spring Data 표준 CRUD (commUserMng 화면 owner / W5).
 *
 * <p>정책 #3 (C) / Q-004 해소 — As-Is 외부 namespace
 * {@code TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK}
 * (SaveRoleGroupHis.java:53/67 / SaveRoleGroupCopyHis.java:60) 호출 흡수.
 *
 * <p>As-Is mergePK = 복합 PK (OP_SUMUP_DT, WORKS_CODE, USER_ID, ROLE_GROUP_ID, RESP_GBN) 동일 시 upsert.
 * To-Be JPA save() 가 동일 동작 (existsById → update / 아니면 insert). saveAll 도 동일.
 *
 * <p>PK 복합 5 컬럼 — {@link SecUserRollHis.PK} {@code @IdClass}.
 */
public interface SecUserRollHisRepository extends JpaRepository<SecUserRollHis, SecUserRollHis.PK> {
}
