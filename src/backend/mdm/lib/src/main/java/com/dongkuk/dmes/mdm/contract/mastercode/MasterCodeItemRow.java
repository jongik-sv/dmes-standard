package com.dongkuk.dmes.mdm.contract.mastercode;

import java.math.BigDecimal;

/** 코드 표({@code TB_MDM_CODE_ITEM}) 한 행 — 선분 [fromVer, toVer). */
public record MasterCodeItemRow(String code, BigDecimal fromVer, BigDecimal toVer, MasterCodeItemValues values) {
}
