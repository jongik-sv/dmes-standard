package com.dongkuk.dmes.mdm.contract.mastercode;

import java.math.BigDecimal;

/** TABLE 카테고리 소속({@code TB_MDM_CODE_CATE_ITEM}) 한 행. */
public record MasterCodeCateItemRow(String cateId, String code, BigDecimal fromVer, BigDecimal toVer) {
}
