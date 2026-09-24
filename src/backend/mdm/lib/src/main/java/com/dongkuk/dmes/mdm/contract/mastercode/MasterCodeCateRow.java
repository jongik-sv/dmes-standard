package com.dongkuk.dmes.mdm.contract.mastercode;

import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import java.math.BigDecimal;

/** 카테고리 표({@code TB_MDM_CODE_CATE}) 한 행 — 정의는 전사 계약 {@link CategoryDefinition}(TSK-01-02)을 그대로 쓴다. */
public record MasterCodeCateRow(CategoryDefinition definition, BigDecimal fromVer, BigDecimal toVer) {
}
