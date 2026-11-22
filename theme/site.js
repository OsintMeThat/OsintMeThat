// Small helps, all optional: the pages read fine without them.
// 1. The home's map: a pin for each article whose card (article.json) names a place, framed to fit them.
// 2. Animated pictures (short looping videos) play only while on screen.
// 3. An outside video, post or map loads only when its placeholder is pressed.
// 4. A long article's contents underline the section being read.
// 5. The Contribute page sends a case bundle to the drop point.
// 6. The lists' extras: places, a map's contents, counts, a category's atlas, About's numbers, the Azimut page.
(function () {
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a.embed-load');
    if (!link) return;
    event.preventDefault();
    var frame = document.createElement('iframe');
    frame.src = link.dataset.src;
    frame.title = link.dataset.title || '';
    frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    frame.allowFullscreen = true;
    frame.className = 'embed-live';
    if (link.dataset.style) frame.setAttribute('style', link.dataset.style);
    link.replaceWith(frame);
  });

  var loops = document.querySelectorAll('video.loop');
  if (loops.length && 'IntersectionObserver' in window) {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { var p = e.target.play(); if (p && p.catch) p.catch(function () {}); }
        else e.target.pause();
      });
    }, { rootMargin: '200px' });
    loops.forEach(function (v) { seen.observe(v); });
  }

  // The contents beside a long article underline the section being read.
  var toc = document.querySelector('.toc');
  if (toc && window.matchMedia('(max-width: 1180px)').matches) toc.open = false;   // folded above the text on a narrow screen
  if (toc && 'IntersectionObserver' in window) {
    var links = {};
    toc.querySelectorAll('a[href^="#"]').forEach(function (a) { links[decodeURIComponent(a.hash.slice(1))] = a; });
    var reading = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting || !links[e.target.id]) return;
        toc.querySelectorAll('a.on').forEach(function (a) { a.classList.remove('on'); });
        links[e.target.id].classList.add('on');
      });
    }, { rootMargin: '0px 0px -70% 0px' });
    Object.keys(links).forEach(function (id) { var h = document.getElementById(id); if (h) reading.observe(h); });
  }

  var box = document.querySelector('.hero-map[data-atlas]');
  if (box && window.fetch && window.Promise) atlas(box);

  var drop = document.querySelector('form[data-contribute]');
  if (drop && window.fetch && window.Promise) contribute(drop);

  if (window.fetch && window.Promise) extras();

  // The Contribute form: Turnstile, then the drop point's three steps. /start takes the fields and the
  // token and answers a presigned upload; the file goes straight to it (XMLHttpRequest, for its progress);
  // /done has the drop point check what arrived. Closed while the page knows no drop point or no sitekey.
  function contribute(form) {
    var worker = (form.dataset.worker || '').replace(/\/+$/, '');
    var sitekey = form.dataset.sitekey || '';
    var maxBytes = (Number(form.dataset.maxMb) || 500) * 1024 * 1024;
    var send = form.querySelector('button[type=submit]');
    var state = form.querySelector('.state');
    var bar = form.querySelector('progress.bar');
    var slot = form.querySelector('[data-turnstile]');
    var token = '';
    var widget = null;
    if (!worker || !sitekey) return;
    function say(words, bad) { state.textContent = words; state.classList.toggle('bad', !!bad); }
    function ready() { send.disabled = !token; }

    window.osmTurnstileReady = function () {
      slot.textContent = '';
      widget = window.turnstile.render(slot, {
        sitekey: sitekey,
        callback: function (t) { token = t; ready(); },
        'expired-callback': function () { token = ''; ready(); },
        'error-callback': function () { token = ''; ready(); say('The robot check did not load. Reload the page to try again.', true); }
      });
    };
    var invite = form.querySelector('.field.invite');
    // The drop point says whether it takes cases now, and whether it wants an invite code.
    fetch(worker + '/config', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (config) {
        if (config.open === false) { say('Sending is closed for now. Ask on the Discord.', true); return; }
        if (config.invite === true) { invite.hidden = false; invite.querySelector('input').required = true; }
        if (Number(config.max_bytes) > 0) maxBytes = Number(config.max_bytes);
        var script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=osmTurnstileReady';
        script.async = true;
        script.onerror = function () { say('The robot check did not load. Reload the page to try again.', true); };
        document.head.appendChild(script);
        say('');
      });

    function post(path, body) {
      return fetch(worker + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (!r.ok) throw new Error(data.error || 'The drop point refused the case (' + r.status + ').');
            return data;
          });
        });
    }

    function put(url, file) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable) { bar.value = Math.round(e.loaded / e.total * 100); say('Sending… ' + bar.value + ' %'); }
        };
        xhr.onload = function () { xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('The upload stopped (' + xhr.status + '). Try again.')); };
        xhr.onerror = function () { reject(new Error('The upload stopped: check your connection and try again.')); };
        xhr.send(file);
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var f = form.elements;
      var file = f.bundle.files[0];
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (/\.azimut\.enc$/i.test(file.name)) { say('Send the bundle unsealed: export the case again without a password.', true); return; }
      if (!/\.azimut\.zip$/i.test(file.name)) { say('Choose the case bundle Azimut exports, a file ending in .azimut.zip.', true); return; }
      if (file.size > maxBytes) { say('This bundle is over ' + Math.max(1, Math.round(maxBytes / 1048576)) + ' MB. Leave out what the article does not use and export again.', true); return; }
      send.disabled = true;
      bar.hidden = false; bar.value = 0;
      say('Checking…');
      var id = '';
      post('/start', {
        name: f.author.value.trim(), email: f.email.value.trim(), title: f.title.value.trim(), note: f.note.value.trim(),
        rights: f.made.checked, publish: f.name.checked, pictures: f.pictures.checked, size: file.size, token: token,
        invite: invite.hidden ? undefined : f.invite.value.trim()
      })
        .then(function (data) { id = data.id; return put(data.upload, file); })
        .then(function () { say('Checking what arrived…'); return post('/done', { id: id }); })
        .then(function () {
          form.reset(); bar.hidden = true;
          form.classList.add('sent');
          say('Received. An e-mail will follow once it has been read. Your receipt: ' + id + ' (it is what a request to delete it names).');
        })
        .catch(function (err) {
          bar.hidden = true;
          say(err.message, true);
        })
        .then(function () {
          // a Turnstile token serves one /start: a fresh one for the next send
          token = '';
          if (widget !== null && window.turnstile) window.turnstile.reset(widget);
          ready();
        });
    });
  }

  // The lists' extras, all from what the site already holds: each article's place on its category's line,
  // what each map holds, what each section head lists, a category's places and numbers, About's numbers,
  // the Azimut page's step in view and the reader's system on its download button.
  function extras() {
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
    function since(date) { return date ? 'since ' + MONTHS[+date.slice(5, 7) - 1] + ' ' + date.slice(0, 4) : ''; }
    function stats(cls, parts) {
      var line = el(cls === 'div' ? 'div' : 'p', 'stats');
      parts.filter(Boolean).forEach(function (part, i) {
        if (i) line.append(' · ');
        line.append(i ? part : el('b', '', part));
      });
      return line;
    }
    var here = location.pathname.replace(/index\.html$/, '');
    var box = document.querySelector('[data-atlas]');
    var map = box ? JSON.parse(box.dataset.atlas) : null;

    document.querySelectorAll('.sechead').forEach(function (h) {
      var list = h.parentNode.querySelector('.az-list');
      var n = list ? list.querySelectorAll(':scope > .az-item').length : 0;
      if (n) h.append(el('span', 'n', list.classList.contains('az-maps') ? plural(n, 'map', 'maps') : plural(n, 'article', 'articles')));
    });

    // What a map holds, read from its own page (the data its reader draws), once its card comes near.
    function holds(li) {
      var a = li.querySelector('.az-title a'), cat = li.querySelector('.az-category');
      if (!a || !cat || li.dataset.held) return Promise.resolve(null);
      li.dataset.held = '1';
      return fetch(a.getAttribute('href')).then(function (r) { return r.ok ? r.text() : ''; }).then(function (html) {
        var node = new DOMParser().parseFromString(html, 'text/html').querySelector('script.az-map-data');
        if (!node) return null;
        var d = JSON.parse(node.textContent), n = { point: 0, line: 0, area: 0 };
        (d.features || []).forEach(function (f) { n[f.kind === 'point' || f.kind === 'line' ? f.kind : 'area']++; });
        var parts = [];
        if (n.point) parts.push(plural(n.point, 'point', 'points'));
        if (n.line) parts.push(plural(n.line, 'line', 'lines'));
        if (n.area) parts.push(plural(n.area, 'area', 'areas'));
        if ((d.days || []).length > 1) parts.push(plural(d.days.length, 'day', 'days'));
        if (parts.length) cat.append(el('span', 'holds', parts.join(' · ')));
        return n;
      }).catch(function () { return null; });
    }
    var cards = [].slice.call(document.querySelectorAll('.az-item.is-map'));
    if (here === '/maps/') {
      Promise.all(cards.map(holds)).then(function (all) {
        var head = document.querySelector('main .page-head');
        var points = 0, maps = 0;
        all.forEach(function (n) { if (n) { maps++; points += n.point; } });
        var dates = [].map.call(document.querySelectorAll('.az-maps .az-meta time'), function (t) { return t.getAttribute('datetime'); }).sort();
        if (head && maps) head.append(stats('p', [plural(maps, 'map', 'maps'), points ? plural(points, 'point', 'points') + ' placed' : '', since(dates[0])]));
      });
    } else if (cards.length && 'IntersectionObserver' in window) {
      var near = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { near.unobserve(en.target); holds(en.target); } });
      }, { rootMargin: '300px' });
      cards.forEach(function (li) { near.observe(li); });
    }

    fetch('/articles.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.articles)) return;
        var lines = data.articles.filter(function (a) { return a && a.layout !== 'map'; });
        var by = {};
        lines.forEach(function (a) { by[a.address] = a; });

        // an article's place: a small world with its dot, then the place's first part
        if (map) document.querySelectorAll('.az-item:not(.is-map)').forEach(function (li) {
          var a = li.querySelector('.az-title a'), line = a && by[a.getAttribute('href')];
          var cat = li.querySelector('.az-category'), place = line && placeOf(line.place);
          if (!place || !cat) return;
          var xy = project(map, place.lon, place.lat), loc = el('span', 'loc'), mini = el('span', 'mini'), dot = el('i');
          dot.style.left = (xy[0] / map.w * 100) + '%';
          dot.style.top = (xy[1] / map.h * 100) + '%';
          mini.append(dot);
          loc.title = coords(place.lat) + ', ' + coords(place.lon);
          loc.append(mini, el('span', '', place.name.split(',')[0]));
          cat.append(loc);
        });

        // About: what the site holds, and in how many publications it was cited
        var about = here === '/about-contact/' && document.querySelector('.phead .wrap');
        if (about) {
          var outlets = {};
          document.querySelectorAll('#cited-by .cites li span').forEach(function (s) { outlets[s.textContent.split(' · ')[0].trim()] = 1; });
          var cited = Object.keys(outlets).length;
          about.append(stats('div', [plural(lines.length, 'article', 'articles'), (data.maps || []).length ? plural(data.maps.length, 'map', 'maps') : '',
            cited ? 'cited in ' + plural(cited, 'publication', 'publications') : '']));
        }

        // A category: its numbers, and the atlas framed on its places
        var band = document.querySelector('.cat-band[data-category]');
        if (!band) return;
        var name = band.dataset.category;
        var mine = lines.filter(function (a) { return a.category === name; });
        var maps = (data.maps || []).filter(function (m) { return m.category === name; });
        var places = [];
        mine.forEach(function (a) {
          var p = placeOf(a.place);
          if (!p) return;
          if (places.filter(function (g) { return Math.abs(g.lat - p.lat) < 2.5 && Math.abs(g.lon - p.lon) < 2.5; }).length) return;
          places.push({ lat: p.lat, lon: p.lon, name: p.name, xy: project(map, p.lon, p.lat) });
        });
        var first = mine.map(function (a) { return a.date || ''; }).filter(Boolean).sort()[0];
        var head = band.querySelector('.page-head');
        if (mine.length) head.append(stats('p', [plural(mine.length, 'article', 'articles'), maps.length ? plural(maps.length, 'map', 'maps') : '',
          places.length ? plural(places.length, 'place', 'places') : '', since(first)]));
        var img = band.querySelector('.atlas');
        function draw() {
          var cw = band.clientWidth, ch = band.clientHeight;
          if (!cw || !ch) return;
          band.querySelectorAll('.cat-pin').forEach(function (p) { p.remove(); });
          var cover = Math.max(cw / map.w, ch / map.h), s = cover, cx = map.w / 2, cy = map.h / 2;
          if (places.length) {
            var xs = places.map(function (g) { return g.xy[0]; }), ys = places.map(function (g) { return g.xy[1]; });
            var spanX = Math.max.apply(null, xs) - Math.min.apply(null, xs), spanY = Math.max.apply(null, ys) - Math.min.apply(null, ys);
            cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
            cy = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
            s = Math.min(cover * 4, spanX ? 0.3 * cw / spanX : Infinity, spanY ? 0.5 * ch / spanY : Infinity);
            s = Math.max(cover, s);
          }
          var ox = Math.min(0, Math.max(cw - map.w * s, (cw < 900 ? 0.78 : 0.74) * cw - cx * s));
          var oy = Math.min(0, Math.max(ch - map.h * s, 0.5 * ch - cy * s));
          img.style.width = map.w * s + 'px'; img.style.height = map.h * s + 'px';
          img.style.left = ox + 'px'; img.style.top = oy + 'px';
          img.classList.add('placed');
          places.forEach(function (g) {
            var pin = el('div', 'cat-pin'), label = el('span', '', g.name);
            pin.style.left = g.xy[0] * s + ox + 'px';
            pin.style.top = g.xy[1] * s + oy + 'px';
            label.append(el('small', '', coords(g.lat) + ', ' + coords(g.lon)));
            pin.append(label);
            band.append(pin);
          });
        }
        draw();
        var queued = false;
        window.addEventListener('resize', function () {
          if (queued) return;
          queued = true;
          requestAnimationFrame(function () { queued = false; draw(); });
        });
      })
      .catch(function () {});

    // The Azimut page: the step in view underlined in the index; the download names the reader's system
    var steps = document.querySelectorAll('.azstep[id]'), index = document.querySelectorAll('.azindex a');
    if (steps.length && index.length && 'IntersectionObserver' in window) {
      var reading = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          index.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id); });
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      steps.forEach(function (s) { reading.observe(s); });
    }
    var get = document.querySelector('.toolhead .go .btn:not(.ghost)');
    if (get) {
      var ua = navigator.userAgent, pf = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
      var os = /Android|iPhone|iPad/.test(ua) ? '' : /Win/.test(pf) ? 'Windows' : /Mac/.test(pf) ? 'macOS' : /Linux/.test(pf) ? 'Linux' : '';
      if (os) get.textContent = 'Download for ' + os;
    }
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  // The place a card names, or null: {lat, lon, name} within the world's bounds.
  function placeOf(p) {
    if (!p || typeof p !== 'object') return null;
    var lat = Number(p.lat), lon = Number(p.lon);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
    return { lat: lat, lon: lon, name: typeof p.name === 'string' ? p.name.slice(0, 80) : '' };
  }

  // Equal Earth, as the atlas was drawn (make_atlas.mjs): longitude and latitude to the picture's units.
  function project(map, lon, lat) {
    var A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
    var l = lon * Math.PI / 180, t = Math.asin(M * Math.sin(lat * Math.PI / 180));
    var t2 = t * t, t6 = t2 * t2 * t2;
    var x = l * Math.cos(t) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
    var y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
    return [map.tx + map.k * x, map.ty - map.k * y];
  }

  function coords(n) { return n.toFixed(4).replace('-', '−'); }

  function atlas(box) {
    var map = JSON.parse(box.dataset.atlas);
    // An author is shown when it is not the site itself, as in Azimut's own lists.
    var named = document.querySelector('meta[property="og:site_name"]');
    var site = named ? named.content : '';
    var img = box.querySelector('.atlas');
    var list = document.querySelector('.hero-list');
    var text = document.querySelector('.hero-text');
    var groups = [];

    fetch('/articles.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.articles)) return [];
        var lines = data.articles.filter(function (a) {
          return a && typeof a.address === 'string' && /^\/(?!\/)/.test(a.address) && a.layout !== 'map';
        }).slice(0, 40);
        // A list made before Azimut carried places has none: each article's own card says it.
        return Promise.all(lines.map(function (a) {
          if (a.place) return Object.assign({}, a, { place: placeOf(a.place) });
          return fetch(a.address + 'article.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (card) { return Object.assign({}, a, { place: placeOf(card && card.place) }); })
            .catch(function () { return a; });
        }));
      })
      .then(function (lines) {
        lines.forEach(function (a) {
          if (!a.place) return;
          var g = groups.filter(function (g) {
            return Math.abs(g.lat - a.place.lat) < 2.5 && Math.abs(g.lon - a.place.lon) < 2.5;
          })[0];
          if (!g) groups.push(g = { lat: a.place.lat, lon: a.place.lon, name: a.place.name, items: [], xy: project(map, a.place.lon, a.place.lat) });
          g.items.push(a);
        });
        if (!groups.length) return;
        fillList();
        draw();
        var queued = false;
        window.addEventListener('resize', function () {
          if (queued) return;
          queued = true;
          requestAnimationFrame(function () { queued = false; draw(); });
        });
      })
      .catch(function () {});

    function card(g) {
      var c = el('div', 'card');
      c.append(el('span', 'where', coords(g.lat) + ', ' + coords(g.lon)), el('span', 'place', g.name));
      var ul = el('ul');
      g.items.slice(0, 3).forEach(function (a) {
        var li = el('li'), link = el('a', '', a.title);
        link.href = a.address;
        var by = a.author && a.author !== site ? ' · ' + a.author : '';
        li.append(link, el('small', '', (a.date_label || a.date || '') + by + (a.maps && a.maps.length ? ' · with a map' : '')));
        ul.append(li);
      });
      if (g.items.length > 3) ul.append(el('li', '', 'and ' + (g.items.length - 3) + ' more'));
      c.append(ul);
      return c;
    }

    function fillList() {
      if (!list) return;
      groups.forEach(function (g) {
        var li = el('li');
        li.append(el('span', 'where', coords(g.lat) + ', ' + coords(g.lon) + ' · ' + g.name));
        g.items.forEach(function (a) {
          var link = el('a', '', a.title);
          link.href = a.address;
          li.append(link);
        });
        list.append(li);
      });
    }

    function overlaps(a, b) { return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b; }

    function draw() {
      var cw = box.clientWidth, ch = box.clientHeight;
      if (!cw || !ch) return;
      var phone = window.matchMedia('(max-width: 900px)').matches;
      if (list) list.hidden = !phone;
      // Where the pins go: under the title on a wide screen, the middle on a phone.
      var T = phone ? [0.12, 0.88, 0.3, 0.7] : [0.14, 0.9, 0.6, 0.8];
      var xs = groups.map(function (g) { return g.xy[0]; }), ys = groups.map(function (g) { return g.xy[1]; });
      var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs);
      var miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
      var sMin = Math.max(cw / map.w, ch / map.h), sMax = cw * 12 / map.w;
      var s = Math.min((T[1] - T[0]) * cw / Math.max(maxx - minx, 1e-6), (T[3] - T[2]) * ch / Math.max(maxy - miny, 1e-6));
      s = Math.max(sMin, Math.min(sMax, s));
      var ox = (T[0] + T[1]) / 2 * cw - (minx + maxx) / 2 * s;
      var oy = (T[2] + T[3]) / 2 * ch - (miny + maxy) / 2 * s;
      ox = Math.min(0, Math.max(cw - map.w * s, ox));
      oy = Math.min(0, Math.max(ch - map.h * s, oy));
      img.style.width = map.w * s + 'px';
      img.style.height = map.h * s + 'px';
      img.style.left = ox + 'px';
      img.style.top = oy + 'px';
      box.classList.add('placed');

      box.querySelectorAll('.pin').forEach(function (p) { p.remove(); });
      var b = box.getBoundingClientRect(), taken = [];
      if (text && !phone) {
        var r = text.getBoundingClientRect();
        taken.push({ l: r.left - b.left - 12, r: r.right - b.left + 24, t: r.top - b.top - 12, b: r.bottom - b.top + 12 });
      }
      groups.forEach(function (g) {
        var x = g.xy[0] * s + ox, y = g.xy[1] * s + oy;
        if (x < 0 || x > cw || y < 0 || y > ch) return;
        var pin = el('div', 'pin');
        pin.style.left = x + 'px';
        pin.style.top = y + 'px';
        pin.title = g.name;
        box.append(pin);
        if (phone) return;
        var c = card(g);
        pin.append(c);
        var w = c.offsetWidth, h = c.offsetHeight, top = y + 22 - h;
        // Beside the pin on the side with room, pushed clear of the title and of the cards already placed.
        var tries = x > cw / 2 ? ['left', 'right'] : ['right', 'left'];
        for (var i = 0; i < tries.length; i++) {
          var side = tries[i], lead = 24;
          for (var step = 0; step < 40; step++) {
            var l = side === 'right' ? x + lead + 10 : x - lead - 10 - w;
            var rect = { l: l, r: l + w, t: top, b: top + h };
            if (rect.l < 8 || rect.r > cw - 8) break;
            var hit = taken.filter(function (t) { return overlaps(rect, t); })[0];
            if (!hit) {
              pin.classList.add(side);
              pin.style.setProperty('--lead', lead + 'px');
              taken.push(rect);
              return;
            }
            var next = side === 'right' ? hit.r - x - 10 + 1 : x - hit.l - 10 + 1;
            if (next <= lead) break;
            lead = next;
          }
        }
        c.remove();
      });
    }
  }
})();
