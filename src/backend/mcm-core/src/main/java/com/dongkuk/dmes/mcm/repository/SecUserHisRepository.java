/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecUserHis (TB_MCM_SEC_USER_HIS) JPA Repository — commUserMng 화면 owner (W5)
 *       정책 #3 (C) / Q-004 해소 — As-Is TB_MCM_SEC_USER_HIS_Mapper.insert 흡수
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecUserHis;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_USER_HIS} JPA Repository — Spring Data 표준 CRUD (commUserMng 화면 owner / W5).
 *
 * <p>정책 #3 (C) / Q-004 해소 — As-Is 외부 namespace
 * {@code TB_MCM_SEC_USER_HIS_Mapper.insert} (DeleteCommUserMng:64 / RegCommUserMng:70 / ReRegCommUserMng:78) 호출 흡수.
 * Service 가 본 Repository.save(SecUserHis) 로 직접 호출.
 *
 * <p>PK 복합 (USER_ID, ACTIVE_DT) — {@link SecUserHis.PK} {@code @IdClass}.
 */
public interface SecUserHisRepository extends JpaRepository<SecUserHis, SecUserHis.PK> {
}
