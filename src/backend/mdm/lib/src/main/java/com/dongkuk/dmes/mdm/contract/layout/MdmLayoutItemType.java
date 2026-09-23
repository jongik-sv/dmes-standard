package com.dongkuk.dmes.mdm.contract.layout;

/**
 * 직렬화 패딩 방향 판단용(html:557-560, TSK-05-01 design.md F22) — 숫자는 왼쪽 0-채움, 문자는 오른쪽
 * 공백-채움(03:32). 도메인→타입 매핑 로직은 이 Task 밖(TSK-05-03)이다.
 */
public enum MdmLayoutItemType { CHAR, NUM }
