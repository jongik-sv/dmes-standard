# bpmn-skill을 사용자 레벨 Claude Code 스킬로 설치하는 PowerShell 스크립트

$SkillDir = "$env:USERPROFILE\.claude\skills\bpmn-skill"
$Url = "https://raw.githubusercontent.com/thecodinglog/bpmn-skill/main/SKILL.md"

New-Item -ItemType Directory -Force -Path $SkillDir | Out-Null
Invoke-WebRequest -Uri $Url -OutFile "$SkillDir\SKILL.md"

Write-Host "설치 완료: $SkillDir\SKILL.md"
