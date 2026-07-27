# Research Findings Publication

Independent public VitePress site for publishable research notes and reports.

This repository does not contain source projects, credentials, internal configuration, or development branches. It only stores material intentionally copied into `docs/` for public publication.

## Add an A-share report

```powershell
.\scripts\sync-a-share-report.ps1 -ReportPath 'G:\path\to\YYYY-MM-DD_A股收盘简报.md'
```

Review the copied Markdown before committing. The script reads the source report and only writes files inside this repository.
