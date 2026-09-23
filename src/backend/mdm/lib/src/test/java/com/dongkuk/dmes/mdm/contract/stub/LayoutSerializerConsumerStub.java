package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSerializeContext;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSerializer;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 05-03(직렬화 라이브러리) 소비자 흉내(TSK-05-01 design.md §3.4) — {@link MdmLayoutSerializer} 만 알아
 * 컴파일된다는 것을 보인다. 실제 고정 길이 인코딩·패딩 로직은 이 Task 밖이라 스냅샷의 {@code totalLength}
 * 만큼의 자리표시 바이트 배열을 돌려주는 흉내만 한다.
 */
public class LayoutSerializerConsumerStub implements MdmLayoutSerializer {

    @Override
    public byte[] serialize(MdmLayoutSnapshot snapshot, Map<String, Object> record, MdmLayoutSerializeContext context) {
        byte[] out = new byte[snapshot.totalLength()];
        java.util.Arrays.fill(out, (byte) ' ');
        String marker = "seq=" + context.seq();
        byte[] markerBytes = marker.getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(markerBytes, 0, out, 0, Math.min(markerBytes.length, out.length));
        return out;
    }
}
