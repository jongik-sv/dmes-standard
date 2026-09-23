/**
 * SPI(Service Provider Interface) — 정의·사본 조회를 외부(DB·네트워크)에 위임하는 인터페이스만 둔다.
 *
 * <p>불변 규칙 2(design.md §5) — 엔진은 DB·네트워크를 직접 호출하지 않는다. 정의·사본 조회는
 * 이 패키지의 인터페이스로만 받는다(PRD FR-E7·TRD §10). TSK-03-01 계약 전용 단계 —
 * interface·record·enum·상수만 둔다. 구현체는 mdm 서버와 하위 시스템이 만든다.
 */
package kr.dongkuk.maru.mdm.engine.spi;
