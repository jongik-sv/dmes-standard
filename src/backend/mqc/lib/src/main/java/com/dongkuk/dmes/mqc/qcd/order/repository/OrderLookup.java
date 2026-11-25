package com.dongkuk.dmes.mqc.qcd.order.repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * OMS 주문 줄(TB_MQC_ORD) 읽기. 값은 정본 주문 항목 → 글(빈 값 null)이고, 표시용 FNL_CUS_NM·ORD_USG_NM·ORD_USG_DTL·URGENT_YN·REQ_DT
 * 와 EXTRA_JSON 항목을 함께 싣는다. 주문은 OMS 수신 기록이라 읽기만 한다.
 */
public interface OrderLookup {

    /** 의뢰일 내림차순·주문 키 오름차순 전체. */
    List<Map<String, String>> all();

    Optional<Map<String, String>> one(String ordReqNo, String ordReqLn);
}
