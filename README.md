# 见字如面 · 使用说明

## 怎么打开

双击 `index.html` 就行。不需要服务器、不需要联网、不需要装任何东西。

## 目录

```
site/
├─ index.html          首页：状态行 · 这一年 · 两封信 · 她
├─ photos.html         照片墙：全部 / 我们的日常 / 她 / 会动的
├─ assets/style.css    样式（纸、墨、靛蓝、朱砂四个颜色都在最上面）
├─ assets/app.js       页面逻辑
├─ data/content.js     ← 所有文字内容都在这里，想改就改这个文件
├─ data/media.js       素材清单（自动生成，不用手改）
└─ media/              处理好的照片和视频
```

## 想改点什么

| 想改的东西 | 去哪里改 |
|---|---|
| 信的文字 | `data/content.js` 里的 `letters` |
| 页头名字、距离、下次见面日期 | `data/content.js` 顶部的 `him` / `her` / `distance` / `nextMeeting` |
| 年历上点亮的日子 | `data/content.js` 里的 `landmarks` |
| 相纸下面的小字、视频批注 | `data/content.js` 里的 `photoNotes` / `videoNotes` |
| 首页「她」显示哪几张 | `data/content.js` 里的 `herPicks`（现在是 p42 / p48 / p50 / p52） |
| 颜色、字号、间距 | `assets/style.css` 最上面的变量 |

## 想加照片和视频

1. 把文件丢进上一层的 `materials/photos/` 或 `materials/videos/`
2. 在项目根目录跑一次：

```
python tools/build_media.py
```

照片会自动压缩成网页大图和缩略图；视频会转成浏览器能放的 H.264，并抽出首帧当封面。
新照片会按文件名顺序编号（p53、p54……），可以在 `content.js` 里使用。

**注意**：`materials/photos` 里第 36 张之后的照片会被归到「她」这一组（见 `tools/build_media.py` 里的 `HER_FROM`）。

## 现在还不能做的事

- 在网页上直接写字、传照片（这需要一个后端，见 `docs/网站设计说明.md` 的技术方案）
- 搜索、地图、月度回顾

要让这个站在网上能被打开（而不是只在自己电脑上），把它放到 Vercel / Netlify / GitHub Pages 就行，免费；视频建议单独放 Cloudflare R2。
