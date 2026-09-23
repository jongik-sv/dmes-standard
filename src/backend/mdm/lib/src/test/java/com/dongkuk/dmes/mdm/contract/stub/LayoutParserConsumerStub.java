package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutParser;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import java.util.Map;

/**
 * 05-03(파서 라이브러리) 소비자 흉내(TSK-05-01 design.md §3.4) — {@link MdmLayoutParser} 만 알아
 * 컴파일·동작(단순 반환값)한다는 것을 보인다. 실제 바이트 역파싱 로직은 이 Task 밖이다.
 */
public class LayoutParserConsumerStub implements MdmLayoutParser {

    @Override
    public Map<String, Object> parse(MdmLayoutSnapshot snapshot, byte[] message) {
        return Map.of("layoutId", snapshot.layoutId(), "messageLength", message.length);
    }
}
