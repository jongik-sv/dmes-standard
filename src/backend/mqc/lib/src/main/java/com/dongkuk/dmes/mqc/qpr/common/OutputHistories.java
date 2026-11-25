package com.dongkuk.dmes.mqc.qpr.common;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.support.DemoSupport;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.springframework.stereotype.Component;

/** 출력물 이력 쓰기·읽기 도우미. 상태 이름은 문서 종류마다 다르므로 호출하는 쪽이 이름 함수를 준다. OASIS 진입점이 아니다. */
@Component
public class OutputHistories {

    private final OutputHistoryRepository repository;

    public OutputHistories(OutputHistoryRepository repository) {
        this.repository = repository;
    }

    public void record(String docTp, String docNo, Integer rev, String actCd, String before, String after, String reason,
                       String by, LocalDateTime at) {
        repository.save(OutputHistory.of(docTp, docNo, rev, actCd, before, after, reason, by, at));
    }

    /** docNo 가 있으면 그 문서 전체, 없으면 처리일 기간의 같은 종류 문서 이력. 최근 순. */
    public List<Map<String, Object>> list(String docTp, String docNo, String fromDt, String toDt,
                                          Function<String, String> statusName, Function<String, String> actionName) {
        List<OutputHistory> list;
        if (!DemoSupport.isBlank(docNo)) {
            list = repository.findByDocTpAndDocNoOrderByActAtDescHistNoDesc(docTp, docNo.trim());
        } else {
            LocalDateTime[] r = DemoSupport.range(fromDt, toDt);
            list = repository.findByDocTpAndActAtGreaterThanEqualAndActAtLessThanOrderByActAtDescHistNoDesc(docTp, r[0], r[1]);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (OutputHistory h : list) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("histNo", h.getHistNo());
            m.put("docNo", h.getDocNo());
            m.put("docRev", h.getDocRev());
            m.put("actCd", h.getActCd());
            m.put("actNm", actionName.apply(h.getActCd()));
            m.put("statBef", h.getStatBef());
            m.put("statBefNm", h.getStatBef() == null ? null : statusName.apply(h.getStatBef()));
            m.put("statAft", h.getStatAft());
            m.put("statAftNm", h.getStatAft() == null ? null : statusName.apply(h.getStatAft()));
            m.put("reason", h.getRsnTxt());
            m.put("actBy", h.getActBy());
            m.put("actAt", DemoSupport.format(h.getActAt()));
            out.add(m);
        }
        return out;
    }
}
