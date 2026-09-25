package com.dongkuk.dmes.mdm.common.testdb;

/**
 * 공유 컨텍스트에서 테스트 클래스 사이에 값이 새지 않게, 클래스 시작마다 생성 직후 상태로 되돌리는 테스트 가짜 빈
 * ({@link MdmSharedTestDb#resetForTestClass}). 컨텍스트를 클래스마다 새로 띄우던 때는 빈이 늘 새로 만들어졌다.
 */
public interface SharedContextResettable {

    void resetForTestClass();
}
