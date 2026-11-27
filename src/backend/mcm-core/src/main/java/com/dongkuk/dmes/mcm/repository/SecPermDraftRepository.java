/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: SecPermDraftRepository — TB_MCM_SEC_PERM_DRAFT JPA 저장소 (권한 작업대 초안)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecPermDraft;
import org.springframework.data.jpa.repository.JpaRepository;

/** 권한 작업대 초안({@link SecPermDraft}) 저장소. 키 = 초안 주인 사용자 아이디. */
public interface SecPermDraftRepository extends JpaRepository<SecPermDraft, String> {
}
