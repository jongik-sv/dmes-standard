/**
 * SAP DDIC 추출 CSV(DD03L·DD04L·DD04T·DD01L) → 용어·도메인·컬럼·컬럼 시스템 후보와 미대응 작업 목록 CSV(TSK-04-05).
 * 후보는 파일로만 내고 등록은 사람이 화면에서 한다 — 이 패키지는 DB·Spring·SPI 를 쓰지 않는다(TSK-04-05 design.md
 * D1·D2·D4, 불변 규칙 I1, {@code SapDictNoWriteArchitectureTest} 가 고정한다).
 */
package com.dongkuk.dmes.mdm.batch.sapdict;
