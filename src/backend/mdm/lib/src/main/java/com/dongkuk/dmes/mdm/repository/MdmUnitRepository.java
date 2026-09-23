package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmUnit;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@code TB_MDM_UNIT} JPA Repository(TSK-04-01 design.md §2, D3 — 조립·분기 로직 없음, 선언만).
 *
 * <p>{@code findByDimension} 은 TSK-04-02 가 추가한 파생 쿼리다(I3 — 차원별 확립된 기준 단위 조회).
 */
public interface MdmUnitRepository extends JpaRepository<MdmUnit, String> {

    List<MdmUnit> findByDimension(String dimension);
}
