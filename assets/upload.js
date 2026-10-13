/* 见字如面 —— 上传
 *
 * 手机拍的原图动辄 4MB 一张，直接传又慢又占额度，所以先在浏览器里压：
 *   大图  长边 2000px、质量 82  → 正片，点开看的那张
 *   缩略图 长边 900px、质量 78  → 墙上铺的那张小图
 * 视频不转码（浏览器里做不到），原样上传，另外抽一帧当封面。
 */
window.Uploader = (function () {
  "use strict";

  var $ = UI.$;
  var h = UI.h;
  var on = UI.on;

  function blobToPromise(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (blob) {
          if (blob) resolve(blob);
          else reject(new Error("图片压缩失败"));
        },
        "image/jpeg",
        quality
      );
    });
  }

  // 手机拍的照片常常带 EXIF 方向信息，createImageBitmap 能顺手转正
  function decode(file) {
    if (window.createImageBitmap) {
      return window.createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () {
        return decodeWithImg(file);
      });
    }
    return decodeWithImg(file);
  }

  function decodeWithImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("这张图打不开"));
      };
      img.src = url;
    });
  }

  function draw(source, maxSide, quality) {
    var w = source.width || source.naturalWidth;
    var ht = source.height || source.naturalHeight;
    var scale = Math.min(1, maxSide / Math.max(w, ht));
    var tw = Math.max(1, Math.round(w * scale));
    var th = Math.max(1, Math.round(ht * scale));
    var canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0, tw, th);

    // 顺手取一个平均色，当作加载时的占位底色，避免闪白
    var swatch = document.createElement("canvas");
    swatch.width = 6;
    swatch.height = 6;
    var sctx = swatch.getContext("2d");
    sctx.drawImage(source, 0, 0, 6, 6);
    var data;
    try {
      data = sctx.getImageData(0, 0, 6, 6).data;
    } catch (e) {
      data = null;
    }
    var color = null;
    if (data) {
      var r = 0;
      var g = 0;
      var b = 0;
      var count = data.length / 4;
      for (var i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      color =
        "#" +
        [r, g, b]
          .map(function (v) {
            var n = Math.round(v / count).toString(16);
            return n.length === 1 ? "0" + n : n;
          })
          .join("");
    }
    return blobToPromise(canvas, quality).then(function (blob) {
      return { blob: blob, width: tw, height: th, color: color };
    });
  }

  // 视频：抽一帧当封面，顺便拿到时长和尺寸
  function readVideo(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var video = document.createElement("video");
      var done = false;
      function finish(result) {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        resolve(result);
      }
      var timer = setTimeout(function () {
        finish({ posterBlob: null, width: null, height: null, seconds: null });
      }, 12000);

      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.onloadeddata = function () {
        var w = video.videoWidth;
        var ht = video.videoHeight;
        var seconds = isFinite(video.duration) ? video.duration : null;
        try {
          video.currentTime = Math.min(0.4, (seconds || 1) / 4);
        } catch (e) {
          clearTimeout(timer);
          finish({ posterBlob: null, width: w, height: ht, seconds: seconds });
        }
      };
      video.onseeked = function () {
        clearTimeout(timer);
        var w = video.videoWidth;
        var ht = video.videoHeight;
        var seconds = isFinite(video.duration) ? video.duration : null;
        var scale = Math.min(1, 1280 / Math.max(w || 1, ht || 1));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((w || 1280) * scale));
        canvas.height = Math.max(1, Math.round((ht || 720) * scale));
        try {
          canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch (e) {
          finish({ posterBlob: null, width: w, height: ht, seconds: seconds });
          return;
        }
        blobToPromise(canvas, 0.8).then(function (blob) {
          finish({ posterBlob: blob, width: w, height: ht, seconds: seconds });
        }, function () {
          finish({ posterBlob: null, width: w, height: ht, seconds: seconds });
        });
      };
      video.onerror = function () {
        clearTimeout(timer);
        finish({ posterBlob: null, width: null, height: null, seconds: null });
      };
      video.src = url;
    });
  }

  function prettySize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
  }

  /* ------------------------------------------------------------ 传一个文件 */
  function uploadOne(file, opts, report) {
    var group = opts.group || "us";
    var date = opts.date || new Date().toISOString().slice(0, 10);
    var caption = opts.caption || null;
    var id = Store.uuid();

    if (/^video\//.test(file.type)) {
      report("读封面", 0.02);
      return readVideo(file).then(function (meta) {
        var videoPath = "videos/" + id + ".mp4";
        var posterPath = "videos/" + id + ".jpg";
        var jobs = [];
        if (meta.posterBlob) {
          jobs.push(
            Store.objectUrl(posterPath, meta.posterBlob, function (p) {
              report("传封面", 0.05 + p * 0.1);
            }, "image/jpeg")
          );
        }
        return Promise.all(jobs).then(function () {
          return Store.objectUrl(
            videoPath,
            file,
            function (p) {
              report("传视频", 0.15 + p * 0.8);
            },
            file.type || "video/mp4"
          );
        }).then(function () {
          report("记下来", 0.97);
          return Store.insertMedia({
            kind: "video",
            origin: "storage",
            group_label: "moving",
            full_path: videoPath,
            poster_path: meta.posterBlob ? posterPath : null,
            width: meta.width,
            height: meta.height,
            seconds: meta.seconds,
            bytes: file.size,
            caption: caption,
            taken_on: date,
            sort_index: null
          });
        });
      });
    }

    if (!/^image\//.test(file.type)) {
      return Promise.reject(new Error("只认图片和视频：" + file.name));
    }

    report("压缩中", 0.02);
    return decode(file).then(function (source) {
      return Promise.all([draw(source, 2000, 0.82), draw(source, 900, 0.78)]).then(function (out) {
        var full = out[0];
        var thumb = out[1];
        var fullPath = "photos/" + id + ".jpg";
        var thumbPath = "photos/" + id + "-t.jpg";
        // 先传小的，墙上能快点看到东西
        return Store.objectUrl(thumbPath, thumb.blob, function (p) {
          report("传缩略图", 0.05 + p * 0.2);
        }, "image/jpeg")
          .then(function () {
            return Store.objectUrl(fullPath, full.blob, function (p) {
              report("传大图", 0.25 + p * 0.7);
            }, "image/jpeg");
          })
          .then(function () {
            report("记下来", 0.97);
            return Store.insertMedia({
              kind: "photo",
              origin: "storage",
              group_label: group,
              full_path: fullPath,
              thumb_path: thumbPath,
              width: full.width,
              height: full.height,
              bytes: full.blob.size,
              color: full.color,
              caption: caption,
              taken_on: date,
              sort_index: null
            });
          });
      });
    });
  }

  /* ------------------------------------------------------------ 上传面板 */
  function open(options) {
    var opts = options || {};
    var body = UI.modal("放照片和视频进来");
    var files = [];
    var busy = false;

    var drop = h("label", "drop");
    drop.innerHTML =
      '<input type="file" accept="image/*,video/*" multiple hidden>' +
      "<strong>把照片拖到这里，或者点一下选</strong>" +
      "<span>图片会自动压到长边 2000px；视频原样上传（手机视频很大，建议先剪短一点）</span>";
    body.appendChild(drop);

    var fields = h("div", "form row-form");
    var dateWrap = h("label", "field");
    dateWrap.appendChild(h("span", null, "这些照片是哪天的"));
    var dateInput = h("input");
    dateInput.type = "date";
    dateInput.value = new Date().toISOString().slice(0, 10);
    dateWrap.appendChild(dateInput);

    var groupWrap = h("label", "field");
    groupWrap.appendChild(h("span", null, "归到哪一组"));
    var groupInput = h("select");
    [["us", "我们的日常"], ["her", "她"]].forEach(function (pair) {
      var option = h("option", null, pair[1]);
      option.value = pair[0];
      groupInput.appendChild(option);
    });
    groupWrap.appendChild(groupInput);

    var capWrap = h("label", "field wide");
    capWrap.appendChild(h("span", null, "想说一句什么（可以空着）"));
    var capInput = h("input");
    capInput.type = "text";
    capInput.placeholder = "比如：三亚，太阳很好";
    capWrap.appendChild(capInput);

    fields.appendChild(dateWrap);
    fields.appendChild(groupWrap);
    fields.appendChild(capWrap);
    body.appendChild(fields);

    var listBox = h("div", "upload-list");
    body.appendChild(listBox);

    var row = h("div", "modal-actions");
    var start = h("button", "primary", "开始上传");
    start.type = "button";
    start.disabled = true;
    row.appendChild(start);
    body.appendChild(row);

    function addFiles(fileList) {
      Array.prototype.forEach.call(fileList || [], function (file) {
        if (!/^(image|video)\//.test(file.type)) {
          UI.toast("跳过不认识的文件：" + file.name, "bad");
          return;
        }
        files.push(file);
      });
      drawList();
    }

    var input = $("input[type=file]", drop);
    on(input, "change", function () {
      addFiles(input.files);
      input.value = "";
    });
    on(drop, "dragover", function (e) {
      e.preventDefault();
      drop.classList.add("over");
    });
    on(drop, "dragleave", function () {
      drop.classList.remove("over");
    });
    on(drop, "drop", function (e) {
      e.preventDefault();
      drop.classList.remove("over");
      addFiles(e.dataTransfer && e.dataTransfer.files);
    });

    var rows = [];
    function drawList() {
      listBox.innerHTML = "";
      rows = files.map(function (file) {
        var item = h("div", "upload-item");
        var head = h("div", "upload-head");
        head.appendChild(h("span", "upload-name", file.name));
        head.appendChild(h("span", "upload-size", prettySize(file.size)));
        item.appendChild(head);
        var bar = h("div", "bar");
        var fill = h("i");
        bar.appendChild(fill);
        item.appendChild(bar);
        var status = h("div", "upload-status", "");
        item.appendChild(status);
        listBox.appendChild(item);
        if (file.size > 80 * 1024 * 1024) {
          status.appendChild(h("span", "warn", "这个视频挺大的，手机上传可能会断"));
        }
        return { file: file, fill: fill, status: status };
      });
      start.disabled = !files.length || busy;
    }
    drawList();

    on(start, "click", function () {
      if (busy || !files.length) return;
      busy = true;
      start.disabled = true;
      start.textContent = "上传中…";
      var made = [];
      var failed = 0;
      var settings = {
        group: groupInput.value,
        date: dateInput.value,
        caption: capInput.value.trim() || null
      };

      var chain = Promise.resolve();
      rows.forEach(function (row) {
        chain = chain.then(function () {
          return uploadOne(row.file, settings, function (label, p) {
            row.status.textContent = label + " " + Math.round(p * 100) + "%";
            row.fill.style.width = Math.round(p * 100) + "%";
          }).then(function (record) {
            made.push(record);
            row.fill.style.width = "100%";
            row.fill.classList.add("done");
            row.status.textContent = "好了";
          }).catch(function (err) {
            // 一个失败不影响后面几个
            failed += 1;
            row.fill.classList.add("failed");
            row.status.textContent = "没成功：" + (err.message || err);
          });
        });
      });

      chain.then(function () {
        return Store.reload();
      }).then(function () {
        if (opts.onUploaded) opts.onUploaded(made);
        if (failed) {
          UI.toast("传好了 " + made.length + " 个，还有 " + failed + " 个没成功", "bad");
          // 只剩失败的几个，方便直接重试
          rows = rows.filter(function (r) {
            return r.fill.classList.contains("failed");
          });
          files = rows.map(function (r) {
            return r.file;
          });
          drawList();
        } else {
          UI.toast("传好了 " + made.length + " 个", "good");
          UI.close();
        }
        start.disabled = false;
        start.textContent = failed ? "再试一次" : "开始上传";
        busy = false;
      }).catch(function (err) {
        UI.toast("出错了：" + (err.message || err), "bad");
        start.disabled = false;
        start.textContent = "再试一次";
        busy = false;
      });
    });
  }

  return {
    open: open,
    uploadOne: uploadOne,
    prettySize: prettySize,
    readVideo: readVideo
  };
})();
