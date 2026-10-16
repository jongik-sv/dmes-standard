package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionReleasedChangeSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.springframework.stereotype.Component;

/**
 * 레이아웃의 「RELEASED 변경」 SPI 구현(BE 리팩토링 2회차 C4) — 확정·확정 취소 뒤 메타 기록을 그 레이아웃과, 헤더면 그 헤더를 쌓은
 * 전문까지 펼쳐 남긴다({@link LayoutQueries#withStackingMessages}, 버전 무관). 헤더의 RELEASED 가 바뀌면 쌓은 전문의 시각 T 합성도
 * 바뀌기 때문이다. 전에는 공통 {@code DefaultVersionStateService} 가 {@link LayoutQueries} 를 직접 불렀다(common → dmb 역의존).
 *
 * <p>트랜잭션을 열지 않는다(dmb 불변 I19). 기록기는 호출자(공통 버전 서비스) 트랜잭션에 합류한다.
 */
@Component
public class LayoutReleasedChange implements VersionReleasedChangeSpi {

    private final LayoutQueries queries;
    private final MetaRevisionRecorder recorder;

    public LayoutReleasedChange(LayoutQueries queries, MetaRevisionRecorder recorder) {
        this.queries = queries;
        this.recorder = recorder;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.LAYOUT;
    }

    @Override
    public void afterReleasedChange(VersionRef changed) {
        recorder.layouts(queries.withStackingMessages(Long.valueOf(changed.objectId())));
    }
}
