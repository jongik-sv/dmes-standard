package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItemId;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code TB_MDM_LAYOUT_ITEM} JPA Repository(TSK-05-01 design.md §2 — 조립·분기 로직 없음, 선언만). */
public interface MdmLayoutItemRepository extends JpaRepository<MdmLayoutItem, MdmLayoutItemId> {
}
