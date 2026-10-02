/*
 * 작성자: Agent
 * 작성일: 2026-10-02
 * 내용: NoticeTarget (TB_MLS_NOTICE_TARGET) JPA Repository — 공지 게시 대상 역할
 */
package com.dongkuk.dmes.mls.repository;

import com.dongkuk.dmes.mls.entity.NoticeTarget;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

/**
 * {@code TB_MLS_NOTICE_TARGET} JPA Repository.
 *
 * <p>대상 교체는 일괄 DELETE 쿼리를 쓰지 않고, 기존 행을 엔티티로 읽어 빠진 것만 지우고 새 것만 넣는다(NoticeMgmtService
 * {@code syncTargets}). 일괄 DELETE 는 영속성 컨텍스트를 우회해서, 같은 트랜잭션에서 같은 PK 를 다시 저장하면 Hibernate 가
 * 지워진 행을 UPDATE 하려다 실패한다.
 */
public interface NoticeTargetRepository extends JpaRepository<NoticeTarget, NoticeTarget.Key> {

    /** 목록 행에 대상을 붙일 때 한 번에 읽는다(N+1 방지). 정렬은 공지번호·역할 ID 순. */
    @Query("SELECT t FROM NoticeTarget t WHERE t.noticeId IN :ids ORDER BY t.noticeId, t.roleId")
    List<NoticeTarget> findByNoticeIds(@Param("ids") Collection<String> ids);

}
