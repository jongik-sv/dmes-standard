/**
 * SPI(Service Provider Interface) — 정의·사본 조회를 외부(DB·네트워크)에 위임하는 인터페이스만 둔다.
 *
 * <p>불변 규칙 2(design.md §5) — 엔진은 DB·네트워크를 직접 호출하지 않는다. 정의·사본 조회는
 * 이 패키지의 인터페이스로만 받는다(PRD FR-E7·TRD §10). TSK-01-01 스캐폴드 단계 — 빈 골격.
 */
package kr.dongkuk.maru.mdm.engine.spi;
