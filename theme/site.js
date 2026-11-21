// Three small helps, all optional: the page reads fine without them.
// 1. The home's map: a pin for each article whose card (article.json) names a place, framed to fit them.
// 2. Animated pictures (short looping videos) play only while on screen.
// 3. An outside video, post or map loads only when its placeholder is pressed.
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
        li.append(link, el('small', '', (a.date_label || a.date || '') + (a.maps && a.maps.length ? ' · with a map' : '')));
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
