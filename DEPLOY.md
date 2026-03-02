# Deployment Guide

정적 사이트이므로 빌드 없이 바로 배포할 수 있습니다.

## 권장: GitHub + Netlify (상시 공유용)

1. GitHub 새 리포지토리 생성 (예: `tg-bot-site`)
2. 로컬에서 첫 푸시:

```bash
cd "/Users/whdqkf88/Desktop/tg bot"
git status
git add .
git commit -m "Initial deploy-ready site"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

이미 Git 저장소라면 `git init`은 필요 없습니다.

3. Netlify 접속: <https://app.netlify.com/>
4. `Add new site` -> `Import an existing project` -> GitHub 연결
5. 방금 만든 리포지토리 선택
6. Build settings:
   - Build command: (비워둠)
   - Publish directory: `.`
7. `Deploy site` 클릭

배포 완료 후 Netlify URL(예: `https://your-site.netlify.app`)을 공유하면 됩니다.

## 대안: GitHub + Vercel

1. GitHub에 위와 동일하게 푸시
2. Vercel 접속: <https://vercel.com/new>
3. 리포지토리 선택 후 Import
4. Framework Preset: `Other`
5. Build Command: 비워둠 / Output Directory: `.`
6. Deploy

## 커스텀 도메인

- Netlify: `Site settings` -> `Domain management` -> `Add custom domain`
- Vercel: `Project` -> `Settings` -> `Domains`

## 업데이트 반영 방법

```bash
cd "/Users/whdqkf88/Desktop/tg bot"
git add .
git commit -m "Update site"
git push
```

Git 연동 배포라면 push할 때마다 자동 반영됩니다.
