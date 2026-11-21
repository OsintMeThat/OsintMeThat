// Two small helps, both optional: the page reads fine without them.
// 1. The sidebar's latest articles, read from the list Azimut keeps (/articles.json).
// 2. Animated pictures (short looping videos) play only while on screen.
(function () {
  var box = document.querySelector('[data-latest]');
  if (box && window.fetch) {
    fetch('/articles.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.articles)) return;
        var here = location.pathname;
        var list = box.querySelector('ol');
        data.articles.filter(function (a) { return a.address !== here; }).slice(0, 5).forEach(function (a) {
          var li = document.createElement('li');
          var link = document.createElement('a');
          link.href = a.address;
          link.textContent = a.title;
          var when = document.createElement('time');
          when.dateTime = a.date;
          when.textContent = a.date_label || a.date;
          li.append(link, when);
          list.append(li);
        });
        if (list.children.length) box.hidden = false;
      })
      .catch(function () {});
  }

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
})();
