package com.dongkuk.dmes.mcm.widget.query;

import java.util.Set;

/**
 * 입력 조건 {@code codeGroup} 이 가리키는 공통코드 그룹 조회 포트(스펙 2026-10-10-custom-report-v2-design §3.1).
 * 구현({@code SecCodeItemService})은 정적 SQL·바인드로만 읽고, 보관 크기에 상한을 둔다.
 */
public interface QueryCodeLookup {

    /** 그룹의 사용 중({@code USE_YN='Y'}) 항목 코드. 그룹이 없으면 빈 집합. */
    Set<String> items(String groupCd);

    /** 그룹이 있고 사용 중인가 — 정의를 저장할 때만 확인한다. */
    boolean groupExists(String groupCd);
}
