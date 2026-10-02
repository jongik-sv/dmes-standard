package com.dongkuk.dmes.mcm.screenusage.support;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDayId;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.UUID;

/** 화면 사용 테스트 데이터 생성기. 시각은 Asia/Seoul 벽시계 기준 LocalDateTime. */
public final class UsageFixtures {

    private UsageFixtures() {}

    public static ScreenUsageLog log(String userId, String deptCd, String pageId, String startKind,
                                     LocalDateTime startedAt, long durationMs) {
        LocalDateTime endedAt = startedAt.plus(Duration.ofMillis(durationMs));
        ScreenUsageLog l = new ScreenUsageLog();
        l.setUsageId(UUID.randomUUID().toString());
        l.setUserId(userId);
        l.setDeptCd(deptCd);
        l.setPageId(pageId);
        l.setStartKind(startKind);
        l.setStartedAt(startedAt);
        l.setEndedAt(endedAt);
        l.setDurationMs(durationMs);
        l.setClientSegId(UUID.randomUUID().toString());
        l.setReceivedAt(endedAt);
        return l;
    }

    public static ScreenUsageDay day(String usageDt, String pageId, String userId, String deptCd,
                                     int openCnt, int segCnt, long durationMs) {
        ScreenUsageDay d = ScreenUsageDay.of(new ScreenUsageDayId(usageDt, pageId, userId, deptCd));
        d.setOpenCnt(openCnt);
        d.setSegCnt(segCnt);
        d.setDurationMs(durationMs);
        return d;
    }
}
