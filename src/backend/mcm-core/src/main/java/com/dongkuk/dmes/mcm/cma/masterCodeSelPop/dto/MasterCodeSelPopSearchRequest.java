package com.dongkuk.dmes.mcm.cma.masterCodeSelPop.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 마스터코드 선택 팝업 — 조회 요청 DTO.
 *
 * <p>As-Is mui {@code MasterCodeSelPopMapper.GetCodeDetailList} 의 입력 파라미터 3종을 1:1 보존한다.
 * 설계서 정본:
 * <ul>
 *   <li>분석리포트 §6 SQL ID 매트릭스 — {@code pCodeId} / {@code pDiv} / {@code pValue}</li>
 *   <li>정합체크서 §C.3 Mapper {@code <where>} 분기 ↔ xfdl sArgument 4 식별자</li>
 * </ul>
 *
 * <p>OASIS BPMN ServiceTask 의 {@code dto} 속성으로 매핑된다 —
 * {@code services/cma/masterCodeSelPop.bpmn} 의 {@code searchTask}.
 *
 * <p>호출 컨텍스트 (설계서 §1):
 * <pre>
 *   POST /api/mcm/oasis/masterCodeSelPop/search
 *   Body: { "pCodeId": "...", "pDiv": "CODE_VAL|CODE_VAL_MEAN", "pValue": "..." }
 * </pre>
 *
 * <p>식별자 표기: As-Is mybatis 파라미터명 ({@code #{pCodeId}}, {@code #{pDiv}}, {@code #{pValue}}) 보존.
 * Java Bean spec (Introspector) 의 "두 번째 글자도 대문자면 첫 글자 보존" 규칙으로 setter 가
 * {@code setPCodeId} 가 되므로, JSON binding 안정성을 위해 {@link JsonProperty} 로 명시.
 */
public class MasterCodeSelPopSearchRequest {

    /**
     * 코드 그룹 ID (As-Is sCodeId — 호출 화면이 모달 oArg 로 전달).
     * As-Is Mapper:15-17 {@code <if test='pCodeId != null and pCodeId != ""'> AND UPPER(CODE_ID) = UPPER(#{pCodeId})}.
     */
    @JsonProperty("pCodeId")
    private String pCodeId;

    /**
     * 검색구분 (CODE_VAL / CODE_VAL_MEAN — As-Is cbo_div.value).
     * As-Is Mapper:18-23 분기 키.
     */
    @JsonProperty("pDiv")
    private String pDiv;

    /**
     * 검색어 (LIKE %...% — As-Is edt_codeVal.value).
     * As-Is Mapper:19 / Mapper:22 의 {@code #{pValue}}.
     */
    @JsonProperty("pValue")
    private String pValue;

    public MasterCodeSelPopSearchRequest() {}

    public String getPCodeId() { return pCodeId; }
    public void setPCodeId(String pCodeId) { this.pCodeId = pCodeId; }

    public String getPDiv() { return pDiv; }
    public void setPDiv(String pDiv) { this.pDiv = pDiv; }

    public String getPValue() { return pValue; }
    public void setPValue(String pValue) { this.pValue = pValue; }
}
