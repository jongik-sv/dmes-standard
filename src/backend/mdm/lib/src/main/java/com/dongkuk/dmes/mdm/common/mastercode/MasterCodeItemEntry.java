package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;

/** 버전 V 모습의 코드 한 줄 — 선분 없이 코드값과 값만 둔다(저장 검사·메모리 적용의 입력, TSK-06-03 §6.3·§6.4). */
public record MasterCodeItemEntry(String code, MasterCodeItemValues values) {
}
