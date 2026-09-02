#!/bin/bash
# bpmn-skill을 사용자 레벨 Claude Code 스킬로 설치하는 스크립트

SKILL_DIR="$HOME/.claude/skills/bpmn-skill"
REPO_URL="https://raw.githubusercontent.com/thecodinglog/bpmn-skill/main/SKILL.md"

mkdir -p "$SKILL_DIR"
curl -fsSL "$REPO_URL" -o "$SKILL_DIR/SKILL.md"

echo "설치 완료: $SKILL_DIR/SKILL.md"
