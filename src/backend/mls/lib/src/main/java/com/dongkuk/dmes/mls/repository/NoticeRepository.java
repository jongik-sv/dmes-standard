/*
 * 작성자: Agent
 * 작성일: 2026-09-03
 * 내용: Notice (TB_MLS_NOTICE) JPA Repository — noticeMgmt 화면 owner (search + 채번)
 */
package com.dongkuk.dmes.mls.repository;

import com.dongkuk.dmes.mls.entity.Notice;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

/**
 * {@code TB_MLS_NOTICE} JPA Repository (noticeMgmt 화면 owner).
 *
 * <p>기능설계서 §3 조회조건 S-001~S-004 를 단일 JPQL 로 처리한다.
 * 방언 독립을 위해 native query 를 쓰지 않는다 — local 은 SQLite, 운영은 MSSQL 이다.
 *
 * <p><b>null-guard 관용구</b>: {@code (:p IS NULL OR :p = '' OR ...)} 는 mcm
 * {@code SecRoleRepository.searchByFilter} 가 쓰는 정본 패턴이다. FE 가 미입력 조건을 빈 문자열로
 * 보내오므로 {@code IS NULL} 만으로는 부족하다.
 */
public interface NoticeRepository extends JpaRepository<Notice, String> {

    /**
     * 기능설계서 §3 조회 (S-001 제목 LIKE / S-002 게시상태 일치 / S-003·S-004 게시기간 교차).
     *
     * <p><b>게시기간은 "포함" 이 아니라 "교차" 다</b> — 조회 구간 [from, to] 와 공지의 게시구간
     * [postStartDt, postEndDt] 가 하루라도 겹치면 결과에 포함한다. 게시기간이 비어 있는(NULL) 공지는
     * 기간 조건으로 배제하지 않는다 (작성중 공지가 기간 미입력 상태로 존재할 수 있기 때문이다).
     *
     * <p>ORDER BY {@code NOTICE_ID DESC} — 채번이 {@code NT + yyyyMMdd + 순번} 이므로 최신 등록이 위로 온다.
     */
    @Query("""
            SELECT n FROM Notice n
            WHERE (:pTitle IS NULL OR :pTitle = ''
                   OR UPPER(n.title) LIKE UPPER(CONCAT('%', :pTitle, '%')))
              AND (:pStatus IS NULL OR :pStatus = '' OR n.noticeStatus = :pStatus)
              AND (:pFromDt IS NULL OR n.postEndDt IS NULL OR n.postEndDt >= :pFromDt)
              AND (:pToDt IS NULL OR n.postStartDt IS NULL OR n.postStartDt <= :pToDt)
            ORDER BY n.noticeId DESC
            """)
    List<Notice> searchByFilter(@Param("pTitle") String pTitle,
                                @Param("pStatus") String pStatus,
                                @Param("pFromDt") LocalDate pFromDt,
                                @Param("pToDt") LocalDate pToDt);

    /**
     * 채번 보조 — 같은 날짜 prefix 의 마지막 {@code NOTICE_ID} 1건.
     *
     * <p>{@code MAX()} 집계 대신 {@code ORDER BY DESC} + {@link Limit} 을 쓰는 이유는
     * {@code SecRoleRepository.findRoleGroupIdsByRoleId} 와 동일하다 — Hibernate 가 방언별
     * {@code TOP} / {@code LIMIT} 을 생성해 주므로 SQLite·MSSQL 양쪽에서 그대로 동작한다.
     */
    @Query("SELECT n.noticeId FROM Notice n WHERE n.noticeId LIKE CONCAT(:prefix, '%') ORDER BY n.noticeId DESC")
    List<String> findNoticeIdsByPrefix(@Param("prefix") String prefix, Limit limit);

    /** 채번용 — prefix 의 마지막 채번값 (없으면 null). */
    default String findLastNoticeIdByPrefix(String prefix) {
        List<String> ids = findNoticeIdsByPrefix(prefix, Limit.of(1));
        return ids.isEmpty() ? null : ids.get(0);
    }
}
