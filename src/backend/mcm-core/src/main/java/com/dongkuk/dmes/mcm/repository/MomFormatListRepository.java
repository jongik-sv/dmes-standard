package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.MomFormatList;
import com.dongkuk.dmes.mcm.entity.MomFormatListId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * TB_MCM_MOM_FORMAT_LIST JPA Repository.
 *
 * <p>설계: `docs/mcm/design/interfaceList/interfaceList_분석리포트.md` §7 FORMAT_LIST 7 컬럼 + AUDIT.
 * 복합 PK: (FORMAT_ID, FORMAT_VER) — {@link MomFormatListId}.
 *
 * <p>cia/InterfaceList 화면 활용:
 * <ul>
 *   <li>{@link #findLatestByFormatId(String)} — As-Is {@code KEEP(DENSE_RANK FIRST ORDER BY
 *       FORMAT_VER DESC)} 의 ANSI 등가 (Oracle 의존 제거). 최신 FORMAT_VER 의 FORMAT_NM 조회.</li>
 *   <li>{@link #findAllLatestByFormatIds(List)} — IN 절 일괄 조회 (Service enrichment).</li>
 * </ul>
 *
 * <p>Q-012 결정: cia/InterfaceList 의 저장 시 FORMAT_VER = 1 고정 (mui 1:1).
 * 다중 버전 관리 = cib/InterfaceFormatList 화면 책임.
 *
 * <p>cia/InterfaceList 의 cascade 삭제 시 본 Repository {@link #deleteByFormatId(String)} 호출
 * — As-Is `DeleteInterfaceList.java` Line 52-57 정합 (FORMAT_ID 단위 전체 삭제).
 */
public interface MomFormatListRepository extends JpaRepository<MomFormatList, MomFormatListId> {

    /**
     * 최신 FORMAT_VER 의 FORMAT_LIST row 1건 조회.
     * As-Is {@code (SELECT MAX(FORMAT_NM) KEEP(DENSE_RANK FIRST ORDER BY FORMAT_VER DESC) ...)}
     * 의 ANSI 등가 — 상관 서브쿼리 대신 ORDER BY DESC LIMIT 1 (JPQL).
     */
    @Query("""
            SELECT f FROM MomFormatList f
            WHERE f.id.formatId = :formatId
            ORDER BY f.id.formatVer DESC
            """)
    List<MomFormatList> findByFormatIdOrderByFormatVerDesc(@Param("formatId") String formatId);

    default Optional<MomFormatList> findLatestByFormatId(String formatId) {
        List<MomFormatList> list = findByFormatIdOrderByFormatVerDesc(formatId);
        return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }

    /**
     * 여러 FORMAT_ID 의 최신 버전 row 일괄 조회 — Service enrichment 용.
     * GROUP BY + MAX 윈도우 함수 대신 단순 IN + Service 단 partition 권장 (n 작음).
     */
    @Query("""
            SELECT f FROM MomFormatList f
            WHERE f.id.formatId IN :formatIds
            ORDER BY f.id.formatId, f.id.formatVer DESC
            """)
    List<MomFormatList> findAllLatestByFormatIds(@Param("formatIds") List<String> formatIds);

    /**
     * As-Is `DeleteInterfaceList.java` Line 52-57 의 {@code DELETE WHERE FORMAT_ID = ?} 등가.
     * cia/InterfaceList 의 cascade 삭제 (3 테이블 — INTERFACES + TC_LIST + FORMAT_LIST) 시 호출.
     * 본 메서드는 **FORMAT_ID 의 모든 버전 row 삭제** (As-Is 정합 — Q-012 의 FORMAT_VER 단위 분리는
     * cib 책임이므로 cia 의 삭제는 As-Is 그대로 단순 FORMAT_ID 삭제).
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM MomFormatList f WHERE f.id.formatId = :formatId")
    int deleteByFormatId(@Param("formatId") String formatId);
}
