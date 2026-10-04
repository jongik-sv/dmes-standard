package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmColumn;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

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
}
