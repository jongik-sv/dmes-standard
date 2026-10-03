/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecUser (TB_MCM_SEC_USER) JPA Repository — commUserMng 화면 owner (W5)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_USER} JPA Repository (commUserMng 화면 owner / W5).
 *
 * <p>인용 SQL (분석리포트 §6):
 * <ul>
 *   <li>{@link #searchByFilter(String, String, String)} = As-Is {@code selectCommUser} (xml:7~40) 의
 *       SecUser 본 부분 — DEPT_NM JOIN 은 Service 레이어에서 후처리 (DeptInfoRepository 별도 조회).</li>
 *   <li>{@link #findAllUserIdEmpNo()} = As-Is {@code selectCommUserAll} (xml:42~46) — USER_ID / USER_EMP_NO 만</li>
 *   <li>{@link #updateEndActiveDate(String, LocalDateTime, String)} = As-Is {@code deleteCmUser} (xml:130~134) 논리삭제
 *       (2026-09-04 — USE_TP='N' 동시 SET)</li>
 *   <li>{@link #updateReRegUser(String, LocalDateTime, LocalDateTime, String)} = As-Is {@code updateReRegUser}
 *       (xml:278~285) — START_ACTIVE_DATE / END_ACTIVE_DATE / USE_TP SET. updateReRegUserCnt 반환값 사용.</li>
 * </ul>
 *
 * <p>JPA 기본 save / findById / existsById / delete 는 표준 — insertCommUser / updateCommUser 는
 * Service for-loop 의 save() 로 처리 (Oracle MERGE 동등 — PK 없으면 INSERT / 있으면 UPDATE).
 *
 * <p>To-Be 정책 #3 (B) — As-Is 미사용 SQL 5종 (selectCommUserForSave / deleteCommUser /
 * deleteCommUserMapping / deleteCommUserPwd / updateCommonPwdInit) 신규 미반영.
 */
@Repository("mcmSecUserRepository")
public interface SecUserRepository extends JpaRepository<SecUser, String> {

    /**
     * As-Is {@code selectCommUser} (xml:7~40) MSSQL 변환의 SecUser 본 부분.
     *
     * <p>As-Is WHERE 동적:
     * <ul>
     *   <li>{@code edt_USER_ID} → {@code UPPER(USER_ID) LIKE 'val%' OR UPPER(USER_EMP_NO) LIKE 'val%'
     *       OR UPPER(USER_NM) LIKE 'val%'} (xml:27~31 — 3 컬럼 OR 부분 일치)</li>
     *   <li>{@code cbo_USE_TP} → {@code USE_TP = #{cbo_USE_TP}} (xml:32~34)</li>
     *   <li>{@code cbo_IN_OUT_EMP_TP} → {@code IN_OUT_EMP_TP = #{cbo_IN_OUT_EMP_TP}} (xml:35~37)</li>
     * </ul>
     *
     * <p>ORDER BY START_ACTIVE_DATE, USER_ID (xml:38 보존).
     *
     * <p>DEPT_NM 은 Service 가 DeptInfoRepository.findById(deptCd).deptNm 으로 별도 조회 후 row 에 부착
     * (As-Is EAI scalar subquery → To-Be DEPT_INFO LEFT JOIN 등가 / 정책 #2 / T-008).
     */
    @Query("""
            SELECT u FROM McmSecUser u
            WHERE (:pUserKey IS NULL OR :pUserKey = ''
                   OR UPPER(u.userId)    LIKE UPPER(CONCAT(:pUserKey, '%'))
                   OR UPPER(u.userEmpNo) LIKE UPPER(CONCAT(:pUserKey, '%'))
                   OR UPPER(u.userNm)    LIKE UPPER(CONCAT(:pUserKey, '%')))
              AND (:pUseTp IS NULL OR :pUseTp = '' OR u.useTp = :pUseTp)
              AND (:pInOutEmpTp IS NULL OR :pInOutEmpTp = '' OR u.inOutEmpTp = :pInOutEmpTp)
            ORDER BY u.startActiveDate, u.userId
            """)
    List<SecUser> searchByFilter(@Param("pUserKey") String pUserKey,
                                 @Param("pUseTp") String pUseTp,
                                 @Param("pInOutEmpTp") String pInOutEmpTp);

    /**
     * As-Is {@code selectCommUserAll} (xml:42~46) — Task_0970821 (searchCmUser 후속) 의 ds_mainAll 적재용.
     * USER_ID / USER_EMP_NO 만 (V-004 / V-006 전체 사용자 중복 검증용).
     */
    @Query("SELECT u.userId, u.userEmpNo FROM McmSecUser u ORDER BY u.userId")
    List<Object[]> findAllUserIdEmpNo();

    /**
     * As-Is {@code deleteCmUser} (xml:130~134) MSSQL 변환 — 논리삭제 (END_ACTIVE_DATE SET).
     * {@code UPDATE TB_MCM_SEC_USER SET END_ACTIVE_DATE = #{END_ACTIVE_DATE} WHERE USER_ID = #{pUserId}}.
     *
     * <p><b>2026-09-04 fix — {@code USE_TP='N'} 동시 SET (사용자 결정).</b> 종전에는 END_ACTIVE_DATE 만
     * 마감하고 USE_TP 는 'Y' 로 남겼는데, 목록 기본 필터가 {@code USE_TP='Y'} 라 삭제한 계정이 계속
     * "사용 여부 Yes" 로 남았고, "계정 재생성" 버튼은 {@code USE_TP === "Y"} 면 비활성이라
     * <b>영영 열리지 않았다</b>. 되돌리는 경로는 {@link #updateReRegUser}(… , "Y") 가 이미 담당한다.
     */
    @Modifying
    @Query("UPDATE McmSecUser u SET u.endActiveDate = :endActiveDate, u.useTp = :useTp WHERE u.userId = :userId")
    int updateEndActiveDate(@Param("userId") String userId,
                            @Param("endActiveDate") LocalDateTime endActiveDate,
                            @Param("useTp") String useTp);

    /**
     * As-Is {@code updateReRegUser} (xml:278~285) MSSQL 변환 — 계정 재생성.
     * {@code UPDATE TB_MCM_SEC_USER SET START_ACTIVE_DATE = ..., END_ACTIVE_DATE = ..., USE_TP = ...
     *  WHERE USER_ID = #{USER_ID}}.
     *
     * <p>반환: 영향 행 수. ReRegCommUserMng.java:59~62 의 updateReRegUserCnt < 0 차단 조건 (= 0 이면 UserException)
     * 정합을 위해 int 반환.
     *
     * <p>로그인 실패 횟수(PWD_FAIL_COUNT)도 0 으로 되돌린다. 로그인 잠금은 USE_TP='N' 으로 표시되고 이 재생성이
     * 화면의 해제 경로인데, 횟수를 남기면 다음 로그인에서 최대 횟수 검사로 곧바로 다시 잠긴다
     * (McmSecUserRepository#unlockUser 와 같은 의미).
     */
    @Modifying
    @Query("UPDATE McmSecUser u SET u.startActiveDate = :startActiveDate, u.endActiveDate = :endActiveDate, "
         + "u.useTp = :useTp, u.pwdFailCount = 0 WHERE u.userId = :userId")
    int updateReRegUser(@Param("userId") String userId,
                        @Param("startActiveDate") LocalDateTime startActiveDate,
                        @Param("endActiveDate") LocalDateTime endActiveDate,
                        @Param("useTp") String useTp);

    /**
     * 활성 사용자 전체 USER_ID — 포털 알림 ALL 타겟 fan-out
     * (설계 docs/framework/포털알림-WebSocket-Push-상세설계.md §3.3).
     * 활성 판정: USE_TP='Y' + END_ACTIVE_DATE(논리삭제 마감일) 미도래.
     */
    @Query("""
            SELECT u.userId FROM McmSecUser u
            WHERE u.useTp = 'Y'
              AND (u.endActiveDate IS NULL OR u.endActiveDate > :now)
            """)
    List<String> findActiveUserIds(@Param("now") LocalDateTime now);
}
