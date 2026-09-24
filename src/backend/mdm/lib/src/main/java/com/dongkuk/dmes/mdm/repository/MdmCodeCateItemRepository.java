package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmCodeCateItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeCateItemId;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code TB_MDM_CODE_CATE_ITEM} JPA Repository(TSK-06-01 design.md §2 — 조립·분기 로직 없음, 선언만). */
public interface MdmCodeCateItemRepository extends JpaRepository<MdmCodeCateItem, MdmCodeCateItemId> {
}
