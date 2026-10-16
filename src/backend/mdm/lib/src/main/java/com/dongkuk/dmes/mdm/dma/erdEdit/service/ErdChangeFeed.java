package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdChangesView;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdChangeSource;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 변경 기록 읽기(재생·빈 칸 채우기·getChangesSince). 허브({@link ErdChangeSource})와 {@link ErdCommandService#changesSince} 가 같이 쓴다.
 * 허브를 받지 않으므로 허브가 생성자로 받아도 빈 순환이 없다.
 */
@Component
public class ErdChangeFeed implements ErdChangeSource {

    private final ErdModelStore store;
    private final ErdCommandLogStore log;
    private final TransactionTemplate readTx;

    public ErdChangeFeed(ErdModelStore store, ErdCommandLogStore log, PlatformTransactionManager transactionManager) {
        this.store = store;
        this.log = log;
        this.readTx = new TransactionTemplate(transactionManager);
        this.readTx.setReadOnly(true);
    }

    /**
     * sinceRev 뒤에 커밋된 델타. 500건을 넘게 밀렸거나 사이에 다시 읽기 표시가 있거나 sinceRev 가 서버 rev 보다 크면(서버가 되돌려졌거나
     * 잘못된 값) reload=true 와 빈 목록 — 호출자가 모델 전체를 다시 읽는다. rev 와 기록을 한 읽기 트랜잭션에서 읽어 사이에 낀 새 명령이
     * 섞이지 않는다.
     *
     * <p>앞의 두 경우는 fromRev 에 기록을 줄 수 있는 가장 이른 sinceRev 를 싣는다 — max(sinceRev, rev-500) 뒤 마지막 표시 rev, 없으면
     * 그 하한. 변경 기록 화면이 이 값으로 한 번 더 읽는다. sinceRev 가 rev 보다 크면 줄 기록이 없으므로 null 이다.
     */
    @Override
    public ErdChangesView changesSince(String modelId, long sinceRev) {
        return readTx.execute(status -> {
            long rev = store.rev(modelId);
            if (sinceRev > rev) return new ErdChangesView(rev, true, List.of());
            return log.since(modelId, sinceRev, rev)
                    .map(ds -> new ErdChangesView(rev, false, ds))
                    .orElseGet(() -> {
                        long floor = Math.max(sinceRev, rev - ErdCommandLogStore.MAX_REPLAY);
                        long fromRev = log.lastMarker(modelId, floor, rev).orElse(floor);
                        return new ErdChangesView(rev, true, List.of(), fromRev);
                    });
        });
    }
}
