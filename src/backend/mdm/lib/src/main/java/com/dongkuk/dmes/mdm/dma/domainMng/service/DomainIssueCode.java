package com.dongkuk.dmes.mdm.dma.domainMng.service;

/**
 * 도메인 저장 검사 이슈 코드(TSK-04-03 design.md §3.2, 기능설계서 §6). R01~R10 은 02:177 저장 거부 조건을 문장 순서대로,
 * S01~S06 은 원천의 다른 절에서 온 보충 거부, W01~W05 는 저장을 막지 않는 경고다(W04·W05 는 부모 연결 변경, D-132).
 * 문구는 기능설계서 §6 과 같다.
 */
public enum DomainIssueCode {

    R01(Level.ERROR, "검증식을 해석할 수 없습니다"),
    R02(Level.ERROR, "이 칸에서 쓸 수 없는 함수입니다"),
    R03(Level.ERROR, "검증식 결과가 참·거짓이 아닙니다"),
    R04(Level.ERROR, "표준식은 value 만 쓸 수 있습니다"),
    R05(Level.ERROR, "컬럼 사전에 없는 변수입니다"),
    R06(Level.ERROR, "길이·소수 자리는 부모 이하로만 정할 수 있습니다"),
    R07(Level.ERROR, "상속이 순환합니다"),
    R08(Level.ERROR, "테스트 케이스가 기대와 다릅니다"),
    R09(Level.ERROR, "코드 참조가 필요합니다"),
    R10(Level.ERROR, "유효한 카테고리가 아닙니다"),
    S01(Level.ERROR, "구조 변경은 할 수 없습니다. 새 도메인을 만들고 컬럼을 이관하세요"),
    S02(Level.ERROR, "부모에서 고정된 속성입니다"),
    S03(Level.ERROR, "코드 참조 규칙을 확인하세요"),
    S04(Level.ERROR, "FLAG 최상위 도메인은 허용 값 목록(표준식)이 필요합니다"),
    S05(Level.ERROR, "식 작성 규칙을 확인하세요"),
    S06(Level.ERROR, "필수 입력·형식을 확인하세요"),
    W01(Level.WARN, "부모와 정의가 같습니다. 컬럼이 부모를 직접 참조하면 됩니다."),
    W02(Level.WARN, "코드 판정을 할 수 없어 건너뛰었습니다"),
    W03(Level.WARN, "테스트 케이스를 추가하세요"),
    W04(Level.WARN, "부모 연결을 바꾸면 이 도메인을 참조하는 컬럼과 하위 도메인이 영향을 받습니다"),
    W05(Level.WARN, "상속받던 값을 이 도메인에 복사해 같은 정의를 유지합니다");

    public enum Level { ERROR, WARN }

    private final Level level;
    private final String label;

    DomainIssueCode(Level level, String label) {
        this.level = level;
        this.label = label;
    }

    public Level level() {
        return level;
    }

    /** 기능설계서 §6 의 에러 메시지. */
    public String label() {
        return label;
    }
}
