// Shared helpers for the two pencil-vector tool pages (boxer + asset tool).
// Served by server.py at /pv-common.js; loaded as a classic script before each page's
// inline script, so these globals are visible to it.
const $ = s => document.querySelector(s);
const SVGNS = "http://www.w3.org/2000/svg";
const TRASH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" '
  + 'stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5h6v2"/>'
  + '<path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>';

// POST a json body; resolve to the parsed json response.
const postJSON = (url, body) =>
  fetch(url, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body)}).then(r => r.json());

// Client (mouse) coords -> the SVG element's user space.
function clientToUser(svgEl, ev){
  const p = svgEl.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
  const u = p.matrixTransform(svgEl.getScreenCTM().inverse());
  return {x: u.x, y: u.y};
}

// Axis-aligned box from two points; rounded to integer pixels when `round`.
function rectFrom(a, b, round){
  const f = round ? Math.round : (v => v);
  return {x0: f(Math.min(a.x, b.x)), y0: f(Math.min(a.y, b.y)),
          x1: f(Math.max(a.x, b.x)), y1: f(Math.max(a.y, b.y))};
}

// Render the left-hand scan picker: list /scans, highlight `current`, call onPick(name) on click.
// The scan set is cached per session, so a boxer<->asset navigation repaints the list instantly from
// cache (no empty->populated flash). The <ul> is only rebuilt when the set of scans actually changed;
// otherwise the existing <li>s are left in place and just re-highlighted/re-wired -- untouched between
// navigations. The background /scans fetch still runs to pick up any real change to the scan folder.
function renderScanList(current, onPick){
  const ul = $("#scanlist");
  const paint = list => {
    const html = list.map(n => `<li data-scan="${encodeURIComponent(n)}">${n}</li>`).join("");
    if(ul.innerHTML !== html) ul.innerHTML = html;   // rebuild only when the scans changed
    for(const li of ul.children){
      const name = decodeURIComponent(li.dataset.scan);
      li.classList.toggle("on", name === current);
      li.onclick = () => onPick(name);
    }
  };
  let cached = null;
  try { cached = JSON.parse(sessionStorage.getItem("pv:scans") || "null"); } catch(_){}
  if(Array.isArray(cached)){
    paint(cached);                                   // instant, from the previous navigation...
    const sc = sessionStorage.getItem("pv:scansScroll");
    if(sc != null) ul.scrollTop = +sc;               // ...and restored to its scroll BEFORE first paint, so
  }                                                  // the rail never jumps to the top on a boxer<->asset hop
  return fetch("/scans").then(r => r.json()).then(list => {
    try { sessionStorage.setItem("pv:scans", JSON.stringify(list)); } catch(_){}
    paint(list);                                     // no-op on the DOM when unchanged, so scroll is kept
    return list;
  });
}

// Persist the scan rail's scroll across a full-page boxer<->asset navigation. Saved on the way out and
// restored (above) before the next page paints, so switching tools leaves the rail visually fixed.
window.addEventListener("pagehide", () => {
  const ul = $("#scanlist");
  if(ul) try { sessionStorage.setItem("pv:scansScroll", ul.scrollTop); } catch(_){}
});
