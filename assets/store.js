/* 见字如面 —— 数据层
 *
 * 网页上看到的一切都从这里来：
 *   · 没配后端、后端还没建好、或者单纯连不上  → 用 data/content.js + data/media.js 的静态内容，
 *     也就是原来那版网站，照常能看；
 *   · 后端正常                              → 从 Supabase 读；登录之后还能写。
 *
 * 页面不需要知道数据是从哪来的，读 store.content / store.media 就行。
 */
window.Store = (function () {
  "use strict";

  var CFG = window.SITE_BACKEND || {};
  var BUCKET = CFG.bucket || "media";
  var STATIC_CONTENT = window.SITE_CONTENT || {};
  var STATIC_MEDIA = window.SITE_MEDIA || { photos: [], videos: [], words: [] };

  var client =
    CFG.url && CFG.anonKey && window.supabase && window.supabase.createClient
      ? window.supabase.createClient(CFG.url, CFG.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storageKey: "jzm-auth"
          }
        })
      : null;

  var listeners = [];
  var state = {
    ready: false,
    configured: !!client,
    reachable: false, // 这次真的从后端读到东西了吗
    error: null, // 读不到时的原因，给页面提示用
    signedIn: false,
    user: null,
    memberIssue: false, // 登录了，但邮箱不在成员名单里
    settings: null,
    letters: [],
    mediaRows: [],
    landmarks: [],
    milestones: [],
    anniversaries: [],
    notes: [],
    content: STATIC_CONTENT,
    media: { photos: [], videos: [], words: [] },
    mode: "static" // "backend" 或 "static"
  };

  /* ------------------------------------------------------------ 小工具 */
  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function publicUrl(path) {
    if (!path) return "";
    if (/^(https?:)?\/\//.test(path)) return path;
    return CFG.url + "/storage/v1/object/public/" + BUCKET + "/" + path;
  }

  // 一个素材的地址：bundle 的是站内相对路径，storage 的要拼上公开地址
  function pathOf(row, which) {
    var path;
    if (which === "thumb") path = row.thumb_path || row.full_path;
    else if (which === "poster") path = row.poster_path || row.thumb_path || row.full_path;
    else if (which === "loop") path = row.loop_path;
    else path = row.full_path;
    if (!path) return "";
    return row.origin === "storage" ? publicUrl(path) : path;
  }

  function keyOf(row) {
    return row.slug || row.id;
  }

  function paragraphsOf(body) {
    return String(body || "")
      .split(/\r?\n\s*\r?\n/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  var WEEK = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  function dateTextOf(dateStr) {
    var p = String(dateStr).split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return Number(p[1]) + "月" + Number(p[2]) + "日 · " + WEEK[d.getDay()];
  }

  /* ------------------------------------------------------------ 数据库行 → 页面用的形状 */
  function normalizeRows(rows) {
    var out = { photos: [], videos: [], words: [] };
    (rows || []).forEach(function (row) {
      var key = keyOf(row);
      var base = {
        id: row.id,
        key: key,
        slug: row.slug,
        origin: row.origin,
        group: row.group_label,
        w: row.width,
        h: row.height,
        bytes: row.bytes,
        color: row.color,
        caption: row.caption,
        favorite: !!row.is_favorite,
        date: row.taken_on,
        letterId: row.letter_id,
        createdAt: row.created_at,
        sortIndex: row.sort_index,
        // 原始对象路径，删素材的时候要按这些去 Storage 里删文件
        storePaths: {
          full: row.full_path,
          thumb: row.thumb_path,
          poster: row.poster_path,
          loop: row.loop_path
        }
      };
      if (row.kind === "video") {
        out.videos.push(
          Object.assign(base, {
            seconds: row.seconds,
            poster: pathOf(row, "poster"),
            src_mp4: pathOf(row, "full"),
            loop: pathOf(row, "loop")
          })
        );
      } else if (row.kind === "handwriting") {
        out.words.push(Object.assign(base, { src: pathOf(row, "full") }));
      } else {
        out.photos.push(
          Object.assign(base, { thumb: pathOf(row, "thumb"), full: pathOf(row, "full") })
        );
      }
    });
    return out;
  }

  // 静态素材（media.js）也变成同一形状，这样两种来源可以混在一起用
  function staticMedia() {
    var out = { photos: [], videos: [], words: [] };
    (STATIC_MEDIA.photos || []).forEach(function (p, i) {
      out.photos.push({
        id: null,
        key: p.slug,
        slug: p.slug,
        origin: "bundle",
        group: p.group || (i >= 36 ? "her" : "us"),
        w: p.w,
        h: p.h,
        color: p.color,
        caption: (STATIC_CONTENT.photoNotes || {})[p.slug] || null,
        favorite: false,
        thumb: "media/photos/thumb/" + p.slug + ".jpg",
        full: "media/photos/full/" + p.slug + ".jpg",
        sortIndex: i
      });
    });
    (STATIC_MEDIA.videos || []).forEach(function (v, i) {
      out.videos.push({
        id: null,
        key: v.slug,
        slug: v.slug,
        origin: "bundle",
        group: "moving",
        w: v.w,
        h: v.h,
        seconds: v.seconds,
        poster: v.poster,
        src_mp4: v.src_mp4,
        loop: v.loop || null,
        caption: (STATIC_CONTENT.videoNotes || {})[v.slug] || null,
        favorite: false,
        sortIndex: i
      });
    });
    (STATIC_MEDIA.words || []).forEach(function (w, i) {
      out.words.push({
        id: null,
        key: w.slug,
        slug: w.slug,
        origin: "bundle",
        group: "handwriting",
        w: w.w,
        h: w.h,
        src: "media/words/" + w.slug + ".jpg",
        sortIndex: i
      });
    });
    return out;
  }

  // 后端的排在前面（新放进来的先看到），bundle 的按原顺序
  function orderMedia(list) {
    return list.slice().sort(function (a, b) {
      var au = a.sortIndex == null ? 0 : 1;
      var bu = b.sortIndex == null ? 0 : 1;
      if (au !== bu) return au - bu;
      if (au === 0) return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      return (a.sortIndex || 0) - (b.sortIndex || 0);
    });
  }

  function mergeMedia(list, byKey) {
    var index = {};
    list.forEach(function (item) {
      index[item.key] = item;
    });
    byKey.forEach(function (item) {
      index[item.key] = item; // 后端的覆盖静态的
    });
    return Object.keys(index).map(function (k) {
      return index[k];
    });
  }

  function lettersFromRows(rows, withMedia) {
    var byLetter = {};
    (withMedia || []).forEach(function (m) {
      if (!m.letterId) return;
      (byLetter[m.letterId] = byLetter[m.letterId] || []).push(m);
    });
    return (rows || []).map(function (row) {
      var attached = (byLetter[row.id] || []).slice().sort(function (a, b) {
        return (a.sortIndex || 0) - (b.sortIndex || 0);
      });
      return {
        id: row.id,
        legacyId: row.legacy_id,
        date: row.date,
        dateText: row.date_text || dateTextOf(row.date),
        author: row.author,
        title: row.title,
        sign: row.sign || "—— " + row.author,
        mood: row.mood,
        body: row.body,
        isPublic: !!row.is_public,
        sortIndex: row.sort_index,
        createdAt: row.created_at,
        paragraphs: paragraphsOf(row.body),
        photos: attached.filter(function (m) { return m.kind !== "video"; }).map(function (m) { return m.key; }),
        videos: attached.filter(function (m) { return m.kind === "video"; }).map(function (m) { return m.key; })
      };
    });
  }

  function staticLetters() {
    return (STATIC_CONTENT.letters || []).map(function (letter) {
      return {
        id: null,
        legacyId: letter.id,
        date: letter.date,
        dateText: letter.dateText || dateTextOf(letter.date),
        author: letter.author,
        title: letter.title,
        sign: letter.sign || "—— " + letter.author,
        isPublic: true,
        sortIndex: null,
        paragraphs: letter.paragraphs || [],
        photos: letter.photos || [],
        videos: letter.videos || []
      };
    });
  }

  function sortLetters(list) {
    return list.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      var sa = a.sortIndex == null ? 1e9 : a.sortIndex;
      var sb = b.sortIndex == null ? 1e9 : b.sortIndex;
      if (sa !== sb) return sa - sb;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
  }

  // 把一堆来源拼成页面需要的 content / media
  function build() {
    var backend = state.reachable && state.signedIn;
    var dbMedia = normalizeRows(state.mediaRows);
    var media = backend
      ? { photos: orderMedia(dbMedia.photos), videos: orderMedia(dbMedia.videos), words: orderMedia(dbMedia.words) }
      : {
          photos: orderMedia(mergeMedia(staticMedia().photos, dbMedia.photos)),
          videos: orderMedia(mergeMedia(staticMedia().videos, dbMedia.videos)),
          words: orderMedia(mergeMedia(staticMedia().words, dbMedia.words))
        };

    var letters;
    if (backend) {
      letters = lettersFromRows(state.letters, dbMedia.photos.concat(dbMedia.videos));
    } else {
      var dbLetters = lettersFromRows(state.letters, dbMedia.photos.concat(dbMedia.videos));
      var index = {};
      staticLetters().forEach(function (l) {
        index[l.legacyId] = l;
      });
      dbLetters.forEach(function (l) {
        index[l.legacyId || l.id] = l; // 后端的覆盖同名的静态信
      });
      letters = Object.keys(index).map(function (k) {
        return index[k];
      });
    }

    var settings = state.settings || {};
    var extra = settings.extra || {};
    var dbMilestones = (state.milestones || []).map(function (m) {
      var hit = m.media_id ? dbMedia.photos.concat(dbMedia.videos, dbMedia.words).filter(function (x) { return x.id === m.media_id; })[0] : null;
      return {
        id: m.id,
        date: m.date,
        dateText: m.date_text || dateTextOf(m.date),
        title: m.title,
        note: m.note,
        photo: hit ? hit.key : null
      };
    });
    var dbLandmarks = (state.landmarks || []).map(function (l) {
      return { id: l.id, date: l.date, kind: l.kind, label: l.label };
    });

    var content = {
      title: settings.title || STATIC_CONTENT.title,
      mark: settings.mark || STATIC_CONTENT.mark,
      him: settings.him || STATIC_CONTENT.him,
      her: settings.her || STATIC_CONTENT.her,
      start: settings.start_date || STATIC_CONTENT.start,
      distance: settings.distance != null ? settings.distance : STATIC_CONTENT.distance,
      distanceCities: {
        left: settings.distance_left || (STATIC_CONTENT.distanceCities || {}).left,
        right: settings.distance_right || (STATIC_CONTENT.distanceCities || {}).right
      },
      nextMeeting: settings.next_meeting || STATIC_CONTENT.nextMeeting || null,
      letters: sortLetters(letters),
      milestones: mergeMilestones(dbMilestones),
      landmarks: mergeLandmarks(dbLandmarks),
      notes: state.notes || [],
      anniversaries: state.anniversaries || [],
      photoNotes: {},
      videoNotes: {},
      herPicks: extra.herPicks || STATIC_CONTENT.herPicks || [],
      firstMeeting: extra.firstMeeting || STATIC_CONTENT.firstMeeting || null,
      handwritten: extra.handwritten || STATIC_CONTENT.handwritten || null
    };
    media.photos.concat(media.videos).forEach(function (m) {
      if (!m.caption) return;
      if (m.group === "moving") content.videoNotes[m.key] = m.caption;
      else content.photoNotes[m.key] = m.caption;
    });

    state.content = content;
    state.media = media;
    state.mode = backend ? "backend" : "static";
  }

  function mergeMilestones(dbList) {
    // 登录的人看到的是数据库里的全部；没登录时静态内容照旧显示，公开的盖在上面
    if (state.signedIn) return dbList;
    var index = {};
    (STATIC_CONTENT.milestones || []).forEach(function (m) {
      index[m.date + "|" + m.title] = m;
    });
    dbList.forEach(function (m) {
      index[m.date + "|" + m.title] = m;
    });
    return Object.keys(index)
      .map(function (k) {
        return index[k];
      })
      .sort(function (a, b) {
        return a.date < b.date ? -1 : 1;
      });
  }

  function mergeLandmarks(dbList) {
    if (state.signedIn) return dbList;
    var index = {};
    (STATIC_CONTENT.landmarks || []).forEach(function (l) {
      index[l.date + "|" + l.kind + "|" + (l.label || "")] = l;
    });
    dbList.forEach(function (l) {
      index[l.date + "|" + l.kind + "|" + (l.label || "")] = l;
    });
    return Object.keys(index).map(function (k) {
      return index[k];
    });
  }

  /* ------------------------------------------------------------ 读 */
  function fail(error) {
    state.reachable = false;
    state.error = error && (error.message || String(error));
    build();
    state.ready = true;
    emit();
  }

  function fetchAll() {
    if (!client) {
      state.reachable = false;
      state.error = null;
      build();
      state.ready = true;
      emit();
      return Promise.resolve(state);
    }
    return Promise.all([
      client.from("settings").select("*").limit(1).maybeSingle(),
      client.from("letters").select("*"),
      client.from("media").select("*"),
      client.from("landmarks").select("*"),
      client.from("milestones").select("*"),
      client.from("anniversaries").select("*"),
      client.from("notes").select("*").order("created_at", { ascending: false }).limit(60)
    ]).then(function (res) {
      var names = ["settings", "letters", "media", "landmarks", "milestones", "anniversaries", "notes"];
      var bad = null;
      res.forEach(function (r, i) {
        if (r.error && !bad) bad = names[i] + "：" + r.error.message;
      });
      if (bad) {
        // 最常见的情况：后端还没建表（supabase/setup.sql 还没跑）
        fail(new Error(bad));
        return state;
      }
      state.settings = res[0].data || null;
      state.letters = res[1].data || [];
      state.mediaRows = res[2].data || [];
      state.landmarks = res[3].data || [];
      state.milestones = res[4].data || [];
      state.anniversaries = res[5].data || [];
      state.notes = res[6].data || [];
      state.reachable = true;
      state.error = null;
      // 登录了却一条都读不到，通常是邮箱不在成员名单里（RLS 会静默地过滤掉）
      state.memberIssue =
        state.signedIn &&
        !state.letters.length &&
        !state.mediaRows.length &&
        !state.milestones.length &&
        !state.landmarks.length;
      build();
      state.ready = true;
      emit();
      return state;
    }).catch(function (e) {
      fail(e);
      return state;
    });
  }

  function refreshSession() {
    if (!client) {
      state.signedIn = false;
      state.user = null;
      return Promise.resolve(null);
    }
    return client.auth.getSession().then(function (r) {
      var session = r.data ? r.data.session : null;
      state.user = session ? session.user : null;
      state.signedIn = !!session;
      return state.user;
    });
  }

  function emit() {
    listeners.forEach(function (fn) {
      try {
        fn(state);
      } catch (e) {
        if (window.console) console.error(e);
      }
    });
  }

  function init() {
    return refreshSession().then(function () {
      return fetchAll();
    });
  }

  function reload() {
    return refreshSession().then(function () {
      return fetchAll();
    });
  }

  /* ------------------------------------------------------------ 登录 */
  function friendly(error) {
    var msg = (error && error.message) || "";
    if (/Invalid login credentials/i.test(msg)) return "邮箱或密码不对";
    if (/Email not confirmed/i.test(msg)) return "邮箱还没确认，先去邮箱里点一下链接";
    if (/User already registered/i.test(msg)) return "这个邮箱已经注册过了，直接登录就行";
    if (/Password should be at least/i.test(msg)) return "密码太短了，至少要 6 位";
    if (/rate limit|For security purposes/i.test(msg)) return "试得太频繁了，等一会儿再试";
    if (/Failed to fetch|NetworkError/i.test(msg)) return "连不上服务器，检查一下网络";
    return msg || "出了点问题，再试一次";
  }

  function signIn(email, password) {
    if (!client) return Promise.reject(new Error("还没配置后端"));
    return client.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      if (r.error) throw new Error(friendly(r.error));
      return reload();
    });
  }

  // 返回 { needsConfirm: true } 表示还要去邮箱点确认链接
  function signUp(email, password, displayName) {
    if (!client) return Promise.reject(new Error("还没配置后端"));
    return client.auth
      .signUp({
        email: email,
        password: password,
        options: { data: { display_name: displayName || "" } }
      })
      .then(function (r) {
        if (r.error) throw new Error(friendly(r.error));
        if (!r.data.session) return { needsConfirm: true };
        return reload().then(function () {
          return { needsConfirm: false };
        });
      });
  }

  function signOut() {
    if (!client) return Promise.resolve();
    return client.auth.signOut().then(function () {
      return reload();
    });
  }

  function changePassword(password) {
    if (!client) return Promise.reject(new Error("还没配置后端"));
    return client.auth.updateUser({ password: password }).then(function (r) {
      if (r.error) throw new Error(friendly(r.error));
    });
  }

  function sendPasswordReset(email) {
    if (!client) return Promise.reject(new Error("还没配置后端"));
    return client.auth.resetPasswordForEmail(email).then(function (r) {
      if (r.error) throw new Error(friendly(r.error));
    });
  }

  function updateProfile(patch) {
    if (!client || !state.user) return Promise.reject(new Error("先登录"));
    return client
      .from("profiles")
      .upsert(Object.assign({ id: state.user.id }, patch))
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
      });
  }

  /* ------------------------------------------------------------ 写 */
  function must(res) {
    if (res.error) {
      var msg = res.error.message || "出错了";
      if (res.error.code === "23505") throw new Error("这一条已经有了，不用再加一遍");
      if (res.error.code === "42501" || /permission denied|row-level security/i.test(msg)) {
        throw new Error("没有权限 —— 多半是这个邮箱不在成员名单里");
      }
      throw new Error(msg);
    }
    return res.data;
  }

  function saveSettings(patch) {
    return client
      .from("settings")
      .update(patch)
      .eq("id", true)
      .then(must)
      .then(reload);
  }

  // input: { id, date, author, title, body, sign, isPublic, mediaIds:[], met:bool }
  function saveLetter(input) {
    var row = {
      date: input.date,
      date_text: input.dateText || null,
      author: input.author,
      title: input.title || null,
      body: input.body || "",
      sign: input.sign || "—— " + input.author,
      is_public: !!input.isPublic,
      mood: input.mood || null
    };
    var chain;
    if (input.id) {
      chain = client.from("letters").update(row).eq("id", input.id).select().single();
    } else {
      row.created_by = state.user ? state.user.id : null;
      chain = client.from("letters").insert(row).select().single();
    }
    return chain.then(must).then(function (letter) {
      return attachMedia(letter.id, input.mediaIds || []).then(function () {
        return ensureLandmark(input.date, "letter", null);
      }).then(function () {
        if (!input.met) return null;
        return ensureLandmark(input.date, "met", null);
      }).then(reload);
    });
  }

  function attachMedia(letterId, ids) {
    var mine = state.mediaRows.filter(function (m) {
      return m.letter_id === letterId;
    });
    var keep = {};
    ids.forEach(function (id) {
      keep[id] = true;
    });
    var detach = mine.filter(function (m) { return !keep[m.id]; });
    var attach = ids.filter(function (id) {
      return !mine.some(function (m) { return m.id === id; });
    });
    var jobs = [];
    if (detach.length) {
      jobs.push(
        client.from("media").update({ letter_id: null }).in("id", detach.map(function (m) { return m.id; }))
      );
    }
    if (attach.length) {
      jobs.push(client.from("media").update({ letter_id: letterId }).in("id", attach));
    }
    return Promise.all(jobs).then(function (res) {
      res.forEach(must);
    });
  }

  function ensureLandmark(date, kind, label) {
    return client
      .from("landmarks")
      .select("id")
      .eq("date", date)
      .eq("kind", kind)
      .limit(1)
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        if (r.data && r.data.length) return null;
        return client
          .from("landmarks")
          .insert({ date: date, kind: kind, label: label })
          .then(must);
      });
  }

  function deleteLetter(id) {
    return client
      .from("letters")
      .delete()
      .eq("id", id)
      .then(must)
      .then(reload);
  }

  function addNote(text, author) {
    return client
      .from("notes")
      .insert({ body: text, author: author || null, created_by: state.user ? state.user.id : null })
      .then(must)
      .then(reload);
  }

  function deleteNote(id) {
    return client
      .from("notes")
      .delete()
      .eq("id", id)
      .then(must)
      .then(reload);
  }

  function updateMedia(id, patch) {
    return client
      .from("media")
      .update(patch)
      .eq("id", id)
      .then(must)
      .then(reload);
  }

  function addLandmark(date, kind, label) {
    return client
      .from("landmarks")
      .insert({ date: date, kind: kind, label: label })
      .then(must)
      .then(reload);
  }

  function deleteLandmark(id) {
    return client
      .from("landmarks")
      .delete()
      .eq("id", id)
      .then(must)
      .then(reload);
  }

  function saveMilestone(input) {
    var row = {
      date: input.date,
      date_text: input.dateText || null,
      title: input.title,
      note: input.note || null,
      media_id: input.mediaId || null
    };
    var chain = input.id
      ? client.from("milestones").update(row).eq("id", input.id)
      : client.from("milestones").insert(row);
    return chain.then(must).then(reload);
  }

  function deleteMilestone(id) {
    return client
      .from("milestones")
      .delete()
      .eq("id", id)
      .then(must)
      .then(reload);
  }

  function saveAnniversary(input) {
    var row = {
      title: input.title,
      date: input.date,
      repeat_yearly: input.repeatYearly !== false,
      note: input.note || null
    };
    var chain = input.id
      ? client.from("anniversaries").update(row).eq("id", input.id)
      : client.from("anniversaries").insert(row);
    return chain.then(must).then(reload);
  }

  function deleteAnniversary(id) {
    return client
      .from("anniversaries")
      .delete()
      .eq("id", id)
      .then(must)
      .then(reload);
  }

  function deleteMedia(record) {
    if (!record || !record.id) {
      return Promise.reject(new Error("这条素材是跟着仓库一起发布的，不能在网页里删"));
    }
    var paths = [];
    if (record.origin === "storage" && record.storePaths) {
      ["full", "thumb", "poster", "loop"].forEach(function (which) {
        if (record.storePaths[which]) paths.push(record.storePaths[which]);
      });
    }
    var chain = Promise.resolve();
    if (paths.length) {
      chain = client.storage.from(BUCKET).remove(paths).then(function (r) {
        if (r.error) throw new Error(r.error.message);
      });
    }
    return chain.then(function () {
      return client.from("media").delete().eq("id", record.id).then(must);
    }).then(reload);
  }

  /* ------------------------------------------------------------ 上传 */
  function objectUrl(path, blob, onProgress, contentType) {
    return client.auth.getSession().then(function (r) {
      var token = r.data && r.data.session ? r.data.session.access_token : CFG.anonKey;
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", CFG.url + "/storage/v1/object/" + BUCKET + "/" + path, true);
        xhr.setRequestHeader("authorization", "Bearer " + token);
        xhr.setRequestHeader("apikey", CFG.anonKey);
        xhr.setRequestHeader("x-upsert", "true");
        xhr.setRequestHeader("cache-control", "max-age=31536000");
        if (contentType) xhr.setRequestHeader("content-type", contentType);
        if (onProgress) {
          xhr.upload.onprogress = function (e) {
            if (e.lengthComputable) onProgress(e.loaded / e.total);
          };
        }
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) resolve(path);
          else reject(new Error("上传失败（" + xhr.status + "）" + (xhr.responseText || "")));
        };
        xhr.onerror = function () {
          reject(new Error("网络断了，上传失败"));
        };
        xhr.send(blob);
      });
    });
  }

  function insertMedia(row) {
    row.created_by = state.user ? state.user.id : null;
    return client.from("media").insert(row).select().single().then(must);
  }

  // 先把静态内容备好：这样即使还没连上后端，页面第一遍渲染也有东西可画
  build();

  return {
    state: state,
    client: client,
    bucket: BUCKET,
    init: init,
    reload: reload,
    onChange: function (fn) {
      listeners.push(fn);
    },
    dateTextOf: dateTextOf,
    paragraphsOf: paragraphsOf,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    changePassword: changePassword,
    sendPasswordReset: sendPasswordReset,
    updateProfile: updateProfile,
    saveSettings: saveSettings,
    saveLetter: saveLetter,
    deleteLetter: deleteLetter,
    addNote: addNote,
    deleteNote: deleteNote,
    updateMedia: updateMedia,
    deleteMedia: deleteMedia,
    addLandmark: addLandmark,
    deleteLandmark: deleteLandmark,
    saveMilestone: saveMilestone,
    deleteMilestone: deleteMilestone,
    saveAnniversary: saveAnniversary,
    deleteAnniversary: deleteAnniversary,
    objectUrl: objectUrl,
    insertMedia: insertMedia,
    publicUrl: publicUrl,
    uuid: uuid
  };
})();
