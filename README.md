# LinkGrabber for GitHub

一個可直接部署到 GitHub Pages 的純前端書籤與網址整理工具。無 CDN、無後端、無建置步驟。

## 功能

- 內建 Chrome、Microsoft Edge、Firefox、Safari 書籤匯出與快捷鍵指引（支援 Windows / Mac）
- 拖放多個書籤 HTML、JSON、CSV、Markdown 或 TXT
- 完整保留書籤資料夾路徑與階層結構
- 重複網址處理：保留第一次、最後一次、合併來源或全部保留
- 搜尋、資料夾篩選，**支援指定資料夾或自訂範圍匯出**
- 支援匯出為 **標準瀏覽器書籤 HTML**、CSV、JSON、Markdown、純網址複製
- 自訂專案名稱、副標題、主色及 Logo
- localStorage、深色模式、RWD、PWA及列印版面

## GitHub Pages 部署

1. 建立新的 GitHub repository。
2. 將本 ZIP 解壓縮後的全部檔案上傳至 repository 根目錄。
3. 開啟 `Settings > Pages`。
4. 將 Source 設為 `GitHub Actions`。
5. Push 至 `main`，等待 `Deploy GitHub Pages` 完成。

部署網址通常為：

```text
https://你的帳號.github.io/儲存庫名稱/
```

## 自訂專案名稱與 Logo

部署後點右上角「品牌設定」，可設定名稱、副標題、主色及 Logo。這些設定保存於目前瀏覽器的 localStorage。

若要讓所有訪客看到固定品牌，請直接修改：

- `index.html` 中的預設名稱及副標題
- `assets/logo.svg`
- `manifest.webmanifest` 中的 `name`、`short_name`、`theme_color`

## 本機測試

Service Worker 需要 HTTP 環境：

```bash
python -m http.server 8000
```

開啟 `http://localhost:8000`。

## 隱私

所有匯入與整理均在瀏覽器端進行，檔案不會上傳至伺服器。

## 專案結構

```text
.
├── index.html
├── style.css
├── app.js
├── manifest.webmanifest
├── sw.js
├── assets/
├── test-data/
└── .github/workflows/pages.yml
```

## 授權

MIT License。
