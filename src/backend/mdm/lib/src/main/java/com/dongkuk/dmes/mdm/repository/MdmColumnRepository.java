package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmColumn;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

/**
 * {@code TB_MDM_COLUMN} JPA Repository(TSK-04-01 design.md §2, D3 — 조립·분기 로직 없음, 선언만).
 *
 * <p>{@link JpaSpecificationExecutor} 는 컬럼 검색의 DB 1차 거르기(ColumnSearchPrefilter)가 쓴다.
 */
public interface MdmColumnRepository extends JpaRepository<MdmColumn, Long>, JpaSpecificationExecutor<MdmColumn> {

    /** TSK-04-04 — 논리명 유일성 검사(MDM019). */
    Optional<MdmColumn> findByColumnName(String columnName);

    /** TSK-04-04 — 표준 물리명 유일성 검사(MDM019)·역분해 중복 목록. */
    Optional<MdmColumn> findByPhysName(String physName);

    /** 룰 세트 편집 부하 — 여러 물리명을 한 번에(이름은 그대로 비교한다, {@link #findByPhysName} 과 같은 일치). */
    List<MdmColumn> findByPhysNameIn(Collection<String> physNames);

    /** TSK-08-03 — 룰 화면 자동완성 후보(varCandidates) 전체, 물리명 순. */
    List<MdmColumn> findAllByOrderByPhysNameAsc();

    /**
     * 컬럼 목록 첫 조회 상한(화면 성능 가이드 R1) — 논리명→ID 순서로 앞쪽 {@code pageable} 크기만큼의 ID 만 DB 가 골라 준다.
     * 정렬 키(COLUMN_NAME)는 유일 인덱스 {@code UX_TB_MDM_COLUMN_NAME} 이 덮어 인덱스 순서대로 앞쪽만 읽는다(SQLite 실행 계획
     * {@code SCAN ... USING COVERING INDEX}). 순서는 DB 콜레이션을 따르므로 방언마다 한글·영문 대소문자 순서가 다를 수 있다
     * (2026-10-05 사용자 결정 — 받아들인다).
     */
    @Query("select c.columnId from MdmColumn c order by c.columnName asc, c.columnId asc")
    List<Long> findIdsOrderByColumnName(Pageable pageable);
}
