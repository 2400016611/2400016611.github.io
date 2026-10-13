/* 见字如面 —— 页面上共用的那些小东西
 * 提示条、弹窗、登录框、右上角的账号按钮，以及「后端还没建好」时的提醒。
 */
window.UI = (function () {
  "use strict";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function h(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function on(node, event, fn) {
    if (node) node.addEventListener(event, fn);
    return node;
  }

  /* ------------------------------------------------------------ 提示条 */
  var toastBox = null;
  function toast(text, kind) {
    if (!toastBox) {
      toastBox = h("div", "toasts");
      document.body.appendChild(toastBox);
    }
    var item = h("div", "toast" + (kind ? " " + kind : ""), text);
    toastBox.appendChild(item);
    setTimeout(function () {
      item.classList.add("gone");
      setTimeout(function () {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 400);
    }, kind === "bad" ? 5200 : 2600);
  }

  /* ------------------------------------------------------------ 弹窗 */
  var shell = null;
  function modal(title) {
    if (!shell) {
      shell = h("div", "modal");
      shell.innerHTML =
        '<div class="modal-card" role="dialog" aria-modal="true">' +
        '<button class="modal-x" type="button" aria-label="关闭">×</button>' +
        '<div class="modal-title"></div>' +
        '<div class="modal-body"></div>' +
        "</div>";
      document.body.appendChild(shell);
      on(shell, "click", function (e) {
        if (e.target === shell) close();
      });
      on($(".modal-x", shell), "click", close);
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && shell.classList.contains("on")) close();
      });
    }
    $(".modal-title", shell).textContent = title || "";
    var body = $(".modal-body", shell);
    body.innerHTML = "";
    shell.classList.add("on");
    document.documentElement.classList.add("modal-open");
    return body;
  }
  function close() {
    if (!shell) return;
    shell.classList.remove("on");
    document.documentElement.classList.remove("modal-open");
  }

  function confirmBox(text, okText) {
    return new Promise(function (resolve) {
      var body = modal("确认一下");
      body.appendChild(h("p", "modal-text", text));
      var row = h("div", "modal-actions");
      var cancel = h("button", "ghost", "算了");
      var ok = h("button", "danger", okText || "删除");
      row.appendChild(cancel);
      row.appendChild(ok);
      body.appendChild(row);
      on(cancel, "click", function () {
        close();
        resolve(false);
      });
      on(ok, "click", function () {
        close();
        resolve(true);
      });
    });
  }

  /* ------------------------------------------------------------ 登录 */
  function loginButton(label, cls) {
    var btn = h("button", cls || "primary", label);
    btn.type = "button";
    return btn;
  }

  function loginModal(message) {
    var body = modal("登录");
    var state = { tab: "in" };
    if (message) body.appendChild(h("p", "modal-text", message));

    var tabs = h("div", "tabs");
    var tabIn = h("button", "", "登录");
    var tabUp = h("button", "", "第一次来 · 注册");
    tabs.appendChild(tabIn);
    tabs.appendChild(tabUp);
    body.appendChild(tabs);

    var form = h("div", "form");
    var email = h("input");
    email.type = "email";
    email.placeholder = "邮箱";
    email.autocomplete = "username";
    var name = h("input");
    name.type = "text";
    name.placeholder = "你的名字（小孟 / 琪琪）";
    var pwd = h("input");
    pwd.type = "password";
    pwd.placeholder = "密码（至少 6 位）";
    pwd.autocomplete = "current-password";
    form.appendChild(email);
    form.appendChild(name);
    form.appendChild(pwd);
    body.appendChild(form);

    var hint = h("p", "modal-hint", "");
    body.appendChild(hint);

    var row = h("div", "modal-actions");
    var submit = loginButton("登录");
    row.appendChild(submit);
    body.appendChild(row);

    function draw() {
      var isIn = state.tab === "in";
      tabIn.className = isIn ? "on" : "";
      tabUp.className = isIn ? "" : "on";
      name.hidden = isIn;
      submit.textContent = isIn ? "登录" : "注册";
      pwd.autocomplete = isIn ? "current-password" : "new-password";
      hint.textContent = isIn
        ? ""
        : "注册之后可能会收到一封确认邮件，点一下里面的链接再回来登录。";
    }
    on(tabIn, "click", function () {
      state.tab = "in";
      draw();
    });
    on(tabUp, "click", function () {
      state.tab = "up";
      draw();
    });
    draw();

    function go() {
      var e = (email.value || "").trim();
      var p = pwd.value || "";
      if (!e || !p) {
        toast("邮箱和密码都要填", "bad");
        return;
      }
      submit.disabled = true;
      submit.textContent = state.tab === "in" ? "登录中…" : "注册中…";
      var job =
        state.tab === "in"
          ? Store.signIn(e, p)
          : Store.signUp(e, p, (name.value || "").trim());

      job.then(function (res) {
        if (res && res.needsConfirm) {
          close();
          toast("注册好了，去邮箱点一下确认链接，然后回来登录", "good");
          return;
        }
        close();
        toast(Store.state.user ? "欢迎回来" : "好了", "good");
      }).catch(function (err) {
        submit.disabled = false;
        draw();
        toast(err.message || String(err), "bad");
      });
    }

    on(submit, "click", go);
    on(pwd, "keydown", function (e) {
      if (e.key === "Enter") go();
    });
    on(email, "keydown", function (e) {
      if (e.key === "Enter") pwd.focus();
    });
    setTimeout(function () {
      email.focus();
    }, 30);
  }

  // 没登录就弹登录框，登录成功后 resolve
  function requireLogin(why) {
    if (Store.state.signedIn) return Promise.resolve(true);
    if (!Store.state.configured) {
      toast("还没接上后端，先在 Supabase 里跑一次 setup.sql", "bad");
      return Promise.resolve(false);
    }
    loginModal(why || "写东西要先登录一下");
    return new Promise(function (resolve) {
      var stop = false;
      var off = function () {
        stop = true;
      };
      Store.onChange(function (s) {
        if (!stop && s.signedIn) {
          stop = true;
          resolve(true);
        }
      });
      // 关掉弹窗就当作放弃
      var timer = setInterval(function () {
        if (!shell || !shell.classList.contains("on")) {
          clearInterval(timer);
          off();
          resolve(Store.state.signedIn);
        }
      }, 700);
    });
  }

  /* ------------------------------------------------------------ 右上角账号 */
  function initTheme() {
    var saved = null;
    try {
      saved = localStorage.getItem("theme");
    } catch (e) {
      saved = null;
    }
    var dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    var btn = $(".theme-toggle");
    if (!btn) return;
    btn.textContent = dark ? "日间" : "夜读";
    on(btn, "click", function () {
      var isDark = document.documentElement.getAttribute("data-theme") === "dark";
      var next = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      btn.textContent = next === "dark" ? "日间" : "夜读";
      try {
        localStorage.setItem("theme", next);
      } catch (e) {
        /* 忽略 */
      }
    });
  }

  function accountBar() {
    var nav = $(".nav");
    if (!nav) return;

    // 「写一封信」入口
    if (!$(".nav a[href^='write.html']", nav) && !document.body.classList.contains("is-write")) {
      var writeLink = h("a", "write-link", "写一封信");
      writeLink.href = "write.html";
      nav.insertBefore(writeLink, nav.firstChild);
      on(writeLink, "click", function (e) {
        if (Store.state.signedIn) return;
        e.preventDefault();
        requireLogin("写东西要先登录一下").then(function (ok) {
          if (ok) location.href = "write.html";
        });
      });
    }

    var box = h("span", "account");
    nav.appendChild(box);
    var menu = null;

    function shutMenu() {
      if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
      menu = null;
    }

    function draw() {
      box.innerHTML = "";
      shutMenu();
      if (!Store.state.configured) return;
      if (!Store.state.signedIn) {
        var btn = h("button", "account-btn", "登录");
        btn.type = "button";
        box.appendChild(btn);
        on(btn, "click", function () {
          loginModal();
        });
        return;
      }
      var user = Store.state.user;
      var label =
        ((user && user.user_metadata && user.user_metadata.display_name) || "").trim() ||
        (user && user.email ? String(user.email).split("@")[0] : "我");
      var open = h("button", "account-btn on", label);
      open.type = "button";
      box.appendChild(open);
      on(open, "click", function (e) {
        e.stopPropagation();
        if (menu) {
          shutMenu();
          return;
        }
        menu = h("div", "account-menu");
        var a1 = h("a", "", "写一封信");
        a1.href = "write.html";
        var a2 = h("a", "", "设置");
        a2.href = "write.html#settings";
        var out = h("button", "", "退出登录");
        out.type = "button";
        menu.appendChild(a1);
        menu.appendChild(a2);
        menu.appendChild(out);
        box.appendChild(menu);
        on(out, "click", function () {
          Store.signOut().then(function () {
            toast("已退出");
          });
        });
      });
    }

    document.addEventListener("click", function () {
      shutMenu();
    });
    Store.onChange(draw);
    draw();
  }

  /* ------------------------------------------------------------ 后端没接上时的说明 */
  function backendNote() {
    var s = Store.state;
    if (!s.configured) return null;
    if (s.memberIssue) {
      var email = s.user && s.user.email ? s.user.email : "你的邮箱";
      return (
        "这个账号还不在成员名单里，所以什么都看不到。去 Supabase 的 SQL Editor 跑一句：" +
        "insert into public.members (email) values ('" + email + "');"
      );
    }
    if (s.reachable) return null;
    var msg = s.error || "";
    if (/permission denied|row-level security|not allowed|violates row-level/i.test(msg)) {
      return "数据库把这次请求挡下来了 —— 多半是账号不在成员名单里，或者 setup.sql 没跑完整。";
    }
    if (/does not exist|schema cache|relation/i.test(msg)) {
      return "后端还没建好：去 Supabase 的 SQL Editor 跑一次 supabase/setup.sql，跑完刷新这一页。";
    }
    if (/Invalid API key|JWT/i.test(msg)) {
      return "后端密钥不对，检查 data/config.js 里的 anonKey。";
    }
    return "连不上后端（" + msg + "），先按离线内容显示。";
  }

  // 提醒条默认只在「写东西」那一页出现，免得打扰看信的访客；
  // 但「账号不在名单里」这种情况哪儿都要说清楚，不然就是一片空白。
  function banner(always) {
    var note = backendNote();
    var old = $(".backend-note");
    if (old) old.parentNode.removeChild(old);
    if (!note) return;
    if (!always && !Store.state.memberIssue) return;
    var bar = h("div", "backend-note");
    bar.appendChild(h("span", null, note));
    var x = h("button", "backend-x", "知道了");
    x.type = "button";
    bar.appendChild(x);
    on(x, "click", function () {
      bar.parentNode.removeChild(bar);
    });
    var host = $(".wrap") || $(".wide") || document.body;
    host.insertBefore(bar, host.firstChild);
  }

  function mount(options) {
    initTheme();
    accountBar();
    var always = !!(options && options.notice);
    banner(always);
    Store.onChange(function () {
      banner(always);
    });
  }

  return {
    $: $,
    h: h,
    on: on,
    toast: toast,
    modal: modal,
    close: close,
    confirm: confirmBox,
    loginModal: loginModal,
    requireLogin: requireLogin,
    mount: mount,
    initTheme: initTheme,
    banner: banner,
    backendNote: backendNote
  };
})();
