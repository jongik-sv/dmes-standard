/*
 * 작성자: Agent
 * 작성일: 2026-09-03
 * 내용: Notice (TB_MCM_NOTICE) JPA Repository — noticeMgmt 화면 owner (search + 채번)
 */
package com.dongkuk.dmes.mcm.notice.repository;

import com.dongkuk.dmes.mcm.notice.entity.Notice;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

/**
 * {@code TB_MCM_NOTICE} JPA Repository (noticeMgmt 화면 owner).
 *
 * <p>기능설계서 §3 조회조건 S-001~S-006 과 홈 공지 목록(noticeBoard)을 JPQL 로 처리한다.
 * native query 는 쓰지 않는다. 다만 아래 null-guard 는 Oracle 의 빈 문자열 = NULL 동작에 기댄다(대상 DB 는 Oracle).
 *
 * <p><b>null-guard 관용구</b>: {@code (:p IS NULL OR ...)}. FE 는 미입력 조건을 빈 문자열로 보내오는데, Oracle 은 빈 문자열
 * 바인드를 NULL 로 다루므로 {@code IS NULL} 하나로 미입력(null·빈 문자열)을 함께 거른다(2026-10-07 oracle-1007 — 옛
 * {@code OR :p = ''} 는 Oracle 에서 늘 거짓이라 뺐다).
 */
public interface NoticeRepository extends JpaRepository<Notice, String> {

    /**
     * 기능설계서 §3 조회 (S-001 제목 LIKE / S-002 게시상태 일치 / S-003·S-004 게시기간 교차 /
     * S-005 공지 분류 일치 / S-006 본문 형식 일치).
     *
     * <p><b>게시기간은 "포함" 이 아니라 "교차" 다</b> — 조회 구간 [from, to] 와 공지의 게시구간
     * [postStartDt, postEndDt] 가 하루라도 겹치면 결과에 포함한다. 게시기간이 비어 있는(NULL) 공지는
     * 기간 조건으로 배제하지 않는다 (작성중 공지가 기간 미입력 상태로 존재할 수 있기 때문이다).
     *
     * <p>ORDER BY {@code NOTICE_ID DESC} — 채번이 {@code NT + yyyyMMdd + 순번} 이므로 최신 등록이 위로 온다.
     */
    @Query("""
            SELECT n FROM Notice n
            WHERE (:pTitle IS NULL
                   OR UPPER(n.title) LIKE UPPER(CONCAT('%', :pTitle, '%')))
              AND (:pStatus IS NULL OR n.noticeStatus = :pStatus)
              AND (:pFromDt IS NULL OR n.postEndDt IS NULL OR n.postEndDt >= :pFromDt)
              AND (:pToDt IS NULL OR n.postStartDt IS NULL OR n.postStartDt <= :pToDt)
              AND (:pCategory IS NULL OR n.noticeCategory = :pCategory)
              AND (:pFormat IS NULL OR n.contentFormat = :pFormat)
            ORDER BY n.noticeId DESC
            """)
    List<Notice> searchByFilter(@Param("pTitle") String pTitle,
                                @Param("pStatus") String pStatus,
                                @Param("pFromDt") LocalDate pFromDt,
                                @Param("pToDt") LocalDate pToDt,
                                @Param("pCategory") String pCategory,
                                @Param("pFormat") String pFormat,
                                Limit limit);

    /** 상한 없이 조건 조회. */
    default List<Notice> searchByFilter(String pTitle, String pStatus, LocalDate pFromDt, LocalDate pToDt,
                                        String pCategory, String pFormat) {
        return searchByFilter(pTitle, pStatus, pFromDt, pToDt, pCategory, pFormat, Limit.unlimited());
    }

    /**
     * 목록용 요약 조회 — {@link #searchByFilter} 와 같은 조건·정렬이되 본문(CONTENT)을 읽지 않는다(화면 성능 가이드 R1).
     * 본문은 최대 20만 자라 목록 응답이 수 MB 가 되는 원인이다.
     * 열 순서: NOTICE_ID, TITLE, NOTICE_STATUS, CONTENT_FORMAT, NOTICE_CATEGORY, PIN_YN, TARGET_SCOPE,
     * POST_START_DT, POST_END_DT, C_USR_ID, C_AT. {@code limit} 은 앞쪽 N건만 읽는다.
     */
    @Query("""
            SELECT n.noticeId, n.title, n.noticeStatus, n.contentFormat, n.noticeCategory, n.pinYn, n.targetScope,
                   n.postStartDt, n.postEndDt, n.createdBy, n.createdAt
            FROM Notice n
            WHERE (:pTitle IS NULL
                   OR UPPER(n.title) LIKE UPPER(CONCAT('%', :pTitle, '%')))
              AND (:pStatus IS NULL OR n.noticeStatus = :pStatus)
              AND (:pFromDt IS NULL OR n.postEndDt IS NULL OR n.postEndDt >= :pFromDt)
              AND (:pToDt IS NULL OR n.postStartDt IS NULL OR n.postStartDt <= :pToDt)
              AND (:pCategory IS NULL OR n.noticeCategory = :pCategory)
              AND (:pFormat IS NULL OR n.contentFormat = :pFormat)
            ORDER BY n.noticeId DESC
            """)
    List<Object[]> searchSummaryByFilter(@Param("pTitle") String pTitle,
                                         @Param("pStatus") String pStatus,
                                         @Param("pFromDt") LocalDate pFromDt,
                                         @Param("pToDt") LocalDate pToDt,
                                         @Param("pCategory") String pCategory,
                                         @Param("pFormat") String pFormat,
                                         Limit limit);

    // 전체 건수는 JpaRepository.count() 를 쓴다 — 상한은 조건이 없을 때만 걸리므로 전체 건수가 곧 totalCount 다.

    /** 조건 없이 전건 — 저장·상태변경 뒤 재조회용. */
    default List<Notice> searchAll() {
        return searchByFilter(null, null, null, null, null, null);
    }

    /**
     * 홈 화면 공지 목록 (noticeBoard) — 게시중이고 {@code pToday} 가 게시기간 안인 공지.
     *
     * <p>게시 대상(V4): {@code TARGET_SCOPE='ALL'} 이거나, {@code 'ROLE'} 이고 {@code pRoles}(현재 사용자 역할 ID) 중 하나가
     * TB_MCM_NOTICE_TARGET 에 있는 공지. {@code pRoles} 는 비우면 안 된다 — 역할이 없는 사용자는 서비스가 결코 일치하지 않는
     * 값 하나를 넣어 보낸다(빈 IN 목록은 방언마다 문법 오류가 난다).
     *
     * <p>게시기간의 시작·종료가 NULL 이면 그 쪽은 열린 구간으로 본다. 상태값({@code POSTED})과 기준일은 서비스가
     * 고정해서 넘긴다 — 모든 로그인 사용자가 부르는 경로라 요청 값으로 조회 범위를 넓힐 수 없어야 한다.
     *
     * <p>정렬: 상단 고정(PIN_YN='Y') → 긴급(URGENT) → 등록 시각 최신 → 공지번호 역순. 등록 시각이 NULL 인 행
     * (V2 시드처럼 C_AT 없이 넣은 행)은 맨 뒤로 보낸다 — DESC 정렬에서 NULL 의 위치가 SQLite 와 Oracle·PostgreSQL 이
     * 서로 달라서 CASE 로 고정한다. 같은 이유로 {@code NULLS LAST} 대신 CASE 를 쓴다.
     */
    @Query("""
            SELECT n FROM Notice n
            WHERE n.noticeStatus = :pStatus
              AND (n.postStartDt IS NULL OR n.postStartDt <= :pToday)
              AND (n.postEndDt IS NULL OR n.postEndDt >= :pToday)
              AND (n.targetScope = 'ALL'
                   OR (n.targetScope = 'ROLE'
                       AND EXISTS (SELECT 1 FROM NoticeTarget t
                                    WHERE t.noticeId = n.noticeId AND t.roleId IN :pRoles)))
            ORDER BY CASE WHEN n.pinYn = 'Y' THEN 0 ELSE 1 END,
                     CASE WHEN n.noticeCategory = 'URGENT' THEN 0 ELSE 1 END,
                     CASE WHEN n.createdAt IS NULL THEN 1 ELSE 0 END,
                     n.createdAt DESC,
                     n.noticeId DESC
            """)
    List<Notice> findBoard(@Param("pStatus") String pStatus,
                           @Param("pToday") LocalDate pToday,
                           @Param("pRoles") Collection<String> pRoles,
                           Limit limit);

    /**
     * 홈 공지 목록 요약 — {@link #findBoard} 와 같은 조건·정렬이되 본문(CONTENT)을 읽지 않는다(화면 성능 가이드 R1).
     * 열 순서: NOTICE_ID, TITLE, CONTENT_FORMAT, NOTICE_CATEGORY, PIN_YN, POST_START_DT, POST_END_DT, C_USR_ID, C_AT.
     */
    @Query("""
            SELECT n.noticeId, n.title, n.contentFormat, n.noticeCategory, n.pinYn,
                   n.postStartDt, n.postEndDt, n.createdBy, n.createdAt
            FROM Notice n
            WHERE n.noticeStatus = :pStatus
              AND (n.postStartDt IS NULL OR n.postStartDt <= :pToday)
              AND (n.postEndDt IS NULL OR n.postEndDt >= :pToday)
              AND (n.targetScope = 'ALL'
                   OR (n.targetScope = 'ROLE'
                       AND EXISTS (SELECT 1 FROM NoticeTarget t
                                    WHERE t.noticeId = n.noticeId AND t.roleId IN :pRoles)))
            ORDER BY CASE WHEN n.pinYn = 'Y' THEN 0 ELSE 1 END,
                     CASE WHEN n.noticeCategory = 'URGENT' THEN 0 ELSE 1 END,
                     CASE WHEN n.createdAt IS NULL THEN 1 ELSE 0 END,
                     n.createdAt DESC,
                     n.noticeId DESC
            """)
    List<Object[]> findBoardSummary(@Param("pStatus") String pStatus,
                                    @Param("pToday") LocalDate pToday,
                                    @Param("pRoles") Collection<String> pRoles,
                                    Limit limit);

    /**
     * 홈 공지 상세 1건 — 목록과 같은 가시성 조건(게시중·게시기간·대상)을 그대로 걸어, 목록에 보이지 않는 공지는 번호를 알아도 받지 못한다.
     */
    @Query("""
            SELECT n FROM Notice n
            WHERE n.noticeId = :pNoticeId
              AND n.noticeStatus = :pStatus
              AND (n.postStartDt IS NULL OR n.postStartDt <= :pToday)
              AND (n.postEndDt IS NULL OR n.postEndDt >= :pToday)
              AND (n.targetScope = 'ALL'
                   OR (n.targetScope = 'ROLE'
                       AND EXISTS (SELECT 1 FROM NoticeTarget t
                                    WHERE t.noticeId = n.noticeId AND t.roleId IN :pRoles)))
            """)
    List<Notice> findBoardOne(@Param("pNoticeId") String pNoticeId,
                              @Param("pStatus") String pStatus,
                              @Param("pToday") LocalDate pToday,
                              @Param("pRoles") Collection<String> pRoles);

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
