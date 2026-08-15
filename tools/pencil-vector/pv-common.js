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

// Render the left-hand scan picker: list /scans, highlight `current`, call onPick(name) on click.
function renderScanList(current, onPick){
  return fetch("/scans").then(r => r.json()).then(list => {
    const ul = $("#scanlist");
    ul.innerHTML = list.map(n => `<li data-scan="${encodeURIComponent(n)}">${n}</li>`).join("");
    for(const li of ul.children){
      const name = decodeURIComponent(li.dataset.scan);
      li.classList.toggle("on", name === current);
      li.onclick = () => onPick(name);
    }
    return list;
  });
}
