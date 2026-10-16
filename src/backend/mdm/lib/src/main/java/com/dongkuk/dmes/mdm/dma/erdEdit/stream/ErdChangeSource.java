package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdChangesView;

/**
 * 허브가 놓친 델타(재생·빈 칸 채우기)를 읽는 입구. 허브는 이 인터페이스로만 명령 기록을 읽으므로 stream 이 service 에 기대지 않는다.
 * 구현은 service 의 {@code ErdChangeFeed} 하나다 — 둘이 되면 허브 생성자 주입이 모호해진다.
 */
public interface ErdChangeSource {

    /** sinceRev 뒤에 커밋된 델타. 규칙은 구현({@code ErdChangeFeed#changesSince})을 따른다. */
    ErdChangesView changesSince(String modelId, long sinceRev);
}
