package com.dongkuk.dmes.mcm.widget.memo.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemo;
import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemoId;
import com.dongkuk.dmes.mcm.widget.memo.repository.WidgetMemoRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 개인 메모 쓰기의 트랜잭션 경계(스펙 §17.3). OASIS 서비스 빈({@link WidgetMemoService})에는 {@code @Transactional} 을 붙일 수
 * 없어(CGLIB 프록시가 파라미터명 메타데이터를 잃는다, BackEnd 표준 §6-B-1) 「개수 확인 + 저장」을 이 빈에 묶는다 — A 의
 * {@code SecWidgetTabWriter} 와 같은 방식(바깥 OASIS 트랜잭션에 합류한다).
 * <p>덮어쓰기는 읽어 온 행의 값만 바꾼다 — 새 객체로 merge 하면 C_AT·C_USR_ID·VER 가 지워진다.
 * 끝에 flush 해서 {@code @PreUpdate} 가 채운 U_AT 을 응답에 쓸 수 있게 한다.
 */
@Component("widgetMemoWriter")
public class WidgetMemoWriter {

    /** 사용자당 메모 수 상한. */
    public static final int MAX_PER_USER = 100;
    static final String LIMIT_MESSAGE = "메모는 " + MAX_PER_USER + "개까지 저장할 수 있습니다";

    private final WidgetMemoRepository repository;

    @Autowired
    public WidgetMemoWriter(WidgetMemoRepository repository) {
        this.repository = repository;
    }

    /** (userId, instId) 메모를 넣거나 덮어쓴다. 새 instId 일 때만 사용자당 100개 상한을 본다. */
    @Transactional
    public WidgetMemo save(String userId, String instId, String defId, String fmt, String content) {
        WidgetMemo memo = repository.findById(new WidgetMemoId(userId, instId)).orElse(null);
        if (memo == null) {
            if (repository.countByUserId(userId) >= MAX_PER_USER) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, LIMIT_MESSAGE);
            }
            memo = new WidgetMemo();
            memo.setUserId(userId);
            memo.setInstId(instId);
        }
        memo.setDefId(defId);
        memo.setFmt(fmt);
        memo.setContent(content);
        return repository.saveAndFlush(memo);
    }
}
