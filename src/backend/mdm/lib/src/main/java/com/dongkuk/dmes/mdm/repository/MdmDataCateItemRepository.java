package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmDataCateItem;
import com.dongkuk.dmes.mdm.entity.MdmDataCateItemId;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code TB_MDM_DATA_CATE_ITEM} JPA Repository(TSK-07-01 design.md §2 — 조립·분기 로직 없음, 선언만). */
public interface MdmDataCateItemRepository extends JpaRepository<MdmDataCateItem, MdmDataCateItemId> {
}
