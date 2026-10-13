/* 见字如面 —— 页面逻辑
 * 数据都从 Store 来（assets/store.js）：能连上后端就用后端的，连不上就用静态内容。
 */
(function () {
  "use strict";

  // 这两个会在 Store 读完数据之后被换成后端的版本
  var C = window.SITE_CONTENT || {};
  var M = window.SITE_MEDIA || { photos: [], videos: [], words: [] };
  var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function clear(node) {
    if (node) node.innerHTML = "";
    return node;
  }
  function sameKey(item, slug) {
    return item && (item.key === slug || item.slug === slug);
  }
  function parseDate(str) {
    var p = String(str).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function dayKey(d) { return d.getMonth() + 1 + "-" + d.getDate(); }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
  function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function photoOf(slug) {
    for (var i = 0; i < M.photos.length; i++) if (sameKey(M.photos[i], slug)) return M.photos[i];
    return null;
  }
  function videoOf(slug) {
    for (var i = 0; i < M.videos.length; i++) if (sameKey(M.videos[i], slug)) return M.videos[i];
    return null;
  }
  function wordOf(slug) {
    var list = M.words || [];
    for (var i = 0; i < list.length; i++) if (sameKey(list[i], slug)) return list[i];
    return null;
  }
  // bundle 素材是站内相对路径，网页传的是 Storage 的公开地址，这里统一处理
  function photoURL(slug, kind) {
    var photo = photoOf(slug);
    if (!photo) return "";
    return kind === "full" ? photo.full || photo.thumb : photo.thumb || photo.full;
  }
  function note(store, slug, fallback) {
    return (store && store[slug]) || fallback || "";
  }

  /* ---------------- 状态行 ---------------- */
  function renderStatus() {
    var box = $("#status");
    if (!box) return;
    var pieces = [];

    if (C.distance) pieces.push(["异地 ", "<b>" + C.distance + "</b>"]);
    pieces.push(["已写 ", "<b>" + (C.letters ? C.letters.length : 0) + "</b>", " 封"]);

    var next = "";
    if (C.nextMeeting) {
      var left = daysBetween(midnight(today), midnight(parseDate(C.nextMeeting)));
      next = '<span class="next">' + (left >= 0 ? "距下次见面 <b>" + left + "</b> 天" : "见面已经过去 <b>" + (-left) + "</b> 天") + "</span>";
    } else {
      next = "<span>下次见面 · 未定</span>";
    }

    box.innerHTML = pieces.map(function (p) {
      return "<span>" + p[0] + p[1] + (p[2] || "") + "</span>";
    }).join("<span>·</span>") + next;
  }

  /* ---------------- 在一起多少天 + 下一个纪念日 ---------------- */
  var tickerOn = false;
  function startTicker() {
    var big = $("#counter-days");
    if (!big) return;
    var nextEl = $("#counter-next");
    var lastDay = -1;

    function nextMilestone() {
      var start = midnight(parseDate(C.start));
      var today = midnight(new Date());
      var targets = [100, 200, 300, 365, 500, 730];
      for (var i = 0; i < targets.length; i++) {
        var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + targets[i]);
        if (d > today) {
          var name = targets[i] === 365 ? "一周年" : "第 " + targets[i] + " 天";
          return name + " · 还有 " + daysBetween(today, d) + " 天";
        }
      }
      return "";
    }

    function render() {
      var now = new Date();
      var start = midnight(parseDate(C.start));
      var days = Math.floor((midnight(now) - start) / 86400000);   // 与全站口径一致：到今天为止过了多少天
      if (days === lastDay) return;
      lastDay = days;
      big.textContent = days;
      if (nextEl) nextEl.textContent = nextMilestone();
    }

    render();
    if (tickerOn) return; // 循环只开一次，之后每次重跑只刷新数字
    tickerOn = true;
    // 一封信不会在你手里走秒：不再每秒写一次 DOM，只在跨天（或回到窗口）时更新
    setInterval(render, 30000);
    window.addEventListener("focus", render);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) render(); });
  }

  /* ---------------- 距离 ---------------- */
  function renderDistance() {
    var box = $("#distance");
    if (!box || !C.distanceCities) return;
    box.innerHTML =
      '<span class="dist-city">' + C.distanceCities.left + "</span>" +
      '<span class="dist-line"></span>' +
      '<span class="dist-city">' + C.distanceCities.right + "</span>" +
      '<span class="dist-km">' + C.distance + "</span>";
  }

  /* ---------------- 里程碑时间线 ---------------- */
  function renderMilestones(lightbox, containerId) {
    var box = $("#" + (containerId || "milestones"));
    if (!box) return;
    clear(box);
    var list = el("ul", "timeline");
    var lastMonth = "";
    (C.milestones || []).forEach(function (m) {
      // 月份眉标：一年读下来才有节奏，不然就是一串日期
      var d = parseDate(m.date);
      var monthKey = d.getFullYear() + "-" + (d.getMonth() + 1);
      if (monthKey !== lastMonth) {
        lastMonth = monthKey;
        list.appendChild(el("li", "tl-month", (d.getMonth() + 1) + " 月"));
      }
      var li = el("li", "tl-item");
      li.appendChild(el("div", "tl-date", m.dateText || m.date));
      li.appendChild(el("div", "tl-title", m.title));
      if (m.note) li.appendChild(el("div", "tl-note", m.note));
      if (m.photo) {
        var photo = photoOf(m.photo);
        if (photo) {
          var fig = el("figure", "tl-photo");
          var img = el("img");
          img.src = photoURL(photo.slug, "thumb");
          img.alt = m.title;
          img.loading = "lazy";
          sizeTo(img, photo);
          fig.appendChild(img);
          fig.addEventListener("click", function () {
            lightbox.open(photoURL(photo.slug, "full"), (m.dateText || m.date) + " · " + m.title);
          });
          li.appendChild(fig);
        }
      }
      list.appendChild(li);
    });
    box.appendChild(list);
  }

  /* ---------------- 随机回忆 ---------------- */
  function bindRandom(lightbox) {
    var buttons = document.querySelectorAll("[data-random]");
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener("click", function () {
        var pool = M.photos.filter(function (p) { return p.group === "us" || p.group === "her"; });
        if (!pool.length) return;
        var p = pool[Math.floor(Math.random() * pool.length)];
        var caption = note(C.photoNotes, p.slug) || (p.group === "her" ? "琪琪" : "我们");
        lightbox.open(photoURL(p.slug, "full"), caption);
      });
    });
  }

  /* ---------------- 首页旋转照片背景 ---------------- */
  function startBackground() {
    var bg = $("#bg");
    if (!bg) return;
    if (bg.getAttribute("data-on")) return; // 只初始化一次，图片池每轮现算
    var pool = M.photos.filter(function (p) {
      return p.group === "us" && Math.min(p.w, p.h) >= 1000;
    });
    if (!pool.length) return;
    bg.setAttribute("data-on", "1");

    if (pool.length === 1) {
      var only = el("img");
      only.src = photoURL(pool[0].slug, "thumb");
      only.classList.add("on");
      bg.appendChild(only);
      return;
    }

    var a = el("img");
    var b = el("img");
    bg.appendChild(a);
    bg.appendChild(b);
    var i = -1;

    function show() {
      i = (i + 1) % pool.length;
      var incoming = i % 2 === 0 ? a : b;
      var outgoing = i % 2 === 0 ? b : a;
      // 压在 10% 不透明度下面，缩略图完全够用；换成大图只会白跑流量。
      incoming.src = photoURL(pool[i].slug, "thumb");
      incoming.classList.add("on");
      outgoing.classList.remove("on");
      var preload = new Image();
      preload.src = photoURL(pool[(i + 1) % pool.length].slug, "thumb");
    }

    show();
    setInterval(show, 20000);
  }

  /* ---------------- 这一年 ---------------- */
  function renderYear() {
    var grid = $("#year-grid");
    var readout = $("#readout");
    if (!grid) return;
    clear(grid);

    var today = new Date();
    var year = today.getFullYear();
    var start = parseDate(C.start);
    var marks = {};
    var label = {};
    (C.landmarks || []).forEach(function (item) {
      var d = parseDate(item.date);
      if (d.getFullYear() !== year) return;
      marks[dayKey(d)] = item.kind;
      label[dayKey(d)] = item.label || "";
    });

    var picked = null;
    function pick(dot, text) {
      if (picked) picked.classList.remove("picked");
      picked = dot;
      dot.classList.add("picked");
      if (readout) readout.textContent = text;
    }

    for (var m = 1; m <= 12; m++) {
      var row = el("div", "year-row");
      var monthLabel = el("span", "year-month", m + "月");
      row.appendChild(monthLabel);

      for (var d = 1; d <= 31; d++) {
        if (d > MONTH_DAYS[m - 1]) {
          row.appendChild(el("span", "dot void"));
          continue;
        }
        var date = new Date(year, m - 1, d);
        var key = m + "-" + d;
        var dot = el("button", "dot");
        dot.type = "button";
        var text = m + "月" + d + "日 · ";

        if (date > today) {
          dot.classList.add("none");
          text += "还没到";
        } else if (date < start) {
          dot.classList.add("none");
          text += "那时候还没在一起";
        } else if (marks[key] === "met") {
          dot.classList.add("met");
          text += label[key] || "我们见面了";
        } else if (marks[key] === "letter") {
          // 注意：类名不能叫 letter —— 那会和信片的 .letter 撞上，
          // 把圆点撑成一条竖条（.letter 上有 padding）。
          dot.classList.add("wrote");
          text += label[key] || "这天写了信";
        } else if (d === today.getDate() && m === today.getMonth() + 1) {
          dot.classList.add("today");
          text += "今天，还没写";
        } else {
          dot.classList.add("blank");
          text += "空着";
        }

        dot.setAttribute("aria-label", m + "月" + d + "日，" + text.replace(m + "月" + d + "日 · ", ""));
        (function (node, txt, isToday) {
          node.addEventListener("click", function () { pick(node, txt); });
          if (isToday) setTimeout(function () { pick(node, txt); }, 0);
        })(dot, text, d === today.getDate() && m === today.getMonth() + 1);
        row.appendChild(dot);
      }
      grid.appendChild(row);
    }
  }

  /* ---------------- 相纸 ---------------- */
  // 相纸在图片下载完之前也得先把位置占住，否则懒加载的那几张会缩成一条白边
  function sizeTo(img, photo) {
    if (photo && photo.w && photo.h) {
      img.setAttribute("width", photo.w);
      img.setAttribute("height", photo.h);
    }
    if (photo && photo.color) img.style.background = photo.color;
  }

  function printFigure(photo, tilt, noteText, onOpen) {
    var fig = el("figure", "print");
    // 每张相纸歪多少度是随机的，只有左右倾向保留调用方的意思
    var base = tilt ? -0.7 : 0.7;
    var angle = base + (Math.random() * 0.9 - 0.45);
    fig.style.transform = "rotate(" + angle.toFixed(2) + "deg)";
    var img = el("img");
    img.src = photoURL(photo.slug, "thumb");
    img.alt = noteText || "";
    img.loading = "lazy";
    // 用素材里已经算好的主色当占位：图片是"显影"出来的，不是白闪
    sizeTo(img, photo);
    fig.appendChild(img);
    if (noteText) fig.appendChild(el("figcaption", null, noteText));
    if (onOpen) {
      fig.style.cursor = "zoom-in";
      fig.addEventListener("click", function () { onOpen(); });
    }
    return fig;
  }

  function videoFigure(video, tilt, noteText, onOpen) {
    var fig = el("figure", "print " + (tilt ? "tilt-l" : "tilt-r"));
    var box = el("span", "play-badge");
    var node = document.createElement("video");
    node.poster = video.poster;
    node.muted = true;
    node.playsInline = true;
    node.setAttribute("playsinline", "");
    if (video.loop) {
      // 仓库里自带静音小循环：在信里就轻轻动着，点开才是带声音的完整版
      node.src = video.loop;
      node.loop = true;
      node.autoplay = true;
    } else {
      // 网页上传的视频不做自动播放：只显示封面，点开才拉流
      node.preload = "none";
      box.classList.add("still");
      if (!video.poster) {
        node.src = video.src_mp4;
        node.preload = "metadata";
      }
    }
    box.appendChild(node);
    fig.appendChild(box);
    if (noteText) fig.appendChild(el("figcaption", null, noteText));
    if (onOpen) {
      fig.style.cursor = "zoom-in";
      fig.addEventListener("click", function () { onOpen(); });
    }
    return fig;
  }

  /* ---------------- 首页的信：按"日子"铺开 ---------------- */
  // "9月6日 · 08:50" → 这一天是 9月6日，这封写在 08:50
  function dayParts(dateText) {
    var parts = String(dateText || "").split("·");
    return {
      day: (parts[0] || "").trim(),
      time: (parts[1] || "").trim()
    };
  }

  function letterCard(letter, lightbox) {
    var art = el("article", "letter");
    art.setAttribute("data-letter", letter.id || letter.legacyId || "");

    var head = el("div", "letter-head");
    var stamp = dayParts(letter.dateText).time;
    if (stamp) head.appendChild(el("span", "date", stamp));
    if (letter.title) head.appendChild(el("span", "letter-title", letter.title));
    if (Store.state.signedIn && letter.id) {
      var tools = el("span", "letter-tools");
      var edit = el("a", "mini", "编辑");
      edit.href = "write.html?id=" + encodeURIComponent(letter.id);
      var del = el("button", "mini danger", "删除");
      del.type = "button";
      del.addEventListener("click", function () {
        UI.confirm("删掉《" + (letter.title || letter.dateText) + "》这封信？", "删除").then(function (ok) {
          if (!ok) return;
          Store.deleteLetter(letter.id).then(function () {
            UI.toast("删掉了");
          }).catch(function (err) {
            UI.toast(err.message || String(err), "bad");
          });
        });
      });
      tools.appendChild(edit);
      tools.appendChild(del);
      head.appendChild(tools);
    }
    art.appendChild(head);

    var prints = el("div", "prints");
    (letter.photos || []).forEach(function (slug, i) {
      var photo = photoOf(slug);
      if (!photo) return;
      prints.appendChild(printFigure(photo, i % 2 === 0, note(C.photoNotes, slug), function () {
        lightbox.open(photoURL(slug, "full"), note(C.photoNotes, slug), photo);
      }));
    });
    (letter.videos || []).forEach(function (slug) {
      var video = videoOf(slug);
      if (!video) return;
      prints.appendChild(videoFigure(video, (letter.photos || []).length % 2 === 1, note(C.videoNotes, slug), function () {
        lightbox.openVideo(video.src_mp4, note(C.videoNotes, slug), video);
      }));
    });
    art.appendChild(prints);

    var body = el("div", "letter-body");
    var keep = 4;   // 前四段留着，剩下的折起来
    var rest = 0;
    (letter.paragraphs || []).forEach(function (text, i) {
      var p = el("p", "copy", text);
      if (i >= keep) {
        p.hidden = true;
        p.classList.add("more-part");
        rest += 1;
      }
      body.appendChild(p);
    });
    art.appendChild(body);

    if (rest > 0) {
      // 底部渐隐 + 一句手写体，而不是在正文中间插一行链接
      art.classList.add("folded");
      var more = el("button", "read-more", "翻开这封信");
      more.type = "button";
      more.addEventListener("click", function () {
        Array.prototype.forEach.call(art.querySelectorAll(".more-part"), function (node) { node.hidden = false; });
        art.classList.remove("folded");
        more.remove();
      });
      art.appendChild(more);
    }

    art.appendChild(el("div", "sign", letter.sign));
    return art;
  }

  function renderLetters(lightbox) {
    var list = $("#letters");
    if (!list) return;
    clear(list);
    if (!(C.letters || []).length) return;

    // 同一天的两封信归到同一个"日子"下面
    var byDate = {};
    var order = [];
    (C.letters || []).forEach(function (letter) {
      var key = letter.date || dayParts(letter.dateText).day;
      if (!byDate[key]) {
        byDate[key] = [];
        order.push(key);
      }
      byDate[key].push(letter);
    });
    order.sort(function (a, b) { return a < b ? 1 : (a > b ? -1 : 0); });

    var newest = order[0];
    order.forEach(function (key) {
      var items = byDate[key];
      var head = el("div", "day-head");
      head.appendChild(el("span", "day-date", dayParts(items[0].dateText).day || key));
      head.appendChild(el("span", "day-rule"));
      var meta = "";
      if (items.length > 1) {
        meta = items[0].author === items[1].author ? "这天写了两封" : "这天我们各写了一封";
      } else if (items[0].author) {
        meta = items[0].author + " 写";
      }
      if (meta) head.appendChild(el("span", "day-meta", meta));
      list.appendChild(head);

      if (key === newest) {
        // 最近的一天完整铺开：这就是"桌上摊着的那一叠"
        items.forEach(function (letter) { list.appendChild(letterCard(letter, lightbox)); });
        return;
      }
      // 更早的日子收成一行，点开去时间线
      items.forEach(function (letter) {
        var row = el("div", "row");
        var stamp = dayParts(letter.dateText).time;
        if (stamp) row.appendChild(el("span", "row-date", stamp));
        row.appendChild(el("span", "row-text", letter.title || (letter.paragraphs || [])[0] || "一封信"));
        var open = el("a", "row-count", "读这封 →");
        open.href = "timeline.html";
        row.appendChild(open);
        list.appendChild(row);
      });
    });
  }

  /* ---------------- 首页「她」 ---------------- */
  function renderHer(lightbox) {
    var box = $("#her-grid");
    if (!box) return;
    clear(box);
    (C.herPicks || []).forEach(function (slug) {
      var photo = photoOf(slug);
      if (!photo) return;
      // 她的照片也用相纸：和信里的照片是同一套语言
      var fig = el("figure", "print");
      fig.style.transform = "rotate(" + (Math.random() * 1.6 - 0.8).toFixed(2) + "deg)";
      fig.style.cursor = "zoom-in";
      var img = el("img");
      img.src = photoURL(slug, "thumb");
      img.alt = "琪琪";
      img.loading = "lazy";
      sizeTo(img, photo);
      fig.appendChild(img);
      fig.addEventListener("click", function () {
        lightbox.open(photoURL(slug, "full"), note(C.photoNotes, slug, "琪琪"), photo);
      });
      box.appendChild(fig);
    });
  }

  /* ---------------- 首页「起点」 ---------------- */
  function renderFirstMeeting(lightbox) {
    var box = $("#start");
    if (!box || !C.firstMeeting) return;
    clear(box);
    var head = el("div", "her-head");
    head.appendChild(el("h2", null, "起点"));
    head.appendChild(el("span", "who", "2026年1月24日 · 第一次见面"));
    box.appendChild(head);

    var photo = photoOf(C.firstMeeting.photo);
    if (photo) {
      var fig = printFigure(photo, true, C.firstMeeting.label, function () {
        lightbox.open(photoURL(C.firstMeeting.photo, "full"), C.firstMeeting.label, photo);
      });
      fig.classList.add("large");
      box.appendChild(fig);
    }
  }

  /* ---------------- 首页「手写的」 ---------------- */
  function renderHandwritten(lightbox) {
    var box = $("#hand");
    if (!box || !C.handwritten) return;
    clear(box);
    var head = el("div", "her-head");
    head.appendChild(el("h2", null, "手写的"));
    head.appendChild(el("span", "who", "字比打字更有温度"));
    box.appendChild(head);

    var fig = el("figure", "hand-fig");
    var img = el("img");
    var word = wordOf(C.handwritten.photo);
    img.src = word ? word.src : "media/words/" + C.handwritten.photo + ".jpg";
    img.alt = C.handwritten.caption;
    img.loading = "lazy";
    sizeTo(img, word);
    fig.appendChild(img);
    fig.appendChild(el("figcaption", null, C.handwritten.caption));
    fig.addEventListener("click", function () {
      if (lightbox) lightbox.open(img.src, C.handwritten.caption, word);
    });
    box.appendChild(fig);
  }

  /* ---------------- 照片墙 ---------------- */
  var gallery = { bound: false, group: "all", lightbox: null };

  function galleryItems() {
    var list = [];
    M.photos.forEach(function (photo) {
      list.push({ kind: "photo", group: photo.group, record: photo });
    });
    M.videos.forEach(function (video) {
      list.push({ kind: "video", group: "moving", record: video });
    });
    return list;
  }

  function galleryVisible() {
    return galleryItems().filter(function (item) {
      if (gallery.group === "all") return true;
      if (gallery.group === "liked") return !!item.record.favorite;
      return item.group === gallery.group;
    });
  }

  function galleryDraw() {
    var grid = $("#gallery");
    if (!grid) return;
    var countBox = $("#count");
    var lightbox = gallery.lightbox;
    var list = galleryVisible();
    clear(grid);
    if (countBox) countBox.textContent = "共 " + list.length + " 张";

    list.forEach(function (item, index) {
      var tile = el("button", "tile");
      tile.type = "button";
      var img = el("img");
      img.loading = "lazy";
      if (item.kind === "photo") {
        img.src = item.record.thumb || item.record.full;
        img.alt = item.group === "her" ? "琪琪" : "我们";
        sizeTo(img, item.record);
      } else {
        img.src = item.record.poster || "";
        img.alt = note(C.videoNotes, item.record.key, "视频");
        sizeTo(img, item.record);
      }
      tile.appendChild(img);
      if (item.kind === "video") {
        tile.appendChild(el("span", "tag", "▶ " + Math.round(item.record.seconds || 0) + "s"));
      }
      if (item.record.favorite) tile.appendChild(el("span", "tag star", "★"));
      tile.addEventListener("click", function () {
        var current = galleryVisible();
        lightbox.setList(
          current.map(function (it) {
            return it.kind === "photo"
              ? {
                  url: it.record.full || it.record.thumb,
                  caption: note(C.photoNotes, it.record.key),
                  record: it.record
                }
              : {
                  video: it.record.src_mp4,
                  caption: note(C.videoNotes, it.record.key),
                  record: it.record
                };
          }),
          index
        );
      });
      grid.appendChild(tile);
    });
  }

  function renderGallery(lightbox) {
    var grid = $("#gallery");
    if (!grid) return;
    gallery.lightbox = lightbox;

    if (!gallery.bound) {
      gallery.bound = true;
      var hash = (location.hash || "").replace("#", "");
      if (["her", "us", "moving", "liked"].indexOf(hash) >= 0) gallery.group = hash;

      var filterBox = $("#filters");
      if (filterBox) {
        // 登录之后多一个「最喜欢」
        if (!$("button[data-group=liked]", filterBox)) {
          var liked = el("button", null, "最喜欢");
          liked.type = "button";
          liked.dataset.group = "liked";
          liked.hidden = true;
          filterBox.insertBefore(liked, $("[data-random]", filterBox));
        }
        filterBox.addEventListener("click", function (event) {
          var btn = event.target.closest("button[data-group]");
          if (!btn) return;
          gallery.group = btn.dataset.group;
          Array.prototype.forEach.call(filterBox.querySelectorAll("button[data-group]"), function (b) {
            b.setAttribute("aria-pressed", String(b === btn));
          });
          galleryDraw();
        });
      }

      var btn = $("#upload-btn");
      var input = $("#upload-input");
      if (input) input.parentNode.removeChild(input); // 老的本机预览已经不需要了
      if (btn) {
        btn.addEventListener("click", function () {
          UI.requireLogin("传照片要先登录一下").then(function (ok) {
            if (!ok) return;
            Uploader.open({
              onUploaded: function () {
                var box = $("#filters");
                if (box) {
                  Array.prototype.forEach.call(box.querySelectorAll("button[data-group]"), function (b) {
                    b.setAttribute("aria-pressed", String(b.dataset.group === "all"));
                  });
                }
                gallery.group = "all";
                galleryDraw();
              }
            });
          });
        });
      }
    }

    Array.prototype.forEach.call(document.querySelectorAll("#filters button[data-group]"), function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.group === gallery.group));
      if (b.dataset.group === "liked") b.hidden = !Store.state.signedIn;
    });
    var uploadBtn = $("#upload-btn");
    if (uploadBtn) uploadBtn.textContent = Store.state.signedIn ? "传照片 / 视频" : "登录后上传";
    galleryDraw();
  }

  /* ---------------- 灯箱 ---------------- */
  function createLightbox() {
    var box = el("div", "lightbox");
    box.innerHTML =
      '<button class="prev" type="button" aria-label="上一张">‹</button>' +
      '<button class="close" type="button" aria-label="关闭">×</button>' +
      '<button class="next" type="button" aria-label="下一张">›</button>' +
      '<div class="lb-bar"><span class="caption"></span><span class="lb-tools"></span></div>';
    document.body.appendChild(box);
    var stage = el("div");
    var caption = $(".caption", box);
    var toolbar = $(".lb-tools", box);
    var list = [];
    var index = 0;

    var save = el("a", "save", "保存这张");
    save.setAttribute("download", "");
    toolbar.appendChild(save);

    // 登录之后，大图上多两个按钮：收藏、删掉
    function drawTools(item) {
      Array.prototype.forEach.call(toolbar.querySelectorAll("button"), function (b) {
        b.parentNode.removeChild(b);
      });
      var record = item.record;
      if (!Store.state.signedIn || !record || !record.id) return;

      var fav = el("button", "mini", record.favorite ? "取消收藏" : "收藏");
      fav.type = "button";
      fav.addEventListener("click", function (event) {
        event.stopPropagation();
        var next = !record.favorite;
        Store.updateMedia(record.id, { is_favorite: next })
          .then(function () {
            UI.toast(next ? "收藏了" : "取消收藏了", "good");
            var fresh = freshRecord(record.id);
            if (fresh) item.record = fresh;
            drawTools(item);
          })
          .catch(function (err) {
            UI.toast(err.message || String(err), "bad");
          });
      });
      toolbar.insertBefore(fav, save);

      var del = el("button", "mini danger", "删除");
      del.type = "button";
      del.addEventListener("click", function (event) {
        event.stopPropagation();
        UI.confirm("把这一张删掉？删了就找不回来了。", "删除").then(function (ok) {
          if (!ok) return;
          Store.deleteMedia(record).then(function () {
            UI.toast("删掉了");
            list.splice(index, 1);
            if (!list.length) {
              closeBox();
              return;
            }
            show(index);
          });
        });
      });
      toolbar.insertBefore(del, save);
    }

    function show(i) {
      if (!list.length) return;
      index = (i + list.length) % list.length;
      var item = list[index];
      stage.innerHTML = "";
      if (item.video) {
        var v = document.createElement("video");
        v.src = item.video;
        v.controls = true;
        v.autoplay = true;
        v.playsInline = true;
        stage.appendChild(v);
      } else {
        var img = el("img");
        img.src = item.url;
        stage.appendChild(img);
      }
      caption.textContent = [item.caption, list.length > 1 ? (index + 1) + " / " + list.length : ""]
        .filter(Boolean)
        .join("　·　");
      save.href = item.video || item.url;
      save.textContent = item.video ? "保存这段视频" : "保存这张";
      drawTools(item);
    }

    function closeBox() {
      box.classList.remove("on");
      stage.innerHTML = "";
    }

    /* 手机上左右滑动翻页 */
    var touchX = null;
    box.addEventListener("touchstart", function (e) {
      touchX = e.changedTouches[0].clientX;
    }, { passive: true });
    box.addEventListener("touchend", function (e) {
      if (touchX == null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) < 40) return;
      show(dx > 0 ? index - 1 : index + 1);
    }, { passive: true });

    box.insertBefore(stage, $(".lb-bar", box));
    $(".close", box).addEventListener("click", closeBox);
    $(".prev", box).addEventListener("click", function (e) { e.stopPropagation(); show(index - 1); });
    $(".next", box).addEventListener("click", function (e) { e.stopPropagation(); show(index + 1); });
    box.addEventListener("click", function (event) {
      if (event.target !== stage && event.target !== box) return;
      closeBox();
    });
    document.addEventListener("keydown", function (event) {
      if (!box.classList.contains("on")) return;
      if (event.key === "Escape") closeBox();
      if (event.key === "ArrowLeft") show(index - 1);
      if (event.key === "ArrowRight") show(index + 1);
    });

    return {
      open: function (url, text, record) {
        list = [{ url: url, caption: text, record: record || null }];
        box.classList.add("on");
        show(0);
      },
      openVideo: function (src, text, record) {
        list = [{ video: src, caption: text, record: record || null }];
        box.classList.add("on");
        show(0);
      },
      setList: function (nextList, start) {
        list = nextList;
        box.classList.add("on");
        show(start || 0);
      },
      close: closeBox
    };
  }

  function freshRecord(id) {
    var all = M.photos.concat(M.videos, M.words || []);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /* ---------------- 写一句（碎碎念，只存在这台设备上） ---------------- */
  var notesBound = false;
  function initNotes() {
    var openBtn = $("#note-open");
    var box = $("#notebox");
    var input = $("#note-input");
    var saveBtn = $("#note-save");
    var list = $("#notes");
    if (!openBtn || !box) return;
    var KEY = "suixinian";
    function localLoad() {
      try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
    }
    function localStore(items) {
      try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* 忽略 */ }
    }
    function todayLabel() {
      var now = new Date();
      return (now.getMonth() + 1) + "月" + now.getDate() + "日";
    }
    function labelOf(dateStr) {
      var p = String(dateStr || "").split("-");
      return p.length === 3 ? Number(p[1]) + "月" + Number(p[2]) + "日" : dateStr;
    }
    function me() {
      var user = Store.state.user;
      var name = (user && user.user_metadata && user.user_metadata.display_name) || "";
      return name.trim() || (user && user.email ? String(user.email).split("@")[0] : "");
    }
    // 登录了就用数据库里的（两个人都看得到），没登录就还用本机这份
    function current() {
      if (!Store.state.signedIn) return localLoad();
      return (C.notes || []).map(function (n) {
        return { id: n.id, date: labelOf(n.date), text: n.body, author: n.author };
      });
    }
    function draw() {
      var items = current();
      if (list) {
        list.innerHTML = "";
        items.slice(0, 8).forEach(function (item) {
          var row = el("div", "note-row");
          row.appendChild(el("span", "note-date", item.date));
          row.appendChild(el("span", "note-text", item.text));
          if (item.author) row.appendChild(el("span", "note-author", item.author));
          if (Store.state.signedIn && item.id) {
            var del = el("button", "mini danger", "删");
            del.type = "button";
            del.addEventListener("click", function () {
              Store.deleteNote(item.id).catch(function (err) {
                UI.toast(err.message || String(err), "bad");
              });
            });
            row.appendChild(del);
          }
          list.appendChild(row);
        });
      }
      var inviteText = $("#invite-text");
      if (inviteText && items.length && items[0].date === todayLabel()) {
        inviteText.textContent = "今天写过了。还想再说一句？";
      }
      var hint = $(".note-hint");
      if (hint) {
        hint.textContent = Store.state.signedIn
          ? "存下来你们两个都看得到"
          : "现在只保存在这台设备上，登录之后你们俩都能看到";
      }
    }
    if (!notesBound) {
      notesBound = true;
      openBtn.addEventListener("click", function () {
        box.hidden = !box.hidden;
        if (!box.hidden && input) input.focus();
      });
      if (saveBtn) {
        saveBtn.addEventListener("click", function () {
          var text = (input.value || "").trim();
          if (!text) return;
          if (Store.state.signedIn) {
            saveBtn.disabled = true;
            Store.addNote(text, me())
              .then(function () {
                input.value = "";
                box.hidden = true;
                UI.toast("记下了", "good");
              })
              .catch(function (err) {
                UI.toast(err.message || String(err), "bad");
              })
              .then(function () {
                saveBtn.disabled = false;
              });
            return;
          }
          var items = localLoad();
          items.unshift({ date: todayLabel(), text: text });
          localStore(items.slice(0, 50));
          input.value = "";
          box.hidden = true;
          draw();
        });
      }
    }
    draw();
  }

  var galleryBound = false;

  function renderAll(lightbox) {
    renderStatus();
    startTicker();
    startBackground();
    renderYear();
    renderDistance();
    renderMilestones(lightbox, "milestones");
    renderMilestones(lightbox, "timeline-page");
    renderLetters(lightbox);
    renderHer(lightbox);
    initNotes();
    renderFirstMeeting(lightbox);
    renderHandwritten(lightbox);
    renderGallery(lightbox);
    if (!galleryBound) {
      galleryBound = true;
      bindRandom(lightbox);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var lightbox = createLightbox();
    UI.mount();
    // Store 一开始就备好了静态内容，所以这一遍画不会白屏；后端读回来之后会自动重画
    C = Store.state.content || C;
    M = Store.state.media || M;
    renderAll(lightbox);
    Store.onChange(function () {
      C = Store.state.content || C;
      M = Store.state.media || M;
      renderAll(lightbox);
    });
    Store.init();
  });

})();
