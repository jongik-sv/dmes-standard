package com.dongkuk.dmes.mcm.widget.memo.repository;

import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemo;
import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemoId;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code MCMAPUSER.TB_MCM_SEC_USER_WIDGET_MEMO} — 스펙 2026-10-02-widget-admin-generic §17.2. 늘 (userId, instId) 로 읽는다(IDOR). */
public interface WidgetMemoRepository extends JpaRepository<WidgetMemo, WidgetMemoId> {

    /** 사용자당 100개 상한 — 새 instId 를 저장할 때만 센다. */
    long countByUserId(String userId);
}
