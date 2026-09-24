package com.dongkuk.dmes.mdm.common.segment;

/**
 * 화면이 접두어·포함으로 판정하는 고정 문구(design.md A2). BPMN 경로에서는 {@code meta.message} 만 화면에 가므로
 * (F12) 이 글자를 바꾸면 FE 판정({@code m-mdm/pages/dmd/dataItemMng/messages.ts})도 같이 바꿔야 한다.
 * 충돌 문구는 {@code MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage()} 를 그대로 쓴다.
 */
public final class DataItemMessages {

    /** 검사 6 — 닫힌 키로 신규 등록(수용 기준 3). */
    public static final String CLOSED_KEY_REOPEN = "닫힌 키입니다. 새로 등록할 수 없으니 다시 여세요";
    /** 검사 6 — 열린 키로 신규 등록. */
    public static final String KEY_EXISTS = "이미 있는 키입니다";
    /** 닫기·수정 대상에 열린 행이 없다. */
    public static final String NOT_OPEN = "열린 행이 없습니다(닫힌 항목)";
    /** 다시 열기 대상이 이미 열려 있다. */
    public static final String ALREADY_OPEN = "이미 열려 있습니다";
    /** 키의 행이 하나도 없다. */
    public static final String KEY_NOT_FOUND = "없는 키입니다";
    /** 검사 1. */
    public static final String DEPRECATED = "폐기된 마루 데이터입니다";
    /** 검사 2. */
    public static final String SOURCE_MISMATCH = "원천이 맞지 않아 저장할 수 없습니다";
    /** 잠금 문이 0행(L3). */
    public static final String NO_MARU_DATA = "없는 마루 데이터입니다";
    /** 검사 3. 화면 e2e 가 이 접두어("키 패턴")를 본다. */
    public static final String KEY_PATTERN = "키가 키 패턴에 맞지 않습니다";
    /** 키 누락. 이력 조회도 같은 문구를 쓴다(H3). */
    public static final String KEY_REQUIRED = "키를 입력하세요";
    /** 검사 4. */
    public static final String NAME_REQUIRED = "이름을 입력하세요";
    /** 검사 5. */
    public static final String ATTR_NO_LABEL = "라벨이 없는 추가 컬럼에는 값을 넣을 수 없습니다";
    /** 검사 5-1 — 중간 칸 비움. */
    public static final String LVL_GAP = "계층 중간 칸이 비어 있습니다";
    /** 검사 5-1 — 값 형식. */
    public static final String LVL_FORMAT = "계층 값에 콤마·공백을 쓸 수 없습니다";
    /** 검사 5-1 — 같은 값의 앞 칸이 다른 행이 있다. */
    public static final String LVL_CONFLICT = "같은 계층 값이 다른 상위 아래에 있습니다";
    /** 검사 5-2. */
    public static final String LVL_OVER_COUNT = "계층 칸 수보다 뒤 칸에 값이 있습니다";
    /** 일괄 upsert 안의 같은 키. */
    public static final String DUPLICATE_IN_BATCH = "같은 키가 두 번 있습니다";
    /** 검사 7. */
    public static final String MEMBER_NOT_ALLOWED = "소속을 등록할 수 없습니다";
    /** 카테고리 정의 형식. */
    public static final String CATE_DEF_INVALID = "카테고리 정의가 올바르지 않습니다";

    private DataItemMessages() {
    }
}
