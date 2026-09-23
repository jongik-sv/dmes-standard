package com.dongkuk.dmes.mdm.contract.layout;

/**
 * 전문 항목의 채움 방식(TSK-05-01 design.md §6.1, 03:24 "3층 결정"). DB {@code TB_MDM_LAYOUT_ITEM.FILL_KIND}
 * 와 값 집합이 같다(불변 규칙 3, {@code CK_TB_MDM_LAYOUT_ITEM_FILL_KIND}).
 */
public enum MdmFillKind { DATA, CONST, AUTO, FILLER }
