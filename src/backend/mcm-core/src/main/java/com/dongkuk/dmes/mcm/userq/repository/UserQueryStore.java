package com.dongkuk.dmes.mcm.userq.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import org.springframework.stereotype.Repository;

/**
 * 공용 쿼리 조회의 정적 SQL(스펙 2026-10-10-user-query-program-design §4.1·§4.2). 조회조건 5개 search·사용자 myList·할당 탭·
 * 사용자 목록. Spring Data 인터페이스가 아니라 EntityManager 클래스다 — {@code (+)} 외부 조인·EXISTS 조건이 JSQ 표현보다 직접적이고,
 * 이 패키지 시험 구성이 사용자 엔티티를 올리지 않아도 컨텍스트가 뜨게 한다({@code WidgetUserLookupRepository} 와 같은 이유).
 * LIKE 값의 이스케이프는 서비스가 마친 값을 받는.
 */
@Repository
public class UserQueryStore {

    @PersistenceContext(unitName = "default")
    private EntityManager em;

    public UserQueryStore() {}

    /** 시험용 — EntityManager 를 직접 넣는다. */
    public UserQueryStore(EntityManager em) {
        this.em = em;
    }

    /**
     * 관리 목록(§4.1 search). 열 순서: QUERY_ID, QUERY_NM, CATEGORY_CD, OWNER_DEPT_CD, OWNER_DEPT_NM, USE_YN,
     * MAX_ROW_CNT, ASSIGN_CNT, U_AT, U_USR_ID. 빈 조건은 null 로 바인드한다.
     *
     * @param keyword     부분 일치(이스케이프 마친 값) — ID·이름
     * @param ownerDept   부서 이름 부분 일치(이스케이프 마친 값)
     * @param assignUser  할당 사용자 ID·이름 앞 일치(이스케이프 마친 값)
     * @param ownerDeptCd {@code ownerDept} 원래 값 — 부서 코드 같음 조건에 쓴다
     */
    @SuppressWarnings("unchecked")
    public List<Object[]> search(String categoryCd, String keyword, String useYn, String ownerDept, String assignUser,
                                 String ownerDeptCd) {
        return em.createNativeQuery("""
                        SELECT A.QUERY_ID
                             , A.QUERY_NM
                             , A.CATEGORY_CD
                             , A.OWNER_DEPT_CD
                             , B.DEPT_NM OWNER_DEPT_NM
                             , A.USE_YN
                             , A.MAX_ROW_CNT
                             , (SELECT COUNT(*)
                                FROM   MCMAPUSER.TB_MCM_USRQ_ASSIGN C
                                WHERE  C.QUERY_ID = A.QUERY_ID) ASSIGN_CNT
                             , A.U_AT
                             , A.U_USR_ID
                        FROM   MCMAPUSER.TB_MCM_USRQ_DEF A
                             , MCMAPUSER.TB_MCM_DEPT_INFO B
                        WHERE  B.DEPT_CD(+) = A.OWNER_DEPT_CD
                        AND    (:categoryCd IS NULL OR A.CATEGORY_CD = :categoryCd)
                        AND    (:useYn IS NULL OR A.USE_YN = :useYn)
                        AND    (:keyword IS NULL
                                OR UPPER(A.QUERY_ID) LIKE '%' || UPPER(:keyword) || '%' ESCAPE '\\'
                                OR UPPER(A.QUERY_NM) LIKE '%' || UPPER(:keyword) || '%' ESCAPE '\\')
                        -- 담당 부서 이름 조건은 외부 조인 뒤에 일부러 거른다((+) 없음)
                        AND    (:ownerDept IS NULL
                                OR A.OWNER_DEPT_CD = UPPER(:ownerDeptCd)
                                OR B.DEPT_NM LIKE '%' || :ownerDept || '%' ESCAPE '\\')
                        AND    (:assignUser IS NULL OR EXISTS
                               (SELECT 1
                                FROM   MCMAPUSER.TB_MCM_USRQ_ASSIGN C
                                     , MCMAPUSER.TB_MCM_SEC_USER D
                                WHERE  D.USER_ID(+) = C.USER_ID
                                AND    C.QUERY_ID = A.QUERY_ID
                                -- 사용자 이름 조건은 외부 조인 뒤에 일부러 거른다((+) 없음)
                                AND    (UPPER(C.USER_ID) LIKE UPPER(:assignUser) || '%' ESCAPE '\\'
                                        OR UPPER(D.USER_NM) LIKE UPPER(:assignUser) || '%' ESCAPE '\\')))
                        ORDER BY A.CATEGORY_CD, A.QUERY_NM, A.QUERY_ID
                        """)
                .setParameter("categoryCd", categoryCd)
                .setParameter("keyword", keyword)
                .setParameter("useYn", useYn)
                .setParameter("ownerDept", ownerDept)
                .setParameter("ownerDeptCd", ownerDeptCd)
                .setParameter("assignUser", assignUser)
                .getResultList();
    }

    /**
     * 사용자 목록(§4.2 myList). 열 순서: QUERY_ID, QUERY_NM, CATEGORY_CD, QUERY_DESC. 호출자가 인증 컨텍스트의 사용자만 넘긴다.
     */
    @SuppressWarnings("unchecked")
    public List<Object[]> myList(String userId) {
        return em.createNativeQuery("""
                        SELECT B.QUERY_ID
                             , B.QUERY_NM
                             , B.CATEGORY_CD
                             , B.QUERY_DESC
                        FROM   MCMAPUSER.TB_MCM_USRQ_ASSIGN A
                             , MCMAPUSER.TB_MCM_USRQ_DEF B
                        WHERE  B.QUERY_ID = A.QUERY_ID
                        AND    A.USER_ID = :userId
                        AND    B.USE_YN = 'Y'
                        ORDER BY B.CATEGORY_CD, B.QUERY_NM, B.QUERY_ID
                        """)
                .setParameter("userId", userId)
                .getResultList();
    }

    /**
     * 한 정의의 할당(§4.1 searchAssign). 열 순서: USER_ID, USER_NM, DEPT_CD, DEPT_NM, MISSING_YN('Y'=TB_MCM_SEC_USER 에 없는 사용자).
     */
    @SuppressWarnings("unchecked")
    public List<Object[]> searchAssign(String queryId) {
        return em.createNativeQuery("""
                        SELECT C.USER_ID
                             , U.USER_NM
                             , U.DEPT_CD
                             , D.DEPT_NM
                             , CASE WHEN U.USER_ID IS NULL THEN 'Y' ELSE 'N' END MISSING_YN
                        FROM   MCMAPUSER.TB_MCM_USRQ_ASSIGN C
                             , MCMAPUSER.TB_MCM_SEC_USER U
                             , MCMAPUSER.TB_MCM_DEPT_INFO D
                        WHERE  C.QUERY_ID = :queryId
                        AND    U.USER_ID(+) = C.USER_ID
                        AND    D.DEPT_CD(+) = U.DEPT_CD
                        ORDER BY C.USER_ID
                        """)
                .setParameter("queryId", queryId)
                .getResultList();
    }

    /** 사용 중 사용자(§4.1 searchUserList). 열 순서: userId, userNm, deptCd, deptNm. 최대 maxRows+1 행을 읽어 잘림을 정한다. */
    public List<Object[]> activeUsers(LocalDateTime now, int maxRows) {
        return em.createQuery("""
                        select u.userId, u.userNm, u.deptCd, d.deptNm
                        from McmSecUser u left join DeptInfo d on d.deptCd = u.deptCd
                        where u.useTp = 'Y'
                          and (u.endActiveDate is null or u.endActiveDate > :now)
                        order by u.userNm, u.userId
                        """, Object[].class)
                .setParameter("now", now)
                .setMaxResults(maxRows)
                .getResultList();
    }

    /** userIds 중 TB_MCM_SEC_USER 에 실제로 있는 사용자 ID(saveAssign 의 없는 사용자 거절). */
    public List<String> existingUserIds(Collection<String> userIds) {
        return em.createQuery("select u.userId from McmSecUser u where u.userId in :ids", String.class)
                .setParameter("ids", userIds)
                .getResultList();
    }

    /** 부서 이름(없으면 null) — get 의 ownerDeptNm. */
    public String deptNm(String deptCd) {
        List<String> rows = em.createQuery("select d.deptNm from DeptInfo d where d.deptCd = :cd", String.class)
                .setParameter("cd", deptCd)
                .getResultList();
        return rows.isEmpty() || rows.get(0) == null ? null : rows.get(0);
    }
}
