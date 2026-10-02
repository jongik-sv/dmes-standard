package com.dongkuk.dmes.mcm.widget.media.repository;

import com.dongkuk.dmes.mcm.widget.media.entity.WidgetMedia;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code MCMAPUSER.TB_MCM_WIDGET_MEDIA} — 스펙 2026-10-02-widget-admin-generic §4.3. */
public interface WidgetMediaRepository extends JpaRepository<WidgetMedia, String> {
}
