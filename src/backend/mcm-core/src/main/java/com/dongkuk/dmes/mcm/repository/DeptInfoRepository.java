/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: DeptInfo (TB_MCM_DEPT_INFO) JPA Repository — commUserMng 화면 owner (W5)
 *       정책 #2 / Q-002 해소 — As-Is EAIUSER.IF_DSHRMMCMHD02 외부 EAI 폐기, DMES 자체 부서 마스터
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.DeptInfo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * {@code MCMAPUSER.TB_MCM_DEPT_INFO} JPA Repository (commUserMng 화면 owner / W5).
 *
 * <p>정책 #2 / Q-002 해소 — As-Is 외부 EAI 인터페이스 테이블 직접 참조 폐기.
 *
 * <p>인용 SQL (분석리포트 §6 — To-Be 갱신):
 * <ul>
 *   <li>표준 findById = {@code selectCommUser} 의 DEPT_NM scalar subquery 대체 — Service 가 row 별 부착</li>
 *   <li>{@link #searchByDeptKey(String)} = As-Is {@code selectCommDept} (xml:251~263) MSSQL 변환 —
 *       {@code WHERE USE_TP='Y' AND (DEPT_CD LIKE 'val%' OR UPPER(DEPT_NM) LIKE UPPER('val%'))}</li>
 * </ul>
 */
public interface DeptInfoRepository extends JpaRepository<DeptInfo, String> {

    /**
     * As-Is {@code selectCommDept} (xml:251~263) MSSQL 변환 — 부서 팝업 (commonUserDept action / D-007 / LV-005).
     *
     * <p>WHERE 동적 (As-Is — edt_DEPT_CD 단일 파라미터로 CD/NM 양쪽 검색):
     * <ul>
     *   <li>USE_TP = 'Y' (활성 부서만 — To-Be 강제)</li>
     *   <li>edt_DEPT_CD 가 있으면 {@code DEPT_CD LIKE 'val%' OR UPPER(DEPT_NM) LIKE UPPER('val%')}</li>
     * </ul>
     *
     * <p>응답 컬럼: DEPT_CD / DEPT_NM (As-Is dataset 컬럼명 보존).
     */
    @Query("""
            SELECT d FROM DeptInfo d
            WHERE d.useTp = 'Y'
              AND (:pDeptKey IS NULL OR :pDeptKey = ''
                   OR UPPER(d.deptCd) LIKE UPPER(CONCAT(:pDeptKey, '%'))
                   OR UPPER(d.deptNm) LIKE UPPER(CONCAT('%', :pDeptKey, '%')))
            ORDER BY d.deptCd
            """)
    List<DeptInfo> searchByDeptKey(@Param("pDeptKey") String pDeptKey);
}
