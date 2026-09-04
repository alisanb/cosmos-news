// main.js - Core client script for Cosmic Newsseller
(function () {
  'use strict';

  var reduce = document.documentElement.classList.contains('motion-off');
  var SVGNS = 'http://www.w3.org/2000/svg';
  var PALETTE = ['#9184d9', '#b5abfc', '#6f62b8', '#4a4270', '#3f424d'];

  /* ===================================================
     1. UTILITY FUNCTIONS
     =================================================== */
  function fmtInt(n) {
    return Number(n).toLocaleString('en-US');
  }

  function fmtWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return (
      d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
      ' ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
      ' UTC'
    );
  }

  function setText(id, txt) {
    var elem = document.getElementById(id);
    if (elem) elem.textContent = txt;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function el(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      n.setAttribute(k, attrs[k]);
    });
    return n;
  }

  function pct(part, total) {
    return total ? (part / total) * 100 : 0;
  }

  function countUp(id, value, suffix) {
    var target = document.getElementById(id);
    if (!target) return;
    suffix = suffix || '';
    if (reduce || !isFinite(value)) {
      target.textContent = fmtInt(value) + suffix;
      return;
    }
    var dur = 1100;
    var t0 = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      target.textContent = fmtInt(Math.round(value * eased)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ===================================================
     2. HERO PARALLAX & SCROLL ANIMATIONS
     =================================================== */
  var heroBg = document.querySelector('.hero-bg');
  var heroInner = document.querySelector('.hero-inner');
  if (heroBg && !reduce) {
    var ticking = false;
    window.addEventListener(
      'scroll',
      function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          var y = window.scrollY;
          if (y < 900) {
            heroBg.style.transform =
              'translate3d(0,' + y * 0.28 + 'px,0) scale(' + (1 + y * 0.00016) + ')';
            if (heroInner) {
              heroInner.style.transform = 'translate3d(0,' + y * 0.1 + 'px,0)';
              heroInner.style.opacity = String(Math.max(0, 1 - y / 520));
            }
          }
          ticking = false;
        });
      },
      { passive: true }
    );
  }

  (function () {
    var targets = document.querySelectorAll(
      '.section-head, .stat-tile, .live-card, .chart-card, .feature-card, .dispatch-card, .final-cta'
    );
    if (reduce || !('IntersectionObserver' in window)) return;
    targets.forEach(function (node) {
      node.classList.add('reveal');
    });
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var sibs = Array.prototype.slice.call(e.target.parentElement.children).indexOf(e.target);
          e.target.style.transitionDelay = Math.min(sibs, 5) * 70 + 'ms';
          e.target.classList.add('in');
          io.unobserve(e.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );
    targets.forEach(function (node) {
      io.observe(node);
    });
  })();

  /* ===================================================
     3. LIVE SATELLITE / ASTEROID / COUNTDOWN TELEMETRY
     =================================================== */
  function startCountdown(net) {
    var countdownEl = document.getElementById('mc-countdown');
    if (!countdownEl) return;
    if (!net) {
      countdownEl.textContent = 'TBD';
      return;
    }
    var target = new Date(net).getTime();
    if (isNaN(target)) {
      countdownEl.textContent = 'TBD';
      return;
    }
    function pad(n) {
      return String(n).padStart(2, '0');
    }
    (function tickDown() {
      var diff = target - Date.now();
      if (diff <= 0) {
        countdownEl.textContent = 'T+ 00:00:00';
        return;
      }
      var d = Math.floor(diff / 86400000);
      var h = Math.floor((diff % 86400000) / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      countdownEl.textContent = 'T−' + (d ? ' ' + d + 'd' : '') + ' ' + pad(h) + ':' + pad(m) + ':' + pad(s);
      setTimeout(tickDown, 1000);
    })();
  }

  (function trackIss() {
    var dot = document.getElementById('issDot');
    var trail = document.getElementById('issTrail');
    if (!dot) return;
    var path = [];
    function poll() {
      fetch('https://api.wheretheiss.at/v1/satellites/25544')
        .then(function (r) {
          return r.json();
        })
        .then(function (p) {
          if (!p || typeof p.latitude !== 'number') return;
          setText('iss-lat', p.latitude.toFixed(2) + '°');
          setText('iss-lon', p.longitude.toFixed(2) + '°');
          setText('iss-alt', Math.round(p.altitude) + ' km');
          var x = ((p.longitude + 180) / 360) * 360;
          var y = ((90 - p.latitude) / 180) * 180;
          dot.setAttribute('cx', x.toFixed(1));
          dot.setAttribute('cy', y.toFixed(1));
          path.push([x, y]);
          if (path.length > 40) path.shift();
          var segs = [];
          var prev = null;
          path.forEach(function (pt) {
            if (prev && Math.abs(pt[0] - prev[0]) > 180) segs.push([]);
            if (!segs.length) segs.push([]);
            segs[segs.length - 1].push(pt);
            prev = pt;
          });
          if (trail) {
            trail.setAttribute(
              'd',
              segs
                .filter(function (s) {
                  return s.length > 1;
                })
                .map(function (s) {
                  return (
                    'M' +
                    s
                      .map(function (pt) {
                        return pt[0].toFixed(1) + ',' + pt[1].toFixed(1);
                      })
                      .join(' L')
                  );
                })
                .join(' ')
            );
          }
          setText(
            'iss-updated',
            'Live · updated ' +
              new Date().toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })
          );
        })
        .catch(function () {
          setText('iss-updated', 'ISS tracker unreachable — retrying');
        });
    }
    poll();
    setInterval(poll, 5000);
  })();

  /* ===================================================
     4. GENERAL & COMMERCIAL NEWS (PAGINATED, MAX 10)
     =================================================== */
  var PAGE_SIZE = 12;
  var MAX_PAGES = 10;
  var currentGenPage = 1;
  var currentBizPage = 1;

  function renderArticles(containerId, articles) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!articles || !articles.length) {
      container.innerHTML = '<p class="excerpt">No dispatches logged for this cycle.</p>';
      return;
    }

    container.innerHTML = articles
      .map(function (item) {
        return (
          '<a class="news-tile" href="' +
          esc(item.url) +
          '" target="_blank" rel="noopener">' +
          '<div class="news-thumb">' +
          (item.imageUrl
            ? '<img src="' + esc(item.imageUrl) + '" alt="" loading="lazy">'
            : '') +
          '</div>' +
          '<div class="body">' +
          '<span class="news-title">' +
          esc(item.title) +
          '</span>' +
          (item.summary
            ? '<p class="news-sum">' + esc(item.summary) + '…</p>'
            : '') +
          '<span class="news-meta">' +
          esc(item.site) +
          (item.publishedAt ? ' · ' + fmtWhen(item.publishedAt) : '') +
          '</span></div></a>'
        );
      })
      .join('');
  }

  function renderPaginationNumbers(containerId, currentPage, totalPages, clickHandlerName) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var pagesToShow = Math.min(MAX_PAGES, totalPages || 1);
    var html = '';
    for (var i = 1; i <= pagesToShow; i++) {
      var isActive = i === currentPage ? ' active' : '';
      html +=
        '<button class="page-btn' +
        isActive +
        '" type="button" onclick="window.' +
        clickHandlerName +
        '(' +
        i +
        ')">' +
        i +
        '</button>';
    }
    container.innerHTML = html;
  }

  function fetchNewsPage(type, page, containerId, numContainerId, prevBtnId, nextBtnId, clickHandlerName) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.style.opacity = '0.35';

    var offset = (page - 1) * PAGE_SIZE;

    fetch('/api/mission-control?type=' + encodeURIComponent(type) + '&limit=' + PAGE_SIZE + '&offset=' + offset)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var results = data && (data.results || data.news || []);
        renderArticles(containerId, results);

        var totalCount = data && data.count ? data.count : results.length;
        var calculatedPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
        var effectiveTotal = Math.min(MAX_PAGES, calculatedPages);

        renderPaginationNumbers(numContainerId, page, effectiveTotal, clickHandlerName);

        var prevBtn = document.getElementById(prevBtnId);
        var nextBtn = document.getElementById(nextBtnId);
        if (prevBtn) prevBtn.disabled = page <= 1;
        if (nextBtn) nextBtn.disabled = page >= effectiveTotal;
      })
      .catch(function () {
        container.innerHTML = '<p class="excerpt">Mission telemetry offline &mdash; could not sync feed.</p>';
      })
      .finally(function () {
        container.style.opacity = '1';
      });
  }

  // Exposed to window so dynamically injected pagination buttons can invoke them
  window.goToGeneralPage = function (page) {
    if (page < 1 || page > MAX_PAGES) return;
    currentGenPage = page;
    fetchNewsPage('general', currentGenPage, 'mc-news-grid', 'gen-page-numbers', 'gen-prev-btn', 'gen-next-btn', 'goToGeneralPage');
  };

  window.goToBizPage = function (page) {
    if (page < 1 || page > MAX_PAGES) return;
    currentBizPage = page;
    fetchNewsPage('business', currentBizPage, 'biz-news-grid', 'biz-page-numbers', 'biz-prev-btn', 'biz-next-btn', 'goToBizPage');
  };

  /* ===================================================
     5. INITIAL MISSION CONTROL HYDRATION
     =================================================== */
  fetch('/api/mission-control')
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      if (!d) return;
      if (d.generatedAt) setText('mc-updated', 'Last synced ' + fmtWhen(d.generatedAt) + '.');
      if (d.satellites) countUp('mc-sat-num', d.satellites.count);
      if (d.neo) {
        countUp('mc-neo-num', d.neo.count);
        setText('mc-neo-foot', 'NASA NeoWs · ' + d.neo.hazardous + ' flagged hazardous');
      }
      if (d.spaceWeather) {
        countUp('mc-weather-num', d.spaceWeather.flareCount);
        setText(
          'mc-weather-foot',
          'NASA DONKI · ' + (d.spaceWeather.strongestFlare ? 'peak ' + d.spaceWeather.strongestFlare : 'no flare class reported')
        );
      }
      if (d.launches && d.launches.upcoming && d.launches.upcoming.length) {
        var next = d.launches.upcoming[0];
        setText('mc-launch-label', next.name);
        setText('mc-launch-foot', 'The Space Devs · ' + (next.pad || 'pad TBD'));
        startCountdown(next.net);

        var track = document.getElementById('tickerTrack');
        if (track) {
          var items = d.launches.upcoming.map(function (l) {
            return '<span>' + l.name + (l.net ? ' · ' + fmtWhen(l.net) : '') + '</span>';
          });
          if (d.satellites) items.push('<span>' + fmtInt(d.satellites.count) + ' active satellites · CelesTrak</span>');
          track.innerHTML = items.join('') + items.join('');
        }

        var log = document.getElementById('mc-launch-log');
        if (log) {
          var rows = d.launches.upcoming.map(function (l, i) {
            return (
              '<div class="row' +
              (i === 0 ? ' next' : '') +
              '"><span class="name">' +
              (i === 0 ? '<span class="tag-next">NEXT</span>' : '') +
              l.name +
              '</span><span class="meta">' +
              fmtWhen(l.net) +
              '</span></div>'
            );
          });
          (d.launches.previous || []).forEach(function (l) {
            rows.push(
              '<div class="row"><span class="name">' +
                l.name +
                '</span><span class="meta">' +
                fmtWhen(l.net) +
                (l.success ? ' · <span class="status-ok">success</span>' : '') +
                '</span></div>'
            );
          });
          log.innerHTML = rows.join('');
        }
      }
      if (d.apod) {
        setText('mc-apod-title', d.apod.title);
        setText('mc-apod-excerpt', d.apod.explanation + '…');
        setText('mc-apod-credit', 'Credit: ' + d.apod.credit + (d.apod.date ? ' · ' + d.apod.date : ''));
        var art = document.getElementById('mc-apod-art');
        if (art) art.innerHTML = '<img src="' + d.apod.imageUrl + '" alt="' + esc(d.apod.title) + '">';
        var link = document.getElementById('mc-apod-link');
        if (link && d.apod.permalink) link.href = d.apod.permalink;
      }
      if (d.epic) {
        setText('mc-earth-title', 'Earth, today');
        setText('mc-earth-excerpt', d.epic.caption);
        setText('mc-earth-credit', 'NASA DSCOVR/EPIC · ' + d.epic.date);
        var earthArt = document.getElementById('mc-earth-art');
        if (earthArt) earthArt.innerHTML = '<img src="' + d.epic.imageUrl + '" alt="Earth from DSCOVR">';
      }
      if (d.apodRange && d.apodRange.length) {
        var strip = document.getElementById('mc-apod-strip');
        if (strip) {
          strip.hidden = false;
          strip.innerHTML = d.apodRange
            .map(function (a) {
              return (
                '<a class="apod-thumb" href="' +
                a.permalink +
                '" target="_blank" rel="noopener" title="' +
                esc(a.title) +
                '"><img src="' +
                a.thumbUrl +
                '" alt="' +
                esc(a.title) +
                '" loading="lazy">' +
                '<span>' +
                a.date.slice(5) +
                '</span></a>'
              );
            })
            .join('');
        }
      }
      if (d.neo && d.neo.objects && d.neo.objects.length) {
        var neoTable = document.getElementById('mc-neo-table');
        if (neoTable) {
          neoTable.innerHTML =
            '<thead><tr><th>Object</th><th>Ø m</th><th>km/h</th><th>Miss</th></tr></thead><tbody>' +
            d.neo.objects
              .map(function (o) {
                var miss = o.missLunar ? o.missLunar.toFixed(1) + ' LD' : fmtInt(o.missKm) + ' km';
                return (
                  '<tr><td>' +
                  (o.url
                    ? '<a href="' + o.url + '" target="_blank" rel="noopener">' + esc(o.name) + '</a>'
                    : esc(o.name)) +
                  (o.hazardous ? '<span class="haz">HAZ</span>' : '') +
                  '</td><td>' +
                  fmtInt(o.diameterM) +
                  '</td><td>' +
                  fmtInt(o.velocityKph) +
                  '</td><td>' +
                  miss +
                  '</td></tr>'
                );
              })
              .join('') +
            '</tbody>';
        }
      }
      renderLiveCharts(d);

      // Hydrate news feeds on initial load
      window.goToGeneralPage(1);
      if (document.getElementById('biz-news-grid')) {
        window.goToBizPage(1);
      }
    })
    .catch(function () {
      setText('mc-updated', 'Live sync unavailable right now — deploy with API routes to see real values.');
    });

  /* ===================================================
     6. DATA CHARTS & VISUALIZATIONS
     =================================================== */
  function drawDonut(svgId, keyId, slices, valueFmt) {
    var svg = document.getElementById(svgId);
    var key = document.getElementById(keyId);
    if (!svg) return;
    svg.innerHTML = '';
    var wrap = svg.parentElement;
    var centre = wrap ? wrap.querySelector('.donut-center') : null;
    var rings = [];
    if (centre && !centre.dataset.def) centre.dataset.def = centre.innerHTML;
    function focus(i) {
      if (wrap) wrap.classList.add('dim');
      rings.forEach(function (r, n) {
        r.classList.toggle('hot', n === i);
      });
      if (centre) {
        var sl = slices[i];
        var tot = slices.reduce(function (a, x) {
          return a + x.value;
        }, 0);
        centre.innerHTML =
          '<div class="v">' + pct(sl.value, tot).toFixed(1) + '%</div><div class="k">' + esc(sl.label) + '</div>';
      }
    }
    function blur() {
      if (wrap) wrap.classList.remove('dim');
      rings.forEach(function (r) {
        r.classList.remove('hot');
      });
      if (centre) centre.innerHTML = centre.dataset.def;
    }
    if (wrap) wrap.addEventListener('pointerleave', blur);
    var total = slices.reduce(function (a, s) {
      return a + s.value;
    }, 0);
    if (!total) return;
    var r = 38;
    var C = 2 * Math.PI * r;
    var offset = 0;
    slices.forEach(function (sl, i) {
      var frac = sl.value / total;
      var ring = el('circle', {
        cx: 50,
        cy: 50,
        r: r,
        fill: 'none',
        stroke: PALETTE[i % PALETTE.length],
        'stroke-width': 13,
        'stroke-dasharray': (frac * C).toFixed(2) + ' ' + C,
        'stroke-dashoffset': (-offset * C).toFixed(2)
      });
      if (!reduce) {
        ring.style.opacity = 0;
        ring.style.transition = 'opacity .5s ease ' + i * 90 + 'ms';
        requestAnimationFrame(function () {
          ring.style.opacity = 1;
        });
      }
      ring.addEventListener('pointerenter', function () {
        focus(i);
      });
      rings.push(ring);
      svg.appendChild(ring);
      offset += frac;
    });
    if (key) {
      key.addEventListener('pointerleave', blur);
      key.innerHTML = slices
        .map(function (sl, i) {
          return (
            '<div class="row"><span class="sw" style="background:' +
            PALETTE[i % PALETTE.length] +
            '"></span>' +
            '<span class="lbl">' +
            esc(sl.label) +
            '</span>' +
            '<span class="val">' +
            (valueFmt ? valueFmt(sl.value) : fmtInt(sl.value)) +
            ' · ' +
            pct(sl.value, total).toFixed(1) +
            '%</span></div>'
          );
        })
        .join('');
      Array.prototype.forEach.call(key.children, function (row, i) {
        row.addEventListener('pointerenter', function () {
          focus(i);
        });
      });
    }
  }

  function renderLiveCharts(d) {
    if (d.satellites && d.satellites.groups) {
      var g = d.satellites.groups;
      setText('satTotal', fmtInt(d.satellites.count));
      var slices = [
        { label: 'Starlink', value: g.starlink || 0 },
        { label: 'OneWeb', value: g.oneweb || 0 },
        { label: 'Iridium', value: g.iridium || 0 },
        { label: 'Globalstar', value: g.globalstar || 0 },
        { label: 'Everything else', value: g.other || 0 }
      ].filter(function (s) {
        return s.value > 0;
      });
      drawDonut('constDonut', 'constKey', slices);
      setText('constLead', Math.round(pct(g.starlink || 0, d.satellites.count)) + '%');
    }
    if (d.satellites && d.satellites.orbits) {
      var o = d.satellites.orbits;
      var tot = o.leo + o.meo + o.geo;
      drawDonut('orbitDonut', 'orbitKey', [
        { label: 'Low Earth orbit', value: o.leo },
        { label: 'Medium Earth orbit', value: o.meo },
        { label: 'Geosynchronous', value: o.geo }
      ]);
      setText('orbitLead', Math.round(pct(o.leo, tot)) + '%');
    }
    if (d.launchStats) {
      var ls = d.launchStats;
      setText('lsSample', String(ls.sampleSize));
      setText('lsSuccess', fmtInt(ls.success));
      setText('lsFailure', fmtInt(ls.failure));
      setText('lsWindow', (ls.windowFrom || '?') + ' → ' + (ls.windowTo || '?'));
      if (ls.successRate != null) {
        var arc = document.getElementById('gaugeArc');
        if (arc) arc.setAttribute('stroke-dashoffset', String(132 - (ls.successRate / 100) * 132));
        var num = document.getElementById('lsRate');
        if (reduce && num) {
          num.textContent = ls.successRate.toFixed(1);
        } else if (num) {
          var t0 = performance.now();
          (function step(now) {
            var p = Math.min(1, (now - t0) / 1100);
            num.textContent = (ls.successRate * (1 - Math.pow(1 - p, 3))).toFixed(1);
            if (p < 1) requestAnimationFrame(step);
          })(t0);
        }
      }
    }
  }

  // Cost to Orbit Log Chart
  (function costChart() {
    var svg = document.getElementById('costChart');
    if (!svg) return;
    var pts = [
      { label: 'Shuttle', sub: '1981–2011', value: 54500 },
      { label: 'Ariane 5', sub: '1996–2023', value: 9100 },
      { label: 'Falcon 9', sub: 'current', value: 2700 },
      { label: 'F. Heavy', sub: 'current', value: 1500 },
      { label: 'Starship', sub: 'target', value: 200, target: true }
    ];
    var W = 420;
    var H = 210;
    var padL = 42;
    var padR = 12;
    var padT = 16;
    var padB = 40;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var lo = 100;
    var hi = 100000;
    function y(v) {
      var t = (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
      return padT + plotH - t * plotH;
    }
    function x(i) {
      return padL + (i / (pts.length - 1)) * plotW;
    }

    [100, 1000, 10000, 100000].forEach(function (t) {
      svg.appendChild(el('line', { class: 'gridline', x1: padL, x2: W - padR, y1: y(t), y2: y(t) }));
      var lb = el('text', { class: 'axis-label', x: padL - 7, y: y(t) + 3, 'text-anchor': 'end' });
      lb.textContent = t >= 1000 ? '$' + t / 1000 + 'k' : '$' + t;
      svg.appendChild(lb);
    });

    var solid = pts.slice(0, 4).map(function (p, i) {
      return x(i) + ',' + y(p.value);
    });
    svg.appendChild(el('path', { class: 'step', d: 'M' + solid.join(' L') }));
    svg.appendChild(
      el('path', {
        class: 'step target',
        d: 'M' + x(3) + ',' + y(pts[3].value) + ' L' + x(4) + ',' + y(pts[4].value)
      })
    );

    var vline = el('line', { class: 'vline', x1: 0, x2: 0, y1: padT, y2: padT + plotH });
    svg.appendChild(vline);
    var dots = [];
    pts.forEach(function (p, i) {
      var dot = el('circle', { class: 'pt', cx: x(i), cy: y(p.value), r: 3.5 });
      dots.push(dot);
      svg.appendChild(dot);
      var v = el('text', { class: 'pt-label', x: x(i), y: y(p.value) - 10, 'text-anchor': 'middle' });
      v.setAttribute('fill', '#d2cefd');
      v.textContent = '$' + fmtInt(p.value);
      svg.appendChild(v);
      var n = el('text', { class: 'axis-label', x: x(i), y: H - 20, 'text-anchor': 'middle' });
      n.textContent = p.label;
      svg.appendChild(n);
      var sub = el('text', { class: 'axis-label', x: x(i), y: H - 9, 'text-anchor': 'middle' });
      sub.setAttribute('fill', '#595d6c');
      sub.textContent = p.sub;
      svg.appendChild(sub);
    });

    var band = plotW / (pts.length - 1);
    pts.forEach(function (p, i) {
      var hit = el('rect', { class: 'hit', x: x(i) - band / 2, y: padT, width: band, height: plotH });
      var title = el('title');
      title.textContent = p.label + ' (' + p.sub + ') — $' + fmtInt(p.value) + ' per kg to LEO';
      hit.appendChild(title);
      hit.addEventListener('pointerenter', function () {
        vline.setAttribute('x1', x(i));
        vline.setAttribute('x2', x(i));
        vline.style.opacity = 1;
        dots.forEach(function (dd, n) {
          dd.classList.toggle('hot', n === i);
        });
      });
      svg.appendChild(hit);
    });
    svg.addEventListener('pointerleave', function () {
      vline.style.opacity = 0;
      dots.forEach(function (dd) {
        dd.classList.remove('hot');
      });
    });
  })();

  drawDonut(
    'segDonut',
    'segKey',
    [
      { label: 'Ground equipment', value: 145 },
      { label: 'Satellite services', value: 113 },
      { label: 'Satellite manufacturing', value: 17 },
      { label: 'Launch services', value: 7 }
    ],
    function (v) {
      return '$' + v + 'B';
    }
  );

  // Global Space Economy Trend Line Chart
  var econData = [
    { year: 2019, value: 366, projected: false },
    { year: 2020, value: 371, projected: false },
    { year: 2021, value: 424, projected: false },
    { year: 2022, value: 469, projected: false },
    { year: 2023, value: 546, projected: false },
    { year: 2024, value: 613, projected: false },
    { year: 2025, value: 685, projected: true },
    { year: 2026, value: 760, projected: true },
    { year: 2027, value: 850, projected: true },
    { year: 2028, value: 950, projected: true },
    { year: 2029, value: 1060, projected: true },
    { year: 2030, value: 1180, projected: true }
  ];

  (function renderChart() {
    var svg = document.getElementById('econChart');
    if (!svg) return;
    var W = 860;
    var H = 300;
    var padL = 46;
    var padR = 14;
    var padT = 14;
    var padB = 30;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var maxV = 1200;
    var minV = 0;
    function xFor(i) {
      return padL + (i / (econData.length - 1)) * plotW;
    }
    function yFor(v) {
      return padT + plotH - ((v - minV) / (maxV - minV)) * plotH;
    }

    var gridG = document.getElementById('econGrid');
    var axisG = document.getElementById('econAxis');
    if (gridG && axisG) {
      [0, 400, 800, 1200].forEach(function (t) {
        var y = yFor(t);
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'gridline');
        line.setAttribute('x1', padL);
        line.setAttribute('x2', W - padR);
        line.setAttribute('y1', y);
        line.setAttribute('y2', y);
        gridG.appendChild(line);
        var lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('class', 'axis-label');
        lbl.setAttribute('x', padL - 8);
        lbl.setAttribute('y', y + 3);
        lbl.setAttribute('text-anchor', 'end');
        lbl.textContent = '$' + t + 'B';
        axisG.appendChild(lbl);
      });
      econData.forEach(function (d, i) {
        if (i % 2 !== 0 && i !== econData.length - 1) return;
        var lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('class', 'axis-label');
        lbl.setAttribute('x', xFor(i));
        lbl.setAttribute('y', H - 10);
        lbl.setAttribute('text-anchor', 'middle');
        lbl.textContent = d.year;
        axisG.appendChild(lbl);
      });
    }

    var areaPts = econData
      .map(function (d, i) {
        return xFor(i) + ',' + yFor(d.value);
      })
      .join(' L ');
    var areaEl = document.getElementById('econArea');
    if (areaEl) {
      areaEl.setAttribute(
        'd',
        'M ' + xFor(0) + ',' + yFor(0) + ' L ' + areaPts + ' L ' + xFor(econData.length - 1) + ',' + yFor(0) + ' Z'
      );
    }

    var splitIdx = econData.findIndex(function (d) {
      return d.projected;
    });
    var solidPts = econData
      .slice(0, splitIdx + 1)
      .map(function (d, i) {
        return xFor(i) + ',' + yFor(d.value);
      })
      .join(' L ');
    var dashedPts = econData
      .slice(splitIdx)
      .map(function (d, i) {
        return xFor(i + splitIdx) + ',' + yFor(d.value);
      })
      .join(' L ');
    var solidEl = document.getElementById('econLineSolid');
    var dashedEl = document.getElementById('econLineDashed');
    if (solidEl) solidEl.setAttribute('d', 'M ' + solidPts);
    if (dashedEl) dashedEl.setAttribute('d', 'M ' + dashedPts);

    var divider = document.getElementById('econDivider');
    var dx = xFor(splitIdx);
    if (divider) {
      divider.setAttribute('x1', dx);
      divider.setAttribute('x2', dx);
      divider.setAttribute('y1', padT);
      divider.setAttribute('y2', H - padB);
    }

    var last = econData[econData.length - 1];
    var endDot = document.getElementById('econEndDot');
    if (endDot) {
      endDot.setAttribute('cx', xFor(econData.length - 1));
      endDot.setAttribute('cy', yFor(last.value));
    }

    var hit = document.getElementById('econHit');
    var crosshair = document.getElementById('econCrosshair');
    var hoverDot = document.getElementById('econHoverDot');
    var tip = document.getElementById('econTip');

    function showAt(clientX) {
      if (!hit || !crosshair || !hoverDot || !tip) return;
      var rect = svg.getBoundingClientRect();
      var localX = ((clientX - rect.left) / rect.width) * W;
      var i = Math.round(((localX - padL) / plotW) * (econData.length - 1));
      i = Math.max(0, Math.min(econData.length - 1, i));
      var d = econData[i];
      var x = xFor(i);
      var y = yFor(d.value);
      crosshair.setAttribute('x1', x);
      crosshair.setAttribute('x2', x);
      crosshair.setAttribute('y1', padT);
      crosshair.setAttribute('y2', H - padB);
      crosshair.style.opacity = 1;
      hoverDot.setAttribute('cx', x);
      hoverDot.setAttribute('cy', y);
      hoverDot.style.opacity = 1;
      tip.style.left = (x / W) * 100 + '%';
      tip.style.top = (y / H) * 100 + '%';
      tip.innerHTML =
        d.year +
        (d.projected ? ' <span style="color:#75798c">(projected)</span>' : '') +
        '<br><b>$' +
        d.value +
        'B</b>';
      tip.style.opacity = 1;
    }
    function hide() {
      if (crosshair) crosshair.style.opacity = 0;
      if (hoverDot) hoverDot.style.opacity = 0;
      if (tip) tip.style.opacity = 0;
    }
    if (hit) {
      hit.addEventListener('pointermove', function (e) {
        showAt(e.clientX);
      });
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('pointerdown', function (e) {
        showAt(e.clientX);
      });
    }

    var table = document.getElementById('econTable');
    if (table) {
      var rows = econData
        .map(function (d) {
          return (
            '<tr><td>' +
            d.year +
            '</td><td>' +
            d.value +
            '</td><td>' +
            (d.projected ? 'Projected' : 'Reported') +
            '</td></tr>'
          );
        })
        .join('');
      table.innerHTML =
        '<thead><tr><th>Year</th><th>Value ($B)</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody>';
    }
  })();

  /* ===================================================
     7. COSMIC BEAR ASSISTANT (CHAT RAIL)
     =================================================== */
  var GREETING =
    "Hey, I'm Cosmic Bear \uD83D\uDE80 Ask me about the space economy data on this page, what's live vs. a snapshot, or how to subscribe — I'm here to help you get around.";
  var chatLog = document.getElementById('chatLog');
  var chatForm = document.getElementById('chatForm');
  var chatInput = document.getElementById('chatInput');
  var chatSend = document.getElementById('chatSend');
  var history = [];

  try {
    history = JSON.parse(localStorage.getItem('cosmicBearChat') || '[]');
  } catch (e) {
    history = [];
  }
  if (!Array.isArray(history)) history = [];

  function saveChat() {
    try {
      localStorage.setItem('cosmicBearChat', JSON.stringify(history.slice(-40)));
    } catch (e) {}
  }

  function bubble(role, text) {
    if (!chatLog) return null;
    var elem = document.createElement('div');
    elem.className = 'bc-msg ' + (role === 'user' ? 'me' : 'bot');
    elem.textContent = text;
    chatLog.appendChild(elem);
    chatLog.scrollTop = chatLog.scrollHeight;
    return elem;
  }

  if (chatLog) {
    bubble('assistant', GREETING);
    history.forEach(function (m) {
      bubble(m.role, m.content);
    });
  }

  function ask(text) {
    if (!text || !chatInput || !chatSend) return;
    bubble('user', text);
    history.push({ role: 'user', content: text });
    saveChat();
    chatInput.value = '';
    chatSend.disabled = true;
    var typing = bubble('assistant', 'thinking…');
    if (typing) typing.classList.add('typing');

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-20) })
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (typing) typing.remove();
        var reply = (d && d.reply) || "I couldn't reach mission control just then — try again in a moment?";
        bubble('assistant', reply);
        history.push({ role: 'assistant', content: reply });
        saveChat();
      })
      .catch(function () {
        if (typing) typing.remove();
        bubble('assistant', "I couldn't reach mission control just then — try again in a moment?");
      })
      .finally(function () {
        chatSend.disabled = false;
        chatInput.focus();
      });
  }

  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      ask(chatInput.value.trim());
    });
  }

  document.querySelectorAll('[data-ask]').forEach(function (b) {
    b.addEventListener('click', function () {
      ask(b.getAttribute('data-ask'));
    });
  });

  var rail = document.getElementById('rail');
  var railToggle = document.getElementById('railToggle');
  if (rail && railToggle && chatInput) {
    railToggle.addEventListener('click', function () {
      var open = rail.classList.toggle('open');
      railToggle.classList.toggle('active', open);
      railToggle.setAttribute('aria-label', open ? 'Close chat' : 'Ask Cosmic Bear');
      if (open) chatInput.focus();
    });
  }

  /* ===================================================
     8. NEWSLETTER SUBSCRIPTION FORMS
     =================================================== */
  ['signupHero', 'signupFooter'].forEach(function (id) {
    var f = document.getElementById(id);
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var field = f.querySelector('input');
      var btn = f.querySelector('button');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending…';
      }
      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: field ? field.value : '' })
      })
        .then(function (r) {
          return r.json().catch(function () {
            return {};
          });
        })
        .then(function () {
          if (btn) btn.textContent = 'Welcome aboard';
        })
        .catch(function () {
          if (btn) {
            btn.textContent = 'Try again';
            btn.disabled = false;
          }
        });
    });
  });
})();

// In api/mission-control.js

async function getNews(limit = 12, offset = 0, isBusiness = false) {
  try {
    const baseUrl = 'https://api.spaceflightnewsapi.net/v4/articles/';
    let url = `${baseUrl}?limit=${limit}&offset=${offset}&ordering=-published_at`;

    // Business filter: search for commercial space keywords using SNAPI's official search parameter
    if (isBusiness) {
      url += '&search=commercial';
    }

    const data = await safeFetchJson(url, 8000);
    if (!data || !Array.isArray(data.results)) {
      return { count: 0, results: [] };
    }

    return {
      count: data.count || data.results.length,
      results: data.results.map((a) => ({
        title: a.title || 'Untitled Dispatch',
        url: a.url || '#',
        site: a.news_site || (isBusiness ? 'Market Watch' : 'Space News'),
        publishedAt: a.published_at || null,
        imageUrl: a.image_url || null,
        summary: a.summary ? String(a.summary).slice(0, 180) : '',
      })),
    };
  } catch (err) {
    // Return empty results rather than throwing an exception to protect the rest of the site
    return { count: 0, results: [] };
  }
}

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');

  const query = req.query || {};

  // 1. Paginated slice requested by pagination buttons
  if (query.type) {
    const limit = Math.min(Number(query.limit) || 12, 30);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const isBusiness = query.type === 'business';

    const newsData = await getNews(limit, offset, isBusiness);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(newsData);
  }

  // 2. Initial Page Load - Fetch all feeds safely
  try {
    const [satellites, neo, apod, apodRange, launches, launchStats, generalNews, bizNews, spaceWeather, epic] =
      await Promise.all([
        getSatellites().catch(() => null),
        getNeo().catch(() => null),
        getApod().catch(() => null),
        getApodRange().catch(() => null),
        getLaunches().catch(() => null),
        getLaunchStats().catch(() => null),
        getNews(12, 0, false), // General feed
        getNews(12, 0, true),  // Business / Commercial feed
        getSpaceWeather().catch(() => null),
        getEpic().catch(() => null),
      ]);

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      satellites,
      neo,
      apod,
      apodRange,
      launches,
      launchStats,
      news: generalNews.results || [],
      bizNews: bizNews.results || [],
      spaceWeather,
      epic,
    });
  } catch (fatal) {
    // Ultimate fallback: even if something breaks upstream, return 200 with fallback data
    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      news: [],
      bizNews: [],
    });
  }
};
