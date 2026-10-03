package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItemId;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@code TB_MDM_LAYOUT_ITEM} JPA Repository(TSK-05-01 design.md §2 — 조립·분기 로직 없음, 선언만).
 *
 * <p>{@code existsByUnitCodeOrTransUnit} 은 단위 삭제 전 FK 참조 사전 확인(D-151 검토 — 확정 고정값 UNIT_CODE·전송 단위 TRANS_UNIT,
 * {@code LayoutUnitReferenceSpi})이다.
 */
public interface MdmLayoutItemRepository extends JpaRepository<MdmLayoutItem, MdmLayoutItemId> {

    boolean existsByUnitCodeOrTransUnit(String unitCode, String transUnit);
}
