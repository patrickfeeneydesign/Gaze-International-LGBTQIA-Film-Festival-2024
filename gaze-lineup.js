/* ───────────────────────────────────────────────────────────────────────────
   GAZE shared line-up script (CLASSIC script — not an ES module, so it loads
   reliably regardless of how the host serves .js files).
   Requires the Supabase UMD global to be loaded first:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="gaze-lineup.js"></script>
   Exposes helpers on window.GAZE and injects the FESTIVAL / LINE UP menus +
   the bottom-left quick-nav on any page with a <nav>.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://pcqmducomykhcumkchjm.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjcW1kdWNvbXlraGN1bWtjaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NDU4NjcsImV4cCI6MjA2NDQyMTg2N30.esmrg8uQpQQHfuzmYmNwxciv3x2ExRqV03thXVSOC38';
  const TABLE = 'lineup';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('gaze-lineup.js: Supabase UMD library not found — load @supabase/supabase-js@2 before this script.');
    return;
  }
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  /* ─── helpers ─── */
  function esc(t){ return String(t == null ? '' : t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function ordinal(n){ const s=['th','st','nd','rd']; const v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }

  function timeToMinutes(str){
    if(!str) return 1e9;
    const m = String(str).trim().toLowerCase().match(/(\d{1,2})[:.]?(\d{2})?\s*(am|pm)?/);
    if(!m) return 1e9;
    let h = parseInt(m[1],10);
    const min = m[2] ? parseInt(m[2],10) : 0;
    const ap = m[3];
    if(ap==='pm' && h!==12) h += 12;
    if(ap==='am' && h===12) h = 0;
    return h*60 + min;
  }

  function chronoSort(rows){
    return rows.slice().sort(function(a,b){
      const da = a.screening_date || '9999-12-31', db = b.screening_date || '9999-12-31';
      if(da !== db) return da < db ? -1 : 1;
      const ta = timeToMinutes(a.screening_time), tb = timeToMinutes(b.screening_time);
      if(ta !== tb) return ta - tb;
      const oa = a.order == null ? 0 : a.order, ob = b.order == null ? 0 : b.order;
      if(oa !== ob) return oa - ob;
      return (a.title||'').localeCompare(b.title||'');
    });
  }

  /* the exact public listing markup (lifted from the old strand pages) */
  function filmItemHTML(film){
    /* screening_date is a date-only string, so it parses as UTC midnight — format it
       in UTC too, otherwise viewers west of UTC see the previous day. */
    const d = new Date(film.screening_date);
    const dateStr = isNaN(d.getTime()) ? '' :
      d.toLocaleDateString(undefined,{weekday:'long', timeZone:'UTC'}) + ' ' +
      d.toLocaleDateString(undefined,{month:'long', timeZone:'UTC'}) + ' ' +
      ordinal(d.getUTCDate()) + ' ' + d.getUTCFullYear();
    const line1 = [dateStr, film.screening_time, film.country].filter(Boolean).join(' • ');
    const line2 = [film.length, film.venue, film.director && ('Dir. ' + film.director)].filter(Boolean).join(' • ');
    return '' +
      '<div class="sf-film-item">' +
        '<img class="sf-film-image" src="' + esc(film.image_url) + '" alt="' + esc(film.title) + '">' +
        '<div class="sf-film-info">' +
          '<h2 class="sf-film-title">' + (film.title || '') + '</h2>' +
          '<div class="sf-film-meta">' +
            '<span class="sf-film-meta-primary">' + line1 + '</span>' +
            '<span class="sf-film-meta-secondary">' + line2 + '</span>' +
          '</div>' +
          '<p class="sf-film-desc">' + (film.description || '') + '</p>' +
          '<p class="sf-film-credits">' +
            (film.writers ? ('Writers: ' + film.writers + '<br>') : '') +
            (film.producers ? ('Producers: ' + film.producers) : '') +
          '</p>' +
          (film.ticket_url
            ? '<a class="sf-film-button" href="' + film.ticket_url + '" target="_blank" rel="noopener">Book Tickets</a>'
            : '') +
        '</div>' +
      '</div>';
  }

  async function loadStrands(){
    const res = await supabase.from(TABLE).select('strand, screening_date, screening_time');
    if(res.error){ console.error(res.error); return []; }
    const earliest = new Map();
    (res.data||[]).forEach(function(r){
      if(!r.strand) return;
      const key = (r.screening_date || '9999-12-31') + '-' + String(timeToMinutes(r.screening_time)).padStart(5,'0');
      if(!earliest.has(r.strand) || key < earliest.get(r.strand)) earliest.set(r.strand, key);
    });
    return Array.from(earliest.keys()).sort(function(a,b){
      const ka = earliest.get(a), kb = earliest.get(b);
      return ka < kb ? -1 : ka > kb ? 1 : a.localeCompare(b);
    });
  }

  function currentStrand(){ return new URLSearchParams(location.search).get('strand'); }

  window.GAZE = { supabase: supabase, TABLE: TABLE, esc: esc, ordinal: ordinal, timeToMinutes: timeToMinutes, chronoSort: chronoSort, filmItemHTML: filmItemHTML, loadStrands: loadStrands, currentStrand: currentStrand };

  /* ─── menu + quick-nav injection ─── */
  function findDropdownByLabel(nav, label){
    const lis = nav.querySelectorAll(':scope > ul > li.dropdown');
    for(let i=0;i<lis.length;i++){
      const a = lis[i].querySelector(':scope > a');
      if(a && a.textContent.trim().toUpperCase() === label) return lis[i];
    }
    return null;
  }

  function buildNav(){
    const nav = document.querySelector('nav');
    if(!nav) return null;
    const ul = nav.querySelector(':scope > ul');
    if(!ul) return null;

    /* TICKETS → FESTIVAL */
    const tickets = findDropdownByLabel(nav, 'TICKETS');
    if(tickets){
      const lbl = tickets.querySelector(':scope > a');
      if(lbl) lbl.textContent = 'FESTIVAL';
      const dc = tickets.querySelector('.dropdown-content');
      if(dc) dc.innerHTML =
        '<li tabindex="0" role="button"><a href="timetable.html">Timetable</a></li>' +
        '<li tabindex="0" role="button"><a href="https://events.ticketbooth.eu/event/gaze-festival-pass-2025" target="_blank">Festival Pass</a></li>' +
        '<li tabindex="0" role="button"><a href="friend.html">Festival Friend</a></li>' +
        '<li tabindex="0" role="button"><a href="supporters.html">Supporters</a></li>';
    }

    /* LINE UP dropdown shell (strands filled async) */
    let lineup = findDropdownByLabel(nav, 'LINE UP');
    if(!lineup){
      lineup = document.createElement('li');
      lineup.className = 'dropdown'; lineup.tabIndex = 0; lineup.setAttribute('aria-label','Line Up');
      lineup.innerHTML =
        '<a href="themes.html" aria-haspopup="true" aria-expanded="false" role="button">LINE UP</a>' +
        '<ul class="dropdown-content"></ul>';
      if(tickets && tickets.nextSibling) ul.insertBefore(lineup, tickets.nextSibling);
      else ul.appendChild(lineup);
    }

    /* drop "Featured Events" anywhere, and Festival Friend from SUPPORT */
    nav.querySelectorAll('.dropdown-content li a').forEach(function(a){
      if(a.textContent.trim().toLowerCase() === 'featured events'){ const li=a.closest('li'); if(li) li.remove(); }
    });
    const support = findDropdownByLabel(nav,'SUPPORT');
    if(support){
      support.querySelectorAll('.dropdown-content li a').forEach(function(a){
        if((a.getAttribute('href')||'') === 'friend.html'){ const li=a.closest('li'); if(li) li.remove(); }
      });
    }
    return lineup;
  }

  function buildQuickNav(strands){
    let qn = document.querySelector('.quick-nav');
    if(!qn){ qn = document.createElement('div'); qn.className='quick-nav'; qn.setAttribute('aria-label','Section shortcuts'); document.body.appendChild(qn); }
    const cur = currentStrand();
    let items = '<li><a href="timetable.html">Timetable</a></li>';
    strands.forEach(function(s){
      const active = cur === s;
      items += '<li><a href="themes.html?strand=' + encodeURIComponent(s) + '"' + (active ? ' style="color:#f37160;font-weight:600;"' : '') + '>' + esc(s) + '</a></li>';
    });
    qn.innerHTML = '<ul>' + items + '</ul>';
  }

  function init(){
    try{
      const lineupLi = buildNav();
      loadStrands().then(function(strands){
        try{
          if(lineupLi){
            const dc = lineupLi.querySelector('.dropdown-content');
            strands.forEach(function(s){
              dc.insertAdjacentHTML('beforeend', '<li tabindex="0" role="button"><a href="themes.html?strand=' + encodeURIComponent(s) + '">' + esc(s) + '</a></li>');
            });
          }
          buildQuickNav(strands);
        }catch(e){ console.error('gaze-lineup quick-nav error', e); }
      });
    }catch(e){ console.error('gaze-lineup nav error', e); }
  }

  if(document.querySelector('nav')) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
