package com.dongkuk.dmes.mqc.qpr.tagManagement.repository;

import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.TagDoc;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TagDocRepository extends JpaRepository<TagDoc, String> {
}
