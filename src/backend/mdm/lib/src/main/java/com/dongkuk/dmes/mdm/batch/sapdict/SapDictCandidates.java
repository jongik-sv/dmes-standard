package com.dongkuk.dmes.mdm.batch.sapdict;

import com.dongkuk.dmes.mdm.contract.dictionary.MdmDataType;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainKind;
import java.util.List;

/**
 * 후보 추출 결과(TSK-04-05 design.md §4.3). 02 의 등록 순서(용어 → 도메인 → 컬럼 → 컬럼 시스템 매핑)에 한 목록씩
 * 대응하고, 미대응 필드 작업 목록을 하나 더한다. 모든 목록은 §4.3 의 정렬 키 순서다.
 */
public record SapDictCandidates(
        List<TermCandidate> terms,
        List<DomainCandidate> domains,
        List<ColumnCandidate> columns,
        List<ColumnSystemCandidate> columnSystems,
        List<UnmatchedField> unmatched) {

    public SapDictCandidates {
        terms = List.copyOf(terms);
        domains = List.copyOf(domains);
        columns = List.copyOf(columns);
        columnSystems = List.copyOf(columnSystems);
        unmatched = List.copyOf(unmatched);
    }

    /** 컬럼명 토큰 하나. {@code columnCount} 는 그 토큰을 가진 컬럼 후보 수다. */
    public record TermCandidate(String termName, int columnCount, List<String> sampleRollnames) {
    }

    /** 값 정의 하나(I10). {@code sapDomains} 는 참고 칸이며 마루 도메인의 키나 이름이 아니다. */
    public record DomainCandidate(String domainKey, MdmDataType dataType, Integer length, Integer scale,
            MdmDomainKind kindHint, int elementCount, List<String> sapDomains, List<String> sampleRollnames) {
    }

    /** 적격 데이터 엘리먼트 하나(I13). {@code sap*} 칸은 한국어 DD04T 원문(앞뒤 공백만 뗌)이다. */
    public record ColumnCandidate(String rollname, String columnName, List<String> termNames, String domainKey,
            String sapScrtextL, String sapScrtextM, String sapScrtextS, String sapDdtext, List<String> fieldNames) {
    }

    /** 필드명 하나(I15). {@code tables} 는 검토용 참고 칸이다. */
    public record ColumnSystemCandidate(String systemCode, String physName, String rollname, String transform,
            String note, List<String> tables) {
    }

    /** 컬럼 시스템 후보가 되지 못한 대상 행 하나(I16). */
    public record UnmatchedField(String tabname, String fieldname, String rollname, List<UnmatchedReason> reasons,
            String detail) {
    }

    /** 미대응 사유. 선언 순서가 {@code reasons} 칸의 출력 순서다(I16). */
    public enum UnmatchedReason {
        NO_DATA_ELEMENT,
        DATA_ELEMENT_NOT_FOUND,
        UNSUPPORTED_TYPE,
        NO_KOREAN_LABEL,
        FIELD_NAME_CONFLICT
    }
}
