package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmDataItem;
import com.dongkuk.dmes.mdm.entity.MdmDataItemId;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code TB_MDM_DATA_ITEM} JPA Repository(TSK-07-01 design.md §2 — 조립·분기 로직 없음, 선언만). */
public interface MdmDataItemRepository extends JpaRepository<MdmDataItem, MdmDataItemId> {
}
