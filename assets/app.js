/* 见字如面 —— 页面逻辑（纯静态，不需要服务器） */
(function () {
  "use strict";

  var C = window.SITE_CONTENT || {};
  var M = window.SITE_MEDIA || { photos: [], videos: [] };
  var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function parseDate(str) {
    var p = String(str).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function dayKey(d) { return d.getMonth() + 1 + "-" + d.getDate(); }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
  function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function photoOf(slug) {
    for (var i = 0; i < M.photos.length; i++) if (M.photos[i].slug === slug) return M.photos[i];
    return null;
  }
  function videoOf(slug) {
    for (var i = 0; i < M.videos.length; i++) if (M.videos[i].slug === slug) return M.videos[i];
    return null;
  }
  function photoURL(slug, kind) {
    return "media/photos/" + (kind === "full" ? "full" : "thumb") + "/" + slug + ".jpg";
  }
  function note(store, slug, fallback) {
    return (store && store[slug]) || fallback || "";
  }

  /* ---------------- 明暗 ---------------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem("theme"); } catch (e) { saved = null; }
    var dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    var btn = $(".theme-toggle");
    if (!btn) return;
    btn.textContent = dark ? "日间" : "夜读";
    btn.addEventListener("click", function () {
      var isDark = document.documentElement.getAttribute("data-theme") === "dark";
      var next = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      btn.textContent = next === "dark" ? "日间" : "夜读";
      try { localStorage.setItem("theme", next); } catch (e) { /* 忽略 */ }
    });
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

  /* ---------------- 实时计时 + 下一个纪念日 ---------------- */
  function startTicker() {
    var big = $("#counter-days");
    if (!big) return;
    var hh = $("#counter-hh");
    var mm = $("#counter-mm");
    var ss = $("#counter-ss");
    var nextEl = $("#counter-next");
    var start = midnight(parseDate(C.start));
    var lastSecond = -1;

    function two(n) { return (n < 10 ? "0" : "") + n; }
    function nextMilestone() {
      var today = midnight(new Date());
      var targets = [100, 200, 300, 365, 500, 730];
      for (var i = 0; i < targets.length; i++) {
        var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + targets[i]);
        if (d > today) {
          var name = targets[i] === 365 ? "一周年" : "第 " + targets[i] + " 天";
          return "距" + name + "还有 " + daysBetween(today, d) + " 天";
        }
      }
      return "";
    }

    function render(now) {
      var total = Math.floor((midnight(now) - start) / 1000);
      var days = Math.floor(total / 86400);
      var rest = total - days * 86400;
      big.textContent = days;
      if (hh) hh.textContent = two(Math.floor(rest / 3600));
      if (mm) mm.textContent = two(Math.floor((rest % 3600) / 60));
      if (ss) ss.textContent = two(rest % 60);
    }

    function frame() {
      var now = new Date();
      var second = Math.floor(now.getTime() / 1000);
      if (second !== lastSecond) {
        lastSecond = second;
        render(now);
      }
      requestAnimationFrame(frame);
    }

    if (nextEl) {
      var label = nextMilestone();
      nextEl.textContent = label;
    }
    render(new Date());
    requestAnimationFrame(frame);
    setInterval(function () { render(new Date()); }, 1000);
    window.addEventListener("focus", function () { render(new Date()); });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) render(new Date());
    });
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
    var list = el("ul", "timeline");
    (C.milestones || []).forEach(function (m) {
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
    var pool = M.photos.filter(function (p) {
      return p.group === "us" && Math.min(p.w, p.h) >= 1000;
    });
    if (!pool.length) return;

    if (pool.length === 1) {
      var only = el("img");
      only.src = photoURL(pool[0].slug, "full");
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
      incoming.src = photoURL(pool[i].slug, "full");
      incoming.classList.add("on");
      outgoing.classList.remove("on");
      var preload = new Image();
      preload.src = photoURL(pool[(i + 1) % pool.length].slug, "full");
    }

    show();
    setInterval(show, 10000);
  }

  /* ---------------- 这一年 ---------------- */
  function renderYear() {
    var grid = $("#year-grid");
    var readout = $("#readout");
    if (!grid) return;

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
          dot.classList.add("letter");
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
  function printFigure(photo, tilt, noteText, onOpen) {
    var fig = el("figure", "print " + (tilt ? "tilt-l" : "tilt-r"));
    var img = el("img");
    img.src = photoURL(photo.slug, "thumb");
    img.alt = noteText || "";
    img.loading = "lazy";
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
    node.src = video.loop || video.src_mp4;
    node.poster = video.poster;
    node.muted = true;
    node.loop = true;
    node.autoplay = true;
    node.playsInline = true;
    node.setAttribute("playsinline", "");
    box.appendChild(node);
    fig.appendChild(box);
    if (noteText) fig.appendChild(el("figcaption", null, noteText));
    if (onOpen) {
      fig.style.cursor = "zoom-in";
      fig.addEventListener("click", function () { onOpen(); });
    }
    return fig;
  }

  /* ---------------- 首页的两封信 ---------------- */
  function renderLetters(lightbox) {
    var list = $("#letters");
    if (!list) return;

    (C.letters || []).forEach(function (letter) {
      var art = el("article", "letter");
      var head = el("div", "letter-head");
      head.appendChild(el("span", "date", letter.dateText));
      if (letter.title) head.appendChild(el("span", "letter-title", letter.title));
      head.appendChild(el("span", "who", letter.author + " 写"));
      art.appendChild(head);

      var prints = el("div", "prints");
      (letter.photos || []).forEach(function (slug, i) {
        var photo = photoOf(slug);
        if (!photo) return;
        prints.appendChild(printFigure(photo, i % 2 === 0, note(C.photoNotes, slug), function () {
          lightbox.open(photoURL(slug, "full"), note(C.photoNotes, slug));
        }));
      });
      (letter.videos || []).forEach(function (slug) {
        var video = videoOf(slug);
        if (!video) return;
        prints.appendChild(videoFigure(video, (letter.photos || []).length % 2 === 1, note(C.videoNotes, slug), function () {
          lightbox.openVideo(video.src_mp4, note(C.videoNotes, slug));
        }));
      });
      art.appendChild(prints);

      var paras = letter.paragraphs || [];
      var rest = 0;
      paras.forEach(function (text, i) {
        var p = el("p", "copy", text);
        if (i >= 3) {
          p.hidden = true;
          p.classList.add("more-part");
          rest += 1;
        }
        art.appendChild(p);
      });
      if (rest > 0) {
        var more = el("button", "read-more", "继续读（还有 " + rest + " 段）");
        more.type = "button";
        more.addEventListener("click", function () {
          Array.prototype.forEach.call(art.querySelectorAll(".more-part"), function (node) { node.hidden = false; });
          more.remove();
        });
        art.appendChild(more);
      }
      art.appendChild(el("div", "sign", letter.sign));
      list.appendChild(art);
    });
  }

  /* ---------------- 首页「她」 ---------------- */
  function renderHer(lightbox) {
    var box = $("#her-grid");
    if (!box) return;
    (C.herPicks || []).forEach(function (slug) {
      var photo = photoOf(slug);
      if (!photo) return;
      var img = el("img");
      img.src = photoURL(slug, "thumb");
      img.alt = "琪琪";
      img.loading = "lazy";
      img.addEventListener("click", function () {
        lightbox.open(photoURL(slug, "full"), note(C.photoNotes, slug, "琪琪"));
      });
      box.appendChild(img);
    });
  }

  /* ---------------- 首页「起点」 ---------------- */
  function renderFirstMeeting(lightbox) {
    var box = $("#start");
    if (!box || !C.firstMeeting) return;
    var head = el("div", "her-head");
    head.appendChild(el("h2", null, "起点"));
    head.appendChild(el("span", "who", "2026年1月24日 · 第一次见面"));
    box.appendChild(head);

    var photo = photoOf(C.firstMeeting.photo);
    if (photo) {
      var fig = printFigure(photo, true, C.firstMeeting.label, function () {
        lightbox.open(photoURL(photo.slug, "full"), C.firstMeeting.label);
      });
      fig.classList.add("large");
      box.appendChild(fig);
    }
  }

  /* ---------------- 首页「手写的」 ---------------- */
  function renderHandwritten() {
    var box = $("#hand");
    if (!box || !C.handwritten) return;
    var head = el("div", "her-head");
    head.appendChild(el("h2", null, "手写的"));
    head.appendChild(el("span", "who", "字比打字更有温度"));
    box.appendChild(head);

    var fig = el("figure", "hand-fig");
    var img = el("img");
    img.src = "media/words/" + C.handwritten.photo + ".jpg";
    img.alt = C.handwritten.caption;
    img.loading = "lazy";
    fig.appendChild(img);
    fig.appendChild(el("figcaption", null, C.handwritten.caption));
    box.appendChild(fig);
  }

  /* ---------------- 照片墙 ---------------- */
  function renderGallery(lightbox) {
    var grid = $("#gallery");
    if (!grid) return;
    var filterBox = $("#filters");
    var countBox = $("#count");
    var hash = (location.hash || "").replace("#", "");
    var state = { group: hash === "her" || hash === "us" || hash === "moving" ? hash : "all" };

    var items = [];
    M.photos.forEach(function (photo) {
      items.push({ kind: "photo", group: photo.group, data: photo, slug: photo.slug });
    });
    M.videos.forEach(function (video) {
      items.push({ kind: "video", group: "moving", data: video, slug: video.slug });
    });
    var uploaded = [];

    function visible() {
      return items.concat(uploaded).filter(function (item) {
        return state.group === "all" || item.group === state.group;
      });
    }

    function draw() {
      var list = visible();
      grid.innerHTML = "";
      if (countBox) countBox.textContent = "共 " + list.length + " 张";

      list.forEach(function (item, index) {
        var tile = el("button", "tile");
        tile.type = "button";
        var img = el("img");
        img.loading = "lazy";
        if (item.kind === "photo") {
          img.src = item.slug ? photoURL(item.slug, "thumb") : item.url;
          img.alt = item.slug ? (item.data.group === "her" ? "琪琪" : "我们") : "本机预览";
          img.style.background = item.slug ? (item.data.color || "") : "";
          if (!item.slug) tile.appendChild(el("span", "tag", "本机预览"));
        } else {
          img.src = item.data.poster;
          img.alt = note(C.videoNotes, item.slug, "视频");
          tile.appendChild(el("span", "tag", "▶ " + Math.round(item.data.seconds) + "s"));
        }
        tile.appendChild(img);
        tile.addEventListener("click", function () {
          var current = visible();
          lightbox.setList(current.map(function (it) {
            return it.kind === "photo"
              ? { url: it.slug ? photoURL(it.slug, "full") : it.url, caption: it.slug ? note(C.photoNotes, it.slug) : "本机预览 · 刷新会消失" }
              : { video: it.data.src_mp4, caption: note(C.videoNotes, it.slug) };
          }), index);
        });
        grid.appendChild(tile);
      });
    }

    var input = $("#upload-input");
    var btn = $("#upload-btn");
    if (input && btn) {
      btn.addEventListener("click", function () { input.click(); });
      input.addEventListener("change", function () {
        var files = Array.prototype.slice.call(input.files || []);
        files.forEach(function (file) {
          if (!/^image\//.test(file.type)) return;
          var url = URL.createObjectURL(file);
          var probe = new Image();
          probe.onload = function () {
            uploaded.push({
              kind: "photo",
              group: "uploaded",
              data: { group: "uploaded" },
              slug: null,
              url: url,
              w: probe.naturalWidth,
              h: probe.naturalHeight
            });
            draw();
          };
          probe.src = url;
        });
        input.value = "";
      });
    }

    if (filterBox) {
      Array.prototype.forEach.call(filterBox.querySelectorAll("button[data-group]"), function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.group === state.group));
      });
      filterBox.addEventListener("click", function (event) {
        var btn = event.target.closest("button[data-group]");
        if (!btn) return;
        state.group = btn.dataset.group;
        Array.prototype.forEach.call(filterBox.querySelectorAll("button"), function (b) {
          b.setAttribute("aria-pressed", String(b === btn));
        });
        draw();
      });
    }
    draw();
  }

  /* ---------------- 灯箱 ---------------- */
  function createLightbox() {
    var box = el("div", "lightbox");
    box.innerHTML =
      '<button class="prev" type="button" aria-label="上一张">‹</button>' +
      '<button class="close" type="button" aria-label="关闭">×</button>' +
      '<button class="next" type="button" aria-label="下一张">›</button>' +
      '<div class="caption"></div>';
    document.body.appendChild(box);
    var stage = el("div");
    var caption = $(".caption", box);
    var list = [];
    var index = 0;

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
      caption.textContent = [item.caption, list.length > 1 ? (index + 1) + " / " + list.length : ""].filter(Boolean).join("　·　");
      save.href = item.video || item.url;
      save.textContent = item.video ? "保存这段视频" : "保存这张";
    }

    var save = el("a", "save", "保存这张");
    save.setAttribute("download", "");
    box.appendChild(save);

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

    box.insertBefore(stage, caption);
    $(".close", box).addEventListener("click", function () { box.classList.remove("on"); stage.innerHTML = ""; });
    $(".prev", box).addEventListener("click", function (e) { e.stopPropagation(); show(index - 1); });
    $(".next", box).addEventListener("click", function (e) { e.stopPropagation(); show(index + 1); });
    box.addEventListener("click", function (event) {
      if (event.target !== stage && event.target !== box) return;
      box.classList.remove("on");
      stage.innerHTML = "";
    });
    document.addEventListener("keydown", function (event) {
      if (!box.classList.contains("on")) return;
      if (event.key === "Escape") { box.classList.remove("on"); stage.innerHTML = ""; }
      if (event.key === "ArrowLeft") show(index - 1);
      if (event.key === "ArrowRight") show(index + 1);
    });

    return {
      open: function (url, text) {
        list = [{ url: url, caption: text }];
        box.classList.add("on");
        show(0);
      },
      openVideo: function (src, text) {
        list = [{ video: src, caption: text }];
        box.classList.add("on");
        show(0);
      },
      setList: function (nextList, start) {
        list = nextList;
        box.classList.add("on");
        show(start || 0);
      }
    };
  }

  /* ---------------- 写一句（碎碎念，只存在这台设备上） ---------------- */
  function initNotes() {
    var openBtn = $("#note-open");
    var box = $("#notebox");
    var input = $("#note-input");
    var saveBtn = $("#note-save");
    var list = $("#notes");
    if (!openBtn || !box) return;
    var KEY = "suixinian";
    function load() {
      try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
    }
    function store(items) {
      try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* 忽略 */ }
    }
    function todayLabel() {
      var now = new Date();
      return (now.getMonth() + 1) + "月" + now.getDate() + "日";
    }
    function draw() {
      var items = load();
      if (list) {
        list.innerHTML = "";
        items.slice(0, 5).forEach(function (item) {
          var row = el("div", "note-row");
          row.appendChild(el("span", "note-date", item.date));
          row.appendChild(el("span", "note-text", item.text));
          list.appendChild(row);
        });
      }
      var inviteText = $("#invite-text");
      if (inviteText && items.length && items[0].date === todayLabel()) {
        inviteText.textContent = "今天写过了。还想再说一句？";
      }
    }
    openBtn.addEventListener("click", function () {
      box.hidden = !box.hidden;
      if (!box.hidden && input) input.focus();
    });
    if (saveBtn) saveBtn.addEventListener("click", function () {
      var text = (input.value || "").trim();
      if (!text) return;
      var items = load();
      items.unshift({ date: todayLabel(), text: text });
      store(items.slice(0, 50));
      input.value = "";
      box.hidden = true;
      draw();
    });
    draw();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var lightbox = createLightbox();
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
    renderHandwritten();
    renderGallery(lightbox);
    bindRandom(lightbox);
  });

  initTheme();
})();
