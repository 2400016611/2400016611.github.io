/* 见字如面 —— 写一封信这一页
 * 写信 / 碎碎念 / 这一年 / 设置，四件事都在这儿做。
 */
(function () {
  "use strict";

  var $ = UI.$;
  var h = UI.h;
  var on = UI.on;

  var picked = {}; // 这封信里夹了哪些素材（按数据库 id 记）
  var editing = null; // 正在改的那封信
  var who = "小孟";
  var settingsDirty = false;
  var booted = false;

  function val(id) {
    var node = document.getElementById(id);
    return node ? node.value : "";
  }
  function setVal(id, v) {
    var node = document.getElementById(id);
    if (node) node.value = v == null ? "" : v;
  }
  function setText(id, v) {
    var node = document.getElementById(id);
    if (node) node.textContent = v == null ? "" : v;
  }
  function todayStr() {
    var now = new Date();
    return (
      now.getFullYear() +
      "-" +
      ("0" + (now.getMonth() + 1)).slice(-2) +
      "-" +
      ("0" + now.getDate()).slice(-2)
    );
  }
  function busy(btn, text, fn) {
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = text;
    return fn().catch(function (err) {
      UI.toast(err.message || String(err), "bad");
    }).then(function () {
      btn.disabled = false;
      btn.textContent = old;
    });
  }

  /* ------------------------------------------------------------ 分页 */
  function showTab(name) {
    var tabs = $("#tabs");
    if (!tabs) return;
    Array.prototype.forEach.call(tabs.querySelectorAll("button"), function (b) {
      b.classList.toggle("on", b.dataset.tab === name);
    });
    ["letter", "notes", "days", "settings"].forEach(function (key) {
      var pane = document.getElementById("pane-" + key);
      if (pane) pane.hidden = key !== name;
    });
    if (name === "days") drawDays();
    if (name === "settings") drawSettings();
    if (name === "notes") drawNotes();
  }

  /* ------------------------------------------------------------ 登录门 */
  function showGate() {
    var gate = $("#gate");
    if (gate) gate.hidden = false;
    var hint = $("#gate-hint");
    if (hint) {
      var note = UI.backendNote();
      hint.textContent = note || (Store.state.configured ? "" : "还没配置后端（data/config.js）");
    }
    ["letter", "notes", "days", "settings"].forEach(function (key) {
      var pane = document.getElementById("pane-" + key);
      if (pane) pane.hidden = true;
    });
    var tabs = $("#tabs");
    if (tabs) tabs.hidden = true;
  }
  function hideGate() {
    var gate = $("#gate");
    if (gate) gate.hidden = true;
    var tabs = $("#tabs");
    if (tabs) tabs.hidden = false;
    showTab(currentTab());
  }

  function currentTab() {
    var hash = (location.hash || "").replace("#", "");
    if (["letter", "notes", "days", "settings"].indexOf(hash) >= 0) return hash;
    return "letter";
  }

  /* ------------------------------------------------------------ 写信 */
  function drawWho() {
    Array.prototype.forEach.call(document.querySelectorAll("#who-pick button"), function (b) {
      b.classList.toggle("on", b.dataset.who === who);
    });
    var sign = $("#letter-sign");
    if (sign && (!sign.value.trim() || /^——\s*(小孟|琪琪)$/.test(sign.value.trim()))) {
      sign.value = "—— " + who;
    }
  }

  function mediaList() {
    var M = Store.state.media || { photos: [], videos: [] };
    return (M.photos || []).concat(M.videos || []);
  }

  function drawPicker() {
    var box = $("#picker");
    if (!box) return;
    box.innerHTML = "";
    var list = mediaList().filter(function (m) {
      return m.id; // 只有数据库里的素材能夹进信里
    });
    if (!list.length) {
      box.appendChild(h("span", "pane-hint", "还没有素材，先传几张上来吧。"));
    }
    list.forEach(function (m) {
      var tile = h("button", "pick-tile" + (picked[m.id] ? " on" : ""));
      tile.type = "button";
      tile.title = m.caption || m.key || "";
      var img = h("img");
      img.loading = "lazy";
      img.src = m.thumb || m.full || m.poster || "";
      img.alt = m.caption || "";
      tile.appendChild(img);
      if (m.group === "moving") tile.appendChild(h("span", "tag", "▶"));
      on(tile, "click", function () {
        if (picked[m.id]) delete picked[m.id];
        else picked[m.id] = true;
        tile.classList.toggle("on");
        setText("pick-count", "已选 " + Object.keys(picked).length + " 个");
      });
      box.appendChild(tile);
    });
    setText("pick-count", "已选 " + Object.keys(picked).length + " 个");
  }

  function resetLetter() {
    editing = null;
    picked = {};
    setVal("letter-date", todayStr());
    setVal("letter-title", "");
    setVal("letter-body", "");
    setVal("letter-sign", "—— " + who);
    var met = $("#letter-met");
    if (met) met.checked = false;
    var pub = $("#letter-public");
    if (pub) pub.checked = false;
    var del = $("#letter-delete");
    if (del) del.hidden = true;
    setText("letter-status", "");
    drawPicker();
  }

  function loadLetter(id) {
    var letters = (Store.state.content && Store.state.content.letters) || [];
    var letter = letters.filter(function (l) {
      return l.id === id;
    })[0];
    if (!letter) {
      UI.toast("没找到这封信", "bad");
      resetLetter();
      return;
    }
    editing = letter;
    picked = {};
    var all = mediaList();
    (letter.photos || []).concat(letter.videos || []).forEach(function (key) {
      var hit = all.filter(function (m) {
        return m.key === key;
      })[0];
      if (hit && hit.id) picked[hit.id] = true;
    });
    who = letter.author || who;
    drawWho();
    setVal("letter-date", letter.date);
    setVal("letter-title", letter.title || "");
    setVal("letter-body", letter.body || (letter.paragraphs || []).join("\n\n"));
    setVal("letter-sign", letter.sign || "—— " + who);
    var pub = $("#letter-public");
    if (pub) pub.checked = !!letter.isPublic;
    var del = $("#letter-delete");
    if (del) del.hidden = false;
    setText("letter-status", "正在改：" + (letter.title || letter.dateText));
    drawPicker();
  }

  function saveLetter() {
    var date = val("letter-date") || todayStr();
    var body = val("letter-body").trim();
    var title = val("letter-title").trim();
    var count = Object.keys(picked).length;
    if (!body && !title && !count) {
      UI.toast("写点什么，或者至少夹一张照片", "bad");
      return;
    }
    var btn = $("#letter-save");
    busy(btn, "存…", function () {
      return Store.saveLetter({
        id: editing ? editing.id : null,
        date: date,
        author: who,
        title: title,
        body: body,
        sign: val("letter-sign").trim() || "—— " + who,
        isPublic: $("#letter-public") ? $("#letter-public").checked : false,
        met: $("#letter-met") ? $("#letter-met").checked : false,
        mediaIds: Object.keys(picked)
      }).then(function () {
        setText("letter-status", "存好了，正在回首页…");
        UI.toast("存好了", "good");
        setTimeout(function () {
          location.href = "index.html";
        }, 650);
      });
    });
  }

  function bindLetter() {
    Array.prototype.forEach.call(document.querySelectorAll("#who-pick button"), function (b) {
      on(b, "click", function () {
        who = b.dataset.who;
        drawWho();
      });
    });
    on($("#letter-save"), "click", saveLetter);
    on($("#letter-reset"), "click", function () {
      resetLetter();
      UI.toast("清空了");
    });
    on($("#letter-delete"), "click", function () {
      if (!editing) return;
      UI.confirm("删掉这一封？删了就找不回来了。", "删除").then(function (ok) {
        if (!ok) return;
        Store.deleteLetter(editing.id).then(function () {
          UI.toast("删掉了");
          location.href = "index.html";
        });
      });
    });
    on($("#pick-clear"), "click", function () {
      picked = {};
      drawPicker();
    });
    on($("#pick-upload"), "click", function () {
      Uploader.open({
        onUploaded: function (rows) {
          (rows || []).forEach(function (row) {
            if (row && row.id) picked[row.id] = true;
          });
          drawPicker();
        }
      });
    });
  }

  /* ------------------------------------------------------------ 碎碎念 */
  function drawNotes() {
    var box = $("#note-list");
    if (!box) return;
    box.innerHTML = "";
    var notes = (Store.state.notes || []).slice(0, 30);
    if (!notes.length) {
      box.appendChild(h("div", "note-row", "还没有碎碎念。"));
      return;
    }
    notes.forEach(function (note) {
      var row = h("div", "note-row");
      row.appendChild(h("span", "note-date", Store.dateTextOf(note.date).split(" ·")[0]));
      row.appendChild(h("span", "note-text", note.body));
      if (note.author) row.appendChild(h("span", "note-author", note.author));
      var del = h("button", "mini danger", "删");
      del.type = "button";
      on(del, "click", function () {
        Store.deleteNote(note.id).then(function () {
          UI.toast("删掉了");
        });
      });
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  function bindNotes() {
    on($("#note-add"), "click", function () {
      var text = val("note-body").trim();
      if (!text) {
        UI.toast("先写一句", "bad");
        return;
      }
      var btn = $("#note-add");
      busy(btn, "记…", function () {
        return Store.addNote(text, who).then(function () {
          setVal("note-body", "");
          UI.toast("记下了", "good");
        });
      });
    });
  }

  /* ------------------------------------------------------------ 这一年 */
  function drawDays() {
    var lmBox = $("#lm-list");
    var msBox = $("#ms-list");
    var content = Store.state.content || {};

    if (lmBox) {
      lmBox.innerHTML = "";
      (content.landmarks || [])
        .slice()
        .sort(function (a, b) {
          return a.date < b.date ? 1 : -1;
        })
        .forEach(function (item) {
          var row = h("div", "row");
          row.appendChild(h("span", "row-date", item.date));
          row.appendChild(h("span", "row-tag " + item.kind, item.kind === "met" ? "见面" : "写信"));
          row.appendChild(h("span", "row-text", item.label || ""));
          if (item.id) {
            var del = h("button", "mini danger", "删");
            del.type = "button";
            on(del, "click", function () {
              Store.deleteLandmark(item.id).then(function () {
                UI.toast("删掉了");
              });
            });
            row.appendChild(del);
          }
          lmBox.appendChild(row);
        });
      if (!lmBox.childNodes.length) lmBox.appendChild(h("div", "row", "还没有点亮的日子。"));
    }

    if (msBox) {
      msBox.innerHTML = "";
      (content.milestones || [])
        .slice()
        .sort(function (a, b) {
          return a.date < b.date ? -1 : 1;
        })
        .forEach(function (item) {
          var row = h("div", "row");
          row.appendChild(h("span", "row-date", item.date));
          row.appendChild(h("span", "row-text", item.title + (item.note ? "：" + item.note : "")));
          if (item.id) {
            var del = h("button", "mini danger", "删");
            del.type = "button";
            on(del, "click", function () {
              Store.deleteMilestone(item.id).then(function () {
                UI.toast("删掉了");
              });
            });
            row.appendChild(del);
          }
          msBox.appendChild(row);
        });
      if (!msBox.childNodes.length) msBox.appendChild(h("div", "row", "还没有里程碑。"));
    }

    var photoSelect = $("#ms-photo");
    if (photoSelect && !photoSelect.dataset.filled) {
      photoSelect.dataset.filled = "1";
      var blank = h("option", null, "不配照片");
      blank.value = "";
      photoSelect.appendChild(blank);
      (Store.state.media.photos || []).forEach(function (m) {
        if (!m.id) return;
        var option = h("option", null, (m.caption || m.key || m.id) + "");
        option.value = m.id;
        photoSelect.appendChild(option);
      });
    }
  }

  function bindDays() {
    on($("#lm-add"), "click", function () {
      var date = val("lm-date");
      if (!date) {
        UI.toast("先选个日期", "bad");
        return;
      }
      Store.addLandmark(date, val("lm-kind") || "met", val("lm-label").trim() || null)
        .then(function () {
          setVal("lm-label", "");
          UI.toast("点亮了", "good");
        })
        .catch(function (err) {
          UI.toast(err.message || String(err), "bad");
        });
    });
    on($("#ms-add"), "click", function () {
      var date = val("ms-date");
      var title = val("ms-title").trim();
      if (!date || !title) {
        UI.toast("日期和标题都要填", "bad");
        return;
      }
      Store.saveMilestone({
        date: date,
        title: title,
        note: val("ms-note").trim(),
        mediaId: val("ms-photo") || null
      })
        .then(function () {
          setVal("ms-title", "");
          setVal("ms-note", "");
          UI.toast("加上了", "good");
        })
        .catch(function (err) {
          UI.toast(err.message || String(err), "bad");
        });
    });
  }

  /* ------------------------------------------------------------ 设置 */
  function drawSettings() {
    var s = Store.state.settings;
    if (!s || settingsDirty) return;
    setVal("st-title", s.title);
    setVal("st-him", s.him);
    setVal("st-her", s.her);
    setVal("st-start", s.start_date);
    setVal("st-distance", s.distance);
    setVal("st-left", s.distance_left);
    setVal("st-right", s.distance_right);
    setVal("st-next", s.next_meeting || "");
  }

  function bindSettings() {
    ["st-title", "st-him", "st-her", "st-start", "st-distance", "st-left", "st-right", "st-next"].forEach(
      function (id) {
        var node = document.getElementById(id);
        if (node) on(node, "input", function () { settingsDirty = true; });
      }
    );
    on($("#st-save"), "click", function () {
      var btn = $("#st-save");
      busy(btn, "存…", function () {
        return Store.saveSettings({
          title: val("st-title"),
          him: val("st-him"),
          her: val("st-her"),
          start_date: val("st-start") || null,
          distance: val("st-distance"),
          distance_left: val("st-left"),
          distance_right: val("st-right"),
          next_meeting: val("st-next") || null
        }).then(function () {
          settingsDirty = false;
          setText("st-status", "存好了");
          UI.toast("存好了", "good");
        });
      });
    });
    on($("#pwd-save"), "click", function () {
      var a = val("pwd-new");
      var b = val("pwd-again");
      if (!a || a.length < 6) {
        UI.toast("新密码至少 6 位", "bad");
        return;
      }
      if (a !== b) {
        UI.toast("两次输的不一样", "bad");
        return;
      }
      var btn = $("#pwd-save");
      busy(btn, "改…", function () {
        return Store.changePassword(a).then(function () {
          setVal("pwd-new", "");
          setVal("pwd-again", "");
          UI.toast("密码改好了", "good");
        });
      });
    });
    on($("#sign-out"), "click", function () {
      Store.signOut().then(function () {
        location.href = "index.html";
      });
    });
  }

  /* ------------------------------------------------------------ 启动 */
  function onSignedIn() {
    var params = new URLSearchParams(location.search);
    var id = params.get("id");
    resetLetter();
    if (id) loadLetter(id);
    drawSettings();
    drawNotes();
    drawDays();
  }

  function boot() {
    UI.mount({ notice: true });
    bindLetter();
    bindNotes();
    bindDays();
    bindSettings();
    var tabs = $("#tabs");
    if (tabs) {
      on(tabs, "click", function (event) {
        var btn = event.target.closest("button[data-tab]");
        if (btn) showTab(btn.dataset.tab);
      });
    }
    on($("#gate-login"), "click", function () {
      UI.loginModal("登录之后才能写");
    });

    showTab(currentTab());

    Store.onChange(function (state) {
      if (!state.signedIn) {
        showGate();
        booted = false;
        return;
      }
      if (!booted) {
        booted = true;
        hideGate();
        onSignedIn();
        return;
      }
      // 数据变了（比如刚传完照片、刚存完设置），只刷新从数据里长出来的部分
      if (state.ready) {
        drawPicker();
        drawNotes();
        drawDays();
        drawSettings();
      }
    });

    Store.init().then(function (state) {
      if (!state.signedIn) UI.loginModal("登录之后才能写");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
