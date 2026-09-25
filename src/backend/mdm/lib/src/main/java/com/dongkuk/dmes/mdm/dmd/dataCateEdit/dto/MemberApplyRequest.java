package com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto;

import java.util.List;

/**
 * TABLE 소속 일괄 적용 내부 전달 값(design.md §2) — OASIS 에 직접 바인딩되지 않는다({@code CateSaveRequest} 가
 * 받는다). 서비스가 {@code addCodes}·{@code removeCodes} 를 이 값으로 묶어 한 트랜잭션(R12) 안에서
 * {@code addMember}/{@code removeMember} N 회를 돈다.
 */
public class MemberApplyRequest {

    private final String maruDataId;
    private final String cateId;
    private final List<String> addCodes;
    private final List<String> removeCodes;

    public MemberApplyRequest(String maruDataId, String cateId, List<String> addCodes, List<String> removeCodes) {
        this.maruDataId = maruDataId;
        this.cateId = cateId;
        this.addCodes = addCodes;
        this.removeCodes = removeCodes;
    }

    public String maruDataId() { return maruDataId; }
    public String cateId() { return cateId; }
    public List<String> addCodes() { return addCodes; }
    public List<String> removeCodes() { return removeCodes; }
}
